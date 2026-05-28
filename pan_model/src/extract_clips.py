from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
FOA_DIR = ROOT / "data" / "starss23" / "foa_dev"
EVENTS_PATH = ROOT / "data" / "processed" / "events.parquet"
CLIPS_DIR = ROOT / "data" / "processed" / "clips"
INDEX_PATH = ROOT / "data" / "processed" / "clips_index.parquet"

FRAME_HOP_S = 0.1
SAMPLE_RATE = 24000
MAX_ABS_AZIMUTH_DEG = 75.0


def foa_to_stereo(foa: np.ndarray) -> np.ndarray:
    w = foa[:, 0]
    y = foa[:, 1]
    left = 0.5 * (w + y)
    right = 0.5 * (w - y)
    return np.stack([left, right], axis=1)


def main() -> int:
    if not EVENTS_PATH.exists():
        print(f"missing {EVENTS_PATH}; run parse_metadata.py first", file=sys.stderr)
        return 1

    events = pd.read_parquet(EVENTS_PATH)
    pre = len(events)
    events = events[events["mean_azimuth"].abs() <= MAX_ABS_AZIMUTH_DEG]
    events = events.sort_values(["recording_id", "start_frame"]).reset_index(drop=True)
    print(f"events filtered by |azimuth| <= {MAX_ABS_AZIMUTH_DEG}: {pre} -> {len(events)}")

    CLIPS_DIR.mkdir(parents=True, exist_ok=True)

    rows = []
    cache_id: str | None = None
    cache_audio: np.ndarray | None = None
    cache_sr: int = SAMPLE_RATE
    skipped = 0

    for i, ev in enumerate(events.itertuples(index=False)):
        if ev.recording_id != cache_id:
            wav_path = FOA_DIR / ev.split / f"{ev.recording_id}.wav"
            if not wav_path.exists():
                skipped += 1
                continue
            cache_audio, cache_sr = sf.read(wav_path, always_2d=True)
            cache_id = ev.recording_id

        start = int(round(ev.start_frame * FRAME_HOP_S * cache_sr))
        end = int(round((ev.end_frame + 1) * FRAME_HOP_S * cache_sr))
        if end > cache_audio.shape[0]:
            end = cache_audio.shape[0]
        if end - start < int(0.3 * cache_sr):
            skipped += 1
            continue

        foa = cache_audio[start:end, :4]
        stereo = foa_to_stereo(foa).astype(np.float32)

        peak = float(np.max(np.abs(stereo)))
        if peak < 1e-4:
            skipped += 1
            continue

        out_path = CLIPS_DIR / f"{ev.event_id}.wav"
        sf.write(out_path, stereo, cache_sr, subtype="PCM_16")

        az_rad = np.deg2rad(ev.mean_azimuth)
        pan = float(np.clip(-np.sin(az_rad), -1.0, 1.0))

        rows.append(
            {
                "event_id": ev.event_id,
                "recording_id": ev.recording_id,
                "split": ev.split,
                "class_index": ev.class_index,
                "mean_azimuth": ev.mean_azimuth,
                "mean_elevation": ev.mean_elevation,
                "mean_distance": ev.mean_distance,
                "duration_s": (end - start) / cache_sr,
                "pan": pan,
            }
        )

        if (i + 1) % 500 == 0:
            print(f"  {i + 1}/{len(events)} processed (skipped {skipped})")

    index = pd.DataFrame(rows)
    index.to_parquet(INDEX_PATH, index=False)
    print(f"wrote {len(index)} clips to {CLIPS_DIR}")
    print(f"index: {INDEX_PATH}")
    print(f"skipped: {skipped}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
