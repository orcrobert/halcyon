import numpy as np

try:
    import librosa
    _LIBROSA = True
except ImportError:
    _LIBROSA = False


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
    low_energy  = float(np.sum(spec[freqs < 300])  / total)
    mid_energy  = float(np.sum(spec[(freqs >= 300) & (freqs < 3000)]) / total)
    high_energy = float(np.sum(spec[freqs >= 3000]) / total)

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

    w_min, w_max = weights.min(), weights.max()
    if w_max - w_min < 1e-6:
        weights_norm = np.full(len(weights), 0.5)
    else:
        weights_norm = (weights - w_min) / (w_max - w_min)

    raw_db = np.array([f["loudness_db"] for f in features])

    anchor_idx = int(np.argmax(weights))
    anchor_raw_db = raw_db[anchor_idx]

    DB_RANGE = 18.0
    desired_offset_db = (weights_norm - 1.0) * DB_RANGE
    desired_db = anchor_raw_db + desired_offset_db

    penalty_db = np.zeros(len(elements))
    for i in range(len(elements)):
        for j in range(i + 1, len(elements)):
            overlap = _spectral_overlap(features[i], features[j])
            if overlap <= 0.2:
                continue
            db_penalty = overlap * 3.0
            if raw_db[i] >= raw_db[j]:
                penalty_db[i] += db_penalty
            else:
                penalty_db[j] += db_penalty

    desired_db -= penalty_db

    gain_db = np.minimum(desired_db - raw_db, 0.0)
    gains = np.power(10.0, gain_db / 20.0)
    gains = np.clip(gains, 0.15, 1.0)

    return [round(float(g), 3) for g in gains]
