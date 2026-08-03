import base64

import requests

from api.app.services.runconfig import RunConfig

GENERATOR_TIMEOUT_S = 300
PROBE_TIMEOUT_S = 10


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
        for key in ("audiogen_model", "musicgen_model", "duration", "loaded")
        if key in payload
    }
    return "ok", None, reported or None


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
