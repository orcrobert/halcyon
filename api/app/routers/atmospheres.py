import base64
import binascii
import io
import math

import soundfile as sf
from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from sqlmodel import Session, func, select

from api.app.config import (
    DEFAULT_DURATION_S,
    MAX_STYLE_BYTES,
    MAX_STYLE_S,
    MIN_STYLE_S,
)
from api.app.deps import CurrentUser, SessionDep
from api.app.models.schemas import (
    AtmosphereCreate,
    AtmosphereOut,
    DecompositionLayerOut,
    DecompositionRevise,
    DecompositionUpdate,
    Envelope,
    Page,
    PageMeta,
    StyleReferenceIn,
    StyleReferenceOut,
)
from api.app.models.tables import Atmosphere, User, utcnow
from api.app.routers.elements import serialize_element
from api.app.services import storage
from api.app.services.decomposer import (
    DEFAULT_ROLE,
    normalize_elements,
    revise_decomposition,
)
from api.app.services.runconfig import resolve_config

router = APIRouter(prefix="/api/atmospheres", tags=["atmospheres"])

PER_PAGE = 20

STYLE_TOLERANCE_S = 0.05

CARRIED_FIELDS = (
    "role",
    "playback",
    "clip_s",
    "interval_min_s",
    "interval_max_s",
    "source",
    "source_json",
)


def _element_specs(atmosphere: Atmosphere) -> list[dict]:
    roles = {
        element.get("label"): element.get("role")
        for element in (atmosphere.decomposed_json or {}).get("elements", [])
        if isinstance(element, dict)
    }

    specs = []
    for element in atmosphere.elements:
        carried = {
            "role": roles.get(element.label),
            "playback": element.playback,
            "clip_s": element.clip_s,
            "interval_min_s": element.interval_min_s,
            "interval_max_s": element.interval_max_s,
            "source": element.source,
            "source_json": element.source_json,
        }
        specs.append(
            {
                "label": element.label,
                "type": element.type,
                "prompt": element.prompt,
                **{k: v for k, v in carried.items() if v is not None},
            }
        )
    return specs


def _decode_style(style: StyleReferenceIn) -> tuple[bytes, dict]:
    try:
        audio = base64.b64decode(style.audio_b64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The style clip is not valid base64.",
        )
    if len(audio) > MAX_STYLE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The style clip is too large.",
        )

    try:
        info = sf.info(io.BytesIO(audio))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The style clip is not a readable WAV file.",
        )

    seconds = info.frames / info.samplerate if info.samplerate else 0.0
    if not (
        MIN_STYLE_S - STYLE_TOLERANCE_S <= seconds <= MAX_STYLE_S + STYLE_TOLERANCE_S
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"The style clip must be between {MIN_STYLE_S:g} and "
                f"{MAX_STYLE_S:g} seconds long."
            ),
        )

    meta = {
        "name": style.name.strip() or "Reference clip",
        "start_s": round(style.start_s, 3),
        "end_s": round(max(style.end_s, style.start_s + seconds), 3),
        "duration_s": round(seconds, 3),
    }
    return audio, meta


def _style_out(atmosphere: Atmosphere) -> StyleReferenceOut | None:
    meta = atmosphere.style_json
    if not isinstance(meta, dict):
        return None
    try:
        return StyleReferenceOut(**meta)
    except ValueError:
        return None


def owned_atmosphere(
    session: Session, user: User, atmosphere_id: int
) -> Atmosphere:
    atmosphere = session.get(Atmosphere, atmosphere_id)
    if atmosphere is None or atmosphere.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Atmosphere not found."
        )
    return atmosphere


def _review_layers(atmosphere: Atmosphere) -> list[DecompositionLayerOut] | None:
    if atmosphere.status != "awaiting_review":
        return None
    return [
        DecompositionLayerOut(
            label=str(element.get("label", "")),
            type=str(element.get("type", "sound")),
            role=str(element.get("role") or DEFAULT_ROLE),
            frequency=element.get("frequency"),
            prompt=str(element.get("prompt", "")),
        )
        for element in (atmosphere.decomposed_json or {}).get("elements", [])
        if isinstance(element, dict)
    ]


