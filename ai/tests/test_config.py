import pytest

from ai.app.config import Settings


def _settings(**env) -> Settings:
    return Settings(_env_file=None, **env)


def test_defaults_to_gemini():
    config = _settings()

    assert config.decomposer_provider == "gemini"
    assert config.decomposer_model is None


def test_legacy_model_names_are_read_as_providers():
    assert _settings(decomposer_model="gemini").decomposer_provider == "gemini"
    assert _settings(decomposer_model="llama").decomposer_provider == "ollama"
    assert _settings(decomposer_model="mistral").decomposer_provider == "ollama"


def test_legacy_gemini_name_clears_the_model_id():
    assert _settings(decomposer_model="gemini").decomposer_model is None


def test_legacy_mistral_name_is_kept_as_an_ollama_model():
    config = _settings(decomposer_model="mistral")

    assert config.decomposer_provider == "ollama"
    assert config.decomposer_model == "mistral"


def test_real_model_ids_are_left_alone():
    config = _settings(decomposer_provider="openai", decomposer_model="gpt-4o-mini")

    assert config.decomposer_provider == "openai"
    assert config.decomposer_model == "gpt-4o-mini"


@pytest.mark.parametrize(
    "given",
    [
        "http://localhost:11434/api/generate",
        "http://localhost:11434/api/generate/",
        "http://localhost:11434/",
    ],
)
def test_ollama_base_urls_are_normalised(given):
    assert _settings(decomposer_base_url=given).decomposer_base_url == "http://localhost:11434"


def test_generator_url_accepts_the_legacy_colab_name(monkeypatch):
    monkeypatch.setenv("COLAB_URL", "http://gpu.local:9000")

    assert _settings().generator_url == "http://gpu.local:9000"
