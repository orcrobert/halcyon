from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    ollama_url: str = "http://localhost:11434/api/generate"
    ollama_model: str = "mistral"
    colab_url: str = "https://xxxx.ngrok-free.app"
    output_dir: str = "output"

    model_config = {"env_file": str(Path(__file__).resolve().parents[2] / ".env")}


settings = Settings()
