def test_register_returns_token_and_user(client):
    response = client.post(
        "/api/auth/register",
        json={"name": "Ambient Fan", "email": "Fan@Halcyon.test", "password": "hunter2hunter2"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["token"]
    assert body["data"]["email"] == "fan@halcyon.test"
    assert "password" not in body["data"]
    assert "password_hash" not in body["data"]


def test_register_rejects_duplicate_email(client, register):
    register()

    response = client.post(
        "/api/auth/register",
        json={"name": "Impostor", "email": "fan@halcyon.test", "password": "hunter2hunter2"},
    )

    assert response.status_code == 422


def test_register_rejects_short_password(client):
    response = client.post(
        "/api/auth/register",
        json={"name": "Ambient Fan", "email": "fan@halcyon.test", "password": "short"},
    )

    assert response.status_code == 422


def test_register_can_be_disabled(client, monkeypatch):
    from api.app.config import settings

    monkeypatch.setattr(settings, "allow_registration", False)

    response = client.post(
        "/api/auth/register",
        json={"name": "Ambient Fan", "email": "fan@halcyon.test", "password": "hunter2hunter2"},
    )

    assert response.status_code == 403


def test_login_succeeds_with_correct_credentials(client, register):
    register()

    response = client.post(
        "/api/auth/login",
        json={"email": "fan@halcyon.test", "password": "hunter2hunter2"},
    )

    assert response.status_code == 200
    assert response.json()["token"]


def test_login_rejects_wrong_password(client, register):
    register()

    response = client.post(
        "/api/auth/login",
        json={"email": "fan@halcyon.test", "password": "wrongwrongwrong"},
    )

    assert response.status_code == 422


def test_me_requires_a_token(client):
    assert client.get("/api/auth/me").status_code == 401


def test_me_rejects_a_bogus_token(client):
    response = client.get("/api/auth/me", headers={"Authorization": "Bearer nonsense"})

    assert response.status_code == 401


def test_me_returns_the_current_user(client, auth):
    response = client.get("/api/auth/me", headers=auth)

    assert response.status_code == 200
    assert response.json()["data"]["email"] == "fan@halcyon.test"


def test_logout_revokes_the_token(client, auth):
    assert client.post("/api/auth/logout", headers=auth).status_code == 204
    assert client.get("/api/auth/me", headers=auth).status_code == 401
