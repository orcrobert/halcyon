import base64

import requests

from ai.app.services.runconfig import RunConfig

GENERATOR_TIMEOUT_S = 300


def generate(decomposed: dict, config: RunConfig) -> list[dict]:
    response = requests.post(
        f"{config.generator_url.rstrip('/')}/generate",
        json={"elements": decomposed["elements"]},
        timeout=GENERATOR_TIMEOUT_S,
    )
    response.raise_for_status()

    results = []
    for element in response.json()["elements"]:
        encoded = element.pop("audio_b64", None)
        if not encoded:
            continue
        element["audio"] = base64.b64decode(encoded)
        results.append(element)

    if not results:
        raise ValueError("Generator returned no audio")

    return results
