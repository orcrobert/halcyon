import base64
import logging
import re
import tempfile
from pathlib import Path
from typing import Any

from .config import GeneratorConfig

MIN_DURATION_S = 1
MAX_DURATION_S = 120
MIN_STYLE_S = 1.5
MAX_STYLE_S = 4.5
STYLE_CFG = 3.0
STYLE_TOP_K = 250
MIN_STYLE_EVAL_Q = 1
MAX_STYLE_EVAL_Q = 6
MIN_STYLE_CFG_BETA = 0.0
MAX_STYLE_CFG_BETA = 20.0

_UNSAFE = re.compile(r"[^A-Za-z0-9_-]+")

logger = logging.getLogger(__name__)


def _stem(label: str) -> str:
    cleaned = _UNSAFE.sub("_", label).strip("_")
    return cleaned or "element"


class AudioCraftEngine:
    def __init__(self, config: GeneratorConfig | None = None) -> None:
        self.config = config or GeneratorConfig.from_env()
        self._audiogen = None
        self._musicgen = None
        self._style = None

    def load(self) -> None:
        self._load_models()
        if self.config.style_preload and self.supports_style:
            self.load_style()

    def _load_models(self) -> None:
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
        base = self._audiogen is not None and self._musicgen is not None
        if self.config.style_preload and self.supports_style:
            return base and self._style is not None
        return base

    @property
    def style_loaded(self) -> bool:
        return self._style is not None

    @property
    def gpu(self) -> str | None:
        if not self.config.device.startswith("cuda"):
            return None
        try:
            import torch

            return torch.cuda.get_device_name(self.config.device)
        except Exception:
            return None

    @property
    def supports_style(self) -> bool:
        return bool(self.config.style_model)

    def load_style(self) -> None:
        from audiocraft.models import MusicGen

        self._style = MusicGen.get_pretrained(
            self.config.style_model, device=self.config.device
        )

    def _kind(self, element: dict[str, Any]) -> str:
        if element.get("type") != "music":
            return "sound"
        if element.get("style_b64") and self.supports_style:
            return "style"
        return "music"

    def resolve_duration(self, requested: int | None) -> int:
        if not requested:
            return self.config.duration
        return max(MIN_DURATION_S, min(MAX_DURATION_S, int(requested)))

    def style_params(self, options: dict[str, Any] | None) -> tuple[int, float]:
        options = options or {}
        try:
            eval_q = int(options.get("style_eval_q", self.config.style_eval_q))
        except (TypeError, ValueError):
            eval_q = self.config.style_eval_q
        try:
            cfg_beta = float(options.get("style_cfg_beta", self.config.style_cfg_beta))
        except (TypeError, ValueError):
            cfg_beta = self.config.style_cfg_beta
        return (
            max(MIN_STYLE_EVAL_Q, min(MAX_STYLE_EVAL_Q, eval_q)),
            max(MIN_STYLE_CFG_BETA, min(MAX_STYLE_CFG_BETA, cfg_beta)),
        )

    def generate(
        self,
        elements: list[dict[str, Any]],
        duration: int | None = None,
        options: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        if not self.loaded:
            self.load()

        groups: dict[tuple[str, int], list[dict[str, Any]]] = {}
        for element in elements:
            kind = self._kind(element)
            if kind != "style":
                if element.get("style_b64"):
                    logger.warning(
                        "Ignoring the style reference for %r", element.get("label")
                    )
                element = {k: v for k, v in element.items() if k != "style_b64"}
            seconds = self.resolve_duration(element.get("duration") or duration)
            groups.setdefault((kind, seconds), []).append(element)

        results: list[dict[str, Any]] = []
        for (kind, seconds), group in groups.items():
            if kind == "style":
                if not self.style_loaded:
                    self.load_style()
                results.extend(
                    self._generate_style_batch(
                        self._style, group, seconds, self.style_params(options)
                    )
                )
                continue
            model = self._musicgen if kind == "music" else self._audiogen
            results.extend(self._generate_batch(model, group, seconds))
        return results

    def _generate_batch(
        self, model, elements: list[dict[str, Any]], seconds: int
    ) -> list[dict[str, Any]]:
        model.set_generation_params(duration=seconds)
        wavs = model.generate([e["prompt"] for e in elements])
        return self._encode(model, elements, wavs)

    def _generate_style_batch(
        self,
        model,
        elements: list[dict[str, Any]],
        seconds: int,
        params: tuple[int, float],
    ) -> list[dict[str, Any]]:
        import torch
        from audiocraft.data.audio import audio_read
        from audiocraft.data.audio_utils import convert_audio

        excerpts = []
        with tempfile.TemporaryDirectory() as tmp:
            for position, element in enumerate(elements):
                path = Path(tmp) / f"style_{position}.wav"
                path.write_bytes(base64.b64decode(element["style_b64"]))
                wav, sr = audio_read(str(path))
                excerpts.append(
                    convert_audio(wav, sr, model.sample_rate, model.audio_channels)
                )

        eval_q, cfg_beta = params
        frames = min(excerpt.shape[-1] for excerpt in excerpts)
        excerpt_s = max(MIN_STYLE_S, min(MAX_STYLE_S, frames / model.sample_rate))

        model.set_generation_params(
            duration=seconds,
            use_sampling=True,
            top_k=STYLE_TOP_K,
            cfg_coef=STYLE_CFG,
            cfg_coef_beta=cfg_beta,
        )
        model.set_style_conditioner_params(eval_q=eval_q, excerpt_length=excerpt_s)
        wavs = model.generate_with_chroma(
            [e["prompt"] for e in elements],
            torch.stack([excerpt[..., :frames] for excerpt in excerpts]),
            model.sample_rate,
        )
        styled = [
            {**{k: v for k, v in e.items() if k != "style_b64"}, "style_applied": True}
            for e in elements
        ]
        return self._encode(model, styled, wavs)

    def _encode(
        self, model, elements: list[dict[str, Any]], wavs
    ) -> list[dict[str, Any]]:
        from audiocraft.data.audio import audio_write

        results = []
        with tempfile.TemporaryDirectory() as tmp:
            for elem, wav in zip(elements, wavs):
                stem = Path(tmp) / _stem(elem.get("label", "element"))
                audio_write(
                    str(stem),
                    wav.cpu(),
                    model.sample_rate,
                    strategy="loudness",
                    loudness_headroom_db=-self.config.loudness_lufs,
                    loudness_compressor=True,
                )
                data = stem.with_suffix(".wav").read_bytes()
                results.append({**elem, "audio_b64": base64.b64encode(data).decode()})
        return results
