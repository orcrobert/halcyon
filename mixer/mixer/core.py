import os
import numpy as np
import soundfile as sf

from mixer.effects.looping import make_loopable
from mixer.effects.eq import apply_eq, remove_subsonics
from mixer.effects.auto_eq import auto_eq
from mixer.effects.events import (
    EVENT_DEFAULT_INTERVAL_S,
    EVENT_MIN_S,
    place_events,
    rms_db,
    trim_to_envelope,
)
from mixer.effects.volume import assign_volumes
from mixer.effects.spatial import apply_pan, assign_spatial

EVENT_SCATTER_SEED = 0
MIX_FALLBACK_LENGTH_S = 30.0


def _resample(wav: np.ndarray, sr: int, target_sr: int) -> np.ndarray:
    if sr == target_sr:
        return wav
    new_len = int(len(wav) * target_sr / sr)
    return np.interp(
        np.linspace(0, len(wav) - 1, new_len),
        np.arange(len(wav)),
        wav,
    )


def _loop_to_length(track: np.ndarray, target_len: int) -> np.ndarray:
    if track.shape[-1] >= target_len:
        return track[..., :target_len]
    repeats = (target_len // track.shape[-1]) + 1
    return np.tile(track, (1, repeats))[..., :target_len]


def _to_stereo(track: np.ndarray) -> np.ndarray:
    if track.shape[0] == 1:
        return np.repeat(track, 2, axis=0)
    return track


def _scatter(
    track: np.ndarray,
    target_len: int,
    sr: int,
    min_s: float,
    max_s: float,
    rng: np.random.Generator,
) -> np.ndarray:
    out = np.zeros((track.shape[0], target_len), dtype=np.float64)
    clip = track.shape[-1]
    low = max(min_s, clip / sr)
    high = max(max_s, low)

    at = rng.uniform(0.5, low)
    while True:
        start = int(at * sr)
        if start >= target_len:
            return out
        end = min(start + clip, target_len)
        out[:, start:end] += track[:, : end - start]
        at += rng.uniform(low, high)


def _is_event(element: dict) -> bool:
    return element.get("playback") == "oneshot"


def analyze(elements: list[dict]) -> tuple[list[dict], list[np.ndarray], list[int]]:
    wavs: list[np.ndarray] = []
    srs: list[int] = []
    valid: list[dict] = []

    for element in elements:
        path = element.get("file", "")
        if not path or not os.path.exists(path):
            continue
        wav, sr = sf.read(path, always_2d=True)
        wav = remove_subsonics(wav.T, sr)
        if _is_event(element):
            wav = trim_to_envelope(wav, sr)
            if wav.shape[-1] < EVENT_MIN_S * sr:
                continue
        elif not element.get("looped"):
            wav = make_loopable(wav, sr)
        wavs.append(wav)
        srs.append(sr)
        valid.append(element)

    if not valid:
        return valid, wavs, srs

    eq_bands_per_element = auto_eq(wavs, srs, valid)
    for element, eq_bands in zip(valid, eq_bands_per_element):
        element["eq_json"] = eq_bands

    eqd_wavs = [
        apply_eq(wav, sr, bands)
        for wav, sr, bands in zip(wavs, srs, eq_bands_per_element)
    ]

    loop_idx = [i for i, element in enumerate(valid) if not _is_event(element)]
    event_idx = [i for i, element in enumerate(valid) if _is_event(element)]

    volumes: list[float] = [0.0] * len(valid)
    spatial: list[tuple[float, float]] = [(0.0, 0.0)] * len(valid)

    if loop_idx:
        loop_volumes = assign_volumes(
            [valid[i] for i in loop_idx],
            [eqd_wavs[i] for i in loop_idx],
            [srs[i] for i in loop_idx],
        )
        loop_spatial = assign_spatial([(eqd_wavs[i], srs[i]) for i in loop_idx])
        for slot, i in enumerate(loop_idx):
            volumes[i] = loop_volumes[slot]
            spatial[i] = loop_spatial[slot]

    if event_idx:
        anchor = max(
            (
                rms_db(eqd_wavs[i]) + 20.0 * np.log10(max(volumes[i], 1e-9))
                for i in loop_idx
            ),
            default=None,
        )
        placements = place_events([eqd_wavs[i] for i in event_idx], anchor)
        for slot, i in enumerate(event_idx):
            volume, pan, depth = placements[slot]
            volumes[i] = volume
            spatial[i] = (pan, depth)

    for element, vol, (pan, depth) in zip(valid, volumes, spatial):
        element["volume"] = vol
        element["pan"] = round(pan, 4)
        element["depth"] = round(depth, 4)

    return valid, wavs, srs


def mix_to_file(elements: list[dict], output_path: str = "output/mixed.wav") -> str:
    valid, wavs, srs = analyze(elements)

    if not valid:
        raise ValueError("No valid elements to mix")

    target_sr = srs[0]
    tracks = []
    for element, wav, sr in zip(valid, wavs, srs):
        if sr != target_sr:
            wav = np.stack([_resample(ch, sr, target_sr) for ch in wav])
        wav = apply_eq(wav, target_sr, element.get("eq_json", []))
        wav = apply_pan(wav, element.get("pan", 0.0))
        wav = wav * float(element.get("volume", 1.0))
        tracks.append(wav)

    loop_lengths = [
        track.shape[-1]
        for track, element in zip(tracks, valid)
        if not _is_event(element)
    ]
    max_len = (
        max(loop_lengths)
        if loop_lengths
        else int(MIX_FALLBACK_LENGTH_S * target_sr)
    )

    rng = np.random.default_rng(EVENT_SCATTER_SEED)
    default_min, default_max = EVENT_DEFAULT_INTERVAL_S
    laid = []
    for element, track in zip(valid, tracks):
        if _is_event(element):
            laid.append(
                _scatter(
                    track,
                    max_len,
                    target_sr,
                    float(element.get("interval_min_s") or default_min),
                    float(element.get("interval_max_s") or default_max),
                    rng,
                )
            )
        else:
            laid.append(_loop_to_length(track, max_len))

    tracks = [_to_stereo(track) for track in laid]

    mixed = np.stack(tracks).sum(axis=0)

    peak = np.abs(mixed).max()
    if peak > 1.0:
        mixed = mixed / peak

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    sf.write(output_path, mixed.T, target_sr)
    return output_path
