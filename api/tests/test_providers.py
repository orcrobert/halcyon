import json
import subprocess

import pytest

from api.app.services import providers
from api.app.services.runconfig import RunConfig

RESULT = {"atmosphere": "Test", "elements": [{"label": "a", "type": "sound", "prompt": "p"}]}


def _config(**overrides) -> RunConfig:
    base = {
        "generator_url": "http://localhost:9000",
        "decomposer_provider": "ollama",
        "decomposer_model": None,
        "decomposer_base_url": None,
        "decomposer_api_key": None,
        "decomposer_prompt": "system",
    }
    return RunConfig(**{**base, **overrides})


class _Recorder:
    def __init__(self, payload: dict) -> None:
        self.payload = payload
        self.url: str | None = None
        self.body: dict | None = None
        self.headers: dict | None = None

    def __call__(self, url, **kwargs):
        self.url = url
        self.body = kwargs.get("json")
        self.headers = kwargs.get("headers")
        return self

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self.payload


def test_unknown_provider_is_rejected():
    with pytest.raises(ValueError, match="Unknown decomposer provider"):
        providers.get_provider("skynet")


def test_ollama_posts_to_the_native_endpoint(monkeypatch):
    recorder = _Recorder({"response": json.dumps(RESULT)})
    monkeypatch.setattr(providers.requests, "post", recorder)

    raw = providers.complete_json(_config(), "system", "Scene: rain")

    assert recorder.url == "http://localhost:11434/api/generate"
    assert recorder.body["model"] == "mistral"
    assert recorder.body["format"] == "json"
    assert recorder.body["system"] == "system"
    assert json.loads(raw) == RESULT


def test_ollama_honours_a_custom_host_and_model(monkeypatch):
    recorder = _Recorder({"response": json.dumps(RESULT)})
    monkeypatch.setattr(providers.requests, "post", recorder)

    providers.complete_json(
        _config(decomposer_base_url="http://nas.lan:11434", decomposer_model="llama3.1:8b"),
        "system",
        "Scene: rain",
    )

    assert recorder.url == "http://nas.lan:11434/api/generate"
    assert recorder.body["model"] == "llama3.1:8b"


def test_openai_compatible_provider_posts_chat_completions(monkeypatch):
    recorder = _Recorder(
        {"choices": [{"message": {"content": json.dumps(RESULT)}}]}
    )
    monkeypatch.setattr(providers.requests, "post", recorder)

    raw = providers.complete_json(
        _config(
            decomposer_provider="openai",
            decomposer_base_url="https://api.groq.com/openai/v1",
            decomposer_model="llama-3.3-70b-versatile",
            decomposer_api_key="sk-test",
        ),
        "system",
        "Scene: rain",
    )

    assert recorder.url == "https://api.groq.com/openai/v1/chat/completions"
    assert recorder.headers["Authorization"] == "Bearer sk-test"
    assert recorder.body["model"] == "llama-3.3-70b-versatile"
    assert recorder.body["response_format"] == {"type": "json_object"}
    assert json.loads(raw) == RESULT


def test_openai_provider_defaults_to_openai_itself(monkeypatch):
    recorder = _Recorder({"choices": [{"message": {"content": json.dumps(RESULT)}}]})
    monkeypatch.setattr(providers.requests, "post", recorder)

    providers.complete_json(
        _config(decomposer_provider="openai", decomposer_api_key="sk-test"),
        "system",
        "Scene: rain",
    )

    assert recorder.url == "https://api.openai.com/v1/chat/completions"
    assert recorder.body["model"] == "gpt-4o-mini"


def test_local_openai_servers_work_without_a_key(monkeypatch):
    recorder = _Recorder({"choices": [{"message": {"content": json.dumps(RESULT)}}]})
    monkeypatch.setattr(providers.requests, "post", recorder)

    providers.complete_json(
        _config(
            decomposer_provider="openai",
            decomposer_base_url="http://localhost:1234/v1",
            decomposer_model="local-model",
        ),
        "system",
        "Scene: rain",
    )

    assert "Authorization" not in recorder.headers


def test_gemini_without_a_key_explains_itself():
    with pytest.raises(ValueError, match="needs an API key"):
        providers.complete_json(
            _config(decomposer_provider="gemini"), "system", "Scene: rain"
        )


def test_decompose_validates_the_provider_response(monkeypatch):
    from api.app.services.decomposer import decompose

    monkeypatch.setattr(
        "api.app.services.decomposer.complete_json",
        lambda *_: json.dumps({"atmosphere": "Test", "elements": []}),
    )

    with pytest.raises(ValueError, match="empty 'elements'"):
        decompose("rain", _config())


def test_decompose_extracts_json_from_chatty_models(monkeypatch):
    from api.app.services.decomposer import decompose

    monkeypatch.setattr(
        "api.app.services.decomposer.complete_json",
        lambda *_: f"Sure! Here you go:\n```json\n{json.dumps(RESULT)}\n```",
    )

    assert decompose("rain", _config())["atmosphere"] == "Test"


