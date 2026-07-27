import pytest


@pytest.fixture
def element(client, auth, ready_atmosphere):
    return client.get(f"/api/atmospheres/{ready_atmosphere}", headers=auth).json()[
        "data"
    ]["elements"][0]


@pytest.fixture
def other(client, register):
    return {"Authorization": f"Bearer {register(email='other@halcyon.test')}"}


def test_patch_updates_mix_parameters(client, auth, element):
    response = client.patch(
        f"/api/elements/{element['id']}",
        headers=auth,
        json={"volume": 1.4, "pan": -0.5, "depth": 0.25, "tuning_hz": 432},
    )

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["volume"] == 1.4
    assert body["pan"] == -0.5
    assert body["depth"] == 0.25
    assert body["tuning_hz"] == 432


def test_patch_leaves_the_original_snapshot_alone(client, auth, element):
    body = client.patch(
        f"/api/elements/{element['id']}", headers=auth, json={"volume": 1.9}
    ).json()["data"]

    assert body["original"]["volume"] == element["volume"]


def test_patch_accepts_eq_bands(client, auth, element):
    bands = [
        {"type": "lowshelf", "freq": 200, "gain": -3.5, "q": 0.7},
        {"type": "peaking", "freq": 1000, "gain": 2.0, "q": 1.0},
        {"type": "highshelf", "freq": 8000, "gain": 1.5, "q": 0.7},
    ]

    body = client.patch(
        f"/api/elements/{element['id']}", headers=auth, json={"eq_json": bands}
    ).json()["data"]

    assert body["eq_json"] == bands


@pytest.mark.parametrize(
    "payload",
    [
        {"volume": 2.5},
        {"volume": -0.1},
        {"pan": 1.5},
        {"pan": -1.5},
        {"depth": 1.2},
        {"tuning_hz": 100},
        {"tuning_hz": 900},
        {"eq_json": [{"type": "notch", "freq": 200, "gain": 0, "q": 1}]},
        {"eq_json": [{"type": "peaking", "freq": -10, "gain": 0, "q": 1}]},
    ],
)
def test_patch_rejects_out_of_range_values(client, auth, element, payload):
    response = client.patch(f"/api/elements/{element['id']}", headers=auth, json=payload)

    assert response.status_code == 422


def test_reset_restores_the_original_mix(client, auth, element):
    client.patch(
        f"/api/elements/{element['id']}",
        headers=auth,
        json={"volume": 0.1, "pan": 0.9, "depth": 0.8, "tuning_hz": 400},
    )

    body = client.post(f"/api/elements/{element['id']}/reset", headers=auth).json()["data"]

    assert body["volume"] == element["original"]["volume"]
    assert body["pan"] == element["original"]["pan"]
    assert body["depth"] == element["original"]["depth"]
    assert body["eq_json"] == element["original"]["eq_json"]
    assert body["tuning_hz"] == 440.0


def test_elements_are_scoped_to_their_owner(client, element, other):
    assert client.patch(
        f"/api/elements/{element['id']}", headers=other, json={"volume": 1.0}
    ).status_code == 404
    assert client.post(f"/api/elements/{element['id']}/reset", headers=other).status_code == 404
    assert client.get(f"/api/elements/{element['id']}/audio", headers=other).status_code == 404


def test_audio_requires_authentication(client, element):
    assert client.get(f"/api/elements/{element['id']}/audio").status_code == 401


def test_missing_audio_file_returns_404(client, auth, element):
    from api.app.db import session_scope
    from api.app.models.tables import Element
    from api.app.services import storage

    with session_scope() as session:
        relative_path = session.get(Element, element["id"]).audio_path

    storage.resolve_audio(relative_path).unlink()

    assert client.get(f"/api/elements/{element['id']}/audio", headers=auth).status_code == 404


def test_audio_path_cannot_escape_the_storage_root():
    import pytest

    from api.app.services import storage

    with pytest.raises(ValueError):
        storage.resolve_audio("../../etc/passwd")