def _awaiting_review(session: Session, user: User, atmosphere_id: int) -> Atmosphere:
    atmosphere = owned_atmosphere(session, user, atmosphere_id)
    if atmosphere.status != "awaiting_review":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This atmosphere is not waiting for review.",
        )
    return atmosphere


def serialize_atmosphere(
    atmosphere: Atmosphere, include_elements: bool = False
) -> AtmosphereOut:
    return AtmosphereOut(
        id=atmosphere.id,
        title=atmosphere.title,
        prompt=atmosphere.prompt,
        duration_s=atmosphere.duration_s or DEFAULT_DURATION_S,
        use_events=atmosphere.use_events is not False,
        style=_style_out(atmosphere),
        status=atmosphere.status,
        progress=atmosphere.progress,
        current_stage=atmosphere.current_stage,
        stage_detail=atmosphere.stage_detail,
        error=atmosphere.error,
        created_at=atmosphere.created_at,
        updated_at=atmosphere.updated_at,
        generated_at=atmosphere.generated_at,
        timings=atmosphere.timings_json,
        elements=(
            [serialize_element(element) for element in atmosphere.elements]
            if include_elements
            else None
        ),
        decomposition=_review_layers(atmosphere) if include_elements else None,
    )


@router.get("")
def index(
    user: CurrentUser,
    session: SessionDep,
    page: int = Query(default=1, ge=1),
) -> Page[AtmosphereOut]:
    total = session.exec(
        select(func.count(Atmosphere.id)).where(Atmosphere.user_id == user.id)
    ).one()

    rows = session.exec(
        select(Atmosphere)
        .where(Atmosphere.user_id == user.id)
        .order_by(Atmosphere.created_at.desc(), Atmosphere.id.desc())
        .offset((page - 1) * PER_PAGE)
        .limit(PER_PAGE)
    ).all()

    return Page(
        data=[serialize_atmosphere(row) for row in rows],
        meta=PageMeta(
            current_page=page,
            last_page=max(1, math.ceil(total / PER_PAGE)),
            per_page=PER_PAGE,
            total=total,
        ),
    )


@router.post("", status_code=status.HTTP_202_ACCEPTED)
def store(
    payload: AtmosphereCreate,
    user: CurrentUser,
    session: SessionDep,
    request: Request,
) -> Envelope[AtmosphereOut]:
    style_audio, style_meta = (
        _decode_style(payload.style) if payload.style else (None, None)
    )

    atmosphere = Atmosphere(
        user_id=user.id,
        prompt=payload.prompt.strip(),
        title=payload.title.strip() if payload.title else None,
        duration_s=payload.duration_s,
        use_events=payload.use_events,
        style_json=style_meta,
        status="pending",
    )
    session.add(atmosphere)
    session.commit()
    session.refresh(atmosphere)

    if style_audio is not None:
        storage.write_style(atmosphere.id, style_audio)

    request.app.state.worker.submit(atmosphere.id)

    return Envelope(data=serialize_atmosphere(atmosphere, include_elements=True))


