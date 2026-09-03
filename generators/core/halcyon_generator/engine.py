import base64
import re
import tempfile
from pathlib import Path
from typing import Any

from .config import GeneratorConfig

MIN_DURATION_S = 1
MAX_DURATION_S = 120

_UNSAFE = re.compile(r"[^A-Za-z0-9_-]+")


def _stem(label: str) -> str:
    cleaned = _UNSAFE.sub("_", label).strip("_")
    return cleaned or "element"


class AudioCraftEngine:
    def __init__(self, config: GeneratorConfig | None = None) -> None:
        self.config = config or GeneratorConfig.from_env()
        self._audiogen = None
        self._musicgen = None

    def load(self) -> None:
        from audiocraft.models import AudioGen, MusicGen

        self._audiogen = AudioGen.get_pretrained(
            self.config.audiogen_model, device=self.config.device
        )
        self._audiogen.set_generation_params(duration=self.config.duration)

        self._musicgen = MusicGen.get_pretrained(
            self.config.musicgen_model, device=self.config.device
        )
        self._musicgen.set_generation_params(duration=self.config.duration)

    @property
    def loaded(self) -> bool:
        return self._audiogen is not None and self._musicgen is not None

    def resolve_duration(self, requested: int | None) -> int:
        if not requested:
            return self.config.duration
        return max(MIN_DURATION_S, min(MAX_DURATION_S, int(requested)))

    def generate(
        self, elements: list[dict[str, Any]], duration: int | None = None
    ) -> list[dict[str, Any]]:
        if not self.loaded:
            self.load()

        seconds = self.resolve_duration(duration)

        sounds = [e for e in elements if e.get("type") == "sound"]
        music = [e for e in elements if e.get("type") == "music"]

        results: list[dict[str, Any]] = []
        if sounds:
            results.extend(self._generate_batch(self._audiogen, sounds, seconds))
        if music:
            results.extend(self._generate_batch(self._musicgen, music, seconds))
        return results

    def _generate_batch(
        self, model, elements: list[dict[str, Any]], seconds: int
    ) -> list[dict[str, Any]]:
        from audiocraft.data.audio import audio_write

        model.set_generation_params(duration=seconds)
        wavs = model.generate([e["prompt"] for e in elements])
        results = []
        with tempfile.TemporaryDirectory() as tmp:
            for elem, wav in zip(elements, wavs):
                stem = Path(tmp) / _stem(elem.get("label", "element"))
                audio_write(
                    str(stem),
                    wav.cpu(),
                    model.sample_rate,
                    strategy="loudness",
                    loudness_compressor=True,
                )
                data = stem.with_suffix(".wav").read_bytes()
                results.append({**elem, "audio_b64": base64.b64encode(data).decode()})
        return results
