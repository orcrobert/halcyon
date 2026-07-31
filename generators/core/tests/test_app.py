import base64

from fastapi.testclient import TestClient

from halcyon_generator import GeneratorConfig, create_app
from halcyon_generator.engine import _stem


class StubEngine:
    def __init__(self):
        self.config = GeneratorConfig()
        self.loaded = True

    def load(self):
        self.loaded = True

    def generate(self, elements):
        return [{**e, "audio_b64": base64.b64encode(b"RIFF").decode()} for e in elements]


def client():
    return TestClient(create_app(engine=StubEngine(), eager=False))


def test_home_reports_the_configured_models():
    body = client().get("/").json()
    assert body["status"] == "ok"
    assert body["audiogen_model"] == "facebook/audiogen-medium"
    assert body["duration"] == 10


def test_generate_echoes_elements_with_audio():
    elements = [
        {"label": "wind", "type": "sound", "prompt": "low desert wind"},
        {"label": "drone", "type": "music", "prompt": "warm ambient drone"},
    ]
    body = client().post("/generate", json={"elements": elements}).json()

    assert [e["label"] for e in body["elements"]] == ["wind", "drone"]
    for original, returned in zip(elements, body["elements"]):
        assert returned["prompt"] == original["prompt"]
        assert base64.b64decode(returned["audio_b64"]) == b"RIFF"


def test_config_reads_overrides_from_the_environment(monkeypatch):
    monkeypatch.setenv("MUSICGEN_MODEL", "facebook/musicgen-small")
    monkeypatch.setenv("GENERATION_DURATION", "5")
    monkeypatch.setenv("GENERATION_DEVICE", "cpu")

    config = GeneratorConfig.from_env()

    assert config.musicgen_model == "facebook/musicgen-small"
    assert config.duration == 5
    assert config.device == "cpu"


def test_labels_are_sanitised_into_filenames():
    assert _stem("distant thunder / rain") == "distant_thunder_rain"
    assert _stem("///") == "element"
