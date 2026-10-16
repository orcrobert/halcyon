import logging
import secrets
import threading
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

import requests
from sqlmodel import Session, select

from api.app.config import settings
from api.app.db import session_scope
from api.app.models.schemas import UpdateStatusOut
from api.app.models.tables import (
    Atmosphere,
    Element,
    GeneratorProfile,
    InstanceSettings,
    utcnow,
)

logger = logging.getLogger(__name__)

REPOSITORY = "orcrobert/halcyon"
RELEASES_URL = f"https://api.github.com/repos/{REPOSITORY}/releases/latest"
CHECK_INTERVAL = timedelta(hours=6)
FIRST_AUTO_CHECK = timedelta(minutes=10)
REQUEST_TIMEOUT_S = 10
PROBE_TIMEOUT_S = 2
UPDATER_TIMEOUT_S = 900
TAG_SUFFIXES = ("-cli",)

Version = tuple[int, int, int]


@dataclass(frozen=True)
class Release:
    version: str
    notes: str | None
    url: str | None
    published_at: datetime | None


def parse_version(text: str | None) -> Version | None:
    parts = (text or "").strip().removeprefix("v").split(".")
    if len(parts) != 3 or not all(part.isdigit() for part in parts):
        return None
    return int(parts[0]), int(parts[1]), int(parts[2])


def parse_track(tag: str) -> tuple[int, ...] | None:
    name = tag.strip()
    for suffix in TAG_SUFFIXES:
        name = name.removesuffix(suffix)
    if name in ("", "latest"):
        return ()
    parts = name.removeprefix("v").split(".")
    if len(parts) > 3 or not all(part.isdigit() for part in parts):
        return None
    return tuple(int(part) for part in parts)


def compare(current: str, latest: str | None, tag: str) -> tuple[bool, bool, bool]:
    running = parse_version(current)
    newest = parse_version(latest)
    if running is None or newest is None or newest <= running:
        return False, False, False
    major = newest[0] > running[0]
    track = parse_track(tag)
    if track is None or len(track) == 3 or newest[: len(track)] != track:
        return False, major, True
    return True, major, False


def _fetch_latest() -> Release:
    response = requests.get(
        RELEASES_URL,
        headers={"Accept": "application/vnd.github+json"},
        timeout=REQUEST_TIMEOUT_S,
    )
    response.raise_for_status()
    payload = response.json()
    published = payload.get("published_at")
    return Release(
        version=str(payload.get("tag_name") or "").removeprefix("v"),
        notes=payload.get("body") or None,
        url=payload.get("html_url"),
        published_at=datetime.fromisoformat(published.replace("Z", "+00:00"))
        if published
        else None,
    )


class ReleaseFeed:
    def __init__(self, fetch: Callable[[], Release] = _fetch_latest) -> None:
        self._fetch = fetch
        self._lock = threading.Lock()
        self.release: Release | None = None
        self.checked_at: datetime | None = None
        self.error: str | None = None

    def refresh(self, force: bool = False) -> Release | None:
        with self._lock:
            fresh = self.checked_at and utcnow() - self.checked_at < CHECK_INTERVAL
            if fresh and not force:
                return self.release
            try:
                self.release = self._fetch()
                self.error = None
            except (requests.RequestException, ValueError) as exc:
                logger.warning("Could not check for a new release: %s", exc)
                self.error = "Could not reach GitHub to check for a new release."
            self.checked_at = utcnow()
            return self.release


feed = ReleaseFeed()


def _token_path() -> Path | None:
    return Path(settings.updater_token_file) if settings.updater_token_file else None


def ensure_updater_token() -> None:
    path = _token_path()
    if path is None or not path.parent.is_dir():
        return
    try:
        if path.is_file() and path.read_text().strip():
            return
        path.write_text(secrets.token_urlsafe(32))
        path.chmod(0o600)
    except OSError as exc:
        logger.warning("Could not write the updater token to %s: %s", path, exc)


def updater_token() -> str | None:
    path = _token_path()
    if path is None:
        return None
    try:
        return path.read_text().strip() or None
    except OSError:
        return None


