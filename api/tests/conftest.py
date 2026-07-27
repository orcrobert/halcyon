import base64
import io
import json
import sys
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

SAMPLE_RATE = 22050

DECOMPOSED = {
    "atmosphere": "Rainy Library",
    "elements": [
        {"label": "Rain on glass", "type": "sound", "prompt": "steady rain on a window"},
        {"label": "Warm drone", "type": "music", "prompt": "soft ambient drone"},
    ],
}


class RecordingWorker:
    def __init__(self) -> None:
        self.submitted: list[int] = []

    def submit(self, atmosphere_id: int) -> None:
        self.submitted.append(atmosphere_id)


class FakeResponse:
    def __init__(self, payload: dict) -> None:
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self._payload


def wav_bytes(seconds: float = 2.0, seed: int = 0) -> bytes:
    rng = np.random.default_rng(seed)
    samples = rng.normal(0, 0.05, int(SAMPLE_RATE * seconds)).astype(np.float32)
    buffer = io.BytesIO()
    sf.write(buffer, samples, SAMPLE_RATE, format="WAV")
    return buffer.getvalue()


@pytest.fixture
def client(tmp_path, monkeypatch):
    import api.app.db as db
    import api.app.security as security
    from api.app.config import settings

    monkeypatch.setattr(settings, "data_dir", str(tmp_path))
    monkeypatch.setattr(settings, "secret_key", "test-secret-key")
    monkeypatch.setattr(settings, "allow_registration", True)
    monkeypatch.setattr(db, "_engine", None)
    monkeypatch.setattr(security, "_fernet", None)

    from api.app.main import app

    with TestClient(app) as test_client:
        app.state.worker = RecordingWorker()
        yield test_client


@pytest.fixture
def register(client):
    def _register(email: str = "fan@halcyon.test", name: str = "Ambient Fan") -> str:
        response = client.post(
            "/api/auth/register",
            json={"name": name, "email": email, "password": "hunter2hunter2"},
        )
        assert response.status_code == 201, response.text
        return response.json()["token"]

    return _register


@pytest.fixture
def token(register):
    return register()


@pytest.fixture
def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def stub_pipeline(monkeypatch):
    import api.app.services.generator as generator_module

    monkeypatch.setattr(
        "api.app.services.decomposer.complete_json", lambda *_: json.dumps(DECOMPOSED)
    )

    def fake_post(url, **kwargs):
        return FakeResponse(
            {
                "elements": [
                    {**element, "audio_b64": base64.b64encode(wav_bytes(seed=i)).decode()}
                    for i, element in enumerate(kwargs["json"]["elements"])
                ]
            }
        )

    monkeypatch.setattr(generator_module.requests, "post", fake_post)


@pytest.fixture
def ready_atmosphere(client, auth, stub_pipeline):
    from api.app.services.pipeline import run_generation

    response = client.post(
        "/api/atmospheres", headers=auth, json={"prompt": "a rainy library at dusk"}
    )
    assert response.status_code == 202

    atmosphere_id = response.json()["data"]["id"]
    run_generation(atmosphere_id)
    return atmosphere_id