@router.post("/{atmosphere_id}/regenerate", status_code=status.HTTP_202_ACCEPTED)
def regenerate(
    atmosphere_id: int,
    user: CurrentUser,
    session: SessionDep,
    request: Request,
) -> Envelope[AtmosphereOut]:
    source = owned_atmosphere(session, user, atmosphere_id)
    decomposed = source.decomposed_json or {}

    elements = _element_specs(source) or [
        {
            "label": element["label"],
            "type": element["type"],
            "prompt": element["prompt"],
            **{
                key: element[key]
                for key in CARRIED_FIELDS
                if element.get(key) is not None
            },
        }
        for element in decomposed.get("elements", [])
        if isinstance(element, dict)
        and element.get("label")
        and element.get("type")
        and element.get("prompt")
    ]

    if not elements:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This atmosphere has no saved decomposition to regenerate from.",
        )

    fresh = Atmosphere(
        user_id=user.id,
        prompt=source.prompt,
        title=source.title,
        duration_s=source.duration_s,
        use_events=source.use_events,
        style_json=source.style_json,
        status="pending",
        decomposed_json={
            "atmosphere": decomposed.get("atmosphere"),
            "elements": elements,
        },
    )
    session.add(fresh)
    session.commit()
    session.refresh(fresh)

    if source.style_json and not storage.copy_style(source.id, fresh.id):
        fresh.style_json = None
        session.add(fresh)
        session.commit()
        session.refresh(fresh)

    request.app.state.worker.submit(fresh.id)

    return Envelope(data=serialize_atmosphere(fresh, include_elements=True))


@router.put(
    "/{atmosphere_id}/decomposition", status_code=status.HTTP_202_ACCEPTED
)
def confirm_decomposition(
    atmosphere_id: int,
    payload: DecompositionUpdate,
    user: CurrentUser,
    session: SessionDep,
    request: Request,
) -> Envelope[AtmosphereOut]:
    atmosphere = _awaiting_review(session, user, atmosphere_id)

    elements = normalize_elements(
        [element.model_dump(exclude_none=True) for element in payload.elements],
        atmosphere.use_events is not False,
    )
    atmosphere.decomposed_json = {
        "atmosphere": (atmosphere.decomposed_json or {}).get("atmosphere"),
        "elements": elements,
    }
    atmosphere.status = "pending"
    atmosphere.current_stage = None
    atmosphere.stage_detail = None
    atmosphere.progress = 0
    atmosphere.updated_at = utcnow()
    session.add(atmosphere)
    session.commit()
    session.refresh(atmosphere)

    request.app.state.worker.submit(atmosphere.id)

    return Envelope(data=serialize_atmosphere(atmosphere, include_elements=True))


@router.post("/{atmosphere_id}/decomposition/revise")
def revise(
    atmosphere_id: int,
    payload: DecompositionRevise,
    user: CurrentUser,
    session: SessionDep,
) -> Envelope[AtmosphereOut]:
    atmosphere = _awaiting_review(session, user, atmosphere_id)
    config = resolve_config(user.preferences, user.generators)

    try:
        revised = revise_decomposition(
            atmosphere.prompt,
            [element.model_dump() for element in payload.elements],
            payload.feedback.strip(),
            config,
            atmosphere.use_events is not False,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"The language model could not revise the layers: {exc}",
        )

    atmosphere.decomposed_json = {
        "atmosphere": (atmosphere.decomposed_json or {}).get("atmosphere")
        or revised.get("atmosphere"),
        "elements": revised["elements"],
    }
    atmosphere.updated_at = utcnow()
    session.add(atmosphere)
    session.commit()
    session.refresh(atmosphere)

    return Envelope(data=serialize_atmosphere(atmosphere, include_elements=True))


@router.get("/{atmosphere_id}")
def show(
    atmosphere_id: int, user: CurrentUser, session: SessionDep
) -> Envelope[AtmosphereOut]:
    atmosphere = owned_atmosphere(session, user, atmosphere_id)
    return Envelope(data=serialize_atmosphere(atmosphere, include_elements=True))


@router.delete("/{atmosphere_id}", status_code=status.HTTP_204_NO_CONTENT)
def destroy(atmosphere_id: int, user: CurrentUser, session: SessionDep) -> Response:
    atmosphere = owned_atmosphere(session, user, atmosphere_id)

    session.delete(atmosphere)
    session.commit()
    storage.delete_atmosphere_audio(atmosphere_id)
    storage.delete_style(atmosphere_id)

    return Response(status_code=status.HTTP_204_NO_CONTENT)
