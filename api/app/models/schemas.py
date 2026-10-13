from datetime import datetime, timezone
from typing import Annotated, Any, Generic, Literal, TypeVar

from pydantic import (
    AfterValidator,
    BaseModel,
    Field,
    StringConstraints,
    model_validator,
)

from api.app.config import (
    DEFAULT_DURATION_S,
    MAX_DURATION_S,
    MAX_INTERVAL_S,
    MAX_REVIEW_LAYERS,
    MAX_STYLE_BYTES,
    MIN_DURATION_S,
    MIN_INTERVAL_S,
)

T = TypeVar("T")


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


Timestamp = Annotated[datetime, AfterValidator(_as_utc)]

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
    created_at: Timestamp
    updated_at: Timestamp


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
    review_decomposition: bool | None = None
    reduce_blur: bool | None = None
    modal_token_id: str | None = Field(default=None, max_length=255)
    modal_token_secret: str | None = Field(default=None, max_length=255)


class ProviderOut(BaseModel):
    key: str
    label: str
    default_model: str
    default_base_url: str | None
    requires_api_key: bool
    uses_base_url: bool
    suggested_models: list[str]
    key_label: str
    key_hint: str | None
    available: bool


class SettingsOut(BaseModel):
    generator_url: str | None
    decomposer_provider: str | None
    decomposer_model: str | None
    decomposer_base_url: str | None
    decomposer_api_key_set: bool
    decomposer_prompt: str | None
    theme: str | None
    review_decomposition: bool
    reduce_blur: bool
    modal_token_id: str | None
    modal_token_set: bool
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
    last_checked_at: Timestamp | None
    reported: dict[str, Any] | None
    options: dict[str, Any]
    pending_changes: list[str]
    deploy_status: str | None
    deploy_error: str | None
    deploy_log: str | None
    deploy_started_at: Timestamp | None
    deployed_at: Timestamp | None


class GeneratorOptionsUpdate(BaseModel):
    options: dict[str, Any]


class ModalGeneratorCreate(BaseModel):
    name: str = Field(default="Modal", min_length=1, max_length=60)
    options: dict[str, Any] = Field(default_factory=dict)


class OptionChoiceOut(BaseModel):
    value: str
    label: str


class GeneratorOptionSpecOut(BaseModel):
    key: str
    label: str
    hint: str
    kind: Literal["choice", "toggle", "number"]
    scope: Literal["deploy", "request"]
    default: Any
    choices: list[OptionChoiceOut]
    minimum: float | None
    maximum: float | None
    step: float | None
    unit: str | None
    hosts: list[str]


class DeployCapabilityOut(BaseModel):
    available: bool
    credentials: Literal["user", "instance"] | None


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
    option_specs: list[GeneratorOptionSpecOut]
    deploy: DeployCapabilityOut


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


class QualityIssue(BaseModel):
    check: Literal["clipping", "burst", "dropout", "harsh", "seam"]
    value: float
    limit: float


class ElementQuality(BaseModel):
    issues: list[QualityIssue]
    dismissed: bool


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
    quality: ElementQuality | None
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


class StyleReferenceIn(BaseModel):
    audio_b64: str = Field(min_length=1, max_length=MAX_STYLE_BYTES * 4 // 3 + 4)
    name: str = Field(default="Reference clip", max_length=255)
    start_s: float = Field(default=0, ge=0)
    end_s: float = Field(default=0, ge=0)


class StyleReferenceOut(BaseModel):
    name: str
    start_s: float
    end_s: float
    duration_s: float


class AtmosphereCreate(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    title: str | None = Field(default=None, max_length=255)
    duration_s: int = Field(
        default=DEFAULT_DURATION_S, ge=MIN_DURATION_S, le=MAX_DURATION_S
    )
    use_events: bool = True
    style: StyleReferenceIn | None = None


class DecompositionElement(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    type: Literal["sound", "music"]
    role: Literal["bed", "texture", "event"] = "texture"
    frequency: Literal["rare", "occasional", "frequent"] | None = None
    prompt: str = Field(min_length=1, max_length=1000)


def _unique_labels(elements: list[DecompositionElement]) -> list[DecompositionElement]:
    labels = [element.label.strip().casefold() for element in elements]
    if len(set(labels)) != len(labels):
        raise ValueError("Every layer needs a different name.")
    return elements


DecompositionElements = Annotated[
    list[DecompositionElement],
    Field(min_length=1, max_length=MAX_REVIEW_LAYERS),
    AfterValidator(_unique_labels),
]


class DecompositionLayerOut(BaseModel):
    label: str
    type: str
    role: str
    frequency: str | None = None
    prompt: str


class DecompositionUpdate(BaseModel):
    elements: DecompositionElements


class DecompositionRevise(BaseModel):
    feedback: str = Field(min_length=1, max_length=2000)
    elements: DecompositionElements


class AtmosphereOut(BaseModel):
    id: int
    title: str | None
    prompt: str
    duration_s: int
    use_events: bool
    style: StyleReferenceOut | None = None
    status: str
    progress: int
    current_stage: str | None
    stage_detail: str | None = None
    error: str | None
    created_at: Timestamp
    updated_at: Timestamp
    generated_at: Timestamp | None
    timings: dict[str, Any] | None = None
    elements: list[ElementOut] | None = None
    decomposition: list[DecompositionLayerOut] | None = None


class GenerateRequest(BaseModel):
    prompt: str
