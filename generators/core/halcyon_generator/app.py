from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel

from .config import GeneratorConfig
from .engine import AudioCraftEngine


class GenerateRequest(BaseModel):
    elements: list[dict[str, Any]]


class GenerateResponse(BaseModel):
    elements: list[dict[str, Any]]


def create_app(
    config: GeneratorConfig | None = None,
    engine: AudioCraftEngine | None = None,
    eager: bool = True,
) -> FastAPI:
    resolved = engine or AudioCraftEngine(config)
    app = FastAPI(title="Halcyon generator")

    if eager:
        resolved.load()

    @app.get("/")
    def home() -> dict[str, Any]:
        return {
            "status": "ok",
            "loaded": resolved.loaded,
            "audiogen_model": resolved.config.audiogen_model,
            "musicgen_model": resolved.config.musicgen_model,
            "duration": resolved.config.duration,
        }

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {"status": "ok" if resolved.loaded else "loading"}

    @app.post("/generate", response_model=GenerateResponse)
    def generate(req: GenerateRequest) -> GenerateResponse:
        return GenerateResponse(elements=resolved.generate(req.elements))

    app.state.engine = resolved
    return app
