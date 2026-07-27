from dataclasses import dataclass

from ai.app.config import settings
from ai.app.models.tables import UserSettings
from ai.app.security import decrypt_secret


@dataclass(frozen=True)
class RunConfig:
    generator_url: str
    decomposer_provider: str
    decomposer_model: str | None
    decomposer_base_url: str | None
    decomposer_api_key: str | None


def default_config() -> RunConfig:
    return RunConfig(
        generator_url=settings.generator_url,
        decomposer_provider=settings.decomposer_provider,
        decomposer_model=settings.decomposer_model,
        decomposer_base_url=settings.decomposer_base_url,
        decomposer_api_key=settings.decomposer_api_key,
    )


def resolve_config(preferences: UserSettings | None) -> RunConfig:
    defaults = default_config()
    if preferences is None:
        return defaults

    provider = preferences.decomposer_provider or defaults.decomposer_provider
    switched_provider = provider != defaults.decomposer_provider

    return RunConfig(
        generator_url=preferences.generator_url or defaults.generator_url,
        decomposer_provider=provider,
        decomposer_model=preferences.decomposer_model
        or (None if switched_provider else defaults.decomposer_model),
        decomposer_base_url=preferences.decomposer_base_url
        or (None if switched_provider else defaults.decomposer_base_url),
        decomposer_api_key=decrypt_secret(preferences.decomposer_api_key_enc)
        or (None if switched_provider else defaults.decomposer_api_key),
    )