class _FakeCli:
    def __init__(self, stdout: str = "", returncode: int = 0, stderr: str = "", reply: str | None = None) -> None:
        self.stdout = stdout
        self.returncode = returncode
        self.stderr = stderr
        self.reply = reply
        self.args: list[str] | None = None
        self.input: str | None = None
        self.cwd: str | None = None

    def __call__(self, args, **kwargs):
        self.args = args
        self.input = kwargs.get("input")
        self.cwd = kwargs.get("cwd")
        if self.reply is not None:
            path = args[args.index("--output-last-message") + 1]
            with open(path, "w") as handle:
                handle.write(self.reply)
        return subprocess.CompletedProcess(args, self.returncode, self.stdout, self.stderr)


@pytest.fixture
def cli_enabled(monkeypatch):
    monkeypatch.setattr(providers.settings, "decomposer_allow_cli", True)
    monkeypatch.setattr(providers.shutil, "which", lambda name: f"/usr/bin/{name}")


def _flag(args: list[str], name: str) -> str:
    return args[args.index(name) + 1]


def test_cli_providers_are_hidden_unless_enabled(monkeypatch):
    monkeypatch.setattr(providers.settings, "decomposer_allow_cli", False)

    assert "claude_cli" not in {p.key for p in providers.available_providers()}
    with pytest.raises(ValueError, match="DECOMPOSER_ALLOW_CLI"):
        providers.get_provider("claude_cli")


def test_claude_cli_passes_the_chosen_model_and_prompts(monkeypatch, cli_enabled):
    fake = _FakeCli(stdout=json.dumps({"is_error": False, "result": json.dumps(RESULT)}))
    monkeypatch.setattr(providers.subprocess, "run", fake)

    raw = providers.complete_json(
        _config(decomposer_provider="claude_cli", decomposer_model="opus"),
        "system",
        "Scene: rain",
    )

    assert json.loads(raw) == RESULT
    assert fake.args[0] == "/usr/bin/claude"
    assert _flag(fake.args, "--model") == "opus"
    assert _flag(fake.args, "--system-prompt") == "system"
    assert _flag(fake.args, "--tools") == ""
    assert fake.input == "Scene: rain"


def test_claude_cli_defaults_to_sonnet(monkeypatch, cli_enabled):
    fake = _FakeCli(stdout=json.dumps({"is_error": False, "result": "{}"}))
    monkeypatch.setattr(providers.subprocess, "run", fake)

    providers.complete_json(_config(decomposer_provider="claude_cli"), "system", "Scene: rain")

    assert _flag(fake.args, "--model") == "sonnet"


def test_claude_cli_surfaces_its_own_error(monkeypatch, cli_enabled):
    fake = _FakeCli(
        stdout=json.dumps({"is_error": True, "result": "Model not available"}),
        returncode=1,
    )
    monkeypatch.setattr(providers.subprocess, "run", fake)

    with pytest.raises(ValueError, match="Model not available"):
        providers.complete_json(_config(decomposer_provider="claude_cli"), "system", "x")


def test_claude_cli_surfaces_plain_text_failures(monkeypatch, cli_enabled):
    fake = _FakeCli(stdout="There's an issue with the selected model", returncode=1)
    monkeypatch.setattr(providers.subprocess, "run", fake)

    with pytest.raises(ValueError, match="issue with the selected model"):
        providers.complete_json(_config(decomposer_provider="claude_cli"), "system", "x")


def test_missing_cli_binary_explains_itself(monkeypatch):
    monkeypatch.setattr(providers.settings, "decomposer_allow_cli", True)
    monkeypatch.setattr(providers.shutil, "which", lambda name: None)

    with pytest.raises(ValueError, match="`claude` command"):
        providers.complete_json(_config(decomposer_provider="claude_cli"), "system", "x")


def test_codex_cli_reads_the_last_message(monkeypatch, cli_enabled):
    fake = _FakeCli(reply=json.dumps(RESULT))
    monkeypatch.setattr(providers.subprocess, "run", fake)

    raw = providers.complete_json(
        _config(decomposer_provider="codex_cli", decomposer_model="gpt-5-codex"),
        "system",
        "Scene: rain",
    )

    assert json.loads(raw) == RESULT
    assert fake.args[:2] == ["/usr/bin/codex", "exec"]
    assert _flag(fake.args, "--model") == "gpt-5-codex"
    assert _flag(fake.args, "--sandbox") == "read-only"
    assert fake.input.startswith("system") and fake.input.endswith("Scene: rain")


def test_codex_cli_uses_its_configured_model_when_blank(monkeypatch, cli_enabled):
    fake = _FakeCli(reply="{}")
    monkeypatch.setattr(providers.subprocess, "run", fake)

    providers.complete_json(_config(decomposer_provider="codex_cli"), "system", "x")

    assert "--model" not in fake.args


def test_codex_cli_failure_reports_stderr(monkeypatch, cli_enabled):
    fake = _FakeCli(returncode=1, stderr="not logged in")
    monkeypatch.setattr(providers.subprocess, "run", fake)

    with pytest.raises(ValueError, match="not logged in"):
        providers.complete_json(_config(decomposer_provider="codex_cli"), "system", "x")
