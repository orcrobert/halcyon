import json
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import requests

from api.app.config import settings
from api.app.services.runconfig import RunConfig

REQUEST_TIMEOUT_S = 120
CLI_TIMEOUT_S = 240
CLI_ERROR_TAIL = 600


@dataclass(frozen=True)
class Provider:
    key: str
    label: str
    default_model: str
    default_base_url: str | None
    requires_api_key: bool
    complete: Callable[[RunConfig, str, str], str]
    uses_base_url: bool = True
    local_cli: bool = False
    suggested_models: tuple[str, ...] = ()
    key_label: str = "API key"
    key_hint: str | None = None
    key_env: str | None = None


def _model(config: RunConfig, provider: "Provider") -> str:
    return (config.decomposer_model or "").strip() or provider.default_model


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


def _run_cli(
    provider: "Provider",
    args: list[str],
    stdin: str,
    workdir: str,
    config: RunConfig,
) -> subprocess.CompletedProcess:
    binary = shutil.which(args[0])
    if binary is None:
        raise ValueError(
            f"{provider.label} needs the `{args[0]}` command on the server's PATH."
        )
    env = None
    if provider.key_env and config.decomposer_api_key:
        env = {**os.environ, provider.key_env: config.decomposer_api_key.strip()}
    try:
        return subprocess.run(
            [binary, *args[1:]],
            input=stdin,
            capture_output=True,
            text=True,
            timeout=CLI_TIMEOUT_S,
            cwd=workdir,
            env=env,
        )
    except subprocess.TimeoutExpired:
        raise ValueError(f"{provider.label} did not answer within {CLI_TIMEOUT_S}s.")


def _cli_failure(provider: "Provider", result: subprocess.CompletedProcess) -> ValueError:
    detail = (result.stderr.strip() or result.stdout.strip())[-CLI_ERROR_TAIL:]
    return ValueError(f"{provider.label} failed: {detail or f'exit code {result.returncode}'}")


def _complete_claude_cli(config: RunConfig, system_prompt: str, user_prompt: str) -> str:
    provider = PROVIDERS["claude_cli"]
    with tempfile.TemporaryDirectory(prefix="halcyon-claude-") as workdir:
        result = _run_cli(
            provider,
            [
                "claude",
                "-p",
                "--model", _model(config, provider),
                "--system-prompt", system_prompt,
                "--tools", "",
                "--output-format", "json",
                "--no-session-persistence",
                "--setting-sources", "",
                "--strict-mcp-config",
            ],
            user_prompt,
            workdir,
            config,
        )

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        raise _cli_failure(provider, result)
    if payload.get("is_error") or not isinstance(payload.get("result"), str):
        raise ValueError(f"{provider.label} failed: {payload.get('result') or 'no result'}")
    return payload["result"].strip()


def _complete_codex_cli(config: RunConfig, system_prompt: str, user_prompt: str) -> str:
    provider = PROVIDERS["codex_cli"]
    model = _model(config, provider)
    with tempfile.TemporaryDirectory(prefix="halcyon-codex-") as workdir:
        reply = Path(workdir) / "reply.txt"
        result = _run_cli(
            provider,
            [
                "codex",
                "exec",
                "--skip-git-repo-check",
                "--sandbox", "read-only",
                "--color", "never",
                *(["--model", model] if model else []),
                "--output-last-message", str(reply),
                "-",
            ],
            f"{system_prompt}\n\n---\n\n{user_prompt}",
            workdir,
            config,
        )
        text = reply.read_text().strip() if reply.exists() else ""

    if result.returncode != 0 or not text:
        raise _cli_failure(provider, result)
    return text


PROVIDERS: dict[str, Provider] = {
    "gemini": Provider(
        key="gemini",
        label="Google Gemini",
        default_model="gemini-2.5-flash-lite",
        default_base_url=None,
        requires_api_key=True,
        complete=_complete_gemini,
        uses_base_url=False,
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
    "claude_cli": Provider(
        key="claude_cli",
        label="Claude Code (local CLI)",
        default_model="sonnet",
        default_base_url=None,
        requires_api_key=False,
        complete=_complete_claude_cli,
        uses_base_url=False,
        local_cli=True,
        suggested_models=("sonnet", "opus", "haiku", "fable"),
        key_label="Login token",
        key_hint=(
            "Run claude setup-token on any machine and paste the result. "
            "Leave empty if the server's CLI is already logged in."
        ),
        key_env="CLAUDE_CODE_OAUTH_TOKEN",
    ),
    "codex_cli": Provider(
        key="codex_cli",
        label="Codex (local CLI)",
        default_model="",
        default_base_url=None,
        requires_api_key=False,
        complete=_complete_codex_cli,
        uses_base_url=False,
        local_cli=True,
        key_hint=(
            "An OpenAI API key. Leave empty if the server's CLI is already "
            "logged in with codex login."
        ),
        key_env="CODEX_API_KEY",
    ),
}


def available_providers() -> list[Provider]:
    return [
        provider
        for provider in PROVIDERS.values()
        if settings.decomposer_allow_cli or not provider.local_cli
    ]


def get_provider(key: str) -> Provider:
    provider = PROVIDERS.get(key.strip().lower())
    if provider is None or provider not in available_providers():
        names = ", ".join(sorted(p.key for p in available_providers()))
        if provider is not None:
            raise ValueError(
                f"{provider.label} is disabled on this server. "
                f"Set DECOMPOSER_ALLOW_CLI=true to enable it, or choose one of: {names}."
            )
        raise ValueError(f"Unknown decomposer provider {key!r}. Choose one of: {names}.")
    return provider


def complete_json(config: RunConfig, system_prompt: str, user_prompt: str) -> str:
    provider = get_provider(config.decomposer_provider)
    return provider.complete(config, system_prompt, user_prompt)
