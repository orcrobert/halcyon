import math

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from sqlmodel import Session, func, select

from api.app.config import DEFAULT_DURATION_S
from api.app.deps import CurrentUser, SessionDep
from api.app.models.schemas import (
    AtmosphereCreate,
    AtmosphereOut,
    Envelope,
    Page,
    PageMeta,
)
from api.app.models.tables import Atmosphere, User
from api.app.routers.elements import serialize_element
from api.app.services import storage

router = APIRouter(prefix="/api/atmospheres", tags=["atmospheres"])

PER_PAGE = 20


def owned_atmosphere(
    session: Session, user: User, atmosphere_id: int
) -> Atmosphere:
    atmosphere = session.get(Atmosphere, atmosphere_id)
    if atmosphere is None or atmosphere.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Atmosphere not found."
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
        status=atmosphere.status,
        progress=atmosphere.progress,
        current_stage=atmosphere.current_stage,
        error=atmosphere.error,
        created_at=atmosphere.created_at,
        updated_at=atmosphere.updated_at,
        generated_at=atmosphere.generated_at,
        elements=(
            [serialize_element(element) for element in atmosphere.elements]
            if include_elements
            else None
        ),
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
    atmosphere = Atmosphere(
        user_id=user.id,
        prompt=payload.prompt.strip(),
        title=payload.title.strip() if payload.title else None,
        duration_s=payload.duration_s,
        status="pending",
    )
    session.add(atmosphere)
    session.commit()
    session.refresh(atmosphere)

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

    elements = [
        {"label": element.label, "type": element.type, "prompt": element.prompt}
        for element in source.elements
    ] or [
        {"label": element["label"], "type": element["type"], "prompt": element["prompt"]}
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
        status="pending",
        decomposed_json={
            "atmosphere": decomposed.get("atmosphere"),
            "elements": elements,
        },
    )
    session.add(fresh)
    session.commit()
    session.refresh(fresh)

    request.app.state.worker.submit(fresh.id)

    return Envelope(data=serialize_atmosphere(fresh, include_elements=True))


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

    return Response(status_code=status.HTTP_204_NO_CONTENT)
