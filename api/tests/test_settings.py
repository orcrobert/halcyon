def test_settings_start_empty_and_expose_defaults(client, auth):
    body = client.get("/api/settings", headers=auth).json()["data"]

    assert body["decomposer_provider"] is None
    assert body["decomposer_api_key_set"] is False
    assert body["decomposer_prompt"] is None
    assert body["defaults"]["decomposer_provider"] == "gemini"
    assert "audio atmosphere designer" in body["defaults"]["decomposer_prompt"]
    assert {p["key"] for p in body["providers"]} == {"gemini", "ollama", "openai"}


def test_settings_round_trip(client, auth):
    response = client.put(
        "/api/settings",
        headers=auth,
        json={
            "generator_url": "http://gpu.local:9000",
            "decomposer_provider": "openai",
            "decomposer_model": "gpt-4o-mini",
            "decomposer_base_url": "https://api.groq.com/openai/v1",
        },
    )

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["generator_url"] == "http://gpu.local:9000"
    assert body["decomposer_provider"] == "openai"
    assert body["decomposer_model"] == "gpt-4o-mini"

    assert client.get("/api/settings", headers=auth).json()["data"] == body


def test_api_key_is_never_returned(client, auth):
    body = client.put(
        "/api/settings",
        headers=auth,
        json={"decomposer_api_key": "sk-super-secret-value"},
    ).json()["data"]

    assert body["decomposer_api_key_set"] is True
    assert "sk-super-secret-value" not in str(body)


def test_api_key_is_encrypted_at_rest(client, auth):
    client.put(
        "/api/settings", headers=auth, json={"decomposer_api_key": "sk-super-secret"}
    )

    from sqlmodel import select

    from api.app.db import session_scope
    from api.app.models.tables import UserSettings

    with session_scope() as session:
        stored = session.exec(select(UserSettings)).one()

    assert stored.decomposer_api_key_enc
    assert "sk-super-secret" not in stored.decomposer_api_key_enc


def test_api_key_can_be_cleared(client, auth):
    client.put("/api/settings", headers=auth, json={"decomposer_api_key": "sk-secret"})
    body = client.put(
        "/api/settings", headers=auth, json={"decomposer_api_key": ""}
    ).json()["data"]

    assert body["decomposer_api_key_set"] is False


def test_decomposer_prompt_round_trip(client, auth):
    body = client.put(
        "/api/settings", headers=auth, json={"decomposer_prompt": "# Mine\n\nBe brief."}
    ).json()["data"]

    assert body["decomposer_prompt"] == "# Mine\n\nBe brief."
    assert client.get("/api/settings", headers=auth).json()["data"] == body


def test_decomposer_prompt_resets_to_default_when_cleared(client, auth):
    client.put("/api/settings", headers=auth, json={"decomposer_prompt": "# Mine"})
    body = client.put(
        "/api/settings", headers=auth, json={"decomposer_prompt": ""}
    ).json()["data"]

    assert body["decomposer_prompt"] is None


def test_oversized_decomposer_prompt_is_rejected(client, auth):
    response = client.put(
        "/api/settings", headers=auth, json={"decomposer_prompt": "x" * 40001}
    )

    assert response.status_code == 422


def test_custom_decomposer_prompt_is_sent_to_the_model(client, auth, monkeypatch):
    from api.app.services import decomposer

    client.put("/api/settings", headers=auth, json={"decomposer_prompt": "# Mine"})

    seen: list[str] = []

    def fake_complete_json(_config, system, _user):
        seen.append(system)
        return '{"atmosphere": "x", "elements": [{"label": "a", "type": "sound", "prompt": "b"}]}'

    monkeypatch.setattr(decomposer, "complete_json", fake_complete_json)

    from sqlmodel import select

    from api.app.db import session_scope
    from api.app.models.tables import User
    from api.app.services.runconfig import resolve_config

    with session_scope() as session:
        user = session.exec(select(User)).first()
        config = resolve_config(user.preferences)

    decomposer.decompose("a quiet room", config)

    assert seen == ["# Mine"]


def test_default_decomposer_prompt_is_used_without_an_override(client, auth):
    from sqlmodel import select

    from api.app.db import session_scope
    from api.app.models.tables import User
    from api.app.services.runconfig import resolve_config

    with session_scope() as session:
        user = session.exec(select(User)).first()
        config = resolve_config(user.preferences)

    assert "audio atmosphere designer" in config.decomposer_prompt


def test_unknown_provider_is_rejected(client, auth):
    response = client.put(
        "/api/settings", headers=auth, json={"decomposer_provider": "skynet"}
    )

    assert response.status_code == 422


def test_settings_require_authentication(client):
    assert client.get("/api/settings").status_code == 401


def test_settings_are_per_user(client, register, auth):
    client.put(
        "/api/settings", headers=auth, json={"generator_url": "http://mine:9000"}
    )
    other = {"Authorization": f"Bearer {register(email='other@halcyon.test')}"}

    assert client.get("/api/settings", headers=other).json()["data"]["generator_url"] is None


def test_resolved_config_falls_back_to_env_defaults(client, auth):
    from api.app.services.runconfig import resolve_config

    from sqlmodel import select

    from api.app.db import session_scope
    from api.app.models.tables import User

    client.put(
        "/api/settings", headers=auth, json={"generator_url": "http://mine:9000"}
    )

    with session_scope() as session:
        user = session.exec(select(User)).first()
        config = resolve_config(user.preferences)

    assert config.generator_url == "http://mine:9000"
    assert config.decomposer_provider == "gemini"


def test_switching_provider_drops_inherited_credentials(client, auth, monkeypatch):
    from api.app.config import settings

    monkeypatch.setattr(settings, "decomposer_api_key", "env-gemini-key")

    from sqlmodel import select

    from api.app.db import session_scope
    from api.app.models.tables import User
    from api.app.services.runconfig import resolve_config

    client.put("/api/settings", headers=auth, json={"decomposer_provider": "ollama"})

    with session_scope() as session:
        user = session.exec(select(User)).first()
        config = resolve_config(user.preferences)

    assert config.decomposer_provider == "ollama"
    assert config.decomposer_api_key is None


def test_theme_starts_unset_and_round_trips(client, auth):
    assert client.get("/api/settings", headers=auth).json()["data"]["theme"] is None

    body = client.put("/api/settings", headers=auth, json={"theme": "gruvbox"}).json()[
        "data"
    ]

    assert body["theme"] == "gruvbox"
    assert client.get("/api/settings", headers=auth).json()["data"]["theme"] == "gruvbox"


def test_theme_clears_back_to_the_default(client, auth):
    client.put("/api/settings", headers=auth, json={"theme": "dracula"})

    body = client.put("/api/settings", headers=auth, json={"theme": ""}).json()["data"]

    assert body["theme"] is None
