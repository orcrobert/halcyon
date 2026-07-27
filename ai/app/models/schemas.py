from datetime import datetime
from typing import Annotated, Any, Generic, Literal, TypeVar

from pydantic import BaseModel, Field, StringConstraints

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
    defaults: dict[str, str | None]
    providers: list[ProviderOut]


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
    position: int
    volume: float
    pan: float
    depth: float
    tuning_hz: float
    eq_json: list[dict[str, Any]] | None
    original: ElementOriginal
    audio_url: str


class ElementMixUpdate(BaseModel):
    volume: float | None = Field(default=None, ge=0, le=2)
    pan: float | None = Field(default=None, ge=-1, le=1)
    depth: float | None = Field(default=None, ge=0, le=1)
    tuning_hz: float | None = Field(default=None, ge=200, le=800)
    eq_json: list[EQBand] | None = None


class AtmosphereCreate(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    title: str | None = Field(default=None, max_length=255)


class AtmosphereOut(BaseModel):
    id: int
    title: str | None
    prompt: str
    status: str
    progress: int
    current_stage: str | None
    error: str | None
    created_at: datetime
    updated_at: datetime
    generated_at: datetime | None
    elements: list[ElementOut] | None = None


class GenerateRequest(BaseModel):
    prompt: str
