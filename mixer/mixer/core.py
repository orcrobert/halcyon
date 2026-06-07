import os
import numpy as np
import soundfile as sf

from mixer.effects.looping import make_loopable
from mixer.effects.eq import apply_eq
from mixer.effects.auto_eq import auto_eq
from mixer.effects.volume import assign_volumes
from mixer.effects.spatial import apply_pan, assign_spatial


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


def analyze(elements: list[dict]) -> tuple[list[dict], list[np.ndarray], list[int]]:
    wavs: list[np.ndarray] = []
    srs: list[int] = []
    valid: list[dict] = []

    for element in elements:
        path = element.get("file", "")
        if not path or not os.path.exists(path):
            continue
        wav, sr = sf.read(path, always_2d=True)
        wav = wav.T
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

    volumes = assign_volumes(valid, eqd_wavs, srs)
    spatial = assign_spatial(list(zip(eqd_wavs, srs)))

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

    max_len = max(t.shape[-1] for t in tracks)
    tracks = [_to_stereo(_loop_to_length(t, max_len)) for t in tracks]

    mixed = np.stack(tracks).sum(axis=0)

    peak = np.abs(mixed).max()
    if peak > 1.0:
        mixed = mixed / peak

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    sf.write(output_path, mixed.T, target_sr)
    return output_path
