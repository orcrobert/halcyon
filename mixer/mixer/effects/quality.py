import numpy as np
from scipy.signal import welch

from mixer.effects.looping import loop_windows, make_loopable

QUALITY_FRAME_S = 0.05
QUALITY_SILENT_PEAK_DB = -50.0
QUALITY_CLIP_LEVEL = 0.999
QUALITY_CLIP_FRACTION = 0.001
QUALITY_BURST_DB = {"bed": 15.0, "texture": 24.0}
QUALITY_DROPOUT_DB = 30.0
QUALITY_DROPOUT_S = 0.5
QUALITY_PRESENCE_HZ = (2000.0, 5000.0)
QUALITY_SPECTRUM_FLOOR_HZ = 50.0
QUALITY_HARSH_FRACTION = 0.6
QUALITY_SEAM_WINDOW_S = 0.5
QUALITY_SEAM_LEVEL_DB = 6.0
QUALITY_SEAM_SPECTRUM_DB = 8.0
QUALITY_SEAM_NPERSEG = 512
QUALITY_SILENT_WEIGHT = 10.0

QUALITY_CHECKS = ("silent", "clipping", "burst", "dropout", "harsh", "seam")


def _mono(wav: np.ndarray) -> np.ndarray:
    return wav.mean(axis=0) if wav.ndim == 2 else wav


def _db(value: float) -> float:
    return 20.0 * np.log10(max(float(value), 1e-9))


def _rms(signal: np.ndarray) -> float:
    return float(np.sqrt(np.mean(signal ** 2))) if signal.size else 0.0


def _issue(check: str, value: float, limit: float) -> dict:
    return {"check": check, "value": round(float(value), 4), "limit": limit}


def frame_levels_db(mono: np.ndarray, sr: int) -> np.ndarray:
    size = max(1, int(QUALITY_FRAME_S * sr))
    count = mono.size // size
    if count == 0:
        return np.array([_db(_rms(mono))])
    frames = mono[: count * size].reshape(count, size)
    rms = np.sqrt(np.mean(frames ** 2, axis=1))
    return 20.0 * np.log10(np.maximum(rms, 1e-9))


def _longest_run(mask: np.ndarray) -> int:
    longest = current = 0
    for flagged in mask:
        current = current + 1 if flagged else 0
        longest = max(longest, current)
    return longest


def clipped_fraction(wav: np.ndarray) -> float:
    if wav.shape[-1] < 2:
        return 0.0
    hot = np.abs(wav) >= QUALITY_CLIP_LEVEL
    flat = hot[:, 1:] & hot[:, :-1] & (np.sign(wav[:, 1:]) == np.sign(wav[:, :-1]))
    return float(flat.sum() / wav.size)


def presence_fraction(mono: np.ndarray, sr: int) -> float:
    if mono.size < 2:
        return 0.0
    freqs, psd = welch(mono, sr, nperseg=min(2048, mono.size))
    audible = psd[freqs >= QUALITY_SPECTRUM_FLOOR_HZ].sum()
    if audible <= 0.0:
        return 0.0
    low, high = QUALITY_PRESENCE_HZ
    band = psd[(freqs >= low) & (freqs < high)].sum()
    return float(band / audible)


def _spectrum_shape_db(signal: np.ndarray, sr: int) -> np.ndarray:
    freqs, psd = welch(signal, sr, nperseg=min(QUALITY_SEAM_NPERSEG, signal.size))
    shape = 10.0 * np.log10(np.maximum(psd[freqs >= QUALITY_SPECTRUM_FLOOR_HZ], 1e-12))
    return shape - shape.mean()


def seam_steps(wav: np.ndarray, sr: int) -> tuple[float, float]:
    if wav.ndim == 1:
        wav = wav[np.newaxis, :]
    _, crossfade_s = loop_windows(wav.shape[-1] / sr)
    looped = _mono(make_loopable(wav, sr))

    window = int(QUALITY_SEAM_WINDOW_S * sr)
    settled = int(crossfade_s * sr)
    if window < 2 or settled + window > looped.size - window:
        return 0.0, 0.0

    before = looped[-window:]
    after = looped[settled : settled + window]

    level = abs(_db(_rms(after)) - _db(_rms(before)))
    spectrum = float(
        np.mean(np.abs(_spectrum_shape_db(after, sr) - _spectrum_shape_db(before, sr)))
    )
    return level, spectrum


def inspect_clip(
    wav: np.ndarray,
    sr: int,
    role: str = "texture",
    playback: str = "loop",
    looped: bool = False,
) -> list[dict]:
    if wav.ndim == 1:
        wav = wav[np.newaxis, :]
    wav = np.asarray(wav, dtype=np.float64)

    peak_db = _db(np.abs(wav).max()) if wav.size else _db(0.0)
    if peak_db < QUALITY_SILENT_PEAK_DB:
        return [_issue("silent", peak_db, QUALITY_SILENT_PEAK_DB)]

    issues = []
    clipped = clipped_fraction(wav)
    if clipped > QUALITY_CLIP_FRACTION:
        issues.append(_issue("clipping", clipped, QUALITY_CLIP_FRACTION))

    if playback == "oneshot":
        return issues

    mono = _mono(wav)
    levels = frame_levels_db(mono, sr)
    median = float(np.median(levels))

    burst_limit = QUALITY_BURST_DB.get(role, QUALITY_BURST_DB["texture"])
    burst = float(levels.max()) - median
    if burst > burst_limit:
        issues.append(_issue("burst", burst, burst_limit))

    if role == "bed":
        frame_s = max(1, int(QUALITY_FRAME_S * sr)) / sr
        gap = _longest_run(levels < median - QUALITY_DROPOUT_DB) * frame_s
        if gap > QUALITY_DROPOUT_S:
            issues.append(_issue("dropout", gap, QUALITY_DROPOUT_S))

    presence = presence_fraction(mono, sr)
    if presence > QUALITY_HARSH_FRACTION:
        issues.append(_issue("harsh", presence, QUALITY_HARSH_FRACTION))

    if not looped:
        level, spectrum = seam_steps(wav, sr)
        if level > QUALITY_SEAM_LEVEL_DB:
            issues.append(_issue("seam", level, QUALITY_SEAM_LEVEL_DB))
        elif spectrum > QUALITY_SEAM_SPECTRUM_DB:
            issues.append(_issue("seam", spectrum, QUALITY_SEAM_SPECTRUM_DB))

    return issues


def quality_score(issues: list[dict]) -> float:
    return sum(
        QUALITY_SILENT_WEIGHT if issue["check"] == "silent" else 1.0
        for issue in issues
    )
