import base64

import pytest

from api.app.services import storage
from api.tests.conftest import FakeResponse, wav_bytes
from api.tests.test_quality import clipped_bytes, silent_bytes


def _config(**overrides):
    from api.app.services.runconfig import RunConfig

    return RunConfig(
        generator_url="http://generator.test",
        decomposer_provider="gemini",
        decomposer_model=None,
        decomposer_base_url=None,
        decomposer_api_key=None,
        decomposer_prompt="",
        **overrides,
    )


def _specs():
    return [
        {"label": "Rain", "type": "sound", "role": "bed", "prompt": "steady rain"},
        {"label": "Drone", "type": "music", "role": "texture", "prompt": "warm drone"},
        {
            "label": "Owl",
            "type": "sound",
            "role": "event",
            "playback": "oneshot",
            "prompt": "single owl hoot",
        },
    ]


@pytest.fixture
def sent(monkeypatch):
    from api.app.services import generator as generator_module

    seen: dict = {}

    def fake_post(url, **kwargs):
        seen.update(kwargs["json"])
        replies = [
            {
                **element,
                "audio_b64": base64.b64encode(
                    f"{element['label']}-{element['index']}".encode()
                ).decode(),
            }
            for element in reversed(kwargs["json"]["elements"])
        ]
        return FakeResponse({"elements": replies})

    monkeypatch.setattr(generator_module.requests, "post", fake_post)
    return seen


def test_take_count_only_multiplies_looping_textures():
    from api.app.services.generator import take_count

    assert take_count({"role": "texture"}, 3) == 3
    assert take_count({}, 3) == 3
    assert take_count({"role": "bed"}, 3) == 1
    assert take_count({"role": "event", "playback": "oneshot"}, 3) == 1
    assert take_count({"role": "texture", "playback": "oneshot"}, 3) == 1
    assert take_count({"role": "texture"}, 0) == 1


def test_textures_are_requested_once_per_take(sent):
    from api.app.services import generator as generator_module

    generator_module.generate({"elements": _specs()}, _config(texture_takes=3), 30)

    labels = [element["label"] for element in sent["elements"]]
    assert labels == ["Rain", "Drone", "Owl", "Drone", "Drone"]
    assert [element["index"] for element in sent["elements"]] == [0, 1, 2, 3, 4]
    assert {element["duration"] for element in sent["elements"][3:]} == {30}


def test_takes_come_back_grouped_under_their_layer(sent):
    from api.app.services import generator as generator_module

    results = generator_module.generate(
        {"elements": _specs()}, _config(texture_takes=3), 30
    )

    assert [result["label"] for result in results] == ["Rain", "Drone", "Owl"]
    assert results[1]["audio"] == b"Drone-1"
    assert results[1]["takes_audio"] == [b"Drone-3", b"Drone-4"]
    assert results[0]["takes_audio"] == []
    assert results[2]["takes_audio"] == []


def test_label_only_replies_fill_every_take(monkeypatch):
    from api.app.services import generator as generator_module

    def fake_post(url, **kwargs):
        replies = [
            {
                "label": element["label"],
                "audio_b64": base64.b64encode(
                    f"{element['label']}-{element['index']}".encode()
                ).decode(),
            }
            for element in kwargs["json"]["elements"]
        ]
        return FakeResponse({"elements": replies})

    monkeypatch.setattr(generator_module.requests, "post", fake_post)

    results = generator_module.generate(
        {"elements": _specs()}, _config(texture_takes=3), 30
    )

    drone = next(result for result in results if result["label"] == "Drone")
    assert drone["audio"] == b"Drone-1"
    assert drone["takes_audio"] == [b"Drone-3", b"Drone-4"]


def test_indexed_replies_keep_their_slot_beside_label_only_ones(monkeypatch):
    from api.app.services import generator as generator_module

    def fake_post(url, **kwargs):
        elements = kwargs["json"]["elements"]
        replies = []
        for element in elements:
            reply = {
                "label": element["label"],
                "audio_b64": base64.b64encode(
                    f"{element['label']}-{element['index']}".encode()
                ).decode(),
            }
            if element["index"] == 4:
                reply["index"] = 4
            replies.append(reply)
        return FakeResponse({"elements": replies})

    monkeypatch.setattr(generator_module.requests, "post", fake_post)

    results = generator_module.generate(
        {"elements": _specs()}, _config(texture_takes=3), 30
    )

    drone = next(result for result in results if result["label"] == "Drone")
    assert drone["audio"] == b"Drone-1"
    assert drone["takes_audio"] == [b"Drone-3", b"Drone-4"]


def test_surplus_label_only_replies_are_dropped(monkeypatch):
    from api.app.services import generator as generator_module

    def fake_post(url, **kwargs):
        replies = [
            {"label": "Drone", "audio_b64": base64.b64encode(b"extra").decode()}
            for _ in range(5)
        ]
        return FakeResponse({"elements": replies})

    monkeypatch.setattr(generator_module.requests, "post", fake_post)

    results = generator_module.generate(
        {"elements": _specs()}, _config(texture_takes=2), 30
    )

    assert [result["label"] for result in results] == ["Drone"]
    assert len(results[0]["takes_audio"]) == 1


def test_one_take_sends_each_layer_once(sent):
    from api.app.services import generator as generator_module

    results = generator_module.generate(
        {"elements": _specs()}, _config(texture_takes=1), 30
    )

    assert len(sent["elements"]) == 3
    assert all(result["takes_audio"] == [] for result in results)


