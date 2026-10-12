from collections.abc import Sequence
from dataclasses import dataclass, field

from api.app.config import settings
from api.app.models.tables import GeneratorProfile, UserSettings
from api.app.security import decrypt_secret
from api.app.services.generator_options import request_options
from api.app.services.prompts import default_decomposer_prompt


@dataclass(frozen=True)
class RunConfig:
    generator_url: str
    decomposer_provider: str
    decomposer_model: str | None
    decomposer_base_url: str | None
    decomposer_api_key: str | None
    decomposer_prompt: str
    generator_kind: str = "custom"
    generator_name: str | None = None
    generator_options: dict = field(default_factory=dict)


def default_config() -> RunConfig:
    return RunConfig(
        generator_url=settings.generator_url,
        generator_kind="custom",
        generator_name=None,
        decomposer_provider=settings.decomposer_provider,
        decomposer_model=settings.decomposer_model,
        decomposer_base_url=settings.decomposer_base_url,
        decomposer_api_key=settings.decomposer_api_key,
        decomposer_prompt=default_decomposer_prompt(),
    )


def active_generator(
    generators: Sequence[GeneratorProfile] | None = None,
) -> GeneratorProfile | None:
    for profile in generators or ():
        if profile.is_active and profile.url:
            return profile
    return None


def active_generator_url(
    preferences: UserSettings | None,
    generators: Sequence[GeneratorProfile] | None = None,
) -> str:
    profile = active_generator(generators)
    if profile is not None:
        return profile.url

    return getattr(preferences, "generator_url", None) or settings.generator_url


def _generator_fields(
    preferences: UserSettings | None,
    generators: Sequence[GeneratorProfile] | None,
) -> dict:
    profile = active_generator(generators)
    return {
        "generator_url": active_generator_url(preferences, generators),
        "generator_kind": profile.kind if profile is not None else "custom",
        "generator_name": profile.name if profile is not None else None,
        "generator_options": (
            request_options(profile.kind, profile.options_json)
            if profile is not None
            else {}
        ),
    }


def resolve_config(
    preferences: UserSettings | None,
    generators: Sequence[GeneratorProfile] | None = None,
) -> RunConfig:
    defaults = default_config()
    if preferences is None and not generators:
        return defaults

    if preferences is None:
        return RunConfig(
            **_generator_fields(None, generators),
            decomposer_provider=defaults.decomposer_provider,
            decomposer_model=defaults.decomposer_model,
            decomposer_base_url=defaults.decomposer_base_url,
            decomposer_api_key=defaults.decomposer_api_key,
            decomposer_prompt=defaults.decomposer_prompt,
        )

    provider = preferences.decomposer_provider or defaults.decomposer_provider
    switched_provider = provider != defaults.decomposer_provider

    return RunConfig(
        **_generator_fields(preferences, generators),
        decomposer_provider=provider,
        decomposer_model=preferences.decomposer_model
        or (None if switched_provider else defaults.decomposer_model),
        decomposer_base_url=preferences.decomposer_base_url
        or (None if switched_provider else defaults.decomposer_base_url),
        decomposer_api_key=decrypt_secret(preferences.decomposer_api_key_enc)
        or (None if switched_provider else defaults.decomposer_api_key),
        decomposer_prompt=preferences.decomposer_prompt or defaults.decomposer_prompt,
    )
