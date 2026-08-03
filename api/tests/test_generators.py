import pytest


@pytest.fixture
def create(client, auth):
    def _create(name: str, url: str, kind: str = "custom", activate: bool = True):
        response = client.post(
            "/api/generators",
            headers=auth,
            json={"name": name, "url": url, "kind": kind, "activate": activate},
        )
        assert response.status_code == 201, response.text
        return response.json()["data"]

    return _create


def test_listing_starts_empty_and_falls_back_to_the_instance_default(client, auth):
    body = client.get("/api/generators", headers=auth).json()["data"]

    assert body["generators"] == []
    assert body["active_url"] == body["instance_default_url"]
    assert {kind["key"] for kind in body["kinds"]} == {
        "colab",
        "modal",
        "huggingface",
        "local",
        "custom",
    }


def test_creating_a_generator_activates_it(create):
    body = create("Colab", "https://abcd.ngrok-free.app", kind="colab")

    assert len(body["generators"]) == 1
    assert body["generators"][0]["is_active"] is True
    assert body["active_url"] == "https://abcd.ngrok-free.app"


def test_trailing_slashes_are_stripped_from_urls(create):
    body = create("Modal", "https://x--halcyon.modal.run/")

    assert body["generators"][0]["url"] == "https://x--halcyon.modal.run"


def test_only_one_generator_is_active_at_a_time(client, auth, create):
    create("Colab", "https://abcd.ngrok-free.app", kind="colab")
    body = create("Modal", "https://x--halcyon.modal.run", kind="modal")

    assert [g["is_active"] for g in body["generators"]] == [False, True]
    assert body["active_url"] == "https://x--halcyon.modal.run"

    colab_id = body["generators"][0]["id"]
    switched = client.post(f"/api/generators/{colab_id}/activate", headers=auth)

    assert switched.status_code == 200
    assert switched.json()["data"]["active_url"] == "https://abcd.ngrok-free.app"


def test_adding_without_activating_leaves_the_current_one_selected(client, auth, create):
    create("Colab", "https://abcd.ngrok-free.app", kind="colab")
    body = create("Modal", "https://x--halcyon.modal.run", activate=False)

    assert body["active_url"] == "https://abcd.ngrok-free.app"


def test_the_first_generator_is_active_even_when_not_requested(create):
    body = create("Modal", "https://x--halcyon.modal.run", activate=False)

    assert body["generators"][0]["is_active"] is True


def test_deleting_the_active_generator_promotes_another(client, auth, create):
    create("Colab", "https://abcd.ngrok-free.app", kind="colab")
    body = create("Modal", "https://x--halcyon.modal.run", kind="modal")
    modal_id = body["generators"][1]["id"]

    remaining = client.delete(f"/api/generators/{modal_id}", headers=auth).json()["data"]

    assert len(remaining["generators"]) == 1
    assert remaining["generators"][0]["is_active"] is True
    assert remaining["active_url"] == "https://abcd.ngrok-free.app"


def test_deleting_the_last_generator_falls_back_to_the_default(client, auth, create):
    body = create("Colab", "https://abcd.ngrok-free.app", kind="colab")
    only_id = body["generators"][0]["id"]

    remaining = client.delete(f"/api/generators/{only_id}", headers=auth).json()["data"]

    assert remaining["generators"] == []
    assert remaining["active_url"] == remaining["instance_default_url"]


def test_renaming_and_repointing_a_generator(client, auth, create):
    body = create("Colab", "https://abcd.ngrok-free.app", kind="colab")
    generator_id = body["generators"][0]["id"]

    updated = client.patch(
        f"/api/generators/{generator_id}",
        headers=auth,
        json={"name": "Colab (T4)", "url": "https://efgh.ngrok-free.app"},
    ).json()["data"]

    assert updated["generators"][0]["name"] == "Colab (T4)"
    assert updated["active_url"] == "https://efgh.ngrok-free.app"


def test_repointing_clears_a_stale_probe_result(client, auth, create, monkeypatch):
    import api.app.routers.generators as router

    monkeypatch.setattr(router, "probe", lambda url: ("ok", None, {"duration": 10}))

    body = create("Colab", "https://abcd.ngrok-free.app", kind="colab")
    generator_id = body["generators"][0]["id"]
    client.post(f"/api/generators/{generator_id}/test", headers=auth)

    updated = client.patch(
        f"/api/generators/{generator_id}",
        headers=auth,
        json={"url": "https://efgh.ngrok-free.app"},
    ).json()["data"]

    assert updated["generators"][0]["last_status"] is None
    assert updated["generators"][0]["reported"] is None


