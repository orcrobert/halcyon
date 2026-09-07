import numpy as np

try:
    import librosa
    _LIBROSA = True
except ImportError:
    _LIBROSA = False

_N_BANDS = 24
_F_LOW = 80.0
_F_HIGH = 16000.0

# A-weighting pole frequencies (IEC 61672)
_AW_F1 = 20.6
_AW_F2 = 107.7
_AW_F3 = 737.9
_AW_F4 = 12200.0

# Offset term in Schroeder/Atal/Hall spreading function
_SPREAD_OFFSET = 0.474

# Tonal-shape thresholds (fraction of total spectral energy per band).
# Sound effects get more slack on sub and air — rumble and hiss are
# often the point. Music has to stay tighter.
_SUB_THRESH_SOUND = 0.25
_SUB_THRESH_MUSIC = 0.15
_AIR_THRESH_SOUND = 0.25
_AIR_THRESH_MUSIC = 0.18

# Boxy low-mid and harsh hi-mid only get cut on bright sources —
# i.e. when the centroid is well above the band being trimmed.
# Cutting low-mid on a tuba would just hollow it out.
_LOW_THRESH = 0.30
_HI_MID_THRESH = 0.35

_AIR_HZ = 8000.0
_AIR_SHELF_HZ = 10000.0
_HI_MID_HZ = 3000.0
_NYQUIST_HEADROOM = 0.75
_LOW_CENTROID_MIN = 1500.0
_HI_MID_CENTROID_MIN = 3000.0

# Masking window. Three zones for the maskee:
#   ratio <= 1     → already below threshold, leave it alone
#   1 < excess<=6  → audible but barely; trim it
#   excess > 6 dB  → it's actually doing something, don't touch
# Cap and scale keep cumulative damage in check across many pairs.
_MASKING_LOWER_RATIO = 1.0
_MASKING_UPPER_DB = 6.0
_MASKING_CAP_DB = 3.5
_MASKING_SCALE = 0.5

# Need real co-presence before claiming one element masks another.
# 8 frames at 512-hop ≈ 80 ms at 48 kHz, ~180 ms at 22 kHz — both fine.
_MIN_COACTIVE_FRAMES = 8
_NOISE_FLOOR_RATIO = 1e-4

# When tonal and masking stages both target nearby frequencies,
# merge instead of stacking. 1/3 octave is roughly "same target band"
# to the ear. Floor prevents two cuts from compounding into a hole.
_MERGE_OCTAVE_RATIO = 1.26
_MERGE_FLOOR_DB = -9.0

# Music usually carries the melodic foreground, so it wins ties when
# deciding masker vs maskee. Small bump — not a license to dominate.
_MUSIC_WEIGHT_BONUS = 1.3


def _hz_to_erb(f: float) -> float:
    return 21.366 * np.log10(1.0 + f * 4.37e-3)


def _erb_to_hz(e: float) -> float:
    return (10.0 ** (e / 21.366) - 1.0) / 4.37e-3


_ERB_LOW = _hz_to_erb(_F_LOW)
_ERB_HIGH = _hz_to_erb(_F_HIGH)
_ERB_CENTERS = np.linspace(_ERB_LOW, _ERB_HIGH, _N_BANDS)
_BAND_HZ = np.array([_erb_to_hz(e) for e in _ERB_CENTERS])

_BAND_EDGES_ERB = np.concatenate([
    [_ERB_CENTERS[0] - (_ERB_CENTERS[1] - _ERB_CENTERS[0]) / 2],
    (_ERB_CENTERS[:-1] + _ERB_CENTERS[1:]) / 2,
    [_ERB_CENTERS[-1] + (_ERB_CENTERS[-1] - _ERB_CENTERS[-2]) / 2],
])
_BAND_EDGES_HZ = np.array([_erb_to_hz(e) for e in _BAND_EDGES_ERB])

_dz = _ERB_CENTERS[None, :] - _ERB_CENTERS[:, None]
_x = _dz + _SPREAD_OFFSET
_SF_DB = 15.81 + 7.5 * _x - 17.5 * np.sqrt(1.0 + _x ** 2)
_SPREAD_GAIN = 10.0 ** (_SF_DB / 10.0)


