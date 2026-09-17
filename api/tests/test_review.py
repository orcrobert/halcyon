import pytest


@pytest.fixture
def reviewing(client, auth):
    response = client.put(
        "/api/settings", headers=auth, json={"review_decomposition": True}
    )
    assert response.status_code == 200


@pytest.fixture
def awaiting_atmosphere(client, auth, reviewing, stub_pipeline):
    from api.app.services.pipeline import run_generation

    atmosphere_id = client.post(
        "/api/atmospheres", headers=auth, json={"prompt": "a rainy library at dusk"}
    ).json()["data"]["id"]
    run_generation(atmosphere_id)
    return atmosphere_id


def test_generation_pauses_for_review_when_the_flag_is_on(
    client, auth, awaiting_atmosphere
):
    body = client.get(
        f"/api/atmospheres/{awaiting_atmosphere}", headers=auth
    ).json()["data"]

    assert body["status"] == "awaiting_review"
    assert body["current_stage"] == "reviewing"
    assert body["stage_detail"]
    assert body["title"] == "Rainy Library"
    assert body["elements"] == []


def test_the_pause_never_reaches_the_generator(client, auth, reviewing, stub_pipeline, monkeypatch):
    import api.app.services.generator as generator_module
    from api.app.services.pipeline import run_generation

    def refuse(*_args, **_kwargs):
        raise AssertionError("the generator must not be called before review")

    monkeypatch.setattr(generator_module.requests, "post", refuse)

    atmosphere_id = client.post(
        "/api/atmospheres", headers=auth, json={"prompt": "a rainy library"}
    ).json()["data"]["id"]
    run_generation(atmosphere_id)

    body = client.get(f"/api/atmospheres/{atmosphere_id}", headers=auth).json()["data"]
    assert body["status"] == "awaiting_review"


def test_generation_runs_straight_through_when_the_flag_is_off(
    client, auth, ready_atmosphere
):
    body = client.get(f"/api/atmospheres/{ready_atmosphere}", headers=auth).json()["data"]

    assert body["status"] == "ready"


def test_a_review_survives_a_restart(awaiting_atmosphere):
    from api.app.db import session_scope
    from api.app.models.tables import Atmosphere
    from api.app.worker import reclaim_interrupted

    reclaim_interrupted()

    with session_scope() as session:
        assert session.get(Atmosphere, awaiting_atmosphere).status == "awaiting_review"
