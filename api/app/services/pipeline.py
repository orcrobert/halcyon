import io
import logging
import tempfile
import threading
import time
from pathlib import Path

import soundfile as sf
from sqlmodel import Session

from api.app.config import DEFAULT_DURATION_S
from api.app.db import session_scope
from api.app.models.tables import Atmosphere, Element, utcnow
from api.app.services import storage
from api.app.services.decomposer import DEFAULT_ROLE, decompose, refine_element
from api.app.services.generator import WAKE_TICK_S, generate, wait_until_ready
from api.app.services.runconfig import resolve_config
from api.app.services.stages import (
    PERSISTING_DETAIL,
    REVIEW_DETAIL,
    STAGE_PROGRESS,
    decomposing_detail,
    generating_detail,
    mixing_detail,
    waking_detail,
)
from mixer.core import analyze
from mixer.effects.looping import pad_for_looping

logger = logging.getLogger(__name__)

def _set_stage(
    session: Session, atmosphere: Atmosphere, stage: str, detail: str | None = None
) -> None:
    atmosphere.status = "generating"
    atmosphere.current_stage = stage
    atmosphere.stage_detail = detail
    atmosphere.progress = STAGE_PROGRESS[stage]
    atmosphere.updated_at = utcnow()
    session.add(atmosphere)
    session.commit()


def _set_detail(session: Session, atmosphere: Atmosphere, detail: str) -> None:
    atmosphere.stage_detail = detail
    atmosphere.updated_at = utcnow()
    session.add(atmosphere)
    session.commit()


def _wake_generator(session: Session, atmosphere: Atmosphere, config) -> None:
    state = {"status": "waiting"}

    def on_wait(probe_status: str, _elapsed_s: int) -> None:
        state["status"] = probe_status

    _set_stage(session, atmosphere, "waking", waking_detail(config, "waiting", 0))

    started = time.monotonic()
    probing = threading.Thread(
        target=wait_until_ready,
        args=(config.generator_url, on_wait),
        daemon=True,
    )
    probing.start()

    while probing.is_alive():
        probing.join(WAKE_TICK_S)
        if not probing.is_alive():
            break
        elapsed = int(time.monotonic() - started)
        _set_detail(session, atmosphere, waking_detail(config, state["status"], elapsed))


def _fail(session: Session, atmosphere: Atmosphere, message: str) -> None:
    atmosphere.status = "failed"
    atmosphere.current_stage = None
    atmosphere.stage_detail = None
    atmosphere.error = message
    atmosphere.updated_at = utcnow()
    session.add(atmosphere)
    session.commit()


def _wants_review(atmosphere: Atmosphere) -> bool:
    preferences = atmosphere.user.preferences
    return bool(preferences is not None and preferences.review_decomposition)


def _await_review(
    session: Session,
    atmosphere: Atmosphere,
    decomposed: dict,
    timings: dict[str, float],
) -> None:
    atmosphere.decomposed_json = {
        "atmosphere": decomposed.get("atmosphere"),
        "elements": decomposed["elements"],
    }
    if not atmosphere.title:
        atmosphere.title = decomposed.get("atmosphere")
    atmosphere.status = "awaiting_review"
    atmosphere.current_stage = "reviewing"
    atmosphere.stage_detail = REVIEW_DETAIL
    atmosphere.progress = STAGE_PROGRESS["reviewing"]
    atmosphere.timings_json = timings
    atmosphere.updated_at = utcnow()
    session.add(atmosphere)
    session.commit()


def _stored_audio(element: dict, wav, sr) -> bytes:
    buffer = io.BytesIO()
    stored = wav if element.get("playback") == "oneshot" else pad_for_looping(wav, sr)
    sf.write(buffer, stored.T, sr, format="WAV")
    return buffer.getvalue()


