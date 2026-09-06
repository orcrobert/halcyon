import base64
import json

import pytest

from api.tests.conftest import FakeResponse


def _config():
    from api.app.services.runconfig import RunConfig

    return RunConfig(
        generator_url="http://generator.test",
        decomposer_provider="gemini",
        decomposer_model=None,
        decomposer_base_url=None,
        decomposer_api_key=None,
        decomposer_prompt="",
    )


def _specs():
    return [
        {"label": "Rain", "type": "sound", "role": "bed", "prompt": "steady rain"},
        {"label": "Drone", "type": "music", "role": "texture", "prompt": "warm drone"},
    ]


def test_missing_roles_fall_back_to_texture():
    from api.app.services.decomposer import _parse_result

    result = _parse_result(
        json.dumps(
            {
                "atmosphere": "Quiet Room",
                "elements": [
                    {"label": "Hum", "type": "sound", "prompt": "fridge hum"},
                    {
                        "label": "Pad",
                        "type": "music",
                        "role": "bed",
                        "prompt": "warm pad",
                    },
                    {
                        "label": "Rain",
                        "type": "sound",
                        "role": "BED",
                        "prompt": "steady rain",
                    },
                    {
                        "label": "Odd",
                        "type": "sound",
                        "role": "wallpaper",
                        "prompt": "room tone",
                    },
                ],
            }
        )
    )

    roles = [element["role"] for element in result["elements"]]
    playback = [element["playback"] for element in result["elements"]]

    assert roles == ["texture", "texture", "bed", "texture"]
    assert playback == ["loop", "loop", "loop", "loop"]


def test_clip_length_prefers_a_stored_length_then_the_role():
    from api.app.config import BED_CLIP_S, EVENT_CLIP_S
    from api.app.services.generator import clip_length

    assert clip_length({"role": "bed"}, 30) == BED_CLIP_S
    assert clip_length({"role": "event"}, 30) == EVENT_CLIP_S
    assert clip_length({"role": "texture"}, 30) == 30
    assert clip_length({}, 30) == 30
    assert clip_length({"role": "bed", "clip_s": 7}, 30) == 7


def test_each_element_carries_its_own_duration(monkeypatch):
    from api.app.config import BED_CLIP_S
    from api.app.services import generator as generator_module

    sent = {}

    def fake_post(url, **kwargs):
        sent.update(kwargs["json"])
        return FakeResponse(
            {
                "elements": [
                    {**element, "audio_b64": base64.b64encode(b"RIFF").decode()}
                    for element in kwargs["json"]["elements"]
                ]
            }
        )

    monkeypatch.setattr(generator_module.requests, "post", fake_post)

    elements = _specs()
    generator_module.generate({"elements": elements}, _config(), 30)

    assert sent["duration"] == 30
    assert [e["duration"] for e in sent["elements"]] == [BED_CLIP_S, 30]
    assert [e["index"] for e in sent["elements"]] == [0, 1]
    assert [e["clip_s"] for e in elements] == [BED_CLIP_S, 30]


def test_replies_are_matched_by_index_not_position(monkeypatch):
    from api.app.services import generator as generator_module

    def fake_post(url, **kwargs):
        replies = [
            {**element, "audio_b64": base64.b64encode(element["label"].encode()).decode()}
            for element in reversed(kwargs["json"]["elements"])
        ]
        return FakeResponse({"elements": replies})

    monkeypatch.setattr(generator_module.requests, "post", fake_post)

    results = generator_module.generate({"elements": _specs()}, _config(), 30)

    assert [r["label"] for r in results] == ["Rain", "Drone"]
    assert [r["audio"] for r in results] == [b"Rain", b"Drone"]
    assert [r["role"] for r in results] == ["bed", "texture"]


