from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
META_DIR = ROOT / "data" / "starss23" / "metadata_dev"
OUT_PATH = ROOT / "data" / "processed" / "events.parquet"

FRAME_HOP_S = 0.1
MIN_EVENT_DURATION_S = 0.5
MAX_AZIMUTH_SPREAD_DEG = 30.0

COLUMNS = ["frame", "class_index", "source_number", "azimuth", "elevation", "distance"]


def load_recording(csv_path: Path) -> pd.DataFrame:
    df = pd.read_csv(csv_path, header=None, names=COLUMNS)
    df["recording_id"] = csv_path.stem
    df["split"] = csv_path.parent.name
    return df


def segment_events(df: pd.DataFrame) -> list[dict]:
    events: list[dict] = []
    df = df.sort_values(["source_number", "class_index", "frame"]).reset_index(drop=True)

    for (source, cls), grp in df.groupby(["source_number", "class_index"], sort=False):
        frames = grp["frame"].to_numpy()
        gap_break = np.where(np.diff(frames) > 1)[0]
        start_idx = 0
        for boundary in [*gap_break, len(frames) - 1]:
            seg = grp.iloc[start_idx : boundary + 1]
            start_idx = boundary + 1
            if len(seg) < 2:
                continue
            events.append(
                {
                    "recording_id": grp["recording_id"].iloc[0],
                    "split": grp["split"].iloc[0],
                    "source_number": int(source),
                    "class_index": int(cls),
                    "start_frame": int(seg["frame"].iloc[0]),
                    "end_frame": int(seg["frame"].iloc[-1]),
                    "mean_azimuth": float(seg["azimuth"].mean()),
                    "mean_elevation": float(seg["elevation"].mean()),
                    "mean_distance": float(seg["distance"].mean()),
                    "azimuth_spread": float(seg["azimuth"].max() - seg["azimuth"].min()),
                }
            )
    return events


def main() -> int:
    csv_paths = sorted(META_DIR.rglob("*.csv"))
    if not csv_paths:
        print(f"no CSVs under {META_DIR}", file=sys.stderr)
        return 1

    all_events: list[dict] = []
    for csv_path in csv_paths:
        df = load_recording(csv_path)
        all_events.extend(segment_events(df))

    events = pd.DataFrame(all_events)
    events["duration_s"] = (events["end_frame"] - events["start_frame"] + 1) * FRAME_HOP_S

    raw_count = len(events)
    events = events[events["duration_s"] >= MIN_EVENT_DURATION_S]
    after_dur = len(events)
    events = events[events["azimuth_spread"] <= MAX_AZIMUTH_SPREAD_DEG]
    after_spread = len(events)

    events["event_id"] = (
        events["recording_id"]
        + "_s" + events["source_number"].astype(str)
        + "_c" + events["class_index"].astype(str)
        + "_f" + events["start_frame"].astype(str)
    )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    events.to_parquet(OUT_PATH, index=False)

    print(f"recordings: {len(csv_paths)}")
    print(f"raw segments: {raw_count}")
    print(f"after duration >= {MIN_EVENT_DURATION_S}s: {after_dur}")
    print(f"after azimuth spread <= {MAX_AZIMUTH_SPREAD_DEG}deg: {after_spread}")
    print(f"azimuth range: [{events['mean_azimuth'].min():.1f}, {events['mean_azimuth'].max():.1f}]")
    print(f"saved: {OUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
