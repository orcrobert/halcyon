from collections.abc import Iterator

from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

from ai.app.config import settings

_engine: Engine | None = None


def _apply_sqlite_pragmas(dbapi_connection, _connection_record) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA busy_timeout=10000")
    cursor.close()


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        settings.data_path.mkdir(parents=True, exist_ok=True)
        _engine = create_engine(
            f"sqlite:///{settings.database_path}",
            connect_args={"check_same_thread": False},
        )
        event.listen(_engine, "connect", _apply_sqlite_pragmas)
    return _engine


def init_db() -> None:
    import ai.app.models.tables  # noqa: F401

    SQLModel.metadata.create_all(get_engine())


def session_scope() -> Session:
    return Session(get_engine())


def get_session() -> Iterator[Session]:
    with session_scope() as session:
        yield session