def test_the_cleanest_take_becomes_the_layer():
    from api.app.services.quality import check_results

    clean = wav_bytes(seed=1)
    checked = check_results([
        {
            "label": "Drone",
            "role": "texture",
            "audio": clipped_bytes(),
            "takes_audio": [clean],
        }
    ])

    assert checked[0]["audio"] == clean
    assert checked[0]["quality"] == []
    assert checked[0]["takes_audio"] == []


def test_flagged_and_silent_takes_are_left_out():
    from api.app.services.quality import check_results

    primary = wav_bytes(seed=1)
    spare = wav_bytes(seed=2)
    checked = check_results([
        {
            "label": "Drone",
            "role": "texture",
            "audio": primary,
            "takes_audio": [silent_bytes(), clipped_bytes(), spare],
        }
    ])

    assert checked[0]["audio"] == primary
    assert checked[0]["takes_audio"] == [spare]


def test_a_layer_survives_when_only_a_spare_take_is_usable():
    from api.app.services.quality import check_results

    spare = wav_bytes(seed=3)
    checked = check_results([
        {"label": "Drone", "role": "texture", "audio": silent_bytes(), "takes_audio": [spare]}
    ])

    assert checked[0]["audio"] == spare


def _elements(client, auth, atmosphere_id):
    body = client.get(f"/api/atmospheres/{atmosphere_id}", headers=auth).json()
    return {element["label"]: element for element in body["data"]["elements"]}


def test_generation_stores_takes_for_evolving_layers(client, auth, ready_atmosphere):
    elements = _elements(client, auth, ready_atmosphere)

    assert elements["Rain on glass"]["takes"] == []
    takes = elements["Warm drone"]["takes"]
    assert len(takes) == 1
    assert takes[0]["duration_s"] > 0
    assert "take=1" in takes[0]["audio_url"]


def test_take_audio_is_served_by_number(client, auth, ready_atmosphere):
    drone = _elements(client, auth, ready_atmosphere)["Warm drone"]

    take = client.get(drone["takes"][0]["audio_url"], headers=auth)
    primary = client.get(drone["audio_url"], headers=auth)

    assert take.status_code == 200
    assert take.content[:4] == b"RIFF"
    assert take.content != primary.content
    assert (
        client.get(f"/api/elements/{drone['id']}/audio?take=2", headers=auth).status_code
        == 404
    )
    assert (
        client.get(f"/api/elements/{drone['id']}/audio?take=-1", headers=auth).status_code
        == 404
    )


def test_takes_follow_the_setting(client, auth, stub_pipeline):
    from api.app.services.pipeline import run_generation

    client.put("/api/settings", headers=auth, json={"texture_takes": 3})
    atmosphere_id = client.post(
        "/api/atmospheres", headers=auth, json={"prompt": "a rainy library"}
    ).json()["data"]["id"]
    run_generation(atmosphere_id)

    assert len(_elements(client, auth, atmosphere_id)["Warm drone"]["takes"]) == 2


def test_the_stored_decomposition_carries_no_takes(client, auth, ready_atmosphere):
    from api.app.db import session_scope
    from api.app.models.tables import Atmosphere

    with session_scope() as session:
        specs = session.get(Atmosphere, ready_atmosphere).decomposed_json["elements"]

    assert all("takes" not in spec and "takes_audio" not in spec for spec in specs)


def _take_paths(element_id: int) -> list[str]:
    from api.app.db import session_scope
    from api.app.models.tables import Element

    with session_scope() as session:
        return [take["path"] for take in session.get(Element, element_id).takes_json or []]


def test_regenerating_a_layer_replaces_its_takes(client, auth, ready_atmosphere):
    from api.app.services.pipeline import regenerate_element

    drone = _elements(client, auth, ready_atmosphere)["Warm drone"]
    before = _take_paths(drone["id"])

    client.put("/api/settings", headers=auth, json={"texture_takes": 1})
    regenerate_element(drone["id"])

    assert _take_paths(drone["id"]) == []
    assert _elements(client, auth, ready_atmosphere)["Warm drone"]["takes"] == []
    assert all(not storage.resolve_audio(path).exists() for path in before)


def test_regenerating_keeps_fresh_takes_on_disk(client, auth, ready_atmosphere):
    from api.app.services.pipeline import regenerate_element

    drone = _elements(client, auth, ready_atmosphere)["Warm drone"]

    client.put("/api/settings", headers=auth, json={"texture_takes": 3})
    regenerate_element(drone["id"])

    paths = _take_paths(drone["id"])
    assert len(paths) == 2
    assert all(storage.resolve_audio(path).is_file() for path in paths)


def test_deleting_a_layer_removes_its_takes(client, auth, ready_atmosphere):
    drone = _elements(client, auth, ready_atmosphere)["Warm drone"]
    paths = _take_paths(drone["id"])

    response = client.delete(f"/api/elements/{drone['id']}", headers=auth)

    assert response.status_code == 204
    assert paths
    assert all(not storage.resolve_audio(path).exists() for path in paths)


def test_texture_takes_default_and_round_trip(client, auth):
    from api.app.config import DEFAULT_TEXTURE_TAKES

    assert (
        client.get("/api/settings", headers=auth).json()["data"]["texture_takes"]
        == DEFAULT_TEXTURE_TAKES
    )

    body = client.put("/api/settings", headers=auth, json={"texture_takes": 3}).json()
    assert body["data"]["texture_takes"] == 3
    assert client.get("/api/settings", headers=auth).json()["data"]["texture_takes"] == 3


@pytest.mark.parametrize("value", [0, 4])
def test_texture_takes_outside_the_range_are_rejected(client, auth, value):
    response = client.put("/api/settings", headers=auth, json={"texture_takes": value})

    assert response.status_code == 422
