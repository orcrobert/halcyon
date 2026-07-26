import logging
from pathlib import Path

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings

REPO_ROOT = Path(__file__).resolve().parents[2]

LEGACY_PROVIDER_NAMES = {"gemini": "gemini", "llama": "ollama", "mistral": "ollama"}

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    generator_url: str = Field(
        default="http://localhost:9000",
        validation_alias=AliasChoices("GENERATOR_URL", "COLAB_URL"),
    )
    decomposer_provider: str = "gemini"
    decomposer_model: str | None = None
    decomposer_base_url: str | None = None
    decomposer_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("DECOMPOSER_API_KEY", "GEMINI_API_KEY"),
    )

    data_dir: str = "data"
    secret_key: str | None = None
    allow_registration: bool = True
    frontend_origin: str = ""
    frontend_dist: str = "frontend/dist"

    model_config = {
        "env_file": str(REPO_ROOT / ".env"),
        "populate_by_name": True,
        "extra": "ignore",
    }

    @model_validator(mode="after")
    def _migrate_legacy_decomposer(self) -> "Settings":
        legacy = (self.decomposer_model or "").strip().lower()
        if legacy in LEGACY_PROVIDER_NAMES:
            logger.warning(
                "DECOMPOSER_MODEL=%s names a provider, not a model. Reading it as "
                "DECOMPOSER_PROVIDER=%s; see .env.example for the current names.",
                legacy,
                LEGACY_PROVIDER_NAMES[legacy],
            )
            self.decomposer_provider = LEGACY_PROVIDER_NAMES[legacy]
            self.decomposer_model = "mistral" if legacy == "mistral" else None

        if self.decomposer_base_url:
            self.decomposer_base_url = self.decomposer_base_url.rstrip("/").removesuffix(
                "/api/generate"
            )

        return self

    @property
    def data_path(self) -> Path:
        path = Path(self.data_dir)
        return path if path.is_absolute() else REPO_ROOT / path

    @property
    def audio_path(self) -> Path:
        return self.data_path / "audio"

    @property
    def database_path(self) -> Path:
        return self.data_path / "halcyon.db"

    @property
    def frontend_dist_path(self) -> Path:
        path = Path(self.frontend_dist)
        return path if path.is_absolute() else REPO_ROOT / path


settings = Settings()
