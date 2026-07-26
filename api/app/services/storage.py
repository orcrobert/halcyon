import re
import shutil
from pathlib import Path

from api.app.config import settings


def sanitize_label(label: str) -> str:
    return re.sub(r"[^\w]+", "_", label.lower()).strip("_") or "element"


def atmosphere_dir(atmosphere_id: int) -> Path:
    return settings.audio_path / str(atmosphere_id)


def write_element_audio(atmosphere_id: int, position: int, label: str, audio: bytes) -> str:
    directory = atmosphere_dir(atmosphere_id)
    directory.mkdir(parents=True, exist_ok=True)
    filename = f"{position:02d}_{sanitize_label(label)}.wav"
    (directory / filename).write_bytes(audio)
    return f"{atmosphere_id}/{filename}"


def resolve_audio(relative_path: str) -> Path:
    full = (settings.audio_path / relative_path).resolve()
    if not full.is_relative_to(settings.audio_path.resolve()):
        raise ValueError(f"Audio path escapes the storage root: {relative_path}")
    return full


def delete_atmosphere_audio(atmosphere_id: int) -> None:
    shutil.rmtree(atmosphere_dir(atmosphere_id), ignore_errors=True)
