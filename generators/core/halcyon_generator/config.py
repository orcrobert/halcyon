import os
from dataclasses import dataclass


@dataclass(frozen=True)
class GeneratorConfig:
    audiogen_model: str = "facebook/audiogen-medium"
    musicgen_model: str = "facebook/musicgen-large"
    style_model: str = "facebook/musicgen-style"
    style_eval_q: int = 3
    style_cfg_beta: float = 5.0
    duration: int = 10
    loudness_lufs: float = -20.0
    device: str = "cuda"
    port: int = 8000

    @classmethod
    def from_env(cls) -> "GeneratorConfig":
        return cls(
            audiogen_model=os.getenv("AUDIOGEN_MODEL", cls.audiogen_model),
            musicgen_model=os.getenv("MUSICGEN_MODEL", cls.musicgen_model),
            style_model=os.getenv("STYLE_MODEL", cls.style_model),
            style_eval_q=int(os.getenv("STYLE_EVAL_Q", cls.style_eval_q)),
            style_cfg_beta=float(os.getenv("STYLE_CFG_BETA", cls.style_cfg_beta)),
            duration=int(os.getenv("GENERATION_DURATION", cls.duration)),
            loudness_lufs=float(os.getenv("GENERATION_LOUDNESS_LUFS", cls.loudness_lufs)),
            device=os.getenv("GENERATION_DEVICE", cls.device),
            port=int(os.getenv("PORT", cls.port)),
        )
