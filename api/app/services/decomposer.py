import json
import re

from api.app.services.prompts import default_decomposer_prompt
from api.app.services.providers import complete_json
from api.app.services.runconfig import RunConfig


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

    return result


def decompose(prompt: str, config: RunConfig) -> dict:
    system = config.decomposer_prompt or default_decomposer_prompt()
    raw = complete_json(config, system, f"Scene: {prompt}")
    return _parse_result(raw)
