import argparse
import json
import sqlite3
from pathlib import Path


def export(db: Path) -> list[dict]:
    connection = sqlite3.connect(db)
    scenes = []
    atmospheres = connection.execute(
        "select id, prompt, decomposed_json from atmospheres where status = 'ready' order by id"
    )
    for atmosphere_id, prompt, decomposed in atmospheres.fetchall():
        layers = json.loads(decomposed).get("elements", []) if decomposed else []
        roles = {
            layer.get("label"): layer.get("role") for layer in layers if isinstance(layer, dict)
        }
        rows = connection.execute(
            "select label, type, playback, audio_path from elements"
            " where atmosphere_id = ? order by position",
            (atmosphere_id,),
        )
        scenes.append({
            "id": atmosphere_id,
            "prompt": prompt,
            "elements": [
                {
                    "label": label,
                    "type": kind,
                    "playback": playback or "loop",
                    "role": roles.get(label),
                    "audio_path": audio_path,
                }
                for label, kind, playback, audio_path in rows.fetchall()
            ],
        })
    return scenes


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    scenes = export(args.db)
    args.out.write_text(json.dumps(scenes, indent=1))
    print(f"{len(scenes)} scenes -> {args.out}")


if __name__ == "__main__":
    main()
