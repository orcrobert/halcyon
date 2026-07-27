from fastapi import APIRouter, HTTPException, status

from ai.app.deps import CurrentUser, SessionDep
from ai.app.models.schemas import Envelope, ProviderOut, SettingsOut, SettingsUpdate
from ai.app.models.tables import UserSettings
from ai.app.security import encrypt_secret
from ai.app.services.providers import PROVIDERS, get_provider
from ai.app.services.runconfig import default_config

router = APIRouter(prefix="/api/settings", tags=["settings"])

PLAIN_FIELDS = (
    "generator_url",
    "decomposer_provider",
    "decomposer_model",
    "decomposer_base_url",
)


def _serialize(preferences: UserSettings | None) -> SettingsOut:
    defaults = default_config()
    return SettingsOut(
        generator_url=getattr(preferences, "generator_url", None),
        decomposer_provider=getattr(preferences, "decomposer_provider", None),
        decomposer_model=getattr(preferences, "decomposer_model", None),
        decomposer_base_url=getattr(preferences, "decomposer_base_url", None),
        decomposer_api_key_set=bool(
            getattr(preferences, "decomposer_api_key_enc", None)
        ),
        defaults={
            "generator_url": defaults.generator_url,
            "decomposer_provider": defaults.decomposer_provider,
            "decomposer_model": defaults.decomposer_model,
            "decomposer_base_url": defaults.decomposer_base_url,
        },
        providers=[
            ProviderOut(
                key=provider.key,
                label=provider.label,
                default_model=provider.default_model,
                default_base_url=provider.default_base_url,
                requires_api_key=provider.requires_api_key,
            )
            for provider in PROVIDERS.values()
        ],
    )


@router.get("")
def show(user: CurrentUser) -> Envelope[SettingsOut]:
    return Envelope(data=_serialize(user.preferences))


@router.put("")
def update(
    payload: SettingsUpdate, user: CurrentUser, session: SessionDep
) -> Envelope[SettingsOut]:
    provided = payload.model_dump(exclude_unset=True)

    if provided.get("decomposer_provider"):
        try:
            get_provider(provided["decomposer_provider"])
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
            )

    preferences = user.preferences or UserSettings(user_id=user.id)

    for field in PLAIN_FIELDS:
        if field in provided:
            value = (provided[field] or "").strip()
            setattr(preferences, field, value or None)

    if "decomposer_api_key" in provided:
        key = (provided["decomposer_api_key"] or "").strip()
        preferences.decomposer_api_key_enc = encrypt_secret(key) if key else None

    session.add(preferences)
    session.commit()
    session.refresh(preferences)

    return Envelope(data=_serialize(preferences))
