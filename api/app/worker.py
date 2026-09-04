import logging
import queue
import threading
from collections.abc import Callable

from sqlmodel import select

from api.app.db import session_scope
from api.app.models.tables import Atmosphere, Element, utcnow

logger = logging.getLogger(__name__)

_SHUTDOWN = object()


class GenerationWorker:
    def __init__(
        self,
        handler: Callable[[int], None],
        element_handler: Callable[[int, str | None], None] | None = None,
    ) -> None:
        self._handler = handler
        self._element_handler = element_handler
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
        self._queue.put((self._handler, (atmosphere_id,)))

    def submit_element(self, element_id: int, feedback: str | None) -> None:
        if self._element_handler is None:
            raise RuntimeError("This worker has no element handler")
        self._queue.put((self._element_handler, (element_id, feedback)))

    def _run(self) -> None:
        while True:
            item = self._queue.get()
            try:
                if item is _SHUTDOWN:
                    return
                handler, args = item
                handler(*args)
            except Exception:
                logger.exception("Generation worker crashed on job %s", item)
            finally:
                self._queue.task_done()


INTERRUPTED = "Generation was interrupted by a server restart."


def reclaim_interrupted() -> int:
    with session_scope() as session:
        stranded = session.exec(
            select(Atmosphere).where(Atmosphere.status.in_(("pending", "generating")))
        ).all()

        for atmosphere in stranded:
            atmosphere.status = "failed"
            atmosphere.current_stage = None
            atmosphere.error = INTERRUPTED
            atmosphere.updated_at = utcnow()
            session.add(atmosphere)

        elements = session.exec(
            select(Element).where(Element.status == "regenerating")
        ).all()

        for element in elements:
            element.status = "failed"
            element.error = INTERRUPTED
            session.add(element)

        session.commit()
        return len(stranded) + len(elements)
