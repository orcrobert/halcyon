import numpy as np

try:
    import librosa
    _LIBROSA = True
except ImportError:
    _LIBROSA = False


PERCEPTUAL_DB_PER_UNIT = 6.0
MAX_PERCEPTUAL_OFFSET_DB = 18.0
OVERLAP_THRESHOLD = 0.2
OVERLAP_PAIR_DB = 3.0
OVERLAP_SHARE_SPAN_DB = 6.0
MAX_OVERLAP_PENALTY_DB = 6.0
MIN_GAIN = 0.15
LOW_MID_BOUNDARY_HZ = 300.0
MID_HIGH_BOUNDARY_HZ = 3000.0
BAND_TRANSITION_OCTAVES = 2.0
ENVELOPE_FRAME_S = 0.05
ONSET_MIN_RANGE_DB = 3.0
ONSET_FULL_RANGE_DB = 9.0


def _loudness_db(wav: np.ndarray) -> float:
    mono = wav.mean(axis=0) if wav.ndim == 2 else wav
    rms = np.sqrt(np.mean(mono.astype(np.float64) ** 2))
    return 20.0 * np.log10(max(rms, 1e-9))


def _extract_features(wav: np.ndarray, sr: int) -> dict:
    mono = wav.mean(axis=0) if wav.ndim == 2 else wav
    mono_f32 = mono.astype(np.float32)

    loudness_db = _loudness_db(wav)

    if _LIBROSA:
        S = np.abs(librosa.stft(mono_f32))
        freqs = librosa.fft_frequencies(sr=sr)
        centroid = float(np.mean(librosa.feature.spectral_centroid(y=mono_f32, sr=sr)))
        bandwidth = float(np.mean(librosa.feature.spectral_bandwidth(y=mono_f32, sr=sr)))
        onset_frames = librosa.onset.onset_detect(y=mono_f32, sr=sr)
        onset_density = float(len(onset_frames) / max(len(mono) / sr, 1e-3))
        frame = max(1, int(ENVELOPE_FRAME_S * sr))
        count = len(mono) // frame
        if count:
            rms = np.sqrt(np.mean(mono[:count * frame].reshape(count, frame) ** 2, axis=1))
            levels = 20.0 * np.log10(np.maximum(rms, 1e-9))
            dynamic_range = float(np.percentile(levels, 95) - np.percentile(levels, 5))
            onset_density *= float(np.clip(
                (dynamic_range - ONSET_MIN_RANGE_DB)
                / (ONSET_FULL_RANGE_DB - ONSET_MIN_RANGE_DB),
                0.0, 1.0,
            ))
    else:
        n_fft = min(2048, len(mono))
        hop = n_fft // 4
        frames = [
            np.abs(np.fft.rfft(mono[s:s+n_fft] * np.hanning(n_fft)))
            for s in range(0, len(mono) - n_fft + 1, hop)
        ] or [np.abs(np.fft.rfft(mono, n=n_fft))]
        S = np.array(frames).T
        freqs = np.fft.rfftfreq(n_fft, d=1.0 / sr)
        spec = S.mean(axis=1)
        total = np.sum(spec) + 1e-9
        centroid = float(np.sum(freqs * spec) / total)
        bandwidth = float(np.sqrt(np.sum(((freqs - centroid) ** 2) * spec) / total))
        onset_density = 0.0

    spec = S.mean(axis=1)
    total = np.sum(spec) + 1e-9
    low_share = np.clip(
        0.5 - np.log2(np.maximum(freqs, 1.0) / LOW_MID_BOUNDARY_HZ)
        / BAND_TRANSITION_OCTAVES, 0.0, 1.0,
    )
    high_share = np.clip(
        0.5 + np.log2(np.maximum(freqs, 1.0) / MID_HIGH_BOUNDARY_HZ)
        / BAND_TRANSITION_OCTAVES, 0.0, 1.0,
    )
    low_energy = float(np.sum(spec * low_share) / total)
    mid_energy = float(np.sum(spec * (1.0 - low_share - high_share)) / total)
    high_energy = float(np.sum(spec * high_share) / total)

    return {
        "loudness_db": loudness_db,
        "centroid": centroid,
        "bandwidth": bandwidth,
        "low_energy": low_energy,
        "mid_energy": mid_energy,
        "high_energy": high_energy,
        "onset_density": onset_density,
    }


def _spectral_overlap(f1: dict, f2: dict) -> float:
    c1, bw1 = f1["centroid"], max(f1["bandwidth"], 200)
    c2, bw2 = f2["centroid"], max(f2["bandwidth"], 200)
    overlap_start = max(c1 - bw1, c2 - bw2)
    overlap_end   = min(c1 + bw1, c2 + bw2)
    if overlap_end <= overlap_start:
        return 0.0
    return float(np.clip((overlap_end - overlap_start) / min(2 * bw1, 2 * bw2), 0.0, 1.0))


def _perceptual_weight(feat: dict, element_type: str) -> float:
    mid_weight   = feat["mid_energy"] * 2.0
    onset_weight = np.log1p(feat["onset_density"]) * 0.4
    bw_weight    = np.clip(feat["bandwidth"] / 8000.0, 0.0, 1.0) * 0.5
    type_weight  = 0.3 if element_type == "music" else 0.0
    return float(mid_weight + onset_weight + bw_weight + type_weight)


def assign_volumes(elements: list[dict], wavs: list[np.ndarray], srs: list[int] | None = None) -> list[float]:
    if not elements:
        return []

    if srs is None:
        srs = [44100] * len(elements)

    features = [_extract_features(w, sr) for w, sr in zip(wavs, srs)]
    types = [el.get("type", "sound") for el in elements]

    weights = np.array([_perceptual_weight(f, t) for f, t in zip(features, types)])

    raw_db = np.array([f["loudness_db"] for f in features])
    desired_offset_db = np.maximum(
        (weights - weights.max()) * PERCEPTUAL_DB_PER_UNIT,
        -MAX_PERCEPTUAL_OFFSET_DB,
    )
    importance = np.power(10.0, desired_offset_db / 10.0)
    anchor_raw_db = 10.0 * np.log10(
        np.average(np.power(10.0, raw_db / 10.0), weights=importance)
    )
    desired_db = anchor_raw_db + desired_offset_db

    penalty_db = np.zeros(len(elements))
    for i in range(len(elements)):
        for j in range(i + 1, len(elements)):
            overlap = _spectral_overlap(features[i], features[j])
            if overlap <= OVERLAP_THRESHOLD:
                continue
            db_penalty = (
                (overlap - OVERLAP_THRESHOLD) / (1.0 - OVERLAP_THRESHOLD)
                * OVERLAP_PAIR_DB
            )
            share = float(np.clip(
                0.5 + (raw_db[i] - raw_db[j]) / (2.0 * OVERLAP_SHARE_SPAN_DB),
                0.0, 1.0,
            ))
            penalty_db[i] += db_penalty * share
            penalty_db[j] += db_penalty * (1.0 - share)

    desired_db -= np.minimum(penalty_db, MAX_OVERLAP_PENALTY_DB)

    gain_db = np.minimum(desired_db - raw_db, 0.0)
    gains = np.power(10.0, gain_db / 20.0)
    gains = np.clip(gains, MIN_GAIN, 1.0)

    return [round(float(g), 3) for g in gains]