def test_duplicate_names_are_rejected(client, auth, create):
    create("Colab", "https://abcd.ngrok-free.app", kind="colab")

    response = client.post(
        "/api/generators",
        headers=auth,
        json={"name": "Colab", "url": "https://other.ngrok-free.app"},
    )

    assert response.status_code == 422
    assert "already have a generator" in response.json()["detail"]


def test_unknown_host_kinds_are_rejected(client, auth):
    response = client.post(
        "/api/generators",
        headers=auth,
        json={"name": "Weird", "url": "https://x.test", "kind": "sagemaker"},
    )

    assert response.status_code == 422


def test_generators_are_scoped_to_their_owner(client, auth, register, create):
    body = create("Colab", "https://abcd.ngrok-free.app", kind="colab")
    generator_id = body["generators"][0]["id"]

    other = {"Authorization": f"Bearer {register(email='other@halcyon.test')}"}

    assert client.get("/api/generators", headers=other).json()["data"]["generators"] == []
    assert client.post(f"/api/generators/{generator_id}/activate", headers=other).status_code == 404
    assert client.delete(f"/api/generators/{generator_id}", headers=other).status_code == 404


def test_probing_records_what_the_generator_reports(client, auth, create, monkeypatch):
    import api.app.routers.generators as router

    monkeypatch.setattr(
        router,
        "probe",
        lambda url: ("ok", None, {"audiogen_model": "facebook/audiogen-medium", "duration": 10}),
    )

    body = create("Modal", "https://x--halcyon.modal.run", kind="modal")
    generator_id = body["generators"][0]["id"]

    result = client.post(f"/api/generators/{generator_id}/test", headers=auth).json()["data"]

    assert result["status"] == "ok"
    assert result["reported"]["duration"] == 10

    listed = client.get("/api/generators", headers=auth).json()["data"]["generators"][0]
    assert listed["last_status"] == "ok"
    assert listed["last_checked_at"] is not None


def test_probing_an_unreachable_generator_reports_it(client, auth, create, monkeypatch):
    import api.app.routers.generators as router

    monkeypatch.setattr(
        router, "probe", lambda url: ("unreachable", "Connection refused", None)
    )

    body = create("Colab", "https://abcd.ngrok-free.app", kind="colab")
    generator_id = body["generators"][0]["id"]

    result = client.post(f"/api/generators/{generator_id}/test", headers=auth).json()["data"]

    assert result["status"] == "unreachable"
    assert result["detail"] == "Connection refused"


def test_a_legacy_generator_url_is_adopted_as_a_profile(client, auth):
    client.put("/api/settings", headers=auth, json={"generator_url": "http://gpu.local:9000"})

    body = client.get("/api/generators", headers=auth).json()["data"]

    assert len(body["generators"]) == 1
    assert body["generators"][0]["url"] == "http://gpu.local:9000"
    assert body["generators"][0]["is_active"] is True
    assert body["active_url"] == "http://gpu.local:9000"


def test_the_legacy_url_is_adopted_only_once(client, auth):
    client.put("/api/settings", headers=auth, json={"generator_url": "http://gpu.local:9000"})
    client.get("/api/generators", headers=auth)

    body = client.get("/api/generators", headers=auth).json()["data"]

    assert len(body["generators"]) == 1


def test_generation_uses_the_active_generator(client, auth, create, monkeypatch):
    import api.app.services.generator as generator_module

    called: list[str] = []

    def fake_post(url, **kwargs):
        called.append(url)
        raise RuntimeError("stop here")

    monkeypatch.setattr(generator_module.requests, "post", fake_post)
    monkeypatch.setattr(
        "api.app.services.decomposer.complete_json",
        lambda *_: '{"atmosphere": "x", "elements": [{"label": "a", "type": "sound", "prompt": "b"}]}',
    )

    create("Colab", "https://abcd.ngrok-free.app", kind="colab")
    create("Modal", "https://x--halcyon.modal.run", kind="modal")

    from api.app.services.pipeline import run_generation

    atmosphere_id = client.post(
        "/api/atmospheres", headers=auth, json={"prompt": "a rainy library"}
    ).json()["data"]["id"]
    run_generation(atmosphere_id)

    assert called == ["https://x--halcyon.modal.run/generate"]
