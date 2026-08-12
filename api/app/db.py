from collections.abc import Iterator

from sqlalchemy import event, inspect, text
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

from api.app.config import settings

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


def _add_missing_columns(engine: Engine) -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.begin() as connection:
        for table in SQLModel.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue
            known = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in known or not column.nullable:
                    continue
                type_sql = column.type.compile(engine.dialect)
                connection.execute(
                    text(
                        f'ALTER TABLE "{table.name}" '
                        f'ADD COLUMN "{column.name}" {type_sql}'
                    )
                )


def init_db() -> None:
    import api.app.models.tables  # noqa: F401

    engine = get_engine()
    SQLModel.metadata.create_all(engine)
    _add_missing_columns(engine)


def session_scope() -> Session:
    return Session(get_engine())


def get_session() -> Iterator[Session]:
    with session_scope() as session:
        yield session
