import io
import logging
import tempfile
from pathlib import Path

import soundfile as sf
from sqlmodel import Session

from api.app.config import DEFAULT_DURATION_S
from api.app.db import session_scope
from api.app.models.tables import Atmosphere, Element, utcnow
from api.app.services import storage
from api.app.services.decomposer import decompose, refine_element
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


def _mark_element(
    session: Session, element: Element, status: str, error: str | None
) -> None:
    element.status = status
    element.error = error
    element.atmosphere.updated_at = utcnow()
    session.add(element)
    session.commit()


def _unique_label(atmosphere: Atmosphere, label: str, element_id: int) -> str:
    taken = {row.label for row in atmosphere.elements if row.id != element_id}
    if label not in taken:
        return label
    suffix = 2
    while f"{label} {suffix}" in taken:
        suffix += 1
    return f"{label} {suffix}"


def _stored_payload(element: Element) -> dict | None:
    try:
        path = storage.resolve_audio(element.audio_path)
    except ValueError:
        return None
    if not path.is_file():
        return None
    return {
        "label": element.label,
        "type": element.type,
        "prompt": element.prompt,
        "file": str(path),
        "looped": True,
    }


def _apply_mix(element: Element, payload: dict, regenerated: bool) -> None:
    volume = float(payload.get("volume", 0.8))
    pan = float(payload.get("pan", 0.0))
    depth = float(payload.get("depth", 0.0))
    eq_json = payload.get("eq_json")

    if regenerated or element.volume == element.original_volume:
        element.volume = volume
    if regenerated or element.pan == element.original_pan:
        element.pan = pan
    if regenerated or element.depth == element.original_depth:
        element.depth = depth
    if regenerated or element.eq_json == element.original_eq_json:
        element.eq_json = eq_json

    element.original_volume = volume
    element.original_pan = pan
    element.original_depth = depth
    element.original_eq_json = eq_json


def regenerate_element(element_id: int, feedback: str | None = None) -> None:
    with session_scope() as session:
        element = session.get(Element, element_id)
        if element is None:
            logger.warning("Element %s vanished before regeneration", element_id)
            return

        atmosphere = element.atmosphere
        config = resolve_config(
            atmosphere.user.preferences, atmosphere.user.generators
        )

        try:
            _mark_element(session, element, "regenerating", None)

            spec = {
                "label": element.label,
                "type": element.type,
                "prompt": element.prompt,
            }
            if feedback:
                spec = refine_element(
                    spec,
                    feedback,
                    atmosphere.prompt,
                    [row.label for row in atmosphere.elements if row.id != element.id],
                    config,
                )

            generated = generate({"elements": [spec]}, config)

            with tempfile.TemporaryDirectory(prefix="halcyon-") as scratch:
                fresh = Path(scratch) / "fresh.wav"
                fresh.write_bytes(generated[0].pop("audio"))

                jobs: list[tuple[Element, dict]] = []
                for row in atmosphere.elements:
                    if row.id == element.id:
                        jobs.append((row, {**spec, "file": str(fresh)}))
                        continue
                    payload = _stored_payload(row)
                    if payload is not None:
                        jobs.append((row, payload))

                owners = {id(payload): row for row, payload in jobs}
                valid, wavs, srs = analyze([payload for _, payload in jobs])

                mixed = [
                    (owners[id(payload)], payload, wav, sr)
                    for payload, wav, sr in zip(valid, wavs, srs)
                ]
                if not any(row.id == element.id for row, _, _, _ in mixed):
                    raise ValueError("No usable audio came back from the generator")

                for row, payload, wav, sr in mixed:
                    regenerated = row.id == element.id
                    if regenerated:
                        buffer = io.BytesIO()
                        sf.write(buffer, wav.T, sr, format="WAV")
                        previous_path = row.audio_path

                        row.label = _unique_label(
                            atmosphere, payload["label"], row.id
                        )
                        row.type = payload.get("type", row.type)
                        row.prompt = payload.get("prompt", row.prompt)
                        row.audio_path = storage.write_element_audio(
                            atmosphere.id, row.position, row.label, buffer.getvalue()
                        )
                        row.duration_s = round(wav.shape[-1] / sr, 3)
                        row.version = (row.version or 1) + 1
                        row.status = "ready"
                        row.error = None

                        if previous_path != row.audio_path:
                            storage.delete_element_audio(previous_path)

                    _apply_mix(row, payload, regenerated)
                    session.add(row)

                atmosphere.updated_at = utcnow()
                session.add(atmosphere)
                session.commit()
        except Exception as exc:
            logger.exception("Regeneration failed for element %s", element_id)
            session.rollback()
            element = session.get(Element, element_id)
            if element is not None:
                _mark_element(
                    session, element, "failed", str(exc) or exc.__class__.__name__
                )


def run_generation(atmosphere_id: int) -> None:
    with session_scope() as session:
        atmosphere = session.get(Atmosphere, atmosphere_id)
        if atmosphere is None:
            logger.warning("Atmosphere %s vanished before generation", atmosphere_id)
            return

        config = resolve_config(
            atmosphere.user.preferences, atmosphere.user.generators
        )

        try:
            _set_stage(session, atmosphere, "decomposing")
            decomposed = decompose(atmosphere.prompt, config)

            _set_stage(session, atmosphere, "generating")
            elements = generate(
                decomposed, config, atmosphere.duration_s or DEFAULT_DURATION_S
            )

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
