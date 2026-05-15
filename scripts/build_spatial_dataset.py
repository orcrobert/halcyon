import argparse
import csv
import warnings
from pathlib import Path

import librosa
import numpy as np
import stempeg

warnings.filterwarnings("ignore")

STEM_NAMES = ["drums", "bass", "other", "vocals"]
STEM_INDICES = [1, 2, 3, 4]

FEATURE_NAMES = [
    "spectral_centroid",
    "spectral_bandwidth",
    "spectral_rolloff",
    "rms",
    "zcr",
    "onset_rate",
    *[f"mfcc_{i}" for i in range(13)],
]


def extract_features(stem_stereo: np.ndarray, sr: int) -> dict:
    mono = stem_stereo.mean(axis=1)

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

    return {
        "spectral_centroid": centroid,
        "spectral_bandwidth": bandwidth,
        "spectral_rolloff": rolloff,
        "rms": rms,
        "zcr": zcr,
        "onset_rate": onset_rate,
        **{f"mfcc_{i}": mfcc_means[i] for i in range(13)},
    }


def assign_pan(features: dict, stem_name: str) -> float:
    centroid = features["spectral_centroid"]
    bandwidth = features["spectral_bandwidth"]
    rms = features["rms"]
    zcr = features["zcr"]
    onset_rate = features["onset_rate"]
    mfcc_2 = features["mfcc_2"]

    side = 1.0 if mfcc_2 >= 0 else -1.0

    if centroid < 600:
        return float(np.clip(centroid / 6000.0, 0.0, 0.1) * side)

    if stem_name == "drums":
        bw_norm = np.clip(bandwidth / 4000.0, 0.0, 1.0)
        return float(np.clip(bw_norm * 0.20 * side, -0.25, 0.25))

    if stem_name == "bass":
        return float(np.clip((centroid - 600) / 80000.0, 0.0, 0.06) * side)

    if stem_name == "vocals":
        bw_norm = np.clip((bandwidth - 1500) / 3000.0, 0.0, 1.0)
        return float(np.clip(bw_norm * 0.18 * side, -0.2, 0.2))

    centroid_norm = np.clip((centroid - 600) / (9000 - 600), 0.0, 1.0)
    rms_norm = np.clip(rms / 0.12, 0.0, 1.0)
    zcr_norm = np.clip(zcr / 0.12, 0.0, 1.0)
    onset_norm = np.clip(onset_rate / 8.0, 0.0, 1.0)

    quiet_bonus = (1.0 - rms_norm) * 0.25
    bright_bonus = centroid_norm * 0.35
    tonal_pull = (1.0 - zcr_norm) * 0.12
    rhythmic_pull = onset_norm * 0.15

    reach = 0.25 + bright_bonus + quiet_bonus - tonal_pull - rhythmic_pull
    reach = float(np.clip(reach, 0.05, 0.80))

    return float(np.clip(reach * side, -1.0, 1.0))


def enforce_track_diversity(track_rows: list) -> list:
    result = [dict(r) for r in track_rows]
    free_stems = [r for r in result if r["stem"] not in ("bass", "vocals")]

    if len(free_stems) >= 2:
        pans = [r["pan"] for r in free_stems]
        if all(p >= 0 for p in pans) or all(p <= 0 for p in pans):
            flip_idx = int(np.argmin([abs(p) for p in pans]))
            free_stems[flip_idx]["pan"] *= -1

    return result


def process_track(path: Path, rows: list, min_rms: float = 1e-4) -> int:
    try:
        stems, sr = stempeg.read_stems(str(path))
    except Exception as e:
        print(f"  skip (read error): {e}")
        return 0

    track_rows = []
    for stem_idx, stem_name in zip(STEM_INDICES, STEM_NAMES):
        stem = stems[stem_idx]

        rms_val = float(np.sqrt(np.mean(stem ** 2)))
        if rms_val < min_rms:
            continue

        features = extract_features(stem, sr)
        pan = assign_pan(features, stem_name)

        row = {
            "track": path.stem,
            "stem": stem_name,
            "pan": round(pan, 6),
            **{k: round(features[k], 6) for k in FEATURE_NAMES},
        }
        track_rows.append(row)

    track_rows = enforce_track_diversity(track_rows)
    rows.extend(track_rows)
    return len(track_rows)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--musdb", default="/Users/robert/Datasets/MUSDB18")
    parser.add_argument("--out", default="data/spatial_dataset.csv")
    parser.add_argument("--splits", default="train,test")
    args = parser.parse_args()

    musdb_root = Path(args.musdb)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    splits = [s.strip() for s in args.splits.split(",")]
    tracks = []
    for split in splits:
        split_dir = musdb_root / split
        if not split_dir.exists():
            print(f"Warning: {split_dir} not found, skipping")
            continue
        tracks.extend(sorted(split_dir.glob("*.stem.mp4")))

    print(f"Found {len(tracks)} tracks across splits: {splits}")

    rows = []
    for i, track_path in enumerate(tracks):
        print(f"[{i+1}/{len(tracks)}] {track_path.stem}")
        n = process_track(track_path, rows)
        print(f"  → {n} stems added")

    if not rows:
        print("No data extracted.")
        return

    fieldnames = ["track", "stem", "pan"] + FEATURE_NAMES
    with open(out_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    pans = [r["pan"] for r in rows]
    print(f"\nDone. {len(rows)} samples → {out_path}")
    print(f"Pan — mean: {np.mean(pans):.3f}, std: {np.std(pans):.3f}, min: {np.min(pans):.3f}, max: {np.max(pans):.3f}")

    buckets = {"center (|pan|<0.1)": 0, "mid (0.1-0.4)": 0, "wide (>0.4)": 0}
    for p in pans:
        ap = abs(p)
        if ap < 0.1:
            buckets["center (|pan|<0.1)"] += 1
        elif ap < 0.4:
            buckets["mid (0.1-0.4)"] += 1
        else:
            buckets["wide (>0.4)"] += 1
    for label, count in buckets.items():
        print(f"  {label}: {count} ({100*count/len(pans):.1f}%)")


if __name__ == "__main__":
    main()
