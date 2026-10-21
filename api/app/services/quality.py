import io
import logging

import soundfile as sf

from api.app.services.decomposer import DEFAULT_ROLE
from mixer.effects.quality import inspect_clip, quality_score

UNUSABLE_CHECKS = {"silent", "unreadable"}

logger = logging.getLogger(__name__)


def inspect_audio(element: dict, audio: bytes) -> list[dict]:
    try:
        wav, sr = sf.read(io.BytesIO(audio), always_2d=True)
    except Exception:
        return [{"check": "unreadable", "value": 0.0, "limit": 0.0}]
    return inspect_clip(
        wav.T,
        sr,
        role=element.get("role") or DEFAULT_ROLE,
        playback=element.get("playback") or "loop",
    )


def is_unusable(issues: list[dict]) -> bool:
    return any(issue["check"] in UNUSABLE_CHECKS for issue in issues)


def _ranked_takes(result: dict) -> list[tuple[bytes, list[dict]]]:
    clips = [result["audio"], *result.get("takes_audio", [])]
    usable = []
    for audio in clips:
        issues = inspect_audio(result, audio)
        if is_unusable(issues):
            logger.warning(
                "Dropping a take of %r: %s",
                result.get("label"),
                ", ".join(issue["check"] for issue in issues),
            )
            continue
        usable.append((audio, issues))
    return sorted(usable, key=lambda take: quality_score(take[1]))


def check_results(results: list[dict]) -> list[dict]:
    checked = []
    for result in results:
        ranked = _ranked_takes(result)
        if not ranked:
            continue
        (audio, issues), *rest = ranked
        checked.append({
            **result,
            "audio": audio,
            "quality": issues,
            "takes_audio": [take for take, flagged in rest if not flagged],
        })

    if not checked:
        raise ValueError("The generator only returned silent or unreadable audio")

    return checked
