from __future__ import annotations

import sys
from pathlib import Path

import librosa
import numpy as np
import pandas as pd
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
CLIPS_DIR = ROOT / "data" / "processed" / "clips"
INDEX_PATH = ROOT / "data" / "processed" / "clips_index.parquet"
OUT_PATH = ROOT / "data" / "processed" / "features.parquet"

EPS = 1e-9


def band_fraction(power: np.ndarray, freqs: np.ndarray, lo: float, hi: float) -> float:
    mask = (freqs >= lo) & (freqs < hi)
    total = float(power.sum()) + EPS
    return float(power[mask].sum() / total)


def extract(stereo: np.ndarray, sr: int) -> dict:
    mono = stereo.mean(axis=1)
    rms = float(np.sqrt(np.mean(mono ** 2)) + EPS)
    loudness_db = 20.0 * np.log10(rms)

    centroid = float(np.mean(librosa.feature.spectral_centroid(y=mono, sr=sr)))
    bandwidth = float(np.mean(librosa.feature.spectral_bandwidth(y=mono, sr=sr)))
    rolloff_85 = float(np.mean(librosa.feature.spectral_rolloff(y=mono, sr=sr, roll_percent=0.85)))
    flatness = float(np.mean(librosa.feature.spectral_flatness(y=mono)))
    zcr = float(np.mean(librosa.feature.zero_crossing_rate(y=mono)))

    stft = np.abs(librosa.stft(mono, n_fft=2048, hop_length=512)) ** 2
    power = stft.mean(axis=1)
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    low_energy = band_fraction(power, freqs, 0.0, 300.0)
    mid_energy = band_fraction(power, freqs, 300.0, 3000.0)
    high_energy = band_fraction(power, freqs, 3000.0, sr / 2)

    duration = len(mono) / sr
    onset_frames = librosa.onset.onset_detect(y=mono, sr=sr)
    onset_density = float(len(onset_frames) / duration) if duration > 0 else 0.0

    rms_l = float(np.sqrt(np.mean(stereo[:, 0] ** 2)) + EPS)
    rms_r = float(np.sqrt(np.mean(stereo[:, 1] ** 2)) + EPS)
    pan_from_audio = (rms_r - rms_l) / (rms_r + rms_l)

    return {
        "loudness_db": loudness_db,
        "centroid": centroid,
        "bandwidth": bandwidth,
        "rolloff_85": rolloff_85,
        "flatness": flatness,
        "zcr": zcr,
        "low_energy": low_energy,
        "mid_energy": mid_energy,
        "high_energy": high_energy,
        "onset_density": onset_density,
        "pan_from_audio": pan_from_audio,
    }


def main() -> int:
    if not INDEX_PATH.exists():
        print(f"missing {INDEX_PATH}", file=sys.stderr)
        return 1

    index = pd.read_parquet(INDEX_PATH)
    rows = []
    failed = 0

    for i, row in enumerate(index.itertuples(index=False)):
        wav_path = CLIPS_DIR / f"{row.event_id}.wav"
        if not wav_path.exists():
            failed += 1
            continue
        try:
            audio, sr = sf.read(wav_path, always_2d=True)
            features = extract(audio.astype(np.float32), sr)
        except Exception as exc:
            print(f"  failed {row.event_id}: {exc}", file=sys.stderr)
            failed += 1
            continue

        rows.append(
            {
                "event_id": row.event_id,
                "recording_id": row.recording_id,
                "split": row.split,
                "class_index": row.class_index,
                "duration_s": row.duration_s,
                "pan": row.pan,
                **features,
            }
        )

        if (i + 1) % 500 == 0:
            print(f"  {i + 1}/{len(index)} processed")

    df = pd.DataFrame(rows)
    df.to_parquet(OUT_PATH, index=False)

    corr = float(np.corrcoef(df["pan"], df["pan_from_audio"])[0, 1])
    sign_match = float(
        ((np.sign(df["pan"]) == np.sign(df["pan_from_audio"])) | (df["pan"].abs() < 0.05)).mean()
    )
    print(f"wrote {len(df)} rows (failed {failed}) -> {OUT_PATH}")
    print(f"pan vs pan_from_audio Pearson r = {corr:.4f}")
    print(f"pan vs pan_from_audio sign agreement = {sign_match * 100:.1f}%")
    if corr < 0.4 or sign_match < 0.7:
        print("WARN: FOA decode looks wrong (low correlation or sign mismatch)", file=sys.stderr)
    else:
        print("OK: FOA decode sanity check passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
