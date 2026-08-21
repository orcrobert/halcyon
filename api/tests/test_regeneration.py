import json

import pytest

from api.app.services import storage

REFINED = {
    "elements": [
        {
            "label": "Softer rain",
            "type": "sound",
            "prompt": "gentle rain on glass, distant, muffled",
        }
    ]
}


@pytest.fixture
def elements(client, auth, ready_atmosphere):
    return client.get(f"/api/atmospheres/{ready_atmosphere}", headers=auth).json()[
        "data"
    ]["elements"]


@pytest.fixture
def refiner(monkeypatch):
    seen: list[str] = []

    def complete(_config, _system, user_prompt):
        seen.append(user_prompt)
        return json.dumps(REFINED)

    monkeypatch.setattr("api.app.services.decomposer.complete_json", complete)
    return seen


def row(element_id: int):
    from api.app.db import session_scope
    from api.app.models.tables import Element

    with session_scope() as session:
        element = session.get(Element, element_id)
        session.refresh(element)
        return element


def test_regenerate_accepts_the_job_and_marks_the_layer(client, auth, elements):
    response = client.post(
        f"/api/elements/{elements[0]['id']}/regenerate",
        headers=auth,
        json={"feedback": "too harsh"},
    )

    assert response.status_code == 202
    assert response.json()["data"]["status"] == "regenerating"
    assert client.app.state.worker.elements == [(elements[0]["id"], "too harsh")]


def test_blank_feedback_reaches_the_worker_as_no_feedback(client, auth, elements):
    client.post(
        f"/api/elements/{elements[0]['id']}/regenerate",
        headers=auth,
        json={"feedback": "   "},
    )

    assert client.app.state.worker.elements == [(elements[0]["id"], None)]


def test_regenerate_rejects_a_second_run_while_one_is_in_flight(client, auth, elements):
    client.post(f"/api/elements/{elements[0]['id']}/regenerate", headers=auth, json={})
    response = client.post(
        f"/api/elements/{elements[0]['id']}/regenerate", headers=auth, json={}
    )

    assert response.status_code == 409


def test_regenerate_is_scoped_to_the_owner(client, register, elements):
    other = {"Authorization": f"Bearer {register(email='other@halcyon.test')}"}

    response = client.post(
        f"/api/elements/{elements[0]['id']}/regenerate", headers=other, json={}
    )

    assert response.status_code == 404


def test_empty_feedback_regenerates_without_calling_the_llm(
    client, auth, stub_pipeline, elements, monkeypatch
):
    from api.app.services.pipeline import regenerate_element

    def explode(*_args, **_kwargs):
        raise AssertionError("the LLM should not be called without feedback")

    monkeypatch.setattr("api.app.services.decomposer.complete_json", explode)

    regenerate_element(elements[0]["id"], None)
    after = row(elements[0]["id"])

    assert after.status == "ready"
    assert after.error is None
    assert after.label == elements[0]["label"]
    assert after.prompt == elements[0]["prompt"]
    assert after.version == 2


def test_feedback_rewrites_the_layer_through_the_llm(
    client, auth, stub_pipeline, elements, refiner
):
    from api.app.services.pipeline import regenerate_element

    before = storage.resolve_audio(row(elements[0]["id"]).audio_path)

    regenerate_element(elements[0]["id"], "too harsh")
    after = row(elements[0]["id"])

    assert after.label == "Softer rain"
    assert after.prompt == REFINED["elements"][0]["prompt"]
    assert after.status == "ready"
    assert after.version == 2

    request = json.loads(refiner[0])
    assert request["complaint"] == "too harsh"
    assert request["layer"]["label"] == elements[0]["label"]
    assert request["other_layers"] == [elements[1]["label"]]
    assert request["scene"] == "a rainy library at dusk"

    assert storage.resolve_audio(after.audio_path).is_file()
    assert not before.exists()


def test_a_refined_label_never_collides_with_a_sibling(
    client, auth, stub_pipeline, elements, monkeypatch
):
    from api.app.services.pipeline import regenerate_element

    collision = {
        "elements": [
            {"label": elements[1]["label"], "type": "sound", "prompt": "rain"}
        ]
    }
    monkeypatch.setattr(
        "api.app.services.decomposer.complete_json",
        lambda *_: json.dumps(collision),
    )

    regenerate_element(elements[0]["id"], "make it a drone")

    assert row(elements[0]["id"]).label == f"{elements[1]['label']} 2"


def test_the_whole_mix_is_recomputed_without_retrimming_the_others(
    client, auth, stub_pipeline, elements
):
    from api.app.services.pipeline import regenerate_element

    sibling = row(elements[1]["id"])
    before_duration = sibling.duration_s
    before_audio = storage.resolve_audio(sibling.audio_path).read_bytes()

    regenerate_element(elements[0]["id"], None)
    after = row(elements[1]["id"])

    assert after.duration_s == before_duration
    assert storage.resolve_audio(after.audio_path).read_bytes() == before_audio
    assert after.original_eq_json is not None