def updater_ready() -> bool:
    if updater_token() is None:
        return False
    try:
        response = requests.get(
            f"{settings.updater_url.rstrip('/')}/readyz", timeout=PROBE_TIMEOUT_S
        )
    except requests.RequestException:
        return False
    return response.status_code == 200


def busy_reason(session: Session) -> str | None:
    generating = session.exec(
        select(Atmosphere.id).where(Atmosphere.status.in_(("pending", "generating")))
    ).first()
    regenerating = session.exec(
        select(Element.id).where(Element.status == "regenerating")
    ).first()
    if generating is not None or regenerating is not None:
        return "A soundscape is generating. Update once it finishes."
    deploying = session.exec(
        select(GeneratorProfile.id).where(GeneratorProfile.deploy_status == "deploying")
    ).first()
    if deploying is not None:
        return "A generator is deploying. Update once it finishes."
    return None


def instance_settings(session: Session) -> InstanceSettings:
    row = session.get(InstanceSettings, 1)
    if row is None:
        row = InstanceSettings(id=1)
        session.add(row)
        session.commit()
        session.refresh(row)
    return row


class UpdateRunner:
    def __init__(self, post: Callable[..., requests.Response] = requests.post) -> None:
        self._post = post
        self._lock = threading.Lock()
        self.started_at: datetime | None = None
        self.error: str | None = None

    @property
    def updating(self) -> bool:
        with self._lock:
            return self.started_at is not None

    def start(self) -> bool:
        token = updater_token()
        if token is None:
            return False
        with self._lock:
            if self.started_at is not None:
                return False
            self.started_at = utcnow()
            self.error = None
        threading.Thread(
            target=self._run, args=(token,), name="halcyon-update", daemon=True
        ).start()
        return True

    def _run(self, token: str) -> None:
        error = None
        try:
            response = self._post(
                f"{settings.updater_url.rstrip('/')}/v1/update",
                headers={"Authorization": f"Bearer {token}"},
                timeout=UPDATER_TIMEOUT_S,
            )
            if response.status_code >= 400:
                error = f"The updater answered {response.status_code}."
            else:
                error = (
                    f"The updater found no newer image for "
                    f"ghcr.io/{REPOSITORY}:{settings.halcyon_tag}."
                )
        except requests.RequestException as exc:
            logger.warning("Update request failed: %s", exc)
            error = "Could not reach the updater."
        with self._lock:
            self.started_at = None
            self.error = error


def update_status(
    session: Session, runner: UpdateRunner, force: bool = False
) -> UpdateStatusOut:
    release = feed.refresh(force=force)
    latest = release.version if release else None
    available, major, pinned = compare(settings.halcyon_version, latest, settings.halcyon_tag)
    return UpdateStatusOut(
        current=settings.halcyon_version,
        latest=latest,
        update_available=available,
        major=major,
        pinned=pinned,
        notes=release.notes if release else None,
        release_url=release.url if release else None,
        published_at=release.published_at if release else None,
        checked_at=feed.checked_at,
        check_error=feed.error,
        track=settings.halcyon_tag,
        updater="ready" if updater_ready() else "missing",
        updating=runner.updating,
        update_error=runner.error,
        auto_update=bool(instance_settings(session).auto_update),
    )


def auto_update_once(runner: UpdateRunner) -> bool:
    with session_scope() as session:
        if not instance_settings(session).auto_update or busy_reason(session):
            return False
    release = feed.refresh()
    available, major, _ = compare(
        settings.halcyon_version, release.version if release else None, settings.halcyon_tag
    )
    if not available or major or not updater_ready():
        return False
    logger.warning("Updating to %s automatically", release.version)
    return runner.start()


class AutoUpdater:
    def __init__(self, runner: UpdateRunner) -> None:
        self._runner = runner
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread is not None:
            return
        self._thread = threading.Thread(target=self._run, name="halcyon-auto-update", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._thread = None

    def _run(self) -> None:
        delay = FIRST_AUTO_CHECK
        while not self._stop.wait(delay.total_seconds()):
            try:
                auto_update_once(self._runner)
            except Exception:
                logger.exception("Automatic update check failed")
            delay = CHECK_INTERVAL
