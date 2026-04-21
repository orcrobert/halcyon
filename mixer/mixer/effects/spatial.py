from pathlib import Path
from typing import Optional

import numpy as np

try:
    import joblib
    _JOBLIB_AVAILABLE = True
except ImportError:
    _JOBLIB_AVAILABLE = False

try:
    import librosa
    _LIBROSA_AVAILABLE = True
except ImportError:
    _LIBROSA_AVAILABLE = False

_MODEL_DIR = Path(__file__).parent.parent.parent / "models"
_model = None
_scaler = None


def _load_model():
    global _model, _scaler
    if _model is not None:
        return True
    if not _JOBLIB_AVAILABLE:
        return False
    model_path = _MODEL_DIR / "spatial_model.pkl"
    scaler_path = _MODEL_DIR / "spatial_scaler.pkl"
    if not model_path.exists() or not scaler_path.exists():
        return False
    _model = joblib.load(model_path)
    _scaler = joblib.load(scaler_path)
    return True


def extract_features(wav: np.ndarray, sr: int) -> Optional[np.ndarray]:
    if not _LIBROSA_AVAILABLE:
        return None

    mono = wav.mean(axis=0) if wav.ndim == 2 else wav

    centroid = float(np.mean(librosa.feature.spectral_centroid(y=mono, sr=sr)))
    bandwidth = float(np.mean(librosa.feature.spectral_bandwidth(y=mono, sr=sr)))
    rolloff = float(np.mean(librosa.feature.spectral_rolloff(y=mono, sr=sr)))
    rms = float(np.mean(librosa.feature.rms(y=mono)))
    zcr = float(np.mean(librosa.feature.zero_crossing_rate(y=mono)))

    onset_frames = librosa.onset.onset_detect(y=mono, sr=sr)
    duration_s = len(mono) / sr
    onset_rate = float(len(onset_frames) / duration_s) if duration_s > 0 else 0.0

    mfccs = librosa.feature.mfcc(y=mono, sr=sr, n_mfcc=13)
    mfcc_means = mfccs.mean(axis=1).tolist()

    return np.array([centroid, bandwidth, rolloff, rms, zcr, onset_rate, *mfcc_means], dtype=np.float32)


def _rule_based_pan(wav: np.ndarray, sr: int) -> float:
    mono = wav.mean(axis=0) if wav.ndim == 2 else wav
    if not _LIBROSA_AVAILABLE:
        return 0.0
    centroid = float(np.mean(librosa.feature.spectral_centroid(y=mono, sr=sr)))
    rms = float(np.mean(librosa.feature.rms(y=mono)))
    if centroid < 600:
        return 0.0
    centroid_norm = np.clip((centroid - 500) / 7500, 0.0, 1.0)
    rms_norm = np.clip(rms / 0.15, 0.0, 1.0)
    reach = 0.35 + centroid_norm * 0.4 + (1 - rms_norm) * 0.2
    side = 1 if np.mean(mono[:100]) >= 0 else -1
    return float(np.clip(side * reach, -0.85, 0.85))


def predict_pan(wav: np.ndarray, sr: int) -> float:
    if _load_model():
        features = extract_features(wav, sr)
        if features is not None:
            scaled = _scaler.transform(features.reshape(1, -1))
            pan = float(_model.predict(scaled)[0])
            return float(np.clip(pan, -1.0, 1.0))
    return _rule_based_pan(wav, sr)


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
