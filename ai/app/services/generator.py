import os
import re
import base64
import json
import requests
from ai.app.config import settings


def sanitize_label(label: str) -> str:
    return re.sub(r"[^\w]+", "_", label.lower()).strip("_")


def generate(decomposed: dict) -> list[dict]:
    os.makedirs(settings.output_dir, exist_ok=True)

    atmosphere = sanitize_label(decomposed["atmosphere"])
    session_path = os.path.join(settings.output_dir, "session.json")

    response = requests.post(
        f"{settings.colab_url}/generate",
        json={"elements": decomposed["elements"]},
        timeout=300,
    )
    response.raise_for_status()

    results = []
    for element in response.json()["elements"]:
        audio_bytes = base64.b64decode(element.pop("audio_b64"))
        path = os.path.join(
            settings.output_dir,
            f"{atmosphere}_{sanitize_label(element['label'])}.wav",
        )
        with open(path, "wb") as f:
            f.write(audio_bytes)
        element["file"] = path
        results.append(element)

    with open(session_path, "w") as f:
        json.dump({"atmosphere": decomposed["atmosphere"], "elements": results}, f, indent=2)

    return results
