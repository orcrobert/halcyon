from fastapi import FastAPI
from fastapi.testclient import TestClient


def test_health_needs_no_auth(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_legacy_generate_endpoint_is_gone(client):
    paths = client.get("/openapi.json").json()["paths"]

    assert "/generate" not in paths
    assert client.post("/generate", json={"prompt": "rain"}).status_code != 200


def test_the_api_surface_is_the_documented_one(client):
    paths = set(client.get("/openapi.json").json()["paths"])

    assert paths == {
        "/health",
        "/api/auth/register",
        "/api/auth/login",
        "/api/auth/logout",
        "/api/auth/me",
        "/api/settings",
        "/api/generators",
        "/api/generators/{generator_id}",
        "/api/generators/{generator_id}/activate",
        "/api/generators/{generator_id}/test",
        "/api/atmospheres",
        "/api/atmospheres/{atmosphere_id}",
        "/api/atmospheres/{atmosphere_id}/regenerate",
        "/api/elements/{element_id}",
        "/api/elements/{element_id}/reset",
        "/api/elements/{element_id}/regenerate",
        "/api/elements/{element_id}/audio",
    }


def test_init_db_backfills_columns_added_after_first_boot(client):
    from sqlalchemy import inspect, text

    from api.app.db import get_engine, init_db

    engine = get_engine()
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE user_settings DROP COLUMN decomposer_prompt"))

    assert "decomposer_prompt" not in {
        c["name"] for c in inspect(engine).get_columns("user_settings")
    }

    init_db()

    assert "decomposer_prompt" in {
        c["name"] for c in inspect(engine).get_columns("user_settings")
    }


def test_frontend_build_is_served_at_the_root(tmp_path, monkeypatch):
    from api.app.config import settings
    from api.app.main import mount_frontend

    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>Halcyon</title>")
    (dist / "assets" / "index.js").write_text("console.log('halcyon')")
    monkeypatch.setattr(settings, "frontend_dist", str(dist))

    app = FastAPI()
    mount_frontend(app)

    with TestClient(app) as test_client:
        assert "Halcyon" in test_client.get("/").text
        assert "halcyon" in test_client.get("/assets/index.js").text
        assert "Halcyon" in test_client.get("/some/client/route").text


def test_missing_frontend_build_leaves_the_api_alone(tmp_path, monkeypatch):
    from api.app.config import settings
    from api.app.main import mount_frontend

    monkeypatch.setattr(settings, "frontend_dist", str(tmp_path / "nowhere"))

    app = FastAPI()
    mount_frontend(app)

    with TestClient(app) as test_client:
        assert test_client.get("/").status_code == 404