def test_replies_without_an_index_fall_back_to_the_label(monkeypatch):
    from api.app.services import generator as generator_module

    def fake_post(url, **kwargs):
        replies = [
            {
                "label": element["label"],
                "audio_b64": base64.b64encode(element["label"].encode()).decode(),
            }
            for element in reversed(kwargs["json"]["elements"])
        ]
        return FakeResponse({"elements": replies})

    monkeypatch.setattr(generator_module.requests, "post", fake_post)

    results = generator_module.generate({"elements": _specs()}, _config(), 30)

    assert [r["audio"] for r in results] == [b"Rain", b"Drone"]


def test_elements_without_audio_are_dropped_in_order(monkeypatch):
    from api.app.services import generator as generator_module

    def fake_post(url, **kwargs):
        replies = [
            {**element, "audio_b64": base64.b64encode(b"RIFF").decode()}
            for element in kwargs["json"]["elements"]
            if element["label"] != "Rain"
        ]
        return FakeResponse({"elements": replies})

    monkeypatch.setattr(generator_module.requests, "post", fake_post)

    results = generator_module.generate({"elements": _specs()}, _config(), 30)

    assert [r["label"] for r in results] == ["Drone"]


def test_generation_stores_the_clip_length_per_layer(client, auth, ready_atmosphere):
    from api.app.config import BED_CLIP_S, DEFAULT_DURATION_S

    elements = client.get(f"/api/atmospheres/{ready_atmosphere}", headers=auth).json()[
        "data"
    ]["elements"]

    assert [e["clip_s"] for e in elements] == [BED_CLIP_S, DEFAULT_DURATION_S]
    assert [e["playback"] for e in elements] == ["loop", "loop"]
    assert [e["source"] for e in elements] == ["generated", "generated"]
    assert all(e["audio_url"] for e in elements)


def test_another_take_keeps_the_roles_and_clip_lengths(client, auth, ready_atmosphere):
    from api.app.config import BED_CLIP_S

    response = client.post(
        f"/api/atmospheres/{ready_atmosphere}/regenerate", headers=auth
    )
    assert response.status_code == 202

    from api.app.db import session_scope
    from api.app.models.tables import Atmosphere

    with session_scope() as session:
        fresh = session.get(Atmosphere, response.json()["data"]["id"])
        specs = fresh.decomposed_json["elements"]

    assert [spec["role"] for spec in specs] == ["bed", "texture"]
    assert [spec["clip_s"] for spec in specs] == [BED_CLIP_S, 10]
    assert [spec["playback"] for spec in specs] == ["loop", "loop"]


def test_regenerating_a_layer_keeps_its_clip_length(client, auth, ready_atmosphere):
    from api.app.config import BED_CLIP_S
    from api.app.services.pipeline import regenerate_element

    element = client.get(f"/api/atmospheres/{ready_atmosphere}", headers=auth).json()[
        "data"
    ]["elements"][0]
    regenerate_element(element["id"])

    refreshed = client.get(f"/api/elements/{element['id']}/audio", headers=auth)
    assert refreshed.status_code == 200

    body = client.get(f"/api/atmospheres/{ready_atmosphere}", headers=auth).json()["data"]
    assert body["elements"][0]["clip_s"] == BED_CLIP_S


@pytest.mark.parametrize(
    "payload",
    [
        {"interval_min_s": 0.5},
        {"interval_max_s": 500},
        {"interval_min_s": 20, "interval_max_s": 10},
    ],
)
def test_invalid_intervals_are_rejected(client, auth, ready_atmosphere, payload):
    element_id = client.get(f"/api/atmospheres/{ready_atmosphere}", headers=auth).json()[
        "data"
    ]["elements"][0]["id"]

    response = client.patch(
        f"/api/elements/{element_id}", headers=auth, json=payload
    )

    assert response.status_code == 422


def test_intervals_can_be_stored_on_a_layer(client, auth, ready_atmosphere):
    element_id = client.get(f"/api/atmospheres/{ready_atmosphere}", headers=auth).json()[
        "data"
    ]["elements"][0]["id"]

    body = client.patch(
        f"/api/elements/{element_id}",
        headers=auth,
        json={"interval_min_s": 8, "interval_max_s": 25},
    ).json()["data"]

    assert body["interval_min_s"] == 8
    assert body["interval_max_s"] == 25
