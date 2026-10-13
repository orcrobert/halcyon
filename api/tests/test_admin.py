import pytest

ROOT_EMAIL = "root@halcyon.test"


class RecordingDeployer:
    def __init__(self) -> None:
        self.started: list[int] = []

    def is_running(self, profile_id: int) -> bool:
        return False

    def start(self, profile_id: int) -> bool:
        self.started.append(profile_id)
        return True


def login(client, email, password="hunter2hunter2"):
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


@pytest.fixture
def admin(register):
    return {"Authorization": f"Bearer {register(email=ROOT_EMAIL, name='Root')}"}


@pytest.fixture
def member(client, admin):
    response = client.post(
        "/api/admin/users",
        headers=admin,
        json={"name": "Listener", "email": "Listener@Halcyon.test", "password": "hunter2hunter2"},
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


def test_the_first_account_is_the_admin(client, admin, register):
    second = {"Authorization": f"Bearer {register(email='second@halcyon.test')}"}

    assert client.get("/api/auth/me", headers=admin).json()["data"]["is_admin"] is True
    assert client.get("/api/auth/me", headers=second).json()["data"]["is_admin"] is False
    assert client.get("/api/admin/users", headers=second).status_code == 403


def test_the_first_account_can_register_with_registration_closed(client, monkeypatch):
    from api.app.config import settings

    monkeypatch.setattr(settings, "allow_registration", False)

    assert client.get("/api/auth/options").json()["data"] == {"registration": True}
    first = client.post(
        "/api/auth/register",
        json={"name": "Root", "email": ROOT_EMAIL, "password": "hunter2hunter2"},
    )
    second = client.post(
        "/api/auth/register",
        json={"name": "Late", "email": "late@halcyon.test", "password": "hunter2hunter2"},
    )

    assert first.status_code == 201
    assert first.json()["data"]["is_admin"] is True
    assert second.status_code == 403
    assert client.get("/api/auth/options").json()["data"] == {"registration": False}


def test_boot_promotes_the_oldest_account_when_there_is_no_admin(client, register):
    from api.app.db import session_scope
    from api.app.models.tables import User
    from api.app.services.accounts import ensure_admin

    oldest = {"Authorization": f"Bearer {register(email='first@halcyon.test')}"}
    register(email="second@halcyon.test")
    with session_scope() as session:
        for user in session.query(User).all():
            user.is_admin = None
            session.add(user)
        session.commit()

    assert ensure_admin() == "first@halcyon.test"
    assert ensure_admin() is None
    assert client.get("/api/auth/me", headers=oldest).json()["data"]["is_admin"] is True


def test_admin_creates_an_account_that_can_sign_in(client, member):
    assert member["email"] == "listener@halcyon.test"
    assert member["is_admin"] is False
    assert member["atmospheres"] == 0
    assert "password_hash" not in member

    login(client, "listener@halcyon.test")


def test_admin_creation_works_with_registration_closed(client, admin, monkeypatch):
    from api.app.config import settings

    monkeypatch.setattr(settings, "allow_registration", False)

    response = client.post(
        "/api/admin/users",
        headers=admin,
        json={"name": "Guest", "email": "guest@halcyon.test", "password": "hunter2hunter2"},
    )

    assert response.status_code == 201


def test_admin_cannot_reuse_an_email(client, admin, member):
    response = client.post(
        "/api/admin/users",
        headers=admin,
        json={"name": "Twin", "email": "listener@halcyon.test", "password": "hunter2hunter2"},
    )

    assert response.status_code == 422


def test_listing_shows_every_account(client, admin, member):
    users = client.get("/api/admin/users", headers=admin).json()["data"]

    assert [u["email"] for u in users] == [ROOT_EMAIL, "listener@halcyon.test"]
    assert users[0]["last_active_at"] is not None


def test_password_reset_signs_the_user_out(client, admin, member):
    session = login(client, "listener@halcyon.test")

    response = client.patch(
        f"/api/admin/users/{member['id']}",
        headers=admin,
        json={"password": "a-brand-new-one"},
    )

    assert response.status_code == 200
    assert client.get("/api/auth/me", headers=session).status_code == 401
    login(client, "listener@halcyon.test", "a-brand-new-one")


def test_admin_can_promote_but_not_demote_themselves(client, admin, member):
    promoted = client.patch(
        f"/api/admin/users/{member['id']}", headers=admin, json={"is_admin": True}
    )
    me = client.get("/api/auth/me", headers=admin).json()["data"]
    demoted = client.patch(
        f"/api/admin/users/{me['id']}", headers=admin, json={"is_admin": False}
    )

    assert promoted.json()["data"]["is_admin"] is True
    assert demoted.status_code == 409


def test_deleting_an_account_removes_its_audio(client, admin, member, tmp_path):
    from api.app.db import session_scope
    from api.app.models.tables import Atmosphere
    from api.app.services import storage

    with session_scope() as session:
        atmosphere = Atmosphere(user_id=member["id"], prompt="rain", status="ready")
        session.add(atmosphere)
        session.commit()
        atmosphere_id = atmosphere.id
    storage.write_element_audio(atmosphere_id, 0, "Rain", b"RIFF")

    response = client.delete(f"/api/admin/users/{member['id']}", headers=admin)

    assert response.status_code == 204
    assert not storage.atmosphere_dir(atmosphere_id).exists()
    assert client.get(f"/api/admin/users/{member['id']}", headers=admin).status_code == 404


def test_admin_cannot_delete_themselves(client, admin):
    me = client.get("/api/auth/me", headers=admin).json()["data"]

    assert client.delete(f"/api/admin/users/{me['id']}", headers=admin).status_code == 409


def test_admin_sets_another_users_decomposer_and_keys(client, admin, member):
    response = client.put(
        f"/api/admin/users/{member['id']}/settings",
        headers=admin,
        json={
            "decomposer_provider": "openai",
            "decomposer_model": "gpt-4o-mini",
            "decomposer_api_key": "sk-secret",
            "modal_token_id": "ak-member",
            "modal_token_secret": "as-member",
        },
    )

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["decomposer_api_key_set"] is True
    assert body["modal_token_set"] is True
    assert "sk-secret" not in response.text

    own = client.get("/api/settings", headers=login(client, "listener@halcyon.test"))
    assert own.json()["data"]["decomposer_model"] == "gpt-4o-mini"
    assert client.get("/api/settings", headers=admin).json()["data"]["decomposer_model"] is None


def test_admin_manages_another_users_generators(client, admin, member):
    base = f"/api/admin/users/{member['id']}/generators"

    created = client.post(
        base, headers=admin, json={"name": "Box", "url": "http://gpu.lan:9000", "kind": "local"}
    )

    assert created.status_code == 201
    assert created.json()["data"]["active_url"] == "http://gpu.lan:9000"
    own = client.get("/api/generators", headers=login(client, "listener@halcyon.test"))
    assert [g["name"] for g in own.json()["data"]["generators"]] == ["Box"]
    assert client.get("/api/generators", headers=admin).json()["data"]["generators"] == []


def test_admin_deploys_with_the_target_users_modal_token(client, admin, member, tmp_path, monkeypatch):
    from api.app.config import settings

    root = tmp_path / "generators"
    (root / "modal").mkdir(parents=True)
    (root / "modal" / "deploy.py").write_text("")
    monkeypatch.setattr(settings, "generators_dir", str(root))
    deployer = RecordingDeployer()
    client.app.state.deployer = deployer
    base = f"/api/admin/users/{member['id']}"

    client.put(
        f"{base}/settings",
        headers=admin,
        json={"modal_token_id": "ak-member", "modal_token_secret": "as-member"},
    )
    started = client.post(f"{base}/generators/modal", headers=admin, json={})

    assert started.status_code == 202
    assert started.json()["data"]["deploy"]["credentials"] == "user"
    assert len(deployer.started) == 1


def test_another_users_generator_is_not_reachable_through_a_different_user(client, admin, member):
    base = f"/api/admin/users/{member['id']}/generators"
    generator = client.post(
        base, headers=admin, json={"name": "Box", "url": "http://gpu.lan:9000", "kind": "local"}
    ).json()["data"]["generators"][0]
    me = client.get("/api/auth/me", headers=admin).json()["data"]

    response = client.delete(f"/api/admin/users/{me['id']}/generators/{generator['id']}", headers=admin)

    assert response.status_code == 404


def test_member_cannot_reach_admin_routes_for_others(client, admin, member, register):
    other = {"Authorization": f"Bearer {register(email='other@halcyon.test')}"}

    assert client.get(f"/api/admin/users/{member['id']}/settings", headers=other).status_code == 403
    assert client.get(f"/api/admin/users/{member['id']}/generators", headers=other).status_code == 403
    assert client.get("/api/admin/users/999/settings", headers=admin).status_code == 404
