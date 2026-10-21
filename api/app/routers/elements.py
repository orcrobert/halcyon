from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import FileResponse
from sqlmodel import Session

from api.app.deps import CurrentUser, SessionDep
from api.app.models.schemas import (
    ElementMixUpdate,
    ElementOriginal,
    ElementOut,
    ElementQuality,
    ElementRegenerate,
    ElementTake,
    Envelope,
)
from api.app.models.tables import Element, User, utcnow
from api.app.services import storage

router = APIRouter(prefix="/api/elements", tags=["elements"])


def serialize_element(element: Element) -> ElementOut:
    return ElementOut(
        id=element.id,
        label=element.label,
        type=element.type,
        prompt=element.prompt,
        duration_s=element.duration_s,
        status=element.status or "ready",
        error=element.error,
        version=element.version or 1,
        position=element.position,
        playback="oneshot" if element.playback == "oneshot" else "loop",
        clip_s=element.clip_s,
        interval_min_s=element.interval_min_s,
        interval_max_s=element.interval_max_s,
        source=element.source or "generated",
        source_json=element.source_json,
        quality=(
            ElementQuality(
                issues=element.quality_json,
                dismissed=bool(element.quality_dismissed),
            )
            if element.quality_json is not None
            else None
        ),
        volume=element.volume,
        pan=element.pan,
        depth=element.depth,
        tuning_hz=element.tuning_hz,
        eq_json=element.eq_json,
        original=ElementOriginal(
            volume=element.original_volume,
            pan=element.original_pan,
            depth=element.original_depth,
            eq_json=element.original_eq_json,
        ),
        audio_url=(
            f"/api/elements/{element.id}/audio?v={element.version or 1}"
            if element.audio_path
            else None
        ),
        takes=[
            ElementTake(
                audio_url=(
                    f"/api/elements/{element.id}/audio"
                    f"?take={number}&v={element.version or 1}"
                ),
                duration_s=take.get("duration_s"),
            )
            for number, take in enumerate(element.takes_json or [], start=1)
        ],
    )


def owned_element(session: Session, user: User, element_id: int) -> Element:
    element = session.get(Element, element_id)
    if element is None or element.atmosphere.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Element not found."
        )
    return element


@router.patch("/{element_id}")
def update(
    element_id: int,
    payload: ElementMixUpdate,
    user: CurrentUser,
    session: SessionDep,
) -> Envelope[ElementOut]:
    element = owned_element(session, user, element_id)
    changes = payload.model_dump(exclude_unset=True)

    if "eq_json" in changes and changes["eq_json"] is not None:
        changes["eq_json"] = [
            band.model_dump(exclude_none=True) for band in payload.eq_json
        ]

    for field, value in changes.items():
        setattr(element, field, value)

    element.atmosphere.updated_at = utcnow()
    session.add(element)
    session.commit()
    session.refresh(element)

    return Envelope(data=serialize_element(element))


@router.post("/{element_id}/reset")
def reset(
    element_id: int, user: CurrentUser, session: SessionDep
) -> Envelope[ElementOut]:
    element = owned_element(session, user, element_id)

    element.volume = element.original_volume
    element.pan = element.original_pan
    element.depth = element.original_depth
    element.eq_json = element.original_eq_json
    element.tuning_hz = 440.0

    session.add(element)
    session.commit()
    session.refresh(element)

    return Envelope(data=serialize_element(element))


@router.post("/{element_id}/regenerate", status_code=status.HTTP_202_ACCEPTED)
def regenerate(
    element_id: int,
    payload: ElementRegenerate,
    user: CurrentUser,
    session: SessionDep,
    request: Request,
) -> Envelope[ElementOut]:
    element = owned_element(session, user, element_id)

    if element.status == "regenerating":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This layer is already being regenerated.",
        )

    element.status = "regenerating"
    element.error = None
    element.atmosphere.updated_at = utcnow()
    session.add(element)
    session.commit()
    session.refresh(element)

    feedback = (payload.feedback or "").strip() or None
    request.app.state.worker.submit_element(element_id, feedback)

    return Envelope(data=serialize_element(element))


@router.delete("/{element_id}", status_code=status.HTTP_204_NO_CONTENT)
def destroy(element_id: int, user: CurrentUser, session: SessionDep) -> Response:
    element = owned_element(session, user, element_id)
    atmosphere = element.atmosphere

    if len(atmosphere.elements) <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An atmosphere needs at least one layer.",
        )

    audio_path = element.audio_path
    takes = element.takes_json
    session.delete(element)
    atmosphere.updated_at = utcnow()
    session.add(atmosphere)
    session.commit()

    storage.delete_element_audio(audio_path)
    storage.delete_take_audio(takes)

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{element_id}/audio")
def audio(
    element_id: int, user: CurrentUser, session: SessionDep, take: int = 0
) -> FileResponse:
    element = owned_element(session, user, element_id)
    takes = element.takes_json or []

    if not 0 <= take <= len(takes):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Take not found."
        )
    relative = takes[take - 1].get("path", "") if take else element.audio_path

    try:
        path = storage.resolve_audio(relative)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Audio file not found."
        )

    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Audio file not found."
        )

    return FileResponse(path, media_type="audio/wav", filename=f"{element.label}.wav")
