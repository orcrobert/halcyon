import logging
import queue
import threading
from collections.abc import Callable

from sqlmodel import select

from ai.app.db import session_scope
from ai.app.models.tables import Atmosphere, utcnow

logger = logging.getLogger(__name__)

_SHUTDOWN = object()


class GenerationWorker:
    def __init__(self, handler: Callable[[int], None]) -> None:
        self._handler = handler
        self._queue: queue.Queue = queue.Queue()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread is not None:
            return
        self._thread = threading.Thread(
            target=self._run, name="halcyon-generation", daemon=True
        )
        self._thread.start()

    def stop(self) -> None:
        if self._thread is None:
            return
        self._queue.put(_SHUTDOWN)
        self._thread.join(timeout=5)
        self._thread = None

    def submit(self, atmosphere_id: int) -> None:
        self._queue.put(atmosphere_id)

    def _run(self) -> None:
        while True:
            item = self._queue.get()
            try:
                if item is _SHUTDOWN:
                    return
                self._handler(item)
            except Exception:
                logger.exception("Generation worker crashed on atmosphere %s", item)
            finally:
                self._queue.task_done()


def reclaim_interrupted() -> int:
    with session_scope() as session:
        stranded = session.exec(
            select(Atmosphere).where(Atmosphere.status.in_(("pending", "generating")))
        ).all()

        for atmosphere in stranded:
            atmosphere.status = "failed"
            atmosphere.current_stage = None
            atmosphere.error = "Generation was interrupted by a server restart."
            atmosphere.updated_at = utcnow()
            session.add(atmosphere)

        session.commit()
        return len(stranded)
