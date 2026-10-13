from fastapi import APIRouter, HTTPException, Request, status
from sqlmodel import select

from api.app.deps import AccountOwner, SessionDep
from api.app.models.schemas import (
    DeployCapabilityOut,
    Envelope,
    GeneratorCreate,
    GeneratorKindOut,
    GeneratorListOut,
    GeneratorOptionSpecOut,
    GeneratorOptionsUpdate,
    GeneratorOut,
    GeneratorProbe,
    GeneratorUpdate,
    ModalGeneratorCreate,
    OptionChoiceOut,
)
from api.app.models.tables import GeneratorProfile, User, utcnow
from api.app.services.generator import probe
from api.app.services.generator_options import (
    DEPLOYABLE_KINDS,
    OPTIONS,
    effective,
    pending_changes,
    validate,
)
from api.app.services.hosts import HOSTS, get_host
from api.app.services.modal_deploy import (
    credentials_source,
    deploy_available,
    modal_credentials,
)
from api.app.services.runconfig import default_config, resolve_config

router = APIRouter(tags=["generators"])


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
        options=effective(profile.kind, profile.options_json),
        pending_changes=pending_changes(
            profile.kind, profile.options_json, profile.deployed_json
        ),
        deploy_status=profile.deploy_status,
        deploy_error=profile.deploy_error,
        deploy_log=profile.deploy_log,
        deploy_started_at=profile.deploy_started_at,
        deployed_at=profile.deployed_at,
    )


OPTION_SPECS = [
    GeneratorOptionSpecOut(
        key=spec.key,
        label=spec.label,
        hint=spec.hint,
        kind=spec.kind,
        scope=spec.scope,
        default=spec.default,
        choices=[
            OptionChoiceOut(value=choice.value, label=choice.label)
            for choice in spec.choices
        ],
        minimum=spec.minimum,
        maximum=spec.maximum,
        step=spec.step,
        unit=spec.unit,
        hosts=list(spec.hosts),
    )
    for spec in OPTIONS
]


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
        option_specs=OPTION_SPECS,
        deploy=DeployCapabilityOut(
            available=deploy_available(),
            credentials=credentials_source(user.preferences),
        ),
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
def index(user: AccountOwner, session: SessionDep) -> Envelope[GeneratorListOut]:
    _adopt_legacy_url(user, session)
    return Envelope(data=_listing(user, session))


@router.post("", status_code=status.HTTP_201_CREATED)
def store(
    payload: GeneratorCreate, user: AccountOwner, session: SessionDep
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
    user: AccountOwner,
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


def _start_deploy(
    profile: GeneratorProfile, user: User, session: SessionDep, request: Request
) -> None:
    if profile.kind not in DEPLOYABLE_KINDS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only Modal generators can be deployed from here.",
        )
    if not deploy_available():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This server has no generators/ folder to deploy from.",
        )
    if modal_credentials(user.preferences) is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Add your Modal token before deploying.",
        )

    deployer = request.app.state.deployer
    if profile.deploy_status == "deploying" and deployer.is_running(profile.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A deploy is already running for this generator.",
        )

    profile.deploy_status = "deploying"
    profile.deploy_error = None
    profile.deploy_log = None
    profile.deploy_started_at = utcnow()
    profile.updated_at = utcnow()
    session.add(profile)
    session.commit()

    deployer.start(profile.id)


@router.post("/modal", status_code=status.HTTP_202_ACCEPTED)
def create_modal(
    payload: ModalGeneratorCreate,
    user: AccountOwner,
    session: SessionDep,
    request: Request,
) -> Envelope[GeneratorListOut]:
    existing = session.exec(
        select(GeneratorProfile).where(
            GeneratorProfile.user_id == user.id, GeneratorProfile.kind == "modal"
        )
    ).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have a Modal generator. Redeploy it instead.",
        )
    _reject_duplicate_name(payload.name, user, session)
    try:
        options = validate("modal", payload.options)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )

    profile = GeneratorProfile(
        user_id=user.id,
        name=payload.name,
        kind="modal",
        url="",
        is_active=False,
        options_json=options or None,
    )
    session.add(profile)
    session.commit()
    session.refresh(profile)

    _start_deploy(profile, user, session, request)
    return Envelope(data=_listing(user, session))


@router.put("/{generator_id}/options")
def update_options(
    generator_id: int,
    payload: GeneratorOptionsUpdate,
    user: AccountOwner,
    session: SessionDep,
) -> Envelope[GeneratorListOut]:
    profile = _owned(generator_id, user, session)

    removed = [key for key, value in payload.options.items() if value is None]
    try:
        clean = validate(
            profile.kind,
            {k: v for k, v in payload.options.items() if v is not None},
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )

    merged = {
        k: v for k, v in (profile.options_json or {}).items() if k not in removed
    }
    merged.update(clean)
    profile.options_json = merged or None
    profile.updated_at = utcnow()
    session.add(profile)
    session.commit()

    return Envelope(data=_listing(user, session))


@router.post("/{generator_id}/deploy", status_code=status.HTTP_202_ACCEPTED)
def deploy(
    generator_id: int,
    user: AccountOwner,
    session: SessionDep,
    request: Request,
) -> Envelope[GeneratorListOut]:
    profile = _owned(generator_id, user, session)
    _start_deploy(profile, user, session, request)
    return Envelope(data=_listing(user, session))


@router.post("/{generator_id}/activate")
def activate(
    generator_id: int, user: AccountOwner, session: SessionDep
) -> Envelope[GeneratorListOut]:
    profile = _owned(generator_id, user, session)
    if not profile.url:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This generator has no URL yet. Deploy it first.",
        )
    profile.is_active = True
    profile.updated_at = utcnow()
    session.add(profile)
    _deactivate_others(profile, session)
    session.commit()

    return Envelope(data=_listing(user, session))


@router.post("/{generator_id}/test")
def test(
    generator_id: int, user: AccountOwner, session: SessionDep
) -> Envelope[GeneratorProbe]:
    profile = _owned(generator_id, user, session)
    if not profile.url:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This generator has no URL yet. Deploy it first.",
        )
    result, detail, reported = probe(profile.url)

    profile.last_status = result
    profile.last_checked_at = utcnow()
    profile.reported_json = reported
    session.add(profile)
    session.commit()

    return Envelope(data=GeneratorProbe(status=result, detail=detail, reported=reported))


@router.delete("/{generator_id}")
def destroy(
    generator_id: int, user: AccountOwner, session: SessionDep
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
