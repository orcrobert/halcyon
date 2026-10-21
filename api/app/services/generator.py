import base64
import logging
import time
from collections.abc import Callable

import requests

from api.app.config import BED_CLIP_S, EVENT_CLIP_S
from api.app.services.decomposer import DEFAULT_ROLE
from api.app.services.runconfig import RunConfig

GENERATOR_TIMEOUT_S = 300
PROBE_TIMEOUT_S = 10
WAKE_TIMEOUT_S = 120
WAKE_POLL_S = 3
WAKE_TICK_S = 2.0

ROLE_CLIP_S = {"bed": BED_CLIP_S, "event": EVENT_CLIP_S}

logger = logging.getLogger(__name__)


def probe(url: str) -> tuple[str, str | None, dict | None]:
    target = f"{url.rstrip('/')}/"
    try:
        response = requests.get(target, timeout=PROBE_TIMEOUT_S, allow_redirects=False)
    except requests.Timeout:
        return "unreachable", "The generator did not answer within 10 seconds.", None
    except requests.RequestException as exc:
        return "unreachable", str(exc), None

    if 300 <= response.status_code < 400:
        return "starting", "The generator is still starting up.", None

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
            "style_model",
            "duration",
            "max_duration",
            "loaded",
            "gpu",
        )
        if key in payload
    }
    return "ok", None, reported or None


def wait_until_ready(
    url: str,
    on_wait: Callable[[str, int], None] | None = None,
    timeout_s: int = WAKE_TIMEOUT_S,
    poll_s: float = WAKE_POLL_S,
) -> bool:
    started = time.monotonic()
    while True:
        status, _, reported = probe(url)
        if status == "ok" and (reported or {}).get("loaded", True):
            return True
        elapsed = int(time.monotonic() - started)
        if elapsed >= timeout_s:
            logger.warning("Generator at %s never reported ready; posting anyway", url)
            return False
        if on_wait is not None:
            on_wait("loading" if status == "ok" else status, elapsed)
        time.sleep(poll_s)


def clip_length(element: dict, duration_s: int) -> int:
    stored = element.get("clip_s")
    if isinstance(stored, int) and stored > 0:
        return stored
    return ROLE_CLIP_S.get(element.get("role"), duration_s)


def take_count(element: dict, takes: int) -> int:
    if element.get("playback") == "oneshot":
        return 1
    if (element.get("role") or DEFAULT_ROLE) != "texture":
        return 1
    return max(1, takes)


def _match_audio(replies: list, elements: list[dict]) -> dict[int, bytes]:
    positions: dict[str, list[int]] = {}
    for position, element in enumerate(elements):
        positions.setdefault(element.get("label"), []).append(position)

    usable = [
        (position, reply)
        for position, reply in enumerate(replies)
        if isinstance(reply, dict) and reply.get("audio_b64")
    ]
    indexed = [item for item in usable if isinstance(item[1].get("index"), int)]
    unindexed = [item for item in usable if not isinstance(item[1].get("index"), int)]

    matched: dict[int, bytes] = {}
    for position, reply in indexed + unindexed:
        index = reply.get("index")
        label = reply.get("label")
        if not isinstance(index, int) and label in positions:
            index = next(
                (candidate for candidate in positions[label] if candidate not in matched),
                None,
            )
        elif not isinstance(index, int):
            index = position

        if index is None or index in matched or not 0 <= index < len(elements):
            continue
        matched[index] = base64.b64decode(reply["audio_b64"])

    return matched


def generate(
    decomposed: dict,
    config: RunConfig,
    duration_s: int,
    style: bytes | None = None,
) -> list[dict]:
    elements = decomposed["elements"]
    style_b64 = base64.b64encode(style).decode() if style else None
    payload = []
    owners: list[int] = []
    for index, element in enumerate(elements):
        element["clip_s"] = clip_length(element, duration_s)
        entry = {
            "index": index,
            "label": element.get("label", ""),
            "type": element.get("type", "sound"),
            "prompt": element.get("prompt", ""),
            "duration": element["clip_s"],
        }
        if style_b64 and entry["type"] == "music":
            entry["style_b64"] = style_b64
        payload.append(entry)
        owners.append(index)

    for index, element in enumerate(elements):
        for _ in range(take_count(element, config.texture_takes) - 1):
            payload.append({**payload[index], "index": len(payload)})
            owners.append(index)

    body: dict = {"elements": payload, "duration": duration_s}
    if config.generator_options:
        body["options"] = config.generator_options

    response = requests.post(
        f"{config.generator_url.rstrip('/')}/generate",
        json=body,
        timeout=GENERATOR_TIMEOUT_S,
    )
    response.raise_for_status()

    audio = _match_audio(response.json()["elements"], payload)

    clips: dict[int, list[bytes]] = {}
    for index in sorted(audio):
        clips.setdefault(owners[index], []).append(audio[index])

    results = []
    for index, element in enumerate(elements):
        if index not in clips:
            logger.warning(
                "Generator returned no audio for %r", element.get("label", index)
            )
            continue
        first, *takes = clips[index]
        results.append({**element, "audio": first, "takes_audio": takes})

    if not results:
        raise ValueError("Generator returned no audio")

    return results
