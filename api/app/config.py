import logging
from pathlib import Path

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings

REPO_ROOT = Path(__file__).resolve().parents[2]

LEGACY_PROVIDER_NAMES = {"gemini": "gemini", "llama": "ollama", "mistral": "ollama"}

DEFAULT_DURATION_S = 10
MIN_DURATION_S = 5
MAX_DURATION_S = 120

BED_CLIP_S = 4
EVENT_CLIP_S = 2
DEFAULT_TEXTURE_TAKES = 2
MIN_TEXTURE_TAKES = 1
MAX_TEXTURE_TAKES = 3
ROLE_INTERVALS = {
    "rare": (30.0, 90.0),
    "occasional": (8.0, 25.0),
    "frequent": (3.0, 8.0),
}
MIN_INTERVAL_S = 1.0
MAX_INTERVAL_S = 300.0
MAX_REVIEW_LAYERS = 12
MIN_STYLE_S = 1.5
MAX_STYLE_S = 4.5
MAX_STYLE_BYTES = 4 * 1024 * 1024

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
    decomposer_allow_cli: bool = False

    modal_token_id: str | None = None
    modal_token_secret: str | None = None
    generators_dir: str = "generators"

    data_dir: str = "data"
    secret_key: str | None = None
    allow_registration: bool = True
    frontend_origin: str = ""
    frontend_dist: str = "frontend/dist"

    halcyon_version: str = "dev"
    halcyon_tag: str = "latest"
    updater_url: str = "http://updater:8080"
    updater_token_file: str | None = "/updater/token"

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
    def modal_deploy_script(self) -> Path:
        path = Path(self.generators_dir)
        root = path if path.is_absolute() else REPO_ROOT / path
        return root / "modal" / "deploy.py"

    @property
    def frontend_dist_path(self) -> Path:
        path = Path(self.frontend_dist)
        return path if path.is_absolute() else REPO_ROOT / path


settings = Settings()
