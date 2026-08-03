import os
from dataclasses import dataclass


@dataclass(frozen=True)
class GeneratorConfig:
    audiogen_model: str = "facebook/audiogen-medium"
    musicgen_model: str = "facebook/musicgen-large"
    duration: int = 10
    device: str = "cuda"
    port: int = 8000

    @classmethod
    def from_env(cls) -> "GeneratorConfig":
        return cls(
            audiogen_model=os.getenv("AUDIOGEN_MODEL", cls.audiogen_model),
            musicgen_model=os.getenv("MUSICGEN_MODEL", cls.musicgen_model),
            duration=int(os.getenv("GENERATION_DURATION", cls.duration)),
            device=os.getenv("GENERATION_DEVICE", cls.device),
            port=int(os.getenv("PORT", cls.port)),
        )
