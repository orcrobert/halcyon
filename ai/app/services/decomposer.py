import json
import re
from pathlib import Path
import requests
from ai.app.config import settings

PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"


def _load_prompt(name: str) -> str:
    return (PROMPTS_DIR / f"{name}.txt").read_text()


def _parse_result(raw: str) -> dict:
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


def _decompose_ollama(system_prompt: str, prompt: str, model_tag: str) -> dict:
    payload = {
        "model": model_tag,
        "prompt": f"{system_prompt}\n\nScene: {prompt}",
        "stream": False,
        "format": "json",
    }
    response = requests.post(settings.ollama_url, json=payload, timeout=120)
    response.raise_for_status()
    return _parse_result(response.json()["response"].strip())


def _decompose_gemini(system_prompt: str, prompt: str) -> dict:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.gemini_api_key)
    response = client.models.generate_content(
        model="gemini-2.5-flash-lite",
        contents=f"Scene: {prompt}",
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            response_mime_type="application/json",
            temperature=0.7,
        ),
    )
    return _parse_result(response.text.strip())


def decompose(prompt: str) -> dict:
    system_prompt = _load_prompt("decomposer")
    model = settings.decomposer_model.lower()

    if model == "gemini":
        return _decompose_gemini(system_prompt, prompt)
    elif model == "llama":
        return _decompose_ollama(system_prompt, prompt, settings.llama_model)
    else:
        return _decompose_ollama(system_prompt, prompt, settings.ollama_model)
