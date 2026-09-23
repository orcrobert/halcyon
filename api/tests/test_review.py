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


EDITED = [
    {
        "label": "Rain on glass",
        "type": "sound",
        "role": "bed",
        "prompt": "light rain on a window, close, soft",
    },
    {
        "label": "Page turn",
        "type": "sound",
        "role": "event",
        "frequency": "rare",
        "prompt": "single page turn, old paper, quiet room",
    },
]


def test_the_review_exposes_the_proposed_layers(client, auth, awaiting_atmosphere):
    body = client.get(
        f"/api/atmospheres/{awaiting_atmosphere}", headers=auth
    ).json()["data"]

    assert [layer["label"] for layer in body["decomposition"]] == [
        "Rain on glass",
        "Warm drone",
    ]
    assert body["decomposition"][1]["role"] == "texture"


def test_confirm_queues_the_edited_layers(client, auth, awaiting_atmosphere):
    from api.app.db import session_scope
    from api.app.models.tables import Atmosphere

    worker = client.app.state.worker
    worker.submitted.clear()

    response = client.put(
        f"/api/atmospheres/{awaiting_atmosphere}/decomposition",
        headers=auth,
        json={"elements": EDITED},
    )

    assert response.status_code == 202
    body = response.json()["data"]
    assert body["status"] == "pending"
    assert body["decomposition"] is None
    assert worker.submitted == [awaiting_atmosphere]

    with session_scope() as session:
        stored = session.get(Atmosphere, awaiting_atmosphere).decomposed_json

    assert stored["atmosphere"] == "Rainy Library"
    event = stored["elements"][1]
    assert event["playback"] == "oneshot"
    assert event["interval_min_s"] and event["interval_max_s"]


def test_a_confirmed_review_generates_without_asking_the_llm_again(
    client, auth, awaiting_atmosphere, monkeypatch
):
    from api.app.services.pipeline import run_generation

    client.put(
        f"/api/atmospheres/{awaiting_atmosphere}/decomposition",
        headers=auth,
        json={"elements": EDITED},
    )

    def refuse(*_args):
        raise AssertionError("the decomposer must not run again")

    monkeypatch.setattr("api.app.services.decomposer.complete_json", refuse)
    run_generation(awaiting_atmosphere)

    body = client.get(
        f"/api/atmospheres/{awaiting_atmosphere}", headers=auth
    ).json()["data"]
    assert body["status"] == "ready"
    assert [element["label"] for element in body["elements"]] == [
        "Rain on glass",
        "Page turn",
    ]
    assert body["elements"][1]["playback"] == "oneshot"


def test_confirm_drops_events_when_the_scene_has_them_off(
    client, auth, reviewing, stub_pipeline
):
    from api.app.db import session_scope
    from api.app.models.tables import Atmosphere
    from api.app.services.pipeline import run_generation

    atmosphere_id = client.post(
        "/api/atmospheres",
        headers=auth,
        json={"prompt": "a rainy library", "use_events": False},
    ).json()["data"]["id"]
    run_generation(atmosphere_id)

    client.put(
        f"/api/atmospheres/{atmosphere_id}/decomposition",
        headers=auth,
        json={"elements": EDITED},
    )

    with session_scope() as session:
        stored = session.get(Atmosphere, atmosphere_id).decomposed_json

    assert {element["playback"] for element in stored["elements"]} == {"loop"}


def test_confirm_rejects_duplicate_labels(client, auth, awaiting_atmosphere):
    response = client.put(
        f"/api/atmospheres/{awaiting_atmosphere}/decomposition",
        headers=auth,
        json={"elements": [EDITED[0], {**EDITED[1], "label": "rain on glass"}]},
    )

    assert response.status_code == 422


def test_confirm_rejects_an_empty_list(client, auth, awaiting_atmosphere):
    response = client.put(
        f"/api/atmospheres/{awaiting_atmosphere}/decomposition",
        headers=auth,
        json={"elements": []},
    )

    assert response.status_code == 422


def test_review_endpoints_refuse_a_scene_that_is_not_waiting(
    client, auth, ready_atmosphere
):
    confirm = client.put(
        f"/api/atmospheres/{ready_atmosphere}/decomposition",
        headers=auth,
        json={"elements": EDITED},
    )
    revise = client.post(
        f"/api/atmospheres/{ready_atmosphere}/decomposition/revise",
        headers=auth,
        json={"feedback": "warmer", "elements": EDITED},
    )

    assert confirm.status_code == 409
    assert revise.status_code == 409


def test_review_endpoints_are_scoped_to_the_owner(
    client, register, awaiting_atmosphere
):
    other = {"Authorization": f"Bearer {register('other@halcyon.test', 'Other')}"}

    response = client.put(
        f"/api/atmospheres/{awaiting_atmosphere}/decomposition",
        headers=other,
        json={"elements": EDITED},
    )

    assert response.status_code == 404


def test_revise_sends_the_draft_and_stores_the_answer(
    client, auth, awaiting_atmosphere, monkeypatch
):
    import json

    seen = {}

    def fake_complete(_config, system, request):
        seen["system"] = system
        seen["request"] = json.loads(request)
        return json.dumps(
            {
                "atmosphere": "Rainy Library",
                "elements": [
                    {**EDITED[0], "prompt": "heavier rain on a window, close"},
                    {**EDITED[0], "prompt": "rain on a skylight, distant"},
                ],
            }
        )

    monkeypatch.setattr("api.app.services.decomposer.complete_json", fake_complete)

    response = client.post(
        f"/api/atmospheres/{awaiting_atmosphere}/decomposition/revise",
        headers=auth,
        json={"feedback": "  more rain  ", "elements": EDITED},
    )

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["status"] == "awaiting_review"
    assert [layer["label"] for layer in body["decomposition"]] == [
        "Rain on glass",
        "Rain on glass 2",
    ]
    assert seen["request"]["complaint"] == "more rain"
    assert [layer["label"] for layer in seen["request"]["layers"]] == [
        "Rain on glass",
        "Page turn",
    ]
    assert "ADDRESS THE NOTE" in seen["system"]


def test_revise_reports_a_model_failure(client, auth, awaiting_atmosphere, monkeypatch):
    monkeypatch.setattr(
        "api.app.services.decomposer.complete_json", lambda *_: "not json at all"
    )

    response = client.post(
        f"/api/atmospheres/{awaiting_atmosphere}/decomposition/revise",
        headers=auth,
        json={"feedback": "warmer", "elements": EDITED},
    )

    assert response.status_code == 502


def test_discarding_a_review_deletes_the_atmosphere(client, auth, awaiting_atmosphere):
    response = client.delete(f"/api/atmospheres/{awaiting_atmosphere}", headers=auth)

    assert response.status_code == 204
    assert client.get(
        f"/api/atmospheres/{awaiting_atmosphere}", headers=auth
    ).status_code == 404
