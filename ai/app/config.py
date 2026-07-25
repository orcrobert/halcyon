from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    ollama_url: str = "http://localhost:11434/api/generate"
    ollama_model: str = "mistral"
    generator_url: str = Field(
        default="http://localhost:9000",
        validation_alias=AliasChoices("GENERATOR_URL", "COLAB_URL"),
    )
    output_dir: str = "output"

    ai_service_secret: str | None = None
    backend_origin: str = "http://localhost:8000"

    llama_model: str = "llama3.1:8b"
    gemini_api_key: str | None = None
    decomposer_model: str = "gemini"

    model_config = {
        "env_file": str(Path(__file__).resolve().parents[2] / ".env"),
        "populate_by_name": True,
        "extra": "ignore",
    }


settings = Settings()
