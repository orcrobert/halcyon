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

_FFT_S = 2048 / 48000
_HOP_DIVISOR = 4

_MIN_COACTIVE_FRAMES = 8
_NOISE_FLOOR_RATIO = 1e-4

_ROLE_PRIORITY_DB = {"texture": 6.0, "bed": 0.0, "event": -6.0}
_MUSIC_PRIORITY_DB = 2.0
_DEFAULT_ROLE = "texture"

_MASKER_PERCENTILE = 75
_TARGET_PERCENTILE = 50
_MASKER_INDEX_DB = -6.0
_SALIENT_DB = 20.0
_UNMASK_MARGIN_DB = 4.0
_MAX_DEFICIT_DB = 12.0
_MASKING_CAP_DB = 4.5
_MASKING_BUDGET_DB = 1.5
_MIN_CUT_DB = 0.5
_MASKING_Q_RANGE = (0.8, 2.5)
_BAND_NYQUIST_RATIO = 0.9

_MERGE_OCTAVE_RATIO = 1.26
_MERGE_FLOOR_DB = -9.0

_SHELF_Q = 0.7


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
_MASKER_INDEX = 10.0 ** (_MASKER_INDEX_DB / 10.0)


def _stft_power(mono: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray]:
    n_fft = int(round(_FFT_S * sr))
    if _LIBROSA and len(mono) >= n_fft:
        hop = n_fft // _HOP_DIVISOR
        S = np.abs(librosa.stft(mono, n_fft=n_fft, hop_length=hop, window="hann")) ** 2
        freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    else:
        n_fft = min(n_fft, len(mono))
        hop = max(1, n_fft // _HOP_DIVISOR)
        win = np.hanning(n_fft)
        n_frames = max(1, (len(mono) - n_fft) // hop + 1)
        frames = np.stack(
            [mono[i * hop: i * hop + n_fft] * win for i in range(n_frames)], axis=1
        )
        S = np.abs(np.fft.rfft(frames, n=n_fft, axis=0)) ** 2
        freqs = np.fft.rfftfreq(n_fft, d=1.0 / sr)
    return S / float(n_fft) ** 2, freqs


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


def _band(kind: str, freq: float, gain_db: float, q: float, source: str) -> dict:
    return {
        "type": kind,
        "freq": freq,
        "gain": round(float(gain_db), 1),
        "q": round(float(q), 2),
        "source": source,
    }


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
        bands.append(_band("lowshelf", 80, db, _SHELF_Q, "tone"))

    if air_e > air_thresh:
        db = -min(6.0, (air_e - air_thresh) * 25.0)
        bands.append(_band("highshelf", round(air_shelf), db, _SHELF_Q, "tone"))

    if low_e > _LOW_THRESH and centroid > _LOW_CENTROID_MIN:
        db = -min(4.0, (low_e - _LOW_THRESH) * 15.0)
        bands.append(_band("lowshelf", 200, db, _SHELF_Q, "tone"))

    if hi_mid_e > _HI_MID_THRESH and centroid > _HI_MID_CENTROID_MIN:
        db = -min(4.0, (hi_mid_e - _HI_MID_THRESH) * 12.0)
        bands.append(_band("peaking", 5000, db, 0.8, "tone"))

    return bands


def _role(element: dict) -> str:
    role = str(element.get("role") or "").strip().lower()
    if role in _ROLE_PRIORITY_DB:
        return role
    return "event" if element.get("playback") == "oneshot" else _DEFAULT_ROLE


def _priority(level_db: float, element: dict) -> float:
    bonus = _ROLE_PRIORITY_DB[_role(element)]
    if element.get("type") == "music":
        bonus += _MUSIC_PRIORITY_DB
    return level_db + bonus


def _coactive(
    target: np.ndarray, masker: np.ndarray
) -> tuple[np.ndarray, np.ndarray] | None:
    n_frames = min(target.shape[1], masker.shape[1])
    target = target[:, :n_frames]
    masker = masker[:, :n_frames]
    active = (
        (target.max(axis=0) > target.max() * _NOISE_FLOOR_RATIO)
        & (masker.max(axis=0) > masker.max() * _NOISE_FLOOR_RATIO)
    )
    if active.sum() < _MIN_COACTIVE_FRAMES:
        return None
    return target[:, active], masker[:, active]


def _required_cuts(
    target: np.ndarray, masker: np.ndarray, usable: np.ndarray
) -> np.ndarray:
    target_p = np.percentile(target, _TARGET_PERCENTILE, axis=1)
    masker_p = np.percentile(masker, _MASKER_PERCENTILE, axis=1)
    contribution = masker_p[:, None] * _SPREAD_GAIN * _MASKER_INDEX
    threshold = contribution.sum(axis=0)
    salient = target_p > target_p.max() * 10.0 ** (-_SALIENT_DB / 10.0)

    cuts = np.zeros(_N_BANDS)
    for b in np.flatnonzero(salient & usable):
        deficit = (
            10.0 * np.log10((threshold[b] + 1e-30) / (target_p[b] + 1e-30))
            + _UNMASK_MARGIN_DB
        )
        if deficit <= 0.0 or deficit > _MAX_DEFICIT_DB:
            continue
        source = int(np.argmax(contribution[:, b]))
        if usable[source]:
            cuts[source] = max(cuts[source], min(_MASKING_CAP_DB, deficit))
    return cuts


def _energy_loss_db(cuts: np.ndarray, power: np.ndarray) -> float:
    share = power / (power.sum() + 1e-30)
    kept = float((share * 10.0 ** (-cuts / 10.0)).sum())
    return -10.0 * np.log10(max(kept, 1e-30))


def _within_budget(cuts: np.ndarray, power: np.ndarray) -> np.ndarray:
    if _energy_loss_db(cuts, power) <= _MASKING_BUDGET_DB:
        return cuts
    low, high = 0.0, 1.0
    for _ in range(24):
        mid = (low + high) / 2.0
        if _energy_loss_db(cuts * mid, power) > _MASKING_BUDGET_DB:
            high = mid
        else:
            low = mid
    return cuts * low


def _cut_bands(cuts: np.ndarray) -> list[dict]:
    bands = []
    start = 0
    while start < _N_BANDS:
        if cuts[start] < _MIN_CUT_DB:
            start += 1
            continue
        end = start
        while end + 1 < _N_BANDS and cuts[end + 1] >= _MIN_CUT_DB:
            end += 1
        run = cuts[start:end + 1]
        freq = _erb_to_hz(float(np.average(_ERB_CENTERS[start:end + 1], weights=run)))
        width = _BAND_EDGES_HZ[end + 1] - _BAND_EDGES_HZ[start]
        q = float(np.clip(freq / width, *_MASKING_Q_RANGE))
        bands.append(_band("peaking", int(round(freq)), -float(run.max()), q, "masking"))
        start = end + 1
    return bands


def _masking_cuts(
    band_frames: list[np.ndarray],
    levels_db: list[float],
    nyquists: list[float],
    elements: list[dict],
) -> list[list[dict]]:
    n = len(band_frames)
    priorities = [_priority(level, el) for level, el in zip(levels_db, elements)]
    roles = [_role(el) for el in elements]
    cuts = [np.zeros(_N_BANDS) for _ in range(n)]

    for t in range(n):
        if roles[t] == "event":
            continue
        for m in range(n):
            if m == t:
                continue
            if roles[m] != "event" and priorities[m] >= priorities[t]:
                continue
            pair = _coactive(band_frames[t], band_frames[m])
            if pair is None:
                continue
            usable = _BAND_HZ < _BAND_NYQUIST_RATIO * min(nyquists[t], nyquists[m])
            cuts[m] = np.maximum(cuts[m], _required_cuts(*pair, usable))

    return [
        _cut_bands(_within_budget(c, frames.mean(axis=1)))
        for c, frames in zip(cuts, band_frames)
    ]


def _nearby(fa: float, fb: float) -> bool:
    hi, lo = max(fa, fb), min(fa, fb)
    return (hi / (lo + 1e-9)) < _MERGE_OCTAVE_RATIO


def _merge_bands(tonal: list[dict], masking: list[dict]) -> list[dict]:
    merged = [dict(b) for b in tonal]
    for b in masking:
        for existing in merged:
            if existing["type"] == b["type"] and _nearby(
                float(existing["freq"]), float(b["freq"])
            ):
                combined = existing["gain"] + b["gain"]
                existing["gain"] = round(max(combined, _MERGE_FLOOR_DB), 1)
                existing["source"] = "both"
                break
        else:
            merged.append(b)
    return merged


def auto_eq(
    wavs: list[np.ndarray],
    srs: list[int],
    elements: list[dict],
    gains: list[float] | None = None,
) -> list[list[dict]]:
    monos = [
        w.mean(axis=0).astype(np.float32) if w.ndim == 2 else w.astype(np.float32)
        for w in wavs
    ]
    element_types = [el.get("type", "sound") for el in elements]
    gains = list(gains) if gains is not None else [1.0] * len(wavs)

    stfts = [_stft_power(m, sr) for m, sr in zip(monos, srs)]
    band_frames = [
        _band_power_frames(S, freqs) * g ** 2 for (S, freqs), g in zip(stfts, gains)
    ]
    levels_db = [
        20.0 * np.log10(max(_a_weighted_rms(S, freqs) * g, 1e-12))
        for (S, freqs), g in zip(stfts, gains)
    ]

    tonal_bands = [_tonal_shape(S, freqs, t) for (S, freqs), t in zip(stfts, element_types)]
    masking_bands = _masking_cuts(
        band_frames, levels_db, [sr / 2.0 for sr in srs], elements
    )

    return [_merge_bands(t, m) for t, m in zip(tonal_bands, masking_bands)]
