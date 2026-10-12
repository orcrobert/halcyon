import logging
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
from collections.abc import Callable

from sqlmodel import select

from api.app.config import settings
from api.app.db import session_scope
from api.app.models.tables import GeneratorProfile, UserSettings, utcnow
from api.app.security import decrypt_secret
from api.app.services.generator_options import deploy_env, deploy_options

DEPLOY_TIMEOUT_S = 1800
LOG_LIMIT = 12000
LOG_FLUSH_S = 1.5

URL_PATTERN = re.compile(r"https://[A-Za-z0-9.-]+\.modal\.run")
ANSI_PATTERN = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")

INTERRUPTED = "The deploy was interrupted by a server restart."

logger = logging.getLogger(__name__)


def modal_credentials(preferences: UserSettings | None) -> tuple[str, str] | None:
    token_id = getattr(preferences, "modal_token_id", None)
    secret = decrypt_secret(getattr(preferences, "modal_token_secret_enc", None))
    if token_id and secret:
        return token_id, secret
    if settings.modal_token_id and settings.modal_token_secret:
        return settings.modal_token_id, settings.modal_token_secret
    return None


def credentials_source(preferences: UserSettings | None) -> str | None:
    if getattr(preferences, "modal_token_id", None) and getattr(
        preferences, "modal_token_secret_enc", None
    ):
        return "user"
    if settings.modal_token_id and settings.modal_token_secret:
        return "instance"
    return None


def deploy_available() -> bool:
    return settings.modal_deploy_script.is_file()


def _clean(text: str) -> str:
    return ANSI_PATTERN.sub("", text).replace("\r", "\n")


def _write_log(profile_id: int, log: str) -> None:
    with session_scope() as session:
        profile = session.get(GeneratorProfile, profile_id)
        if profile is None:
            return
        profile.deploy_log = log[-LOG_LIMIT:]
        session.add(profile)
        session.commit()


def _fail(profile_id: int, message: str, log: str | None = None) -> None:
    with session_scope() as session:
        profile = session.get(GeneratorProfile, profile_id)
        if profile is None:
            return
        profile.deploy_status = "failed"
        profile.deploy_error = message
        if log is not None:
            profile.deploy_log = log[-LOG_LIMIT:]
        profile.updated_at = utcnow()
        session.add(profile)
        session.commit()


def _succeed(profile_id: int, snapshot: dict, log: str) -> None:
    urls = URL_PATTERN.findall(log)
    with session_scope() as session:
        profile = session.get(GeneratorProfile, profile_id)
        if profile is None:
            return
        profile.deploy_status = "ready"
        profile.deploy_error = None
        profile.deploy_log = log[-LOG_LIMIT:]
        profile.deployed_json = snapshot
        profile.deployed_at = utcnow()
        profile.last_status = None
        profile.last_checked_at = None
        profile.reported_json = None

        if urls and profile.url != urls[-1]:
            profile.url = urls[-1]

        if profile.url and not profile.is_active:
            others = session.exec(
                select(GeneratorProfile).where(
                    GeneratorProfile.user_id == profile.user_id,
                    GeneratorProfile.id != profile.id,
                    GeneratorProfile.is_active,
                )
            ).all()
            if not any(other.url for other in others):
                for other in others:
                    other.is_active = False
                    session.add(other)
                profile.is_active = True

        profile.updated_at = utcnow()
        session.add(profile)
        session.commit()


def _last_line(log: str) -> str | None:
    for line in reversed(log.splitlines()):
        if line.strip():
            return line.strip()[:300]
    return None


def run_deploy(profile_id: int) -> None:
    with session_scope() as session:
        profile = session.get(GeneratorProfile, profile_id)
        if profile is None:
            return
        credentials = modal_credentials(profile.user.preferences)
        snapshot = deploy_options(profile.kind, profile.options_json)
        extra_env = deploy_env(profile.kind, profile.options_json)

    if credentials is None:
        _fail(profile_id, "Add a Modal token before deploying.")
        return

    script = settings.modal_deploy_script
    if not script.is_file():
        _fail(profile_id, f"No Modal deploy script at {script}.")
        return

    token_id, token_secret = credentials
    chunks: list[str] = []

    with tempfile.TemporaryDirectory(prefix="halcyon-modal-") as home:
        env = {
            **os.environ,
            **extra_env,
            "MODAL_TOKEN_ID": token_id,
            "MODAL_TOKEN_SECRET": token_secret,
            "HOME": home,
            "PYTHONUNBUFFERED": "1",
            "NO_COLOR": "1",
            "TERM": "dumb",
            "COLUMNS": "120",
        }

        try:
            process = subprocess.Popen(
                [sys.executable, "-m", "modal", "deploy", str(script)],
                cwd=str(script.parents[2]),
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
        except OSError as exc:
            _fail(profile_id, f"Could not start modal deploy: {exc}")
            return

        timer = threading.Timer(DEPLOY_TIMEOUT_S, process.kill)
        timer.start()
        flushed = time.monotonic()
        try:
            for line in process.stdout or ():
                chunks.append(_clean(line))
                if time.monotonic() - flushed >= LOG_FLUSH_S:
                    _write_log(profile_id, "".join(chunks))
                    flushed = time.monotonic()
            code = process.wait()
        finally:
            timer.cancel()

    log = "".join(chunks)
    if code == 0:
        _succeed(profile_id, snapshot, log)
        return

    if code < 0:
        message = f"modal deploy did not finish within {DEPLOY_TIMEOUT_S // 60} minutes."
    else:
        message = _last_line(log) or f"modal deploy exited with code {code}."
    _fail(profile_id, message, log)


class DeployRunner:
    def __init__(self, handler: Callable[[int], None] = run_deploy) -> None:
        self._handler = handler
        self._running: set[int] = set()
        self._lock = threading.Lock()

    def is_running(self, profile_id: int) -> bool:
        with self._lock:
            return profile_id in self._running

    def start(self, profile_id: int) -> bool:
        with self._lock:
            if profile_id in self._running:
                return False
            self._running.add(profile_id)
        threading.Thread(
            target=self._run,
            args=(profile_id,),
            name=f"halcyon-deploy-{profile_id}",
            daemon=True,
        ).start()
        return True

    def _run(self, profile_id: int) -> None:
        try:
            self._handler(profile_id)
        except Exception as exc:
            logger.exception("Deploy crashed for generator %s", profile_id)
            _fail(profile_id, str(exc) or exc.__class__.__name__)
        finally:
            with self._lock:
                self._running.discard(profile_id)


def reclaim_deploys() -> int:
    with session_scope() as session:
        stranded = session.exec(
            select(GeneratorProfile).where(GeneratorProfile.deploy_status == "deploying")
        ).all()
        for profile in stranded:
            profile.deploy_status = "failed"
            profile.deploy_error = INTERRUPTED
            session.add(profile)
        session.commit()
        return len(stranded)