def test_a_manual_mix_edit_survives_a_neighbour_regenerating(
    client, auth, stub_pipeline, elements
):
    from api.app.services.pipeline import regenerate_element

    client.patch(
        f"/api/elements/{elements[1]['id']}", headers=auth, json={"volume": 1.4}
    )

    regenerate_element(elements[0]["id"], None)
    after = row(elements[1]["id"])

    assert after.volume == 1.4
    assert after.original_volume != 1.4


def test_regeneration_failure_is_recorded_on_the_element(
    client, auth, stub_pipeline, elements, monkeypatch
):
    from api.app.services.pipeline import regenerate_element

    def explode(*_args, **_kwargs):
        raise ValueError("the generator is offline")

    monkeypatch.setattr("api.app.services.pipeline.generate", explode)

    regenerate_element(elements[0]["id"], None)
    after = row(elements[0]["id"])

    assert after.status == "failed"
    assert "the generator is offline" in after.error

    body = client.get(f"/api/elements/{elements[0]['id']}/audio", headers=auth)
    assert body.status_code == 200


def test_restart_reclaims_a_stranded_regeneration(client, auth, elements):
    from api.app.worker import reclaim_interrupted

    client.post(f"/api/elements/{elements[0]['id']}/regenerate", headers=auth, json={})

    assert reclaim_interrupted() == 1
    after = row(elements[0]["id"])

    assert after.status == "failed"
    assert "restart" in after.error


def test_regenerating_a_scene_creates_a_second_atmosphere(
    client, auth, ready_atmosphere, elements
):
    response = client.post(
        f"/api/atmospheres/{ready_atmosphere}/regenerate", headers=auth
    )

    assert response.status_code == 202
    fresh = response.json()["data"]
    assert fresh["id"] != ready_atmosphere
    assert fresh["status"] == "pending"
    assert fresh["prompt"] == "a rainy library at dusk"
    assert fresh["title"] == "Rainy Library"
    assert client.app.state.worker.submitted == [ready_atmosphere, fresh["id"]]

    original = client.get(f"/api/atmospheres/{ready_atmosphere}", headers=auth).json()[
        "data"
    ]
    assert original["status"] == "ready"
    assert [e["id"] for e in original["elements"]] == [e["id"] for e in elements]


def test_a_regenerated_scene_reuses_the_saved_decomposition(
    client, auth, ready_atmosphere, stub_pipeline, monkeypatch
):
    from api.app.services.pipeline import run_generation

    def explode(*_args, **_kwargs):
        raise AssertionError("the decomposer should not run for a saved scene")

    monkeypatch.setattr("api.app.services.decomposer.complete_json", explode)

    fresh_id = client.post(
        f"/api/atmospheres/{ready_atmosphere}/regenerate", headers=auth
    ).json()["data"]["id"]
    run_generation(fresh_id)

    body = client.get(f"/api/atmospheres/{fresh_id}", headers=auth).json()["data"]

    assert body["status"] == "ready"
    assert [e["label"] for e in body["elements"]] == ["Rain on glass", "Warm drone"]
    assert body["elements"][0]["audio_url"] != ""


def test_a_regenerated_scene_keeps_the_original_audio(
    client, auth, ready_atmosphere, elements, stub_pipeline
):
    from api.app.services.pipeline import run_generation

    fresh_id = client.post(
        f"/api/atmospheres/{ready_atmosphere}/regenerate", headers=auth
    ).json()["data"]["id"]
    run_generation(fresh_id)

    for element in elements:
        assert (
            client.get(element["audio_url"], headers=auth).status_code == 200
        )
    assert storage.atmosphere_dir(ready_atmosphere).is_dir()
    assert storage.atmosphere_dir(fresh_id).is_dir()


def test_regenerating_a_scene_without_a_decomposition_is_refused(client, auth):
    atmosphere_id = client.post(
        "/api/atmospheres", headers=auth, json={"prompt": "a rainy library"}
    ).json()["data"]["id"]

    response = client.post(f"/api/atmospheres/{atmosphere_id}/regenerate", headers=auth)

    assert response.status_code == 409
    assert "no saved decomposition" in response.json()["detail"]


def test_regenerating_a_scene_is_scoped_to_the_owner(client, register, ready_atmosphere):
    other = {"Authorization": f"Bearer {register(email='other@halcyon.test')}"}

    response = client.post(
        f"/api/atmospheres/{ready_atmosphere}/regenerate", headers=other
    )

    assert response.status_code == 404
