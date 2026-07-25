import pytest


@pytest.fixture
def other(client, register):
    return {"Authorization": f"Bearer {register(email='other@halcyon.test')}"}


def _create(client, auth, prompt="a rainy library") -> int:
    return client.post("/api/atmospheres", headers=auth, json={"prompt": prompt}).json()[
        "data"
    ]["id"]


def test_index_is_paginated_and_newest_first(client, auth):
    for index in range(3):
        _create(client, auth, prompt=f"scene {index}")

    body = client.get("/api/atmospheres", headers=auth).json()

    assert body["meta"] == {
        "current_page": 1,
        "last_page": 1,
        "per_page": 20,
        "total": 3,
    }
    assert [row["prompt"] for row in body["data"]] == ["scene 2", "scene 1", "scene 0"]


def test_index_only_lists_your_own_atmospheres(client, auth, other):
    _create(client, auth)

    assert client.get("/api/atmospheres", headers=other).json()["meta"]["total"] == 0


def test_show_hides_other_users_atmospheres(client, auth, other):
    atmosphere_id = _create(client, auth)

    assert client.get(f"/api/atmospheres/{atmosphere_id}", headers=other).status_code == 404


def test_delete_removes_the_atmosphere(client, auth):
    atmosphere_id = _create(client, auth)

    assert client.delete(f"/api/atmospheres/{atmosphere_id}", headers=auth).status_code == 204
    assert client.get(f"/api/atmospheres/{atmosphere_id}", headers=auth).status_code == 404


def test_delete_removes_audio_from_disk(client, auth, ready_atmosphere):
    from ai.app.services import storage

    directory = storage.atmosphere_dir(ready_atmosphere)
    assert directory.is_dir()

    client.delete(f"/api/atmospheres/{ready_atmosphere}", headers=auth)

    assert not directory.exists()


def test_delete_rejects_other_users(client, auth, other):
    atmosphere_id = _create(client, auth)

    assert client.delete(f"/api/atmospheres/{atmosphere_id}", headers=other).status_code == 404


def test_atmosphere_routes_require_authentication(client):
    assert client.get("/api/atmospheres").status_code == 401
    assert client.post("/api/atmospheres", json={"prompt": "hi"}).status_code == 401
