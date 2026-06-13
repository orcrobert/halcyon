from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    ollama_url: str = "http://localhost:11434/api/generate"
    ollama_model: str = "mistral"
    colab_url: str = "https://xxxx.ngrok-free.app"
    output_dir: str = "output"

    ai_service_secret: str | None = None
    backend_origin: str = "http://localhost"

    llama_model: str = "llama3.1:8b"
    gemini_api_key: str | None = None
    decomposer_model: str = "gemini"

    model_config = {"env_file": str(Path(__file__).resolve().parents[2] / ".env")}


settings = Settings()
