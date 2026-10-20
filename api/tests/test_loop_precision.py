import io

import numpy as np
import pytest
import soundfile as sf

from api.app.services import pipeline
from mixer.effects.looping import LOOP_PAD_S


@pytest.mark.parametrize("sr", [16000, 22050, 32000, 48000])
@pytest.mark.parametrize("regenerate", [False, True])
def test_loop_duration_survives_storage_and_api_without_rounding(
    client, auth, stub_pipeline, monkeypatch, sr, regenerate
):
    frames = sr * 2 + 7
    wav = np.random.default_rng(7).normal(0, 0.01, (1, frames))

    def analyze(elements):
        for element in elements:
            element.update(volume=0.5, pan=0.0, depth=0.0, eq_json=[])
        return elements, [wav] * len(elements), [sr] * len(elements)

    monkeypatch.setattr(pipeline, "analyze", analyze)
    atmosphere_id = client.post(
        "/api/atmospheres", headers=auth, json={"prompt": "rain"}
    ).json()["data"]["id"]
    pipeline.run_generation(atmosphere_id)
    body = client.get(f"/api/atmospheres/{atmosphere_id}", headers=auth).json()["data"]
    if regenerate:
        pipeline.regenerate_element(body["elements"][0]["id"])
        body = client.get(f"/api/atmospheres/{atmosphere_id}", headers=auth).json()["data"]

    assert body["status"] == "ready"
    element = body["elements"][0]
    assert element["status"] == "ready"
    declared = element["duration_s"]
    assert declared == frames / sr
    audio = client.get(element["audio_url"], headers=auth)
    info = sf.info(io.BytesIO(audio.content))
    pad = (info.duration - declared) / 2
    assert pad * sr == pytest.approx(int(LOOP_PAD_S * sr), abs=1e-8)
    assert (pad + declared) * sr == pytest.approx(
        int(LOOP_PAD_S * sr) + frames, abs=1e-8
    )
