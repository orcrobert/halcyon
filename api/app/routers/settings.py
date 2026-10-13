from fastapi import APIRouter, HTTPException, status

from api.app.deps import AccountOwner, SessionDep
from api.app.models.schemas import Envelope, ProviderOut, SettingsOut, SettingsUpdate
from api.app.models.tables import UserSettings
from api.app.security import encrypt_secret
from api.app.services.prompts import default_decomposer_prompt
from api.app.services.providers import (
    PROVIDERS,
    Provider,
    available_providers,
    get_provider,
)
from api.app.services.runconfig import default_config

router = APIRouter(tags=["settings"])

PLAIN_FIELDS = (
    "generator_url",
    "decomposer_provider",
    "decomposer_model",
    "decomposer_base_url",
    "decomposer_prompt",
    "theme",
    "modal_token_id",
)


def _listed_providers(preferences: UserSettings | None) -> list[Provider]:
    listed = available_providers()
    saved = PROVIDERS.get(getattr(preferences, "decomposer_provider", None) or "")
    if saved is not None and saved not in listed:
        listed.append(saved)
    return listed


def _serialize(preferences: UserSettings | None) -> SettingsOut:
    defaults = default_config()
    enabled = available_providers()
    return SettingsOut(
        generator_url=getattr(preferences, "generator_url", None),
        decomposer_provider=getattr(preferences, "decomposer_provider", None),
        decomposer_model=getattr(preferences, "decomposer_model", None),
        decomposer_base_url=getattr(preferences, "decomposer_base_url", None),
        decomposer_api_key_set=bool(
            getattr(preferences, "decomposer_api_key_enc", None)
        ),
        decomposer_prompt=getattr(preferences, "decomposer_prompt", None),
        theme=getattr(preferences, "theme", None),
        review_decomposition=bool(
            getattr(preferences, "review_decomposition", None)
        ),
        reduce_blur=bool(getattr(preferences, "reduce_blur", None)),
        modal_token_id=getattr(preferences, "modal_token_id", None),
        modal_token_set=bool(getattr(preferences, "modal_token_secret_enc", None)),
        defaults={
            "generator_url": defaults.generator_url,
            "decomposer_provider": defaults.decomposer_provider,
            "decomposer_model": defaults.decomposer_model,
            "decomposer_base_url": defaults.decomposer_base_url,
            "decomposer_prompt": default_decomposer_prompt(),
        },
        providers=[
            ProviderOut(
                key=provider.key,
                label=provider.label,
                default_model=provider.default_model,
                default_base_url=provider.default_base_url,
                requires_api_key=provider.requires_api_key,
                uses_base_url=provider.uses_base_url,
                suggested_models=list(provider.suggested_models),
                key_label=provider.key_label,
                key_hint=provider.key_hint,
                available=provider in enabled,
            )
            for provider in _listed_providers(preferences)
        ],
    )


@router.get("")
def show(user: AccountOwner) -> Envelope[SettingsOut]:
    return Envelope(data=_serialize(user.preferences))


@router.put("")
def update(
    payload: SettingsUpdate, user: AccountOwner, session: SessionDep
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

    if "review_decomposition" in provided:
        preferences.review_decomposition = bool(provided["review_decomposition"])

    if "reduce_blur" in provided:
        preferences.reduce_blur = bool(provided["reduce_blur"])

    if "decomposer_api_key" in provided:
        key = (provided["decomposer_api_key"] or "").strip()
        preferences.decomposer_api_key_enc = encrypt_secret(key) if key else None

    if "modal_token_secret" in provided:
        secret = (provided["modal_token_secret"] or "").strip()
        preferences.modal_token_secret_enc = encrypt_secret(secret) if secret else None

    session.add(preferences)
    session.commit()
    session.refresh(preferences)

    return Envelope(data=_serialize(preferences))
