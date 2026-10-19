import argparse
import json
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
RESULTS_DIR = HERE / "results"


def load(name: str) -> list[dict]:
    return json.loads((RESULTS_DIR / f"{name}.json").read_text())


def summarize(results: list[dict]) -> dict:
    top = [scene["layers"][0] for scene in results]
    rest = [layer for scene in results for layer in scene["layers"][1:]]
    every = [layer for scene in results for layer in scene["layers"]]
    protected = [layer for scene in results for layer in scene["layers"][:-1]]
    return {
        "scenes": len(results),
        "layers": len(every),
        "top_masked_dry": np.mean([l["masked_before"] for l in top]),
        "top_masked_eq": np.mean([l["masked_after"] for l in top]),
        "top_margin_dry": np.mean([l["margin_before_db"] for l in top]),
        "top_margin_eq": np.mean([l["margin_after_db"] for l in top]),
        "top_loss": np.mean([l["eq_loss_db"] for l in top]),
        "top_cut_share": np.mean([l["eq_loss_db"] > 0.5 for l in top]),
        "rest_loss": np.mean([l["eq_loss_db"] for l in rest]) if rest else 0.0,
        "protected_masked_dry": np.mean([l["masked_before"] for l in protected]),
        "protected_masked_eq": np.mean([l["masked_after"] for l in protected]),
        "protected_masked_carved": (
            np.mean([l["masked_masking_only"] for l in protected])
            if all(b.get("source") for l in every for b in l["bands"])
            else None
        ),
        "bands": np.mean([len(l["bands"]) for l in every]),
        "deepest_db": min((b["gain"] for l in every for b in l["bands"]), default=0.0),
    }


ROWS = [
    ("Priority layer: salient energy masked, no EQ", "top_masked_dry", "{:.1%}"),
    ("Priority layer: salient energy masked, with EQ", "top_masked_eq", "{:.1%}"),
    ("Priority layer: median margin over masking, with EQ", "top_margin_eq", "{:+.1f} dB"),
    ("Priority layer: loudness lost to its own EQ", "top_loss", "{:.2f} dB"),
    ("Priority layer: scenes where it is cut > 0.5 dB", "top_cut_share", "{:.0%}"),
    ("Other layers: loudness lost to EQ", "rest_loss", "{:.2f} dB"),
    ("Layers above another: masked by those below, no EQ", "protected_masked_dry", "{:.1%}"),
    ("Layers above another: masked by those below, masking cuts only", "protected_masked_carved", "{:.1%}"),
    ("Layers above another: masked by those below, with EQ", "protected_masked_eq", "{:.1%}"),
    ("Bands per layer", "bands", "{:.1f}"),
    ("Deepest single band", "deepest_db", "{:.1f} dB"),
]


def table(groups: dict[str, dict[str, dict]], names: list[str]) -> str:
    lines = []
    for group, by_name in groups.items():
        first = by_name[names[0]]
        lines.append(f"### {group} ({first['scenes']} scenes, {first['layers']} loop layers)\n")
        lines.append("| Metric | " + " | ".join(names) + " |")
        lines.append("|---|" + "---|" * len(names))
        for label, key, fmt in ROWS:
            lines.append(
                f"| {label} | "
                + " | ".join(
                    "n/a" if by_name[n][key] is None else fmt.format(by_name[n][key])
                    for n in names
                )
                + " |"
            )
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("names", nargs="+")
    args = parser.parse_args()

    data = {name: load(name) for name in args.names}
    groups = {
        "Synthetic": {
            n: summarize([s for s in r if s["scene"].startswith("synthetic")])
            for n, r in data.items()
        },
        "Stored": {
            n: summarize([s for s in r if not s["scene"].startswith("synthetic")])
            for n, r in data.items()
        },
    }
    print(table(groups, args.names))


if __name__ == "__main__":
    main()
