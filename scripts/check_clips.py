import argparse
import sys
from collections import Counter
from pathlib import Path

import soundfile as sf

from mixer.effects.quality import QUALITY_CHECKS, inspect_clip

ROLES = ("bed", "texture", "event")


def _row(path: Path, role: str, looped: bool) -> tuple[str, list[dict]]:
    try:
        wav, sr = sf.read(str(path), always_2d=True)
    except Exception as exc:
        return f"unreadable ({exc.__class__.__name__})", []
    issues = inspect_clip(
        wav.T,
        sr,
        role=role,
        playback="oneshot" if role == "event" else "loop",
        looped=looped,
    )
    if not issues:
        return "ok", issues
    return (
        ", ".join(
            f"{issue['check']} {issue['value']:g} > {issue['limit']:g}"
            if issue["check"] != "silent"
            else f"silent {issue['value']:g} dB peak"
            for issue in issues
        ),
        issues,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Run the generation quality checks over a folder of WAV clips."
    )
    parser.add_argument("folder", type=Path)
    parser.add_argument("--role", choices=ROLES, default="texture")
    parser.add_argument(
        "--looped",
        action="store_true",
        help="the clips are already loop-trimmed (stored layers), so skip the seam check",
    )
    args = parser.parse_args(argv)

    paths = sorted(args.folder.rglob("*.wav"))
    if not paths:
        print(f"No WAV files under {args.folder}", file=sys.stderr)
        return 1

    tally: Counter[str] = Counter()
    flagged = 0
    for path in paths:
        verdict, issues = _row(path, args.role, args.looped)
        if verdict != "ok":
            flagged += 1
        tally.update(issue["check"] for issue in issues)
        print(f"{verdict:<48}  {path.relative_to(args.folder)}")

    print()
    print(f"{flagged} of {len(paths)} clips flagged as {args.role}")
    for check in QUALITY_CHECKS:
        if tally[check]:
            print(f"  {check:<9} {tally[check]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
