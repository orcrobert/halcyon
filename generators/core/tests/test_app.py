import base64

import pytest
from fastapi.testclient import TestClient

from halcyon_generator import GeneratorConfig, create_app
from halcyon_generator.engine import MAX_DURATION_S, AudioCraftEngine, _stem


class StubEngine:
    def __init__(self):
        self.config = GeneratorConfig()
        self.loaded = True
        self.durations = []

    def load(self):
        self.loaded = True

    def generate(self, elements, duration=None):
        self.durations.append(duration)
        return [{**e, "audio_b64": base64.b64encode(b"RIFF").decode()} for e in elements]


class RecordingAudioCraftEngine(AudioCraftEngine):
    def __init__(self, config=None):
        super().__init__(config)
        self.batches = []

    def load(self):
        self._audiogen = "audiogen"
        self._musicgen = "musicgen"

    def _generate_batch(self, model, elements, seconds):
        self.batches.append((model, [e["label"] for e in elements], seconds))
        return [{**e, "audio_b64": base64.b64encode(b"RIFF").decode()} for e in elements]


def client(engine=None):
    return TestClient(create_app(engine=engine or StubEngine(), eager=False))


def test_home_reports_the_configured_models():
    body = client().get("/").json()
    assert body["status"] == "ok"
    assert body["audiogen_model"] == "facebook/audiogen-medium"
    assert body["duration"] == 10
    assert body["max_duration"] == MAX_DURATION_S


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


def test_generate_passes_the_requested_duration_to_the_engine():
    engine = StubEngine()
    elements = [{"label": "wind", "type": "sound", "prompt": "low desert wind"}]

    client(engine).post("/generate", json={"elements": elements, "duration": 45})
    client(engine).post("/generate", json={"elements": elements})

    assert engine.durations == [45, None]


def test_the_engine_falls_back_to_its_configured_duration():
    engine = AudioCraftEngine(GeneratorConfig(duration=10))

    assert engine.resolve_duration(None) == 10
    assert engine.resolve_duration(0) == 10
    assert engine.resolve_duration(30) == 30


def test_the_engine_clamps_absurd_durations():
    engine = AudioCraftEngine(GeneratorConfig(duration=10))

    assert engine.resolve_duration(100_000) == MAX_DURATION_S
    assert engine.resolve_duration(-5) == 1


def test_config_reads_overrides_from_the_environment(monkeypatch):
    monkeypatch.setenv("MUSICGEN_MODEL", "facebook/musicgen-small")
    monkeypatch.setenv("GENERATION_DURATION", "5")
    monkeypatch.setenv("GENERATION_LOUDNESS_LUFS", "-23")
    monkeypatch.setenv("GENERATION_DEVICE", "cpu")

    config = GeneratorConfig.from_env()

    assert config.musicgen_model == "facebook/musicgen-small"
    assert config.duration == 5
    assert config.loudness_lufs == -23.0
    assert config.device == "cpu"


def test_labels_are_sanitised_into_filenames():
    assert _stem("distant thunder / rain") == "distant_thunder_rain"
    assert _stem("///") == "element"


def test_the_cli_parses_serve_overrides():
    from halcyon_generator.cli import build_parser

    args = build_parser().parse_args(
        ["serve", "--port", "9000", "--device", "cpu", "--duration", "5"]
    )

    assert args.command == "serve"
    assert args.port == 9000
    assert args.device == "cpu"
    assert args.duration == 5


def test_the_cli_requires_a_subcommand():
    from halcyon_generator.cli import build_parser

    with pytest.raises(SystemExit):
        build_parser().parse_args([])


def test_the_engine_batches_by_type_and_requested_length():
    engine = RecordingAudioCraftEngine(GeneratorConfig(duration=10))

    engine.generate(
        [
            {"label": "rain", "type": "sound", "duration": 4},
            {"label": "drone", "type": "music", "duration": 30},
            {"label": "wind", "type": "sound", "duration": 4},
            {"label": "hoot", "type": "sound", "duration": 2},
        ]
    )

    assert engine.batches == [
        ("audiogen", ["rain", "wind"], 4),
        ("musicgen", ["drone"], 30),
        ("audiogen", ["hoot"], 2),
    ]


def test_elements_without_a_length_fall_back_to_the_batch_duration():
    engine = RecordingAudioCraftEngine(GeneratorConfig(duration=10))

    engine.generate([{"label": "rain", "type": "sound"}], duration=30)
    engine.generate([{"label": "rain", "type": "sound"}])

    assert [seconds for _, _, seconds in engine.batches] == [30, 10]


def test_unknown_element_keys_survive_the_round_trip():
    elements = [
        {"index": 0, "label": "rain", "type": "sound", "prompt": "rain", "duration": 4},
        {"index": 1, "label": "drone", "type": "music", "prompt": "drone", "duration": 30},
    ]
    returned = RecordingAudioCraftEngine(GeneratorConfig()).generate(elements)

    assert [e["index"] for e in returned] == [0, 1]
