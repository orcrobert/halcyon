import base64
import io

import numpy as np
import pytest
import soundfile as sf

from api.tests.conftest import SAMPLE_RATE, FakeResponse, wav_bytes


def clipped_bytes(seconds: float = 2.0) -> bytes:
    rng = np.random.default_rng(9)
    samples = np.clip(rng.normal(0, 0.8, int(SAMPLE_RATE * seconds)), -1.0, 1.0)
    buffer = io.BytesIO()
    sf.write(buffer, samples.astype(np.float32), SAMPLE_RATE, format="WAV")
    return buffer.getvalue()


def silent_bytes(seconds: float = 2.0) -> bytes:
    buffer = io.BytesIO()
    sf.write(buffer, np.zeros(int(SAMPLE_RATE * seconds), np.float32), SAMPLE_RATE, format="WAV")
    return buffer.getvalue()


@pytest.fixture
def replies(monkeypatch):
    import api.app.services.generator as generator_module

    audio: dict[str, bytes] = {}

    def fake_post(url, **kwargs):
        return FakeResponse(
            {
                "elements": [
                    {
                        **element,
                        "audio_b64": base64.b64encode(
                            audio.get(element["label"], wav_bytes(seed=i))
                        ).decode(),
                    }
                    for i, element in enumerate(kwargs["json"]["elements"])
                ]
            }
        )

    monkeypatch.setattr(generator_module.requests, "post", fake_post)
    return audio


def generated(client, auth, prompt: str = "a rainy library") -> dict:
    from api.app.services.pipeline import run_generation

    atmosphere_id = client.post(
        "/api/atmospheres", headers=auth, json={"prompt": prompt}
    ).json()["data"]["id"]
    run_generation(atmosphere_id)
    return client.get(f"/api/atmospheres/{atmosphere_id}", headers=auth).json()["data"]


def by_label(body: dict) -> dict[str, dict]:
    return {element["label"]: element for element in body["elements"]}


def test_inspect_audio_passes_a_clean_clip():
    from api.app.services.quality import inspect_audio

    assert inspect_audio({"role": "bed", "playback": "loop"}, wav_bytes()) == []


def test_inspect_audio_flags_bytes_that_are_not_audio():
    from api.app.services.quality import inspect_audio

    assert [issue["check"] for issue in inspect_audio({}, b"not a wav")] == [
        "unreadable"
    ]


def test_check_results_attaches_issues_and_drops_unusable_clips():
    from api.app.services.quality import check_results

    checked = check_results(
        [
            {"label": "Clean", "role": "bed", "audio": wav_bytes()},
            {"label": "Hot", "role": "bed", "audio": clipped_bytes()},
            {"label": "Silent", "role": "bed", "audio": silent_bytes()},
            {"label": "Broken", "role": "bed", "audio": b"junk"},
        ]
    )

    assert [result["label"] for result in checked] == ["Clean", "Hot"]
    assert checked[0]["quality"] == []
    assert "clipping" in [issue["check"] for issue in checked[1]["quality"]]


def test_check_results_fails_when_nothing_is_usable():
    from api.app.services.quality import check_results

    with pytest.raises(ValueError, match="silent or unreadable"):
        check_results([{"label": "Silent", "audio": silent_bytes()}])


def test_generation_records_the_issues_of_each_layer(
    client, auth, stub_pipeline, replies
):
    replies["Rain on glass"] = clipped_bytes()

    body = generated(client, auth)
    layers = by_label(body)

    assert body["status"] == "ready"
    rain = layers["Rain on glass"]["quality"]
    assert rain["dismissed"] is False
    assert "clipping" in [issue["check"] for issue in rain["issues"]]
    assert layers["Warm drone"]["quality"] == {"issues": [], "dismissed": False}


def test_a_silent_layer_is_left_out_of_the_scene(client, auth, stub_pipeline, replies):
    replies["Warm drone"] = silent_bytes()

    body = generated(client, auth)

    assert body["status"] == "ready"
    assert [element["label"] for element in body["elements"]] == ["Rain on glass"]


def test_a_scene_of_only_silence_fails(client, auth, stub_pipeline, replies):
    replies["Rain on glass"] = silent_bytes()
    replies["Warm drone"] = silent_bytes()

    body = generated(client, auth)

    assert body["status"] == "failed"
    assert "silent" in body["error"]


def test_the_stored_decomposition_carries_no_quality(
    client, auth, stub_pipeline, replies
):
    from api.app.db import session_scope
    from api.app.models.tables import Atmosphere

    replies["Rain on glass"] = clipped_bytes()
    body = generated(client, auth)

    with session_scope() as session:
        stored = session.get(Atmosphere, body["id"]).decomposed_json

    assert all("quality" not in element for element in stored["elements"])


def test_dismissing_marks_every_flagged_layer(client, auth, stub_pipeline, replies):
    replies["Rain on glass"] = clipped_bytes()
    body = generated(client, auth)

    response = client.post(
        f"/api/atmospheres/{body['id']}/quality/dismiss", headers=auth
    )

    assert response.status_code == 200
    layers = by_label(response.json()["data"])
    assert layers["Rain on glass"]["quality"]["dismissed"] is True
    assert layers["Warm drone"]["quality"]["dismissed"] is False


def test_dismissing_is_scoped_to_the_owner(
    client, auth, register, stub_pipeline, replies
):
    body = generated(client, auth)
    stranger = {"Authorization": f"Bearer {register('other@halcyon.test')}"}

    response = client.post(
        f"/api/atmospheres/{body['id']}/quality/dismiss", headers=stranger
    )

    assert response.status_code == 404


def test_regenerating_a_layer_rechecks_it_and_clears_the_dismissal(
    client, auth, stub_pipeline, replies
):
    from api.app.services.pipeline import regenerate_element

    replies["Rain on glass"] = clipped_bytes()
    body = generated(client, auth)
    client.post(f"/api/atmospheres/{body['id']}/quality/dismiss", headers=auth)
    rain_id = by_label(body)["Rain on glass"]["id"]

    replies.pop("Rain on glass")
    regenerate_element(rain_id)

    after = by_label(
        client.get(f"/api/atmospheres/{body['id']}", headers=auth).json()["data"]
    )
    assert after["Rain on glass"]["quality"] == {"issues": [], "dismissed": False}


def test_a_regeneration_that_comes_back_silent_fails_the_layer(
    client, auth, stub_pipeline, replies
):
    from api.app.services.pipeline import regenerate_element

    body = generated(client, auth)
    rain_id = by_label(body)["Rain on glass"]["id"]

    replies["Rain on glass"] = silent_bytes()
    regenerate_element(rain_id)

    after = by_label(
        client.get(f"/api/atmospheres/{body['id']}", headers=auth).json()["data"]
    )
    assert after["Rain on glass"]["status"] == "failed"
    assert after["Warm drone"]["status"] == "ready"
