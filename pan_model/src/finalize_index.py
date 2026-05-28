from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
EVENTS_PATH = ROOT / "data" / "processed" / "events.parquet"
INDEX_PATH = ROOT / "data" / "processed" / "clips_index.parquet"
FEATURES_PATH = ROOT / "data" / "processed" / "features.parquet"

SPEECH_CLASSES = (0, 1)
SPEECH_CAP_PER_CLASS = 300
RNG_SEED = 42


def add_isolated_flag(index: pd.DataFrame, events: pd.DataFrame) -> pd.DataFrame:
    ev_by_eid = events.assign(
        event_id=(
            events["recording_id"]
            + "_s" + events["source_number"].astype(str)
            + "_c" + events["class_index"].astype(str)
            + "_f" + events["start_frame"].astype(str)
        )
    ).set_index("event_id")

    iso_flags = []
    grouped = events.groupby("recording_id")
    for eid in index["event_id"]:
        ev = ev_by_eid.loc[eid]
        rec_events = grouped.get_group(ev["recording_id"])
        overlap = rec_events[
            (rec_events["end_frame"] >= ev["start_frame"])
            & (rec_events["start_frame"] <= ev["end_frame"])
        ]
        iso_flags.append(len(overlap) == 1)
    return index.assign(is_isolated=iso_flags)


def subsample_speech(df: pd.DataFrame) -> pd.DataFrame:
    rng = np.random.default_rng(RNG_SEED)
    kept = []
    for cls, grp in df.groupby("class_index"):
        if cls in SPEECH_CLASSES and len(grp) > SPEECH_CAP_PER_CLASS:
            picks = rng.choice(grp.index, size=SPEECH_CAP_PER_CLASS, replace=False)
            kept.append(grp.loc[picks])
        else:
            kept.append(grp)
    return pd.concat(kept).sort_values("event_id").reset_index(drop=True)


def main() -> int:
    events = pd.read_parquet(EVENTS_PATH)
    index = pd.read_parquet(INDEX_PATH)
    features = pd.read_parquet(FEATURES_PATH)

    print(f"before: index={len(index)}, features={len(features)}")

    index = add_isolated_flag(index, events)
    iso_count = int(index["is_isolated"].sum())
    print(f"is_isolated flag added: {iso_count} isolated, {len(index) - iso_count} overlapping")

    balanced = subsample_speech(index)
    print(f"after speech subsample (cap={SPEECH_CAP_PER_CLASS}/class for classes {SPEECH_CLASSES}): {len(balanced)}")
    print()
    print("balanced class distribution:")
    print(balanced["class_index"].value_counts().sort_index())

    keep_ids = set(balanced["event_id"])
    features_balanced = features[features["event_id"].isin(keep_ids)].reset_index(drop=True)
    features_balanced = features_balanced.merge(
        balanced[["event_id", "is_isolated"]], on="event_id", how="left"
    )

    balanced.to_parquet(INDEX_PATH, index=False)
    features_balanced.to_parquet(FEATURES_PATH, index=False)

    print()
    print(f"wrote balanced index: {INDEX_PATH} ({len(balanced)} rows)")
    print(f"wrote balanced features: {FEATURES_PATH} ({len(features_balanced)} rows)")
    print(f"isolated in balanced set: {int(features_balanced['is_isolated'].sum())}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
