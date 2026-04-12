import json
import re
from pathlib import Path
import requests
from ai.app.config import settings

PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"


def _load_prompt(name: str) -> str:
    return (PROMPTS_DIR / f"{name}.txt").read_text()


def decompose(prompt: str) -> dict:
    system_prompt = _load_prompt("decomposer")

    payload = {
        "model": settings.ollama_model,
        "prompt": f"{system_prompt}\n\nScene: {prompt}",
        "stream": False,
    }

    response = requests.post(settings.ollama_url, json=payload, timeout=60)
    response.raise_for_status()

    raw = response.json()["response"].strip()

    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        raise ValueError(f"No JSON found in model response:\n{raw}")

    result = json.loads(match.group())

    type_map = {
        "audiogen": "sound", "AudioGen": "sound",
        "musicgen": "music", "MusicGen": "music",
    }
    for element in result.get("elements", []):
        element.setdefault("volume", 0.5)
        element["type"] = type_map.get(element.get("type", ""), element.get("type", "sound"))

    return result
