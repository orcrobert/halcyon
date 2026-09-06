import base64
import logging

import requests

from api.app.config import BED_CLIP_S, EVENT_CLIP_S
from api.app.services.runconfig import RunConfig

GENERATOR_TIMEOUT_S = 300
PROBE_TIMEOUT_S = 10

ROLE_CLIP_S = {"bed": BED_CLIP_S, "event": EVENT_CLIP_S}

logger = logging.getLogger(__name__)


def probe(url: str) -> tuple[str, str | None, dict | None]:
    target = f"{url.rstrip('/')}/"
    try:
        response = requests.get(target, timeout=PROBE_TIMEOUT_S)
    except requests.Timeout:
        return "unreachable", "The generator did not answer within 10 seconds.", None
    except requests.RequestException as exc:
        return "unreachable", str(exc), None

    if response.status_code >= 400:
        return "error", f"The generator answered {response.status_code}.", None

    try:
        payload = response.json()
    except ValueError:
        return "error", "The generator did not return JSON.", None

    if not isinstance(payload, dict):
        return "error", "The generator did not return JSON.", None

    reported = {
        key: payload[key]
        for key in (
            "audiogen_model",
            "musicgen_model",
            "duration",
            "max_duration",
            "loaded",
        )
        if key in payload
    }
    return "ok", None, reported or None


def clip_length(element: dict, duration_s: int) -> int:
    stored = element.get("clip_s")
    if isinstance(stored, int) and stored > 0:
        return stored
    return ROLE_CLIP_S.get(element.get("role"), duration_s)


def _match_audio(replies: list, elements: list[dict]) -> dict[int, bytes]:
    positions: dict[str, int] = {}
    for position, element in enumerate(elements):
        positions.setdefault(element.get("label"), position)

    matched: dict[int, bytes] = {}
    for position, reply in enumerate(replies):
        if not isinstance(reply, dict):
            continue
        encoded = reply.get("audio_b64")
        if not encoded:
            continue

        index = reply.get("index")
        if not isinstance(index, int):
            index = positions.get(reply.get("label"), position)

        if index in matched or not 0 <= index < len(elements):
            continue
        matched[index] = base64.b64decode(encoded)

    return matched


def generate(decomposed: dict, config: RunConfig, duration_s: int) -> list[dict]:
    elements = decomposed["elements"]
    payload = []
    for index, element in enumerate(elements):
        element["clip_s"] = clip_length(element, duration_s)
        payload.append(
            {
                "index": index,
                "label": element.get("label", ""),
                "type": element.get("type", "sound"),
                "prompt": element.get("prompt", ""),
                "duration": element["clip_s"],
            }
        )

    response = requests.post(
        f"{config.generator_url.rstrip('/')}/generate",
        json={"elements": payload, "duration": duration_s},
        timeout=GENERATOR_TIMEOUT_S,
    )
    response.raise_for_status()

    audio = _match_audio(response.json()["elements"], elements)

    results = []
    for index, element in enumerate(elements):
        if index not in audio:
            logger.warning(
                "Generator returned no audio for %r", element.get("label", index)
            )
            continue
        results.append({**element, "audio": audio[index]})

    if not results:
        raise ValueError("Generator returned no audio")

    return results
