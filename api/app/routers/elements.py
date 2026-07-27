from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse
from sqlmodel import Session

from api.app.deps import CurrentUser, SessionDep
from api.app.models.schemas import (
    ElementMixUpdate,
    ElementOriginal,
    ElementOut,
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
        position=element.position,
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
        audio_url=f"/api/elements/{element.id}/audio",
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
        changes["eq_json"] = [band.model_dump() for band in payload.eq_json]

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


@router.get("/{element_id}/audio")
def audio(element_id: int, user: CurrentUser, session: SessionDep) -> FileResponse:
    element = owned_element(session, user, element_id)

    try:
        path = storage.resolve_audio(element.audio_path)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Audio file not found."
        )

    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Audio file not found."
        )

    return FileResponse(path, media_type="audio/wav", filename=f"{element.label}.wav")
