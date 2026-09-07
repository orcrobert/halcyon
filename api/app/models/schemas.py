from datetime import datetime
from typing import Annotated, Any, Generic, Literal, TypeVar

from pydantic import BaseModel, Field, StringConstraints, model_validator

from api.app.config import (
    DEFAULT_DURATION_S,
    MAX_DURATION_S,
    MAX_INTERVAL_S,
    MIN_DURATION_S,
    MIN_INTERVAL_S,
)

T = TypeVar("T")

Email = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        to_lower=True,
        max_length=255,
        pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
    ),
]


class Envelope(BaseModel, Generic[T]):
    data: T


class PageMeta(BaseModel):
    current_page: int
    last_page: int
    per_page: int
    total: int


class Page(BaseModel, Generic[T]):
    data: list[T]
    meta: PageMeta


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: Email
    password: str = Field(min_length=8, max_length=255)


class LoginRequest(BaseModel):
    email: Email
    password: str


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    created_at: datetime
    updated_at: datetime


class AuthResponse(BaseModel):
    data: UserOut
    token: str


class SettingsUpdate(BaseModel):
    generator_url: str | None = None
    decomposer_provider: str | None = None
    decomposer_model: str | None = None
    decomposer_base_url: str | None = None
    decomposer_api_key: str | None = None
    decomposer_prompt: str | None = Field(default=None, max_length=40000)
    theme: str | None = Field(default=None, max_length=64)


class ProviderOut(BaseModel):
    key: str
    label: str
    default_model: str
    default_base_url: str | None
    requires_api_key: bool


class SettingsOut(BaseModel):
    generator_url: str | None
    decomposer_provider: str | None
    decomposer_model: str | None
    decomposer_base_url: str | None
    decomposer_api_key_set: bool
    decomposer_prompt: str | None
    theme: str | None
    defaults: dict[str, str | None]
    providers: list[ProviderOut]


GeneratorKind = Literal["colab", "modal", "huggingface", "local", "custom"]

GeneratorUrl = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=2000),
]


class GeneratorCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    url: GeneratorUrl
    kind: GeneratorKind = "custom"
    activate: bool = True


class GeneratorUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    url: GeneratorUrl | None = None
    kind: GeneratorKind | None = None


class GeneratorOut(BaseModel):
    id: int
    name: str
    kind: str
    url: str
    is_active: bool
    last_status: str | None
    last_checked_at: datetime | None
    reported: dict[str, Any] | None


class GeneratorProbe(BaseModel):
    status: str
    detail: str | None = None
    reported: dict[str, Any] | None = None


class GeneratorKindOut(BaseModel):
    key: str
    label: str
    hint: str
    url_example: str
    docs_url: str


class GeneratorListOut(BaseModel):
    generators: list[GeneratorOut]
    active_url: str
    instance_default_url: str
    kinds: list[GeneratorKindOut]


class EQBand(BaseModel):
    type: Literal["lowshelf", "peaking", "highshelf"]
    freq: float = Field(gt=0)
    gain: float
    q: float = Field(gt=0)


class ElementOriginal(BaseModel):
    volume: float
    pan: float
    depth: float
    eq_json: list[dict[str, Any]] | None


class ElementOut(BaseModel):
    id: int
    label: str
    type: str
    prompt: str
    duration_s: float | None
    status: str
    error: str | None
    version: int
    position: int
    playback: Literal["loop", "oneshot"]
    clip_s: int | None
    interval_min_s: float | None
    interval_max_s: float | None
    source: str
    source_json: dict[str, Any] | None
    volume: float
    pan: float
    depth: float
    tuning_hz: float
    eq_json: list[dict[str, Any]] | None
    original: ElementOriginal
    audio_url: str | None


class ElementMixUpdate(BaseModel):
    volume: float | None = Field(default=None, ge=0, le=2)
    pan: float | None = Field(default=None, ge=-1, le=1)
    depth: float | None = Field(default=None, ge=0, le=1)
    tuning_hz: float | None = Field(default=None, ge=200, le=800)
    interval_min_s: float | None = Field(
        default=None, ge=MIN_INTERVAL_S, le=MAX_INTERVAL_S
    )
    interval_max_s: float | None = Field(
        default=None, ge=MIN_INTERVAL_S, le=MAX_INTERVAL_S
    )
    eq_json: list[EQBand] | None = None

    @model_validator(mode="after")
    def _ordered_interval(self) -> "ElementMixUpdate":
        if (
            self.interval_min_s is not None
            and self.interval_max_s is not None
            and self.interval_max_s < self.interval_min_s
        ):
            raise ValueError("interval_max_s must not be below interval_min_s")
        return self


class ElementRegenerate(BaseModel):
    feedback: str | None = Field(default=None, max_length=2000)


class AtmosphereCreate(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    title: str | None = Field(default=None, max_length=255)
    duration_s: int = Field(
        default=DEFAULT_DURATION_S, ge=MIN_DURATION_S, le=MAX_DURATION_S
    )
    use_events: bool = True


class AtmosphereOut(BaseModel):
    id: int
    title: str | None
    prompt: str
    duration_s: int
    use_events: bool
    status: str
    progress: int
    current_stage: str | None
    error: str | None
    created_at: datetime
    updated_at: datetime
    generated_at: datetime | None
    timings: dict[str, Any] | None = None
    elements: list[ElementOut] | None = None


class GenerateRequest(BaseModel):
    prompt: str
