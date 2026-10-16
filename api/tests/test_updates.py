import time
from datetime import datetime, timezone

import pytest
import requests

from api.app.services import updates
from api.app.services.updates import Release, ReleaseFeed, compare, parse_track, parse_version

ROOT_EMAIL = "root@halcyon.test"


class Reply:
    def __init__(self, status_code: int = 200) -> None:
        self.status_code = status_code


class RecordingPost:
    def __init__(self, reply: Reply | None = None) -> None:
        self.calls: list[tuple[str, dict]] = []
        self.reply = reply or Reply()

    def __call__(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return self.reply


def release(version: str = "1.5.0") -> Release:
    return Release(
        version=version,
        notes="Quieter rain.",
        url=f"https://github.com/orcrobert/halcyon/releases/tag/v{version}",
        published_at=datetime(2026, 10, 1, tzinfo=timezone.utc),
    )


@pytest.fixture
def published(monkeypatch):
    state = {"release": release(), "fetches": 0}

    def fetch():
        state["fetches"] += 1
        return state["release"]

    monkeypatch.setattr(updates, "feed", ReleaseFeed(fetch))
    return state


@pytest.fixture
def server(monkeypatch, tmp_path):
    from api.app.config import settings

    token_file = tmp_path / "updater" / "token"
    token_file.parent.mkdir()
    monkeypatch.setattr(settings, "halcyon_version", "1.4.2")
    monkeypatch.setattr(settings, "halcyon_tag", "latest")
    monkeypatch.setattr(settings, "updater_token_file", str(token_file))
    monkeypatch.setattr(updates, "updater_ready", lambda: True)
    monkeypatch.setattr("api.app.routers.updates.updater_ready", lambda: True)
    updates.ensure_updater_token()
    return token_file


@pytest.fixture
def admin(register):
    return {"Authorization": f"Bearer {register(email=ROOT_EMAIL, name='Root')}"}


@pytest.fixture
def post(client):
    recorder = RecordingPost()
    client.app.state.updater = updates.UpdateRunner(post=recorder)
    return recorder


def test_versions_parse_strictly():
    assert parse_version("v1.4.2") == (1, 4, 2)
    assert parse_version("1.4") is None
    assert parse_version("dev") is None


def test_tags_map_to_a_track():
    assert parse_track("latest") == ()
    assert parse_track("latest-cli") == ()
    assert parse_track("1.4") == (1, 4)
    assert parse_track("1.4.2-cli") == (1, 4, 2)
    assert parse_track("edge") is None


@pytest.mark.parametrize(
    ("current", "latest", "tag", "expected"),
    [
        ("1.4.2", "1.5.0", "latest", (True, False, False)),
        ("1.4.2", "2.0.0", "latest", (True, True, False)),
        ("1.4.2", "1.4.3", "1.4", (True, False, False)),
        ("1.4.2", "1.5.0", "1.4", (False, False, True)),
        ("1.4.2", "1.5.0", "1.4.2", (False, False, True)),
        ("1.5.0", "1.5.0", "latest", (False, False, False)),
        ("dev", "1.5.0", "latest", (False, False, False)),
    ],
)
def test_an_update_is_offered_only_inside_the_track(current, latest, tag, expected):
    assert compare(current, latest, tag) == expected


def test_the_feed_caches_and_keeps_the_last_release_on_failure():
    calls = []

    def fetch():
        calls.append(1)
        if len(calls) > 1:
            raise requests.ConnectionError("offline")
        return release()

    feed = ReleaseFeed(fetch)
    assert feed.refresh().version == "1.5.0"
    assert feed.refresh().version == "1.5.0"
    assert len(calls) == 1

    assert feed.refresh(force=True).version == "1.5.0"
    assert feed.error is not None


def test_the_token_is_written_once(server):
    first = server.read_text()
    updates.ensure_updater_token()
    assert server.read_text() == first
    assert len(first) > 20


def test_members_cannot_see_updates(client, admin, register):
    member = {"Authorization": f"Bearer {register(email='second@halcyon.test')}"}
    assert client.get("/api/admin/updates", headers=member).status_code == 403
    assert client.post("/api/admin/updates", headers=member).status_code == 403


def test_status_reports_the_newer_release(client, admin, published, server):
    body = client.get("/api/admin/updates", headers=admin).json()["data"]

    assert body["current"] == "1.4.2"
    assert body["latest"] == "1.5.0"
    assert body["update_available"] is True
    assert body["notes"] == "Quieter rain."
    assert body["updater"] == "ready"
    assert body["auto_update"] is False

    client.post("/api/admin/updates/check", headers=admin)
    assert published["fetches"] == 2


def test_update_calls_the_updater_with_the_token(client, admin, published, server, post):
    response = client.post("/api/admin/updates", headers=admin)
    assert response.status_code == 202, response.text

    runner = client.app.state.updater
    for _ in range(100):
        if not runner.updating:
            break
        time.sleep(0.01)

    url, kwargs = post.calls[0]
    assert url == "http://updater:8080/v1/update"
    assert kwargs["headers"] == {"Authorization": f"Bearer {server.read_text()}"}
    assert "no newer image" in runner.error


def test_update_waits_for_a_running_generation(client, admin, published, server, post):
    client.post("/api/atmospheres", headers=admin, json={"prompt": "a rainy library at dusk"})

    response = client.post("/api/admin/updates", headers=admin)

    assert response.status_code == 409
    assert post.calls == []


def test_update_needs_the_updater(client, admin, published, server, post, monkeypatch):
    monkeypatch.setattr("api.app.routers.updates.updater_ready", lambda: False)

    assert client.post("/api/admin/updates", headers=admin).status_code == 503


def test_auto_update_skips_majors_and_respects_the_toggle(client, admin, published, server, post):
    runner = client.app.state.updater
    assert updates.auto_update_once(runner) is False

    client.patch("/api/admin/updates", headers=admin, json={"auto_update": True})
    published["release"] = release("2.0.0")
    updates.feed.refresh(force=True)
    assert updates.auto_update_once(runner) is False

    published["release"] = release("1.5.0")
    updates.feed.refresh(force=True)
    assert updates.auto_update_once(runner) is True
