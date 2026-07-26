from dataclasses import dataclass
from typing import Callable

import requests

from api.app.services.runconfig import RunConfig

REQUEST_TIMEOUT_S = 120


@dataclass(frozen=True)
class Provider:
    key: str
    label: str
    default_model: str
    default_base_url: str | None
    requires_api_key: bool
    complete: Callable[[RunConfig, str, str], str]


def _model(config: RunConfig, provider: "Provider") -> str:
    return config.decomposer_model or provider.default_model


def _base_url(config: RunConfig, provider: "Provider") -> str:
    base = config.decomposer_base_url or provider.default_base_url
    if not base:
        raise ValueError(
            f"{provider.label} needs a base URL. Set one in your account settings."
        )
    return base.rstrip("/")


def _require_key(config: RunConfig, provider: "Provider") -> str:
    if not config.decomposer_api_key:
        raise ValueError(
            f"{provider.label} needs an API key. Add one in your account settings."
        )
    return config.decomposer_api_key


def _complete_gemini(config: RunConfig, system_prompt: str, user_prompt: str) -> str:
    from google import genai
    from google.genai import types

    provider = PROVIDERS["gemini"]
    client = genai.Client(api_key=_require_key(config, provider))
    response = client.models.generate_content(
        model=_model(config, provider),
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            response_mime_type="application/json",
            temperature=0.7,
        ),
    )
    return response.text.strip()


def _complete_ollama(config: RunConfig, system_prompt: str, user_prompt: str) -> str:
    provider = PROVIDERS["ollama"]
    response = requests.post(
        f"{_base_url(config, provider)}/api/generate",
        json={
            "model": _model(config, provider),
            "system": system_prompt,
            "prompt": user_prompt,
            "stream": False,
            "format": "json",
        },
        timeout=REQUEST_TIMEOUT_S,
    )
    response.raise_for_status()
    return response.json()["response"].strip()


def _complete_openai(config: RunConfig, system_prompt: str, user_prompt: str) -> str:
    provider = PROVIDERS["openai"]
    headers = {"Content-Type": "application/json"}
    if config.decomposer_api_key:
        headers["Authorization"] = f"Bearer {config.decomposer_api_key}"

    response = requests.post(
        f"{_base_url(config, provider)}/chat/completions",
        headers=headers,
        json={
            "model": _model(config, provider),
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.7,
        },
        timeout=REQUEST_TIMEOUT_S,
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"].strip()


PROVIDERS: dict[str, Provider] = {
    "gemini": Provider(
        key="gemini",
        label="Google Gemini",
        default_model="gemini-2.5-flash-lite",
        default_base_url=None,
        requires_api_key=True,
        complete=_complete_gemini,
    ),
    "ollama": Provider(
        key="ollama",
        label="Ollama",
        default_model="mistral",
        default_base_url="http://localhost:11434",
        requires_api_key=False,
        complete=_complete_ollama,
    ),
    "openai": Provider(
        key="openai",
        label="OpenAI-compatible API",
        default_model="gpt-4o-mini",
        default_base_url="https://api.openai.com/v1",
        requires_api_key=True,
        complete=_complete_openai,
    ),
}


def get_provider(key: str) -> Provider:
    provider = PROVIDERS.get(key.strip().lower())
    if provider is None:
        raise ValueError(
            f"Unknown decomposer provider {key!r}. "
            f"Choose one of: {', '.join(sorted(PROVIDERS))}."
        )
    return provider


def complete_json(config: RunConfig, system_prompt: str, user_prompt: str) -> str:
    provider = get_provider(config.decomposer_provider)
    return provider.complete(config, system_prompt, user_prompt)
