def test_create_returns_the_new_atmosphere(client, auth):
    response = client.post(
        "/api/atmospheres", headers=auth, json={"prompt": "a rainy library"}
    )

    assert response.status_code == 202
    body = response.json()["data"]
    assert body["status"] == "pending"
    assert body["prompt"] == "a rainy library"
    assert body["progress"] == 0


def test_create_rejects_an_empty_prompt(client, auth):
    response = client.post("/api/atmospheres", headers=auth, json={"prompt": ""})

    assert response.status_code == 422


def test_create_defaults_to_the_shipped_length(client, auth):
    from api.app.config import DEFAULT_DURATION_S

    response = client.post(
        "/api/atmospheres", headers=auth, json={"prompt": "a rainy library"}
    )

    assert response.json()["data"]["duration_s"] == DEFAULT_DURATION_S


def test_create_keeps_the_requested_length(client, auth):
    response = client.post(
        "/api/atmospheres",
        headers=auth,
        json={"prompt": "a rainy library", "duration_s": 60},
    )
    atmosphere_id = response.json()["data"]["id"]

    assert response.json()["data"]["duration_s"] == 60
    body = client.get(f"/api/atmospheres/{atmosphere_id}", headers=auth).json()["data"]
    assert body["duration_s"] == 60


def test_create_rejects_a_length_outside_the_allowed_range(client, auth):
    from api.app.config import MAX_DURATION_S, MIN_DURATION_S

    for duration in (MIN_DURATION_S - 1, MAX_DURATION_S + 1):
        response = client.post(
            "/api/atmospheres",
            headers=auth,
            json={"prompt": "a rainy library", "duration_s": duration},
        )
        assert response.status_code == 422


def test_the_requested_length_reaches_the_generator(client, auth, stub_pipeline, monkeypatch):
    import api.app.services.generator as generator_module
    from api.app.services.pipeline import run_generation

    sent = {}
    original_post = generator_module.requests.post

    def capture(url, **kwargs):
        sent.update(kwargs["json"])
        return original_post(url, **kwargs)

    monkeypatch.setattr(generator_module.requests, "post", capture)

    atmosphere_id = client.post(
        "/api/atmospheres",
        headers=auth,
        json={"prompt": "a rainy library", "duration_s": 30},
    ).json()["data"]["id"]
    run_generation(atmosphere_id)

    assert sent["duration"] == 30


def test_generation_produces_playable_elements(client, auth, ready_atmosphere):
    body = client.get(f"/api/atmospheres/{ready_atmosphere}", headers=auth).json()["data"]

    assert body["status"] == "ready"
    assert body["progress"] == 100
    assert body["error"] is None
    assert body["generated_at"] is not None
    assert body["title"] == "Rainy Library"
    assert len(body["elements"]) == 2

    labels = [element["label"] for element in body["elements"]]
    assert labels == ["Rain on glass", "Warm drone"]


def test_mix_parameters_come_from_audio_analysis(client, auth, ready_atmosphere):
    element = client.get(f"/api/atmospheres/{ready_atmosphere}", headers=auth).json()[
        "data"
    ]["elements"][0]

    assert element["duration_s"] > 0
    assert 0.0 <= element["volume"] <= 2.0
    assert -1.0 <= element["pan"] <= 1.0
    assert 0.0 <= element["depth"] <= 1.0
    assert element["tuning_hz"] == 440.0
    assert element["original"]["volume"] == element["volume"]
    assert element["original"]["pan"] == element["pan"]
    assert element["original"]["eq_json"] == element["eq_json"]


def test_generated_audio_is_downloadable(client, auth, ready_atmosphere):
    element = client.get(f"/api/atmospheres/{ready_atmosphere}", headers=auth).json()[
        "data"
    ]["elements"][0]

    response = client.get(element["audio_url"], headers=auth)

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    assert response.content[:4] == b"RIFF"


def test_regenerating_replaces_previous_audio(client, auth, ready_atmosphere):
    from api.app.services import storage
    from api.app.services.pipeline import run_generation

    before = sorted(p.name for p in storage.atmosphere_dir(ready_atmosphere).iterdir())
    run_generation(ready_atmosphere)
    after = sorted(p.name for p in storage.atmosphere_dir(ready_atmosphere).iterdir())

    assert before == after


def test_generation_failure_is_recorded(client, auth, monkeypatch):
    from api.app.services.pipeline import run_generation

    def explode(*_args, **_kwargs):
        raise ValueError("the model is offline")

    monkeypatch.setattr("api.app.services.pipeline.decompose", explode)

    atmosphere_id = client.post(
        "/api/atmospheres", headers=auth, json={"prompt": "a rainy library"}
    ).json()["data"]["id"]

    run_generation(atmosphere_id)
    body = client.get(f"/api/atmospheres/{atmosphere_id}", headers=auth).json()["data"]

    assert body["status"] == "failed"
    assert "the model is offline" in body["error"]
    assert body["current_stage"] is None


def test_restart_reclaims_stranded_atmospheres(client, auth):
    from api.app.worker import reclaim_interrupted

    atmosphere_id = client.post(
        "/api/atmospheres", headers=auth, json={"prompt": "a rainy library"}
    ).json()["data"]["id"]

    assert reclaim_interrupted() == 1
    body = client.get(f"/api/atmospheres/{atmosphere_id}", headers=auth).json()["data"]

    assert body["status"] == "failed"
    assert "restart" in body["error"]
