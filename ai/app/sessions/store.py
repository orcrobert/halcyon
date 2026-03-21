import uuid

_sessions: dict[str, dict] = {}


def create_session(atmosphere: dict) -> str:
    session_id = str(uuid.uuid4())
    _sessions[session_id] = atmosphere
    return session_id


def get_session(session_id: str) -> dict | None:
    return _sessions.get(session_id)


def update_session(session_id: str, data: dict) -> None:
    _sessions[session_id] = data


def delete_session(session_id: str) -> None:
    _sessions.pop(session_id, None)
