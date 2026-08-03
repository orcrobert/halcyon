from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from api.app.deps import CurrentUser, SessionDep
from api.app.models.schemas import (
    Envelope,
    GeneratorCreate,
    GeneratorKindOut,
    GeneratorListOut,
    GeneratorOut,
    GeneratorProbe,
    GeneratorUpdate,
)
from api.app.models.tables import GeneratorProfile, User, utcnow
from api.app.services.generator import probe
from api.app.services.hosts import HOSTS, get_host
from api.app.services.runconfig import default_config, resolve_config

router = APIRouter(prefix="/api/generators", tags=["generators"])


def _serialize(profile: GeneratorProfile) -> GeneratorOut:
    return GeneratorOut(
        id=profile.id,
        name=profile.name,
        kind=profile.kind,
        url=profile.url,
        is_active=profile.is_active,
        last_status=profile.last_status,
        last_checked_at=profile.last_checked_at,
        reported=profile.reported_json,
    )


def _adopt_legacy_url(user: User, session: SessionDep) -> None:
    legacy = getattr(user.preferences, "generator_url", None)
    if not legacy or user.generators:
        return

    session.add(
        GeneratorProfile(
            user_id=user.id, name="My generator", kind="custom", url=legacy, is_active=True
        )
    )
    session.commit()
    session.refresh(user)


def _listing(user: User, session: SessionDep) -> GeneratorListOut:
    profiles = session.exec(
        select(GeneratorProfile)
        .where(GeneratorProfile.user_id == user.id)
        .order_by(GeneratorProfile.created_at)
    ).all()

    return GeneratorListOut(
        generators=[_serialize(profile) for profile in profiles],
        active_url=resolve_config(user.preferences, profiles).generator_url,
        instance_default_url=default_config().generator_url,
        kinds=[
            GeneratorKindOut(
                key=host.key,
                label=host.label,
                hint=host.hint,
                url_example=host.url_example,
                docs_url=host.docs_url,
            )
            for host in HOSTS.values()
        ],
    )


def _owned(generator_id: int, user: User, session: SessionDep) -> GeneratorProfile:
    profile = session.get(GeneratorProfile, generator_id)
    if profile is None or profile.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Generator not found."
        )
    return profile


def _deactivate_others(profile: GeneratorProfile, session: SessionDep) -> None:
    others = session.exec(
        select(GeneratorProfile).where(
            GeneratorProfile.user_id == profile.user_id,
            GeneratorProfile.id != profile.id,
            GeneratorProfile.is_active,
        )
    ).all()
    for other in others:
        other.is_active = False
        session.add(other)


def _reject_duplicate_name(
    name: str, user: User, session: SessionDep, exclude: int | None = None
) -> None:
    clash = session.exec(
        select(GeneratorProfile).where(
            GeneratorProfile.user_id == user.id, GeneratorProfile.name == name
        )
    ).first()
    if clash is not None and clash.id != exclude:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"You already have a generator called '{name}'.",
        )


@router.get("")
def index(user: CurrentUser, session: SessionDep) -> Envelope[GeneratorListOut]:
    _adopt_legacy_url(user, session)
    return Envelope(data=_listing(user, session))


@router.post("", status_code=status.HTTP_201_CREATED)
def store(
    payload: GeneratorCreate, user: CurrentUser, session: SessionDep
) -> Envelope[GeneratorListOut]:
    get_host(payload.kind)
    _reject_duplicate_name(payload.name, user, session)

    profile = GeneratorProfile(
        user_id=user.id,
        name=payload.name,
        kind=payload.kind,
        url=payload.url.rstrip("/"),
        is_active=payload.activate or not user.generators,
    )
    session.add(profile)
    session.commit()
    session.refresh(profile)

    if profile.is_active:
        _deactivate_others(profile, session)
        session.commit()

    return Envelope(data=_listing(user, session))


@router.patch("/{generator_id}")
def update(
    generator_id: int,
    payload: GeneratorUpdate,
    user: CurrentUser,
    session: SessionDep,
) -> Envelope[GeneratorListOut]:
    profile = _owned(generator_id, user, session)
    provided = payload.model_dump(exclude_unset=True)

    if "kind" in provided and provided["kind"]:
        get_host(provided["kind"])
        profile.kind = provided["kind"]

    if "name" in provided and provided["name"]:
        _reject_duplicate_name(provided["name"], user, session, exclude=profile.id)
        profile.name = provided["name"]

    if "url" in provided and provided["url"]:
        profile.url = provided["url"].rstrip("/")
        profile.last_status = None
        profile.last_checked_at = None
        profile.reported_json = None

    profile.updated_at = utcnow()
    session.add(profile)
    session.commit()

    return Envelope(data=_listing(user, session))


@router.post("/{generator_id}/activate")
def activate(
    generator_id: int, user: CurrentUser, session: SessionDep
) -> Envelope[GeneratorListOut]:
    profile = _owned(generator_id, user, session)
    profile.is_active = True
    profile.updated_at = utcnow()
    session.add(profile)
    _deactivate_others(profile, session)
    session.commit()

    return Envelope(data=_listing(user, session))


@router.post("/{generator_id}/test")
def test(
    generator_id: int, user: CurrentUser, session: SessionDep
) -> Envelope[GeneratorProbe]:
    profile = _owned(generator_id, user, session)
    result, detail, reported = probe(profile.url)

    profile.last_status = result
    profile.last_checked_at = utcnow()
    profile.reported_json = reported
    session.add(profile)
    session.commit()

    return Envelope(data=GeneratorProbe(status=result, detail=detail, reported=reported))


@router.delete("/{generator_id}")
def destroy(
    generator_id: int, user: CurrentUser, session: SessionDep
) -> Envelope[GeneratorListOut]:
    profile = _owned(generator_id, user, session)
    was_active = profile.is_active
    session.delete(profile)
    session.commit()

    if was_active:
        successor = session.exec(
            select(GeneratorProfile)
            .where(GeneratorProfile.user_id == user.id)
            .order_by(GeneratorProfile.created_at)
        ).first()
        if successor is not None:
            successor.is_active = True
            session.add(successor)
            session.commit()

    return Envelope(data=_listing(user, session))
