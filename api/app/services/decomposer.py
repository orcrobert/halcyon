import json
import re

from api.app.config import ROLE_INTERVALS
from api.app.services.prompts import default_decomposer_prompt, refiner_prompt
from api.app.services.providers import complete_json
from api.app.services.runconfig import RunConfig

DEFAULT_ROLE = "texture"
DEFAULT_FREQUENCY = "occasional"
ROLE_PLAYBACK = {"bed": "loop", "texture": "loop", "event": "oneshot"}


def _parse_result(raw: str) -> dict:
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            raise ValueError(f"No JSON found in model response:\n{raw}")
        result = json.loads(match.group())

    elements = result.get("elements")
    if not isinstance(elements, list) or len(elements) == 0:
        raise ValueError("decomposer response missing or empty 'elements' array")

    type_map = {
        "audiogen": "sound", "AudioGen": "sound",
        "musicgen": "music", "MusicGen": "music",
    }
    required_fields = {"label", "type", "prompt"}

    for i, element in enumerate(elements):
        if not isinstance(element, dict):
            raise ValueError(f"decomposer element {i} is not an object")
        missing = required_fields - element.keys()
        if missing:
            raise ValueError(
                f"decomposer element {i} missing required fields: {sorted(missing)}"
            )
        prompt_value = element.get("prompt")
        if not isinstance(prompt_value, str) or not prompt_value.strip():
            raise ValueError(
                f"decomposer element {i} has empty or non-string 'prompt'"
            )
        element.setdefault("volume", 0.5)
        element["type"] = type_map.get(
            element.get("type", ""), element.get("type", "sound")
        )
        if element["type"] not in ("sound", "music"):
            raise ValueError(
                f"decomposer element {i} has invalid type: {element['type']!r}"
            )
        role = str(element.get("role", "")).strip().lower()
        if role not in ROLE_PLAYBACK or element["type"] == "music":
            role = DEFAULT_ROLE
        element["role"] = role
        element["playback"] = ROLE_PLAYBACK[role]

        if role == "event":
            frequency = str(element.get("frequency", "")).strip().lower()
            if frequency not in ROLE_INTERVALS:
                frequency = DEFAULT_FREQUENCY
            element["frequency"] = frequency
            minimum, maximum = ROLE_INTERVALS[frequency]
            element["interval_min_s"] = minimum
            element["interval_max_s"] = maximum
        else:
            element.pop("frequency", None)

    return result


def decompose(prompt: str, config: RunConfig) -> dict:
    system = config.decomposer_prompt or default_decomposer_prompt()
    raw = complete_json(config, system, f"Scene: {prompt}")
    return _parse_result(raw)


def refine_element(
    element: dict,
    feedback: str,
    scene: str,
    siblings: list[str],
    config: RunConfig,
) -> dict:
    request = json.dumps(
        {
            "scene": scene,
            "other_layers": siblings,
            "layer": {
                "label": element["label"],
                "type": element["type"],
                "role": element.get("role", DEFAULT_ROLE),
                "frequency": element.get("frequency"),
                "prompt": element["prompt"],
            },
            "complaint": feedback,
        },
        ensure_ascii=False,
    )
    raw = complete_json(config, refiner_prompt(), request)
    return _parse_result(raw)["elements"][0]
