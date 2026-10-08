import base64
import json

from conftest import DECOMPOSED, wav_bytes


def style_payload(seconds: float = 3.0) -> dict:
    return {
        "audio_b64": base64.b64encode(wav_bytes(seconds)).decode(),
        "name": "piano.mp3",
        "start_s": 12.0,
        "end_s": 12.0 + seconds,
    }


def create(client, auth, **extra):
    response = client.post(
        "/api/atmospheres",
        headers=auth,
        json={"prompt": "a rainy library", **extra},
    )
    assert response.status_code == 202, response.text
    return response.json()["data"]


def capture_generator(monkeypatch):
    import api.app.services.generator as generator_module

    sent = []
    original_post = generator_module.requests.post

    def capture(url, **kwargs):
        sent.append(kwargs["json"])
        return original_post(url, **kwargs)

    monkeypatch.setattr(generator_module.requests, "post", capture)
    return sent


def test_create_without_a_style_has_none(client, auth):
    assert create(client, auth)["style"] is None


def test_create_stores_the_style_clip(client, auth):
    from api.app.services import storage

    body = create(client, auth, style=style_payload())

    assert body["style"]["name"] == "piano.mp3"
    assert body["style"]["start_s"] == 12.0
    assert abs(body["style"]["duration_s"] - 3.0) < 0.01
    assert storage.read_style(body["id"]) is not None


def test_create_rejects_a_style_clip_outside_the_excerpt_range(client, auth):
    for seconds in (0.5, 8.0):
        response = client.post(
            "/api/atmospheres",
            headers=auth,
            json={"prompt": "a rainy library", "style": style_payload(seconds)},
        )
        assert response.status_code == 422


def test_create_rejects_a_style_clip_that_is_not_audio(client, auth):
    payload = {**style_payload(), "audio_b64": base64.b64encode(b"not audio").decode()}
    response = client.post(
        "/api/atmospheres",
        headers=auth,
        json={"prompt": "a rainy library", "style": payload},
    )

    assert response.status_code == 422


def test_the_style_clip_reaches_only_music_layers(client, auth, stub_pipeline, monkeypatch):
    from api.app.services.pipeline import run_generation

    sent = capture_generator(monkeypatch)
    atmosphere_id = create(client, auth, style=style_payload())["id"]
    run_generation(atmosphere_id)

    elements = {e["label"]: e for e in sent[0]["elements"]}
    assert "style_b64" in elements["Warm drone"]
    assert "style_b64" not in elements["Rain on glass"]


def test_no_style_clip_is_sent_without_a_reference(client, auth, stub_pipeline, monkeypatch):
    from api.app.services.pipeline import run_generation

    sent = capture_generator(monkeypatch)
    run_generation(create(client, auth)["id"])

    assert all("style_b64" not in e for e in sent[0]["elements"])


def test_the_decomposer_is_told_about_the_reference(client, auth, stub_pipeline, monkeypatch):
    from api.app.services.decomposer import STYLE_NOTE
    from api.app.services.pipeline import run_generation

    systems = []

    def fake_complete(config, system, user):
        systems.append(system)
        return json.dumps(DECOMPOSED)

    monkeypatch.setattr("api.app.services.decomposer.complete_json", fake_complete)

    run_generation(create(client, auth, style=style_payload())["id"])
    run_generation(create(client, auth)["id"])

    assert systems[0].endswith(STYLE_NOTE)
    assert STYLE_NOTE not in systems[1]


def test_a_new_take_keeps_the_style_clip(client, auth, stub_pipeline):
    from api.app.services import storage
    from api.app.services.pipeline import run_generation

    source = create(client, auth, style=style_payload())["id"]
    run_generation(source)

    fresh = client.post(f"/api/atmospheres/{source}/regenerate", headers=auth)

    body = fresh.json()["data"]
    assert body["style"]["name"] == "piano.mp3"
    assert storage.read_style(body["id"]) == storage.read_style(source)


def test_delete_removes_the_style_clip(client, auth):
    from api.app.services import storage

    atmosphere_id = create(client, auth, style=style_payload())["id"]
    client.delete(f"/api/atmospheres/{atmosphere_id}", headers=auth)

    assert storage.read_style(atmosphere_id) is None
