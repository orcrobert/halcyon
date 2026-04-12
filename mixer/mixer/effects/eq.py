import numpy as np
from scipy.signal import sosfilt, iirpeak, iirnotch
from scipy.signal import butter


def _shelf(freq: float, gain_db: float, shelf_type: str, sr: int) -> np.ndarray:
    """Low or high shelf filter as second-order sections."""
    nyq = sr / 2.0
    w0 = freq / nyq
    w0 = np.clip(w0, 1e-4, 1 - 1e-4)
    A = 10 ** (gain_db / 40.0)

    if shelf_type == "low":
        b, a = _low_shelf_coeffs(w0, A)
    else:
        b, a = _high_shelf_coeffs(w0, A)

    return np.array([[b[0], b[1], b[2], 1.0, a[1], a[2]]])


def _low_shelf_coeffs(w0: float, A: float):
    cos_w = np.cos(np.pi * w0)
    alpha = np.sin(np.pi * w0) / 2 * np.sqrt((A + 1 / A) * (1 / 0.707 - 1) + 2)

    b0 = A * ((A + 1) - (A - 1) * cos_w + 2 * np.sqrt(A) * alpha)
    b1 = 2 * A * ((A - 1) - (A + 1) * cos_w)
    b2 = A * ((A + 1) - (A - 1) * cos_w - 2 * np.sqrt(A) * alpha)
    a0 = (A + 1) + (A - 1) * cos_w + 2 * np.sqrt(A) * alpha
    a1 = -2 * ((A - 1) + (A + 1) * cos_w)
    a2 = (A + 1) + (A - 1) * cos_w - 2 * np.sqrt(A) * alpha

    return [b0 / a0, b1 / a0, b2 / a0], [1.0, a1 / a0, a2 / a0]


def _high_shelf_coeffs(w0: float, A: float):
    cos_w = np.cos(np.pi * w0)
    alpha = np.sin(np.pi * w0) / 2 * np.sqrt((A + 1 / A) * (1 / 0.707 - 1) + 2)

    b0 = A * ((A + 1) + (A - 1) * cos_w + 2 * np.sqrt(A) * alpha)
    b1 = -2 * A * ((A - 1) + (A + 1) * cos_w)
    b2 = A * ((A + 1) + (A - 1) * cos_w - 2 * np.sqrt(A) * alpha)
    a0 = (A + 1) - (A - 1) * cos_w + 2 * np.sqrt(A) * alpha
    a1 = 2 * ((A - 1) - (A + 1) * cos_w)
    a2 = (A + 1) - (A - 1) * cos_w - 2 * np.sqrt(A) * alpha

    return [b0 / a0, b1 / a0, b2 / a0], [1.0, a1 / a0, a2 / a0]


def _peak(freq: float, gain_db: float, q: float, sr: int) -> np.ndarray:
    """Peaking EQ band as second-order sections."""
    nyq = sr / 2.0
    w0 = freq / nyq
    w0 = np.clip(w0, 1e-4, 1 - 1e-4)

    if gain_db >= 0:
        b, a = iirpeak(w0, q)
        A = 10 ** (gain_db / 20.0)
        b = b * A
    else:
        b, a = iirnotch(w0, q)
        A = 10 ** (-gain_db / 20.0)
        b = b / A

    return np.array([[b[0], b[1], b[2], 1.0, a[1], a[2]]])


def apply_eq(wav: np.ndarray, sr: int, bands: list[dict]) -> np.ndarray:
    if not bands:
        return wav

    sos_sections = []
    for band in bands:
        gain_db = band.get("gain_db", 0.0)
        if abs(gain_db) < 0.1:
            continue

        btype = band["type"]
        freq = float(band["freq"])

        if btype == "low_shelf":
            sos_sections.append(_shelf(freq, gain_db, "low", sr))
        elif btype == "high_shelf":
            sos_sections.append(_shelf(freq, gain_db, "high", sr))
        elif btype == "peak":
            q = float(band.get("q", 1.4))
            sos_sections.append(_peak(freq, gain_db, q, sr))

    if not sos_sections:
        return wav

    sos = np.vstack(sos_sections)
    return np.stack([sosfilt(sos, ch) for ch in wav])