def _stft_power(mono: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray]:
    if _LIBROSA:
        S = np.abs(librosa.stft(mono, n_fft=2048, hop_length=512, window="hann")) ** 2
        freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    else:
        n_fft = min(2048, len(mono))
        hop = n_fft // 4
        win = np.hanning(n_fft)
        n_frames = max(1, (len(mono) - n_fft) // hop + 1)
        frames = np.stack(
            [mono[i * hop: i * hop + n_fft] * win for i in range(n_frames)], axis=1
        )
        S = np.abs(np.fft.rfft(frames, n=n_fft, axis=0)) ** 2
        freqs = np.fft.rfftfreq(n_fft, d=1.0 / sr)
    return S, freqs


def _band_power_frames(S: np.ndarray, freqs: np.ndarray) -> np.ndarray:
    out = np.zeros((_N_BANDS, S.shape[1]), dtype=np.float64)
    for b in range(_N_BANDS):
        lo = _BAND_EDGES_HZ[b]
        hi = _BAND_EDGES_HZ[b + 1]
        mask = (freqs >= lo) & (freqs < hi)
        if mask.any():
            out[b] = S[mask].sum(axis=0)
    return out


def _a_weighted_rms(S: np.ndarray, freqs: np.ndarray) -> float:
    f2 = freqs ** 2
    f4 = f2 ** 2
    num = (_AW_F4 ** 2) * f4
    den = (
        (f2 + _AW_F1 ** 2)
        * np.sqrt((f2 + _AW_F2 ** 2) * (f2 + _AW_F3 ** 2))
        * (f2 + _AW_F4 ** 2)
    )
    Ra = num / (den + 1e-30)
    weighted = (S * Ra[:, None]).sum(axis=0)
    return float(np.sqrt(np.mean(weighted) + 1e-30))


def _tonal_shape(S: np.ndarray, freqs: np.ndarray, element_type: str) -> list[dict]:
    spec_75 = np.percentile(S, 75, axis=1)
    total = spec_75.sum() + 1e-9

    nyquist = float(freqs[-1]) if freqs.size else _AIR_HZ
    air_start = min(_AIR_HZ, nyquist * _NYQUIST_HEADROOM)
    air_shelf = min(_AIR_SHELF_HZ, nyquist * _NYQUIST_HEADROOM)

    sub_mask    = freqs < 80
    low_mask    = (freqs >= 80) & (freqs < 300)
    air_mask    = freqs >= air_start
    hi_mid_mask = (freqs >= _HI_MID_HZ) & (freqs < air_start)

    sub_e    = float(spec_75[sub_mask].sum()    / total) if sub_mask.any()    else 0.0
    low_e    = float(spec_75[low_mask].sum()    / total) if low_mask.any()    else 0.0
    air_e    = float(spec_75[air_mask].sum()    / total) if air_mask.any()    else 0.0
    hi_mid_e = float(spec_75[hi_mid_mask].sum() / total) if hi_mid_mask.any() else 0.0

    centroid = float((freqs * spec_75).sum() / total)

    is_sound   = (element_type != "music")
    sub_thresh = _SUB_THRESH_SOUND if is_sound else _SUB_THRESH_MUSIC
    air_thresh = _AIR_THRESH_SOUND if is_sound else _AIR_THRESH_MUSIC

    bands = []

    if sub_e > sub_thresh:
        db = -min(6.0, (sub_e - sub_thresh) * 30.0)
        bands.append({"type": "lowshelf", "freq": 80, "gain": round(db, 1)})

    if air_e > air_thresh:
        db = -min(6.0, (air_e - air_thresh) * 25.0)
        bands.append(
            {"type": "highshelf", "freq": round(air_shelf), "gain": round(db, 1)}
        )

    if low_e > _LOW_THRESH and centroid > _LOW_CENTROID_MIN:
        db = -min(4.0, (low_e - _LOW_THRESH) * 15.0)
        bands.append({"type": "lowshelf", "freq": 200, "gain": round(db, 1)})

    if hi_mid_e > _HI_MID_THRESH and centroid > _HI_MID_CENTROID_MIN:
        db = -min(4.0, (hi_mid_e - _HI_MID_THRESH) * 12.0)
        bands.append({"type": "peaking", "freq": 5000, "gain": round(db, 1), "q": 0.8})

    return bands


def _masking_cuts(
    band_frames: list[np.ndarray],
    weights: list[float],
) -> list[list[dict]]:
    n = len(band_frames)
    cuts: list[dict[int, float]] = [{} for _ in range(n)]

    for i in range(n):
        for j in range(i + 1, n):
            noise_floor_i = band_frames[i].max() * _NOISE_FLOOR_RATIO
            noise_floor_j = band_frames[j].max() * _NOISE_FLOOR_RATIO
            n_frames = min(band_frames[i].shape[1], band_frames[j].shape[1])
            active_i  = band_frames[i][:, :n_frames].max(axis=0) > noise_floor_i
            active_j  = band_frames[j][:, :n_frames].max(axis=0) > noise_floor_j
            co_active = active_i & active_j

            if co_active.sum() < _MIN_COACTIVE_FRAMES:
                continue

            fi_co = band_frames[i][:, :n_frames][:, co_active]
            fj_co = band_frames[j][:, :n_frames][:, co_active]
            pi = np.percentile(fi_co, 75, axis=1)
            pj = np.percentile(fj_co, 75, axis=1)

            masker_idx = i if weights[i] >= weights[j] else j
            maskee_idx = j if masker_idx == i else i
            masker_p   = pi if masker_idx == i else pj
            maskee_p   = pj if masker_idx == i else pi

            thresholds        = masker_p[:, None] * _SPREAD_GAIN
            combined_threshold = thresholds.max(axis=0)

            for b in range(_N_BANDS):
                if combined_threshold[b] < 1e-30:
                    continue
                ratio = maskee_p[b] / (combined_threshold[b] + 1e-30)
                if ratio <= _MASKING_LOWER_RATIO:
                    continue
                excess_db = 10.0 * np.log10(ratio)
                if excess_db > _MASKING_UPPER_DB:
                    continue

                db = -min(_MASKING_CAP_DB, excess_db * _MASKING_SCALE)
                fc_key = int(round(float(_BAND_HZ[b])))
                if fc_key not in cuts[maskee_idx] or cuts[maskee_idx][fc_key] > db:
                    cuts[maskee_idx][fc_key] = db

    result = []
    for i in range(n):
        bands = []
        for fc_key, db in cuts[i].items():
            if abs(db) < 0.5:
                continue
            fc = float(fc_key)
            if fc < 300:
                bands.append({"type": "lowshelf", "freq": fc_key, "gain": round(db, 1)})
            elif fc > 6000:
                bands.append({"type": "highshelf", "freq": fc_key, "gain": round(db, 1)})
            else:
                bands.append({"type": "peaking", "freq": fc_key, "gain": round(db, 1), "q": 1.2})
        result.append(bands)

    return result


def _nearby(fa: float, fb: float) -> bool:
    hi, lo = max(fa, fb), min(fa, fb)
    return (hi / (lo + 1e-9)) < _MERGE_OCTAVE_RATIO


def _merge_bands(tonal: list[dict], masking: list[dict]) -> list[dict]:
    merged = list(tonal)
    for b in masking:
        matched = False
        for existing in merged:
            if _nearby(float(existing["freq"]), float(b["freq"])):
                combined = existing["gain"] + b["gain"]
                existing["gain"] = round(max(combined, _MERGE_FLOOR_DB), 1)
                matched = True
                break
        if not matched:
            merged.append(b)
    return merged


def auto_eq(wavs: list[np.ndarray], srs: list[int], elements: list[dict]) -> list[list[dict]]:
    monos = [
        w.mean(axis=0).astype(np.float32) if w.ndim == 2 else w.astype(np.float32)
        for w in wavs
    ]
    element_types = [el.get("type", "sound") for el in elements]

    stfts       = [_stft_power(m, sr) for m, sr in zip(monos, srs)]
    band_frames = [_band_power_frames(S, freqs) for S, freqs in stfts]

    weights = [_a_weighted_rms(S, freqs) for S, freqs in stfts]
    weights = [
        w * _MUSIC_WEIGHT_BONUS if t == "music" else w
        for w, t in zip(weights, element_types)
    ]

    tonal_bands   = [_tonal_shape(S, freqs, t) for (S, freqs), t in zip(stfts, element_types)]
    masking_bands = _masking_cuts(band_frames, weights)

    return [_merge_bands(t, m) for t, m in zip(tonal_bands, masking_bands)]