def _persist(
    session: Session,
    atmosphere: Atmosphere,
    valid: list[dict],
    wavs: list,
    srs: list[int],
    timings: dict[str, float],
    started: float,
) -> None:
    persist_started = time.perf_counter()
    atmosphere.elements.clear()
    session.flush()

    storage.delete_atmosphere_audio(atmosphere.id)

    for position, (element, wav, sr) in enumerate(zip(valid, wavs, srs)):
        audio_path = storage.write_element_audio(
            atmosphere.id, position, element["label"], _stored_audio(element, wav, sr)
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
                playback=element.get("playback"),
                clip_s=element.get("clip_s"),
                interval_min_s=element.get("interval_min_s"),
                interval_max_s=element.get("interval_max_s"),
                source=element.get("source"),
                source_json=element.get("source_json"),
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

    atmosphere.timings_json = {
        **timings,
        "persist_s": round(time.perf_counter() - persist_started, 3),
        "total_s": round(time.perf_counter() - started, 3),
    }
    atmosphere.status = "ready"
    atmosphere.current_stage = None
    atmosphere.stage_detail = None
    atmosphere.progress = 100
    atmosphere.error = None
    atmosphere.generated_at = utcnow()
    atmosphere.updated_at = utcnow()
    session.add(atmosphere)
    session.commit()


def _clip_seconds(path: Path) -> float:
    try:
        info = sf.info(str(path))
    except Exception:
        return 0.0
    return info.frames / info.samplerate if info.samplerate else 0.0


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


def _stored_spec(atmosphere: Atmosphere, label: str) -> dict:
    for element in (atmosphere.decomposed_json or {}).get("elements", []):
        if isinstance(element, dict) and element.get("label") == label:
            return {
                "role": element.get("role") or DEFAULT_ROLE,
                "frequency": element.get("frequency"),
            }
    return {"role": DEFAULT_ROLE, "frequency": None}


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
        "playback": element.playback or "loop",
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

        started = time.perf_counter()
        timings: dict[str, float] = {}

        try:
            _mark_element(session, element, "regenerating", None)

            spec = {
                "label": element.label,
                "type": element.type,
                "prompt": element.prompt,
                **_stored_spec(atmosphere, element.label),
                "playback": element.playback or "loop",
                "clip_s": element.clip_s,
                "interval_min_s": element.interval_min_s,
                "interval_max_s": element.interval_max_s,
            }
            if feedback:
                spec = refine_element(
                    spec,
                    feedback,
                    atmosphere.prompt,
                    [row.label for row in atmosphere.elements if row.id != element.id],
                    config,
                    atmosphere.use_events is not False,
                )

            wait_until_ready(config.generator_url)
            mark = time.perf_counter()
            generated = generate(
                {"elements": [spec]},
                config,
                atmosphere.duration_s or DEFAULT_DURATION_S,
            )
            timings["generate_s"] = round(time.perf_counter() - mark, 3)

            with tempfile.TemporaryDirectory(prefix="halcyon-") as scratch:
                fresh = Path(scratch) / "fresh.wav"
                fresh.write_bytes(generated[0].pop("audio"))
                timings["audio_s"] = round(_clip_seconds(fresh), 3)

                mark = time.perf_counter()
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

                timings["mix_s"] = round(time.perf_counter() - mark, 3)

                for row, payload, wav, sr in mixed:
                    regenerated = row.id == element.id
                    if regenerated:
                        audio = _stored_audio(payload, wav, sr)
                        previous_path = row.audio_path

                        row.label = _unique_label(
                            atmosphere, payload["label"], row.id
                        )
                        row.type = payload.get("type", row.type)
                        row.prompt = payload.get("prompt", row.prompt)
                        row.playback = payload.get("playback")
                        row.clip_s = payload.get("clip_s")
                        row.interval_min_s = payload.get("interval_min_s")
                        row.interval_max_s = payload.get("interval_max_s")
                        row.source = payload.get("source")
                        row.source_json = payload.get("source_json")
                        row.audio_path = storage.write_element_audio(
                            atmosphere.id, row.position, row.label, audio
                        )
                        row.duration_s = round(wav.shape[-1] / sr, 3)
                        row.version = (row.version or 1) + 1
                        row.status = "ready"
                        row.error = None

                        if previous_path != row.audio_path:
                            storage.delete_element_audio(previous_path)

                    _apply_mix(row, payload, regenerated)
                    session.add(row)

                timings["total_s"] = round(time.perf_counter() - started, 3)
                atmosphere.timings_json = {
                    **(atmosphere.timings_json or {}),
                    "regenerate": timings,
                }
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

        started = time.perf_counter()
        timings: dict[str, float] = {}

        try:
            _set_stage(session, atmosphere, "decomposing", decomposing_detail(config))
            stored = atmosphere.decomposed_json
            if stored:
                decomposed = stored
                reviewed_s = (atmosphere.timings_json or {}).get("decompose_s")
                if reviewed_s is not None:
                    timings["decompose_s"] = reviewed_s
            else:
                mark = time.perf_counter()
                decomposed = decompose(
                    atmosphere.prompt, config, atmosphere.use_events is not False
                )
                timings["decompose_s"] = round(time.perf_counter() - mark, 3)

                if _wants_review(atmosphere):
                    _await_review(session, atmosphere, decomposed, timings)
                    return

            mark = time.perf_counter()
            _wake_generator(session, atmosphere, config)
            timings["wake_s"] = round(time.perf_counter() - mark, 3)

            _set_stage(
                session,
                atmosphere,
                "generating",
                generating_detail(config, decomposed["elements"]),
            )
            mark = time.perf_counter()
            elements = generate(
                decomposed, config, atmosphere.duration_s or DEFAULT_DURATION_S
            )
            timings["generate_s"] = round(time.perf_counter() - mark, 3)

            _set_stage(session, atmosphere, "mixing", mixing_detail(elements))
            mark = time.perf_counter()
            with tempfile.TemporaryDirectory(prefix="halcyon-") as scratch:
                audio_s = 0.0
                for index, element in enumerate(elements):
                    path = Path(scratch) / f"{index:02d}.wav"
                    path.write_bytes(element.pop("audio"))
                    element["file"] = str(path)
                    audio_s += _clip_seconds(path)

                valid, wavs, srs = analyze(elements)
                if not valid:
                    raise ValueError("No usable audio came back from the generator")

                timings["mix_s"] = round(time.perf_counter() - mark, 3)
                timings["audio_s"] = round(audio_s, 3)

                _set_stage(session, atmosphere, "persisting", PERSISTING_DETAIL)
                atmosphere.decomposed_json = {
                    "atmosphere": decomposed.get("atmosphere"),
                    "elements": [
                        {k: v for k, v in element.items() if k != "file"}
                        for element in valid
                    ],
                }
                if not atmosphere.title:
                    atmosphere.title = decomposed.get("atmosphere")

                _persist(session, atmosphere, valid, wavs, srs, timings, started)
        except Exception as exc:
            logger.exception("Generation failed for atmosphere %s", atmosphere_id)
            session.rollback()
            atmosphere = session.get(Atmosphere, atmosphere_id)
            if atmosphere is not None:
                _fail(session, atmosphere, str(exc) or exc.__class__.__name__)
