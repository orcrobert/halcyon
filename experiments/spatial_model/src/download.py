from __future__ import annotations

import sys
from pathlib import Path

SOURCE_ROOT = Path.home() / "Datasets"
TARGET_ROOT = Path(__file__).resolve().parents[1] / "data" / "starss23"

EXPECTED_SPLITS = ("dev-train-sony", "dev-train-tau", "dev-test-sony", "dev-test-tau")


def link(source: Path, target: Path) -> None:
    if target.is_symlink() or target.exists():
        if target.is_symlink() and target.resolve() == source.resolve():
            return
        print(f"  target already exists and differs: {target}", file=sys.stderr)
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    target.symlink_to(source)
    print(f"  linked {target} -> {source}")


def main() -> int:
    foa_src = SOURCE_ROOT / "foa_dev"
    meta_src = SOURCE_ROOT / "metadata_dev"

    for src in (foa_src, meta_src):
        if not src.is_dir():
            print(f"missing: {src}", file=sys.stderr)
            return 1

    link(foa_src, TARGET_ROOT / "foa_dev")
    link(meta_src, TARGET_ROOT / "metadata_dev")

    wav_total = 0
    csv_total = 0
    for split in EXPECTED_SPLITS:
        wavs = list((TARGET_ROOT / "foa_dev" / split).glob("*.wav"))
        csvs = list((TARGET_ROOT / "metadata_dev" / split).glob("*.csv"))
        wav_total += len(wavs)
        csv_total += len(csvs)
        if len(wavs) != len(csvs):
            print(f"  WARN {split}: {len(wavs)} wavs vs {len(csvs)} csvs")
        else:
            print(f"  {split}: {len(wavs)} recordings")

    print(f"total: {wav_total} wavs, {csv_total} csvs")
    return 0 if wav_total > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
