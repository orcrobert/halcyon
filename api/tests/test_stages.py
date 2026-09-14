from api.app.services.runconfig import RunConfig


def _config(**overrides) -> RunConfig:
    base = {
        "generator_url": "http://gpu.local:9000",
        "decomposer_provider": "gemini",
        "decomposer_model": None,
        "decomposer_base_url": None,
        "decomposer_api_key": None,
        "decomposer_prompt": "",
    }
    return RunConfig(**{**base, **overrides})


def test_decomposing_names_the_provider_and_model():
    from api.app.services.stages import decomposing_detail

    detail = decomposing_detail(_config(decomposer_model="gemini-2.5-flash"))

    assert detail == (
        "Asking Google Gemini (gemini-2.5-flash) to split the scene into layers"
    )


def test_decomposing_falls_back_to_the_provider_default_model():
    from api.app.services.providers import PROVIDERS
    from api.app.services.stages import decomposing_detail

    detail = decomposing_detail(_config(decomposer_provider="ollama"))

    assert PROVIDERS["ollama"].default_model in detail


def test_generating_counts_layers_by_type():
    from api.app.services.stages import generating_detail

    elements = [
        {"type": "sound"},
        {"type": "sound"},
        {"type": "music"},
    ]
    detail = generating_detail(_config(generator_kind="modal"), elements)

    assert detail == "Rendering 3 layers on Modal: 2 sounds, 1 music"


def test_a_named_profile_wins_over_the_host_label():
    from api.app.services.stages import host_label

    assert host_label(_config(generator_kind="colab", generator_name="Lab box")) == "Lab box"


def test_a_custom_host_is_named_by_its_hostname():
    from api.app.services.stages import host_label

    assert host_label(_config()) == "gpu.local"


def test_stage_detail_is_served_while_generating(client, auth):
    from api.app.db import session_scope
    from api.app.models.tables import Atmosphere
    from api.app.services.pipeline import _set_stage

    atmosphere_id = client.post(
        "/api/atmospheres", headers=auth, json={"prompt": "a rainy library"}
    ).json()["data"]["id"]

    with session_scope() as session:
        _set_stage(session, session.get(Atmosphere, atmosphere_id), "mixing", "Analysing")

    body = client.get(f"/api/atmospheres/{atmosphere_id}", headers=auth).json()["data"]

    assert body["status"] == "generating"
    assert body["current_stage"] == "mixing"
    assert body["stage_detail"] == "Analysing"
    assert body["progress"] == 70


def test_stage_detail_is_cleared_once_ready(client, auth, ready_atmosphere):
    body = client.get(f"/api/atmospheres/{ready_atmosphere}", headers=auth).json()["data"]

    assert body["status"] == "ready"
    assert body["current_stage"] is None
    assert body["stage_detail"] is None


def test_stage_detail_is_cleared_on_failure(client, auth, monkeypatch):
    from api.app.services.pipeline import run_generation

    def explode(*_args, **_kwargs):
        raise ValueError("offline")

    monkeypatch.setattr("api.app.services.pipeline.decompose", explode)
    atmosphere_id = client.post(
        "/api/atmospheres", headers=auth, json={"prompt": "a rainy library"}
    ).json()["data"]["id"]

    run_generation(atmosphere_id)
    body = client.get(f"/api/atmospheres/{atmosphere_id}", headers=auth).json()["data"]

    assert body["status"] == "failed"
    assert body["stage_detail"] is None


def test_run_config_carries_the_active_generator_kind(client, auth):
    from sqlmodel import select

    from api.app.db import session_scope
    from api.app.models.tables import User
    from api.app.services.runconfig import resolve_config

    client.post(
        "/api/generators",
        headers=auth,
        json={"name": "Modal box", "url": "https://x.modal.run", "kind": "modal"},
    )

    with session_scope() as session:
        user = session.exec(select(User)).first()
        config = resolve_config(user.preferences, user.generators)

    assert config.generator_url == "https://x.modal.run"
    assert config.generator_kind == "modal"
    assert config.generator_name == "Modal box"
