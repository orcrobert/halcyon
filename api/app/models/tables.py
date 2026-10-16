from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import JSON, Column, DateTime, UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel

from api.app.config import DEFAULT_DURATION_S


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _timestamp_column() -> Column:
    return Column(DateTime(timezone=True), nullable=False, default=utcnow)


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    name: str
    email: str = Field(index=True, unique=True)
    password_hash: str
    is_admin: bool | None = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow, sa_column=_timestamp_column())
    updated_at: datetime = Field(default_factory=utcnow, sa_column=_timestamp_column())

    tokens: list["AuthToken"] = Relationship(
        back_populates="user", cascade_delete=True
    )
    atmospheres: list["Atmosphere"] = Relationship(
        back_populates="user", cascade_delete=True
    )
    preferences: Optional["UserSettings"] = Relationship(
        back_populates="user",
        cascade_delete=True,
        sa_relationship_kwargs={"uselist": False},
    )
    generators: list["GeneratorProfile"] = Relationship(
        back_populates="user",
        cascade_delete=True,
        sa_relationship_kwargs={"order_by": "GeneratorProfile.created_at"},
    )


class AuthToken(SQLModel, table=True):
    __tablename__ = "auth_tokens"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True, ondelete="CASCADE")
    token_hash: str = Field(index=True, unique=True)
    created_at: datetime = Field(default_factory=utcnow, sa_column=_timestamp_column())
    last_used_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )

    user: User = Relationship(back_populates="tokens")


class UserSettings(SQLModel, table=True):
    __tablename__ = "user_settings"

    user_id: int | None = Field(
        default=None, foreign_key="users.id", primary_key=True, ondelete="CASCADE"
    )
    generator_url: str | None = None
    decomposer_provider: str | None = None
    decomposer_model: str | None = None
    decomposer_base_url: str | None = None
    decomposer_api_key_enc: str | None = None
    decomposer_prompt: str | None = None
    theme: str | None = None
    review_decomposition: bool | None = None
    reduce_blur: bool | None = None
    modal_token_id: str | None = None
    modal_token_secret_enc: str | None = None

    user: User = Relationship(back_populates="preferences")


class InstanceSettings(SQLModel, table=True):
    __tablename__ = "instance_settings"

    id: int | None = Field(default=None, primary_key=True)
    auto_update: bool | None = None


class GeneratorProfile(SQLModel, table=True):
    __tablename__ = "generator_profiles"
    __table_args__ = (UniqueConstraint("user_id", "name"),)

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True, ondelete="CASCADE")
    name: str
    kind: str = "custom"
    url: str
    is_active: bool = Field(default=False, index=True)
    last_status: str | None = None
    last_checked_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    reported_json: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    options_json: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    deployed_json: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    deploy_status: str | None = None
    deploy_error: str | None = None
    deploy_log: str | None = None
    deploy_started_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    deployed_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    created_at: datetime = Field(default_factory=utcnow, sa_column=_timestamp_column())
    updated_at: datetime = Field(default_factory=utcnow, sa_column=_timestamp_column())

    user: User = Relationship(back_populates="generators")


class Atmosphere(SQLModel, table=True):
    __tablename__ = "atmospheres"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True, ondelete="CASCADE")
    title: str | None = None
    prompt: str
    duration_s: int | None = DEFAULT_DURATION_S
    use_events: bool | None = None
    style_json: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    status: str = Field(default="pending", index=True)
    progress: int = 0
    current_stage: str | None = None
    stage_detail: str | None = None
    error: str | None = None
    decomposed_json: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    timings_json: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    created_at: datetime = Field(default_factory=utcnow, sa_column=_timestamp_column())
    updated_at: datetime = Field(default_factory=utcnow, sa_column=_timestamp_column())
    generated_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )

    user: User = Relationship(back_populates="atmospheres")
    elements: list["Element"] = Relationship(
        back_populates="atmosphere",
        cascade_delete=True,
        sa_relationship_kwargs={"order_by": "Element.position"},
    )


class Element(SQLModel, table=True):
    __tablename__ = "elements"
    __table_args__ = (UniqueConstraint("atmosphere_id", "position"),)

    id: int | None = Field(default=None, primary_key=True)
    atmosphere_id: int = Field(
        foreign_key="atmospheres.id", index=True, ondelete="CASCADE"
    )
    position: int = 0
    label: str
    type: str
    prompt: str
    audio_path: str
    duration_s: float | None = None
    status: str | None = "ready"
    error: str | None = None
    version: int | None = 1

    playback: str | None = None
    clip_s: int | None = None
    interval_min_s: float | None = None
    interval_max_s: float | None = None
    source: str | None = None
    source_json: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    quality_json: list[dict[str, Any]] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    quality_dismissed: bool | None = None

    volume: float = 0.8
    pan: float = 0.0
    depth: float = 0.0
    tuning_hz: float = 440.0
    eq_json: list[dict[str, Any]] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )

    original_volume: float = 0.8
    original_pan: float = 0.0
    original_depth: float = 0.0
    original_eq_json: list[dict[str, Any]] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )

    atmosphere: Atmosphere = Relationship(back_populates="elements")
