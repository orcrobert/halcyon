import numpy as np

EVENT_SILENCE_DB = -45.0
EVENT_FADE_IN_S = 0.01
EVENT_FADE_OUT_S = 0.05
EVENT_MAX_S = 4.0
EVENT_MIN_S = 0.15
EVENT_OFFSET_DB = -6.0
EVENT_DEPTH = 0.35
EVENT_FALLBACK_ANCHOR_DB = -20.0
EVENT_VOLUME_RANGE = (0.15, 1.0)
EVENT_DEFAULT_INTERVAL_S = (8.0, 25.0)


def rms_db(wav: np.ndarray) -> float:
    mono = wav.mean(axis=0) if wav.ndim == 2 else wav
    rms = np.sqrt(np.mean(mono.astype(np.float64) ** 2))
    return 20.0 * np.log10(max(rms, 1e-9))


def trim_to_envelope(wav: np.ndarray, sr: int) -> np.ndarray:
    if wav.ndim == 1:
        wav = wav[np.newaxis, :]

    envelope = np.abs(wav).max(axis=0)
    peak = float(envelope.max()) if envelope.size else 0.0
    if peak <= 0.0:
        return wav[:, :0]

    above = np.flatnonzero(envelope >= peak * 10.0 ** (EVENT_SILENCE_DB / 20.0))
    if above.size == 0:
        return wav[:, :0]

    start = int(above[0])
    end = min(int(above[-1]) + 1, start + int(EVENT_MAX_S * sr))
    clip = np.array(wav[:, start:end], dtype=np.float64)

    n_in = min(int(EVENT_FADE_IN_S * sr), clip.shape[-1])
    if n_in > 0:
        clip[:, :n_in] *= np.linspace(0.0, 1.0, n_in)

    n_out = min(int(EVENT_FADE_OUT_S * sr), clip.shape[-1] - n_in)
    if n_out > 0:
        clip[:, -n_out:] *= np.linspace(1.0, 0.0, n_out)

    return clip


def place_events(
    event_wavs: list[np.ndarray], anchor_rms_db: float | None = None
) -> list[tuple[float, float, float]]:
    anchor = EVENT_FALLBACK_ANCHOR_DB if anchor_rms_db is None else anchor_rms_db
    target_db = anchor + EVENT_OFFSET_DB
    low, high = EVENT_VOLUME_RANGE

    placements = []
    for wav in event_wavs:
        gain = 10.0 ** ((target_db - rms_db(wav)) / 20.0)
        placements.append((round(float(np.clip(gain, low, high)), 3), 0.0, EVENT_DEPTH))
    return placements
