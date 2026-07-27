import io
import logging
import tempfile
from pathlib import Path

import soundfile as sf
from sqlmodel import Session

from api.app.db import session_scope
from api.app.models.tables import Atmosphere, Element, utcnow
from api.app.services import storage
from api.app.services.decomposer import decompose
from api.app.services.generator import generate
from api.app.services.runconfig import resolve_config
from mixer.core import analyze

logger = logging.getLogger(__name__)

STAGE_PROGRESS = {
    "decomposing": 10,
    "generating": 30,
    "mixing": 70,
    "persisting": 90,
}


def _set_stage(session: Session, atmosphere: Atmosphere, stage: str) -> None:
    atmosphere.status = "generating"
    atmosphere.current_stage = stage
    atmosphere.progress = STAGE_PROGRESS[stage]
    atmosphere.updated_at = utcnow()
    session.add(atmosphere)
    session.commit()


def _fail(session: Session, atmosphere: Atmosphere, message: str) -> None:
    atmosphere.status = "failed"
    atmosphere.current_stage = None
    atmosphere.error = message
    atmosphere.updated_at = utcnow()
    session.add(atmosphere)
    session.commit()


def _persist(
    session: Session,
    atmosphere: Atmosphere,
    valid: list[dict],
    wavs: list,
    srs: list[int],
) -> None:
    storage.delete_atmosphere_audio(atmosphere.id)

    for position, (element, wav, sr) in enumerate(zip(valid, wavs, srs)):
        buffer = io.BytesIO()
        sf.write(buffer, wav.T, sr, format="WAV")
        audio_path = storage.write_element_audio(
            atmosphere.id, position, element["label"], buffer.getvalue()
        )

        volume = float(element.get("volume", 0.8))
        pan = float(element.get("pan", 0.0))
        depth = float(element.get("depth", 0.0))
        eq_json = element.get("eq_json")

        session.add(
            Element(
                atmosphere_id=atmosphere.id,
                position=position,
                label=element["label"],
                type=element.get("type", "sound"),
                prompt=element.get("prompt", ""),
                audio_path=audio_path,
                duration_s=round(wav.shape[-1] / sr, 3),
                volume=volume,
                pan=pan,
                depth=depth,
                eq_json=eq_json,
                original_volume=volume,
                original_pan=pan,
                original_depth=depth,
                original_eq_json=eq_json,
            )
        )

    atmosphere.status = "ready"
    atmosphere.current_stage = None
    atmosphere.progress = 100
    atmosphere.error = None
    atmosphere.generated_at = utcnow()
    atmosphere.updated_at = utcnow()
    session.add(atmosphere)
    session.commit()


def run_generation(atmosphere_id: int) -> None:
    with session_scope() as session:
        atmosphere = session.get(Atmosphere, atmosphere_id)
        if atmosphere is None:
            logger.warning("Atmosphere %s vanished before generation", atmosphere_id)
            return

        config = resolve_config(atmosphere.user.preferences)

        try:
            _set_stage(session, atmosphere, "decomposing")
            decomposed = decompose(atmosphere.prompt, config)

            _set_stage(session, atmosphere, "generating")
            elements = generate(decomposed, config)

            _set_stage(session, atmosphere, "mixing")
            with tempfile.TemporaryDirectory(prefix="halcyon-") as scratch:
                for index, element in enumerate(elements):
                    path = Path(scratch) / f"{index:02d}.wav"
                    path.write_bytes(element.pop("audio"))
                    element["file"] = str(path)

                valid, wavs, srs = analyze(elements)
                if not valid:
                    raise ValueError("No usable audio came back from the generator")

                _set_stage(session, atmosphere, "persisting")
                atmosphere.decomposed_json = {
                    "atmosphere": decomposed.get("atmosphere"),
                    "elements": [
                        {k: v for k, v in element.items() if k != "file"}
                        for element in valid
                    ],
                }
                if not atmosphere.title:
                    atmosphere.title = decomposed.get("atmosphere")

                _persist(session, atmosphere, valid, wavs, srs)
        except Exception as exc:
            logger.exception("Generation failed for atmosphere %s", atmosphere_id)
            session.rollback()
            atmosphere = session.get(Atmosphere, atmosphere_id)
            if atmosphere is not None:
                _fail(session, atmosphere, str(exc) or exc.__class__.__name__)
