from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import numpy as np

try:
    import librosa
    _LIBROSA_AVAILABLE = True
except ImportError:
    _LIBROSA_AVAILABLE = False


LF_CENTRE_CUTOFF_HZ = 250.0
LF_FULL_CENTRE_HZ = 120.0
CENTROID_REF_HZ = 500.0
CENTROID_SPAN_HZ = 4500.0
HF_BAND_LOW_HZ = 3000.0
MAX_PAN_MAGNITUDE = 0.85
MIN_PAN_SEPARATION = 0.25
LOUDNESS_DAMPING = 0.25

MAX_DEPTH = 0.8
DEPTH_LOUDNESS_WEIGHT = 0.7
DEPTH_HF_WEIGHT = 0.3
DEPTH_ONSET_PULL = 0.25


@dataclass
class _ElementFeatures:
    index: int
    centroid: float
    low_band_ratio: float
    high_band_ratio: float
    bandwidth: float
    loudness_rms: float
    onset_density: float
    reach: float


def _mono(wav: np.ndarray) -> np.ndarray:
    if wav.ndim == 2:
        return wav.mean(axis=0)
    return wav


def _band_ratios(mono: np.ndarray, sr: int) -> tuple[float, float]:
    if len(mono) < 64:
        return 0.0, 0.0
    n_fft = 2048 if len(mono) >= 2048 else int(2 ** np.floor(np.log2(len(mono))))
    spec = np.abs(librosa.stft(mono, n_fft=n_fft, hop_length=n_fft // 4)) ** 2
    power = spec.mean(axis=1)
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    total = float(power.sum()) + 1e-12
    low = float(power[freqs < LF_CENTRE_CUTOFF_HZ].sum()) / total
    high = float(power[freqs >= HF_BAND_LOW_HZ].sum()) / total
    return low, high


def _extract(wav: np.ndarray, sr: int, index: int) -> _ElementFeatures:
    mono = _mono(wav)
    centroid = float(np.mean(librosa.feature.spectral_centroid(y=mono, sr=sr)))
    bandwidth = float(np.mean(librosa.feature.spectral_bandwidth(y=mono, sr=sr)))
    loudness = float(np.sqrt(np.mean(mono ** 2)) + 1e-12)
    low_ratio, high_ratio = _band_ratios(mono, sr)

    duration_s = max(len(mono) / sr, 1e-6)
    onset_frames = librosa.onset.onset_detect(y=mono, sr=sr)
    onset_density = float(len(onset_frames) / duration_s)

    centre_pull = float(np.clip(
        (LF_CENTRE_CUTOFF_HZ - max(centroid, LF_FULL_CENTRE_HZ))
        / (LF_CENTRE_CUTOFF_HZ - LF_FULL_CENTRE_HZ),
        0.0, 1.0,
    ))
    centroid_term = float(np.clip((centroid - CENTROID_REF_HZ) / CENTROID_SPAN_HZ, 0.0, 1.0))
    bandwidth_term = float(np.clip(bandwidth / 4000.0, 0.0, 1.0))
    loudness_norm = float(np.clip(loudness / 0.15, 0.0, 1.0))

    reach = (0.35 + 0.40 * centroid_term + 0.15 * bandwidth_term) * (1.0 - LOUDNESS_DAMPING * loudness_norm)
    reach = max(0.0, reach * (1.0 - centre_pull) - 0.5 * low_ratio)
    reach = float(np.clip(reach, 0.0, MAX_PAN_MAGNITUDE))

    return _ElementFeatures(
        index=index,
        centroid=centroid,
        low_band_ratio=low_ratio,
        high_band_ratio=high_ratio,
        bandwidth=bandwidth,
        loudness_rms=loudness,
        onset_density=onset_density,
        reach=reach,
    )


def _compute_depths(feats: list[_ElementFeatures]) -> list[float]:
    if not feats:
        return []
    loudness_vals = np.array([f.loudness_rms for f in feats])
    hf_vals = np.array([f.high_band_ratio for f in feats])
    onset_vals = np.array([f.onset_density for f in feats])

    lo, hi = float(loudness_vals.min()), float(loudness_vals.max())
    loudness_score = (hi - loudness_vals) / (hi - lo + 1e-12)

    hf_lo, hf_hi = float(hf_vals.min()), float(hf_vals.max())
    hf_score = (hf_hi - hf_vals) / (hf_hi - hf_lo + 1e-12)

    onset_lo, onset_hi = float(onset_vals.min()), float(onset_vals.max())
    onset_score = (onset_vals - onset_lo) / (onset_hi - onset_lo + 1e-12)

    raw = DEPTH_LOUDNESS_WEIGHT * loudness_score + DEPTH_HF_WEIGHT * hf_score
    raw = raw - DEPTH_ONSET_PULL * onset_score
    raw = np.clip(raw, 0.0, 1.0) * MAX_DEPTH

    depths = [0.0] * len(feats)
    for f, d in zip(feats, raw):
        depths[f.index] = float(d)
    return depths


def _spectral_similarity(a: _ElementFeatures, b: _ElementFeatures) -> float:
    centroid_dist = abs(a.centroid - b.centroid) / (CENTROID_SPAN_HZ + 1e-6)
    bandwidth_dist = abs(a.bandwidth - b.bandwidth) / 4000.0
    raw = 1.0 - np.clip(0.7 * centroid_dist + 0.3 * bandwidth_dist, 0.0, 1.0)
    return float(raw)


def _assign_pans_from_features(feats: list[_ElementFeatures]) -> list[float]:
    order = sorted(feats, key=lambda f: f.reach)
    pans = [0.0] * len(feats)

    side = 1
    placed: list[_ElementFeatures] = []
    for f in order:
        if f.reach < 0.05:
            pans[f.index] = 0.0
            placed.append(f)
            continue

        best_side = side
        if placed:
            score_pos = sum(_spectral_similarity(f, p) * (pans[p.index] > 0) for p in placed)
            score_neg = sum(_spectral_similarity(f, p) * (pans[p.index] < 0) for p in placed)
            best_side = -1 if score_pos > score_neg else 1 if score_neg > score_pos else side

        candidate = best_side * f.reach
        for p in placed:
            if pans[p.index] == 0.0:
                continue
            if abs(candidate - pans[p.index]) < MIN_PAN_SEPARATION:
                if abs(candidate) < MAX_PAN_MAGNITUDE - MIN_PAN_SEPARATION:
                    candidate = pans[p.index] + np.sign(candidate - pans[p.index]) * MIN_PAN_SEPARATION
                candidate = float(np.clip(candidate, -MAX_PAN_MAGNITUDE, MAX_PAN_MAGNITUDE))

        pans[f.index] = float(candidate)
        placed.append(f)
        side = -side

    return pans


def assign_spatial(elements: Sequence[tuple[np.ndarray, int]]) -> list[tuple[float, float]]:
    if not _LIBROSA_AVAILABLE or len(elements) == 0:
        return [(0.0, 0.0)] * len(elements)
    feats = [_extract(wav, sr, i) for i, (wav, sr) in enumerate(elements)]
    pans = _assign_pans_from_features(feats)
    depths = _compute_depths(feats)
    return list(zip(pans, depths))


def assign_pans(elements: Sequence[tuple[np.ndarray, int]]) -> list[float]:
    return [pan for pan, _ in assign_spatial(elements)]


def predict_pan(wav: np.ndarray, sr: int) -> float:
    return 0.0


def apply_pan(wav: np.ndarray, pan: float) -> np.ndarray:
    pan = float(np.clip(pan, -1.0, 1.0))
    theta = (pan + 1.0) / 2.0 * (np.pi / 2.0)
    l_gain = np.cos(theta)
    r_gain = np.sin(theta)

    out = wav.copy().astype(np.float32)
    if out.ndim == 1:
        out = np.stack([out, out])
    elif out.shape[0] == 1:
        out = np.concatenate([out, out], axis=0)

    out[0] *= l_gain
    out[1] *= r_gain
    return out


def predict_and_apply(wav: np.ndarray, sr: int) -> tuple[np.ndarray, float]:
    pan = predict_pan(wav, sr)
    return apply_pan(wav, pan), pan
