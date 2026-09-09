import numpy as np
from scipy.signal import fftconvolve

PEAK_CEILING = 1.0

LOOP_CROSSFADE_S = 1.5
LOOP_SEARCH_WINDOW_S = 3.0
LOOP_CROSSFADE_FRACTION = 0.2
LOOP_SEARCH_FRACTION = 0.3


def loop_windows(
    total_s: float,
    search_window: float | None = None,
    crossfade_duration: float | None = None,
) -> tuple[float, float]:
    if search_window is None:
        search_window = min(LOOP_SEARCH_WINDOW_S, total_s * LOOP_SEARCH_FRACTION)
    if crossfade_duration is None:
        crossfade_duration = min(LOOP_CROSSFADE_S, total_s * LOOP_CROSSFADE_FRACTION)
    return search_window, crossfade_duration


def find_loop_point(
    wav: np.ndarray,
    sr: int,
    search_window: float | None = None,
    crossfade_duration: float | None = None,
) -> int:
    mono = wav.mean(axis=0) if wav.ndim == 2 else wav
    total = len(mono)

    search_window, crossfade_duration = loop_windows(
        total / sr, search_window, crossfade_duration
    )
    n_fade = int(crossfade_duration * sr)

    if total < n_fade * 3:
        return total - n_fade

    ref = mono[:n_fade]
    search_start = max(n_fade, total - int(search_window * sr) - n_fade)
    search_region = mono[search_start : total - n_fade]

    ref_norm = (ref - np.mean(ref)) / (np.std(ref) + 1e-6)
    search_norm = (search_region - np.mean(search_region)) / (np.std(search_region) + 1e-6)

    correlation = fftconvolve(search_norm, ref_norm[::-1], mode="valid")

    return search_start + int(np.argmax(correlation))


def _correlation(a: np.ndarray, b: np.ndarray) -> float:
    a = a.mean(axis=0) if a.ndim == 2 else a
    b = b.mean(axis=0) if b.ndim == 2 else b
    a = a - a.mean()
    b = b - b.mean()
    denom = np.sqrt(np.sum(a * a) * np.sum(b * b))
    if denom < 1e-12:
        return 0.0
    return float(np.clip(np.sum(a * b) / denom, 0.0, 1.0))


def limit_peak(wav: np.ndarray) -> np.ndarray:
    peak = float(np.abs(wav).max()) if wav.size else 0.0
    if peak > PEAK_CEILING:
        return wav * (PEAK_CEILING / peak)
    return wav


def make_loopable(
    wav: np.ndarray,
    sr: int,
    search_window: float | None = None,
    crossfade_duration: float | None = None,
) -> np.ndarray:
    if wav.ndim == 1:
        wav = wav[np.newaxis, :]

    channels, total = wav.shape

    search_window, crossfade_duration = loop_windows(
        total / sr, search_window, crossfade_duration
    )
    n_fade = int(crossfade_duration * sr)

    if total < n_fade * 3:
        t = np.linspace(0, np.pi / 2, min(n_fade, total))
        result = wav.copy()
        result[:, :len(t)] *= np.sin(t)
        result[:, -len(t):] *= np.cos(t)
        return limit_peak(result)

    loop_point = find_loop_point(wav, sr, search_window, crossfade_duration)

    t = np.linspace(0, np.pi / 2, n_fade)
    fade_in = np.sin(t)
    fade_out = np.cos(t)

    output = wav[:, :loop_point].copy()
    tail = wav[:, loop_point : loop_point + n_fade]

    rho = _correlation(output[:, :n_fade], tail)
    norm = 1.0 / np.sqrt(1.0 + 2.0 * rho * fade_in * fade_out)

    output[:, :n_fade] = ((output[:, :n_fade] * fade_in) + (tail * fade_out)) * norm

    return limit_peak(output)
