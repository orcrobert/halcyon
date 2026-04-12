import numpy as np
from scipy.signal import fftconvolve


def find_loop_point(
    wav: np.ndarray,
    sr: int,
    search_window: float = 3.0,
    crossfade_duration: float = 1.5,
) -> int:
    n_fade = int(crossfade_duration * sr)

    mono = wav.mean(axis=0) if wav.ndim == 2 else wav
    total = len(mono)

    if total < n_fade * 3:
        return total - n_fade

    ref = mono[:n_fade]
    search_start = max(n_fade, total - int(search_window * sr) - n_fade)
    search_region = mono[search_start : total - n_fade]

    ref_norm = (ref - np.mean(ref)) / (np.std(ref) + 1e-6)
    search_norm = (search_region - np.mean(search_region)) / (np.std(search_region) + 1e-6)

    correlation = fftconvolve(search_norm, ref_norm[::-1], mode="valid")

    return search_start + int(np.argmax(correlation))


def make_loopable(
    wav: np.ndarray,
    sr: int,
    search_window: float = 3.0,
    crossfade_duration: float = 1.5,
) -> np.ndarray:
    n_fade = int(crossfade_duration * sr)

    if wav.ndim == 1:
        wav = wav[np.newaxis, :]

    channels, total = wav.shape

    if total < n_fade * 3:
        t = np.linspace(0, np.pi / 2, min(n_fade, total))
        result = wav.copy()
        result[:, :len(t)] *= np.sin(t)
        result[:, -len(t):] *= np.cos(t)
        return result

    loop_point = find_loop_point(wav, sr, search_window, crossfade_duration)

    t = np.linspace(0, np.pi / 2, n_fade)
    fade_in = np.sin(t)
    fade_out = np.cos(t)

    output = wav[:, :loop_point].copy()
    tail = wav[:, loop_point : loop_point + n_fade]

    output[:, :n_fade] = (output[:, :n_fade] * fade_in) + (tail * fade_out)

    return output
