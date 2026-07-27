import json

import pytest

from ai.app.services import providers
from ai.app.services.runconfig import RunConfig

RESULT = {"atmosphere": "Test", "elements": [{"label": "a", "type": "sound", "prompt": "p"}]}


def _config(**overrides) -> RunConfig:
    base = {
        "generator_url": "http://localhost:9000",
        "decomposer_provider": "ollama",
        "decomposer_model": None,
        "decomposer_base_url": None,
        "decomposer_api_key": None,
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
    from ai.app.services.decomposer import decompose

    monkeypatch.setattr(
        "ai.app.services.decomposer.complete_json",
        lambda *_: json.dumps({"atmosphere": "Test", "elements": []}),
    )

    with pytest.raises(ValueError, match="empty 'elements'"):
        decompose("rain", _config())


def test_decompose_extracts_json_from_chatty_models(monkeypatch):
    from ai.app.services.decomposer import decompose

    monkeypatch.setattr(
        "ai.app.services.decomposer.complete_json",
        lambda *_: f"Sure! Here you go:\n```json\n{json.dumps(RESULT)}\n```",
    )

    assert decompose("rain", _config())["atmosphere"] == "Test"
