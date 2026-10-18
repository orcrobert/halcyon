import argparse
import json
import shutil
import sys
from pathlib import Path

from sqlmodel import Session

from api.app.config import settings
from api.app.db import get_engine
from api.app.models.tables import Atmosphere
from api.app.routers.atmospheres import serialize_atmosphere
from api.app.services import storage

CATALOG = "catalog.json"
AUDIO_PREFIX = "/catalog"


def load_catalog(out: Path) -> list[dict]:
    path = out / CATALOG
    if not path.is_file():
        return []
    return json.loads(path.read_text()).get("soundscapes", [])


def save_catalog(out: Path, soundscapes: list[dict]) -> None:
    out.mkdir(parents=True, exist_ok=True)
    temporary = out / f"{CATALOG}.tmp"
    temporary.write_text(json.dumps({"soundscapes": soundscapes}, indent=2))
    temporary.replace(out / CATALOG)


def public_entry(atmosphere: Atmosphere, files: dict[int, str]) -> dict:
    entry = serialize_atmosphere(atmosphere, include_elements=True).model_dump(
        mode="json"
    )
    entry.update(
        style=None,
        timings=None,
        decomposition=None,
        error=None,
        progress=100,
        current_stage=None,
        stage_detail=None,
    )
    for element in entry["elements"]:
        element.update(
            quality=None,
            error=None,
            status="ready",
            audio_url=f"{AUDIO_PREFIX}/{atmosphere.id}/{files[element['id']]}",
        )
    return entry


def publishable(session: Session, atmosphere_id: int) -> Atmosphere:
    atmosphere = session.get(Atmosphere, atmosphere_id)
    if atmosphere is None or not atmosphere.user.is_admin:
        raise SystemExit(f"{atmosphere_id}: no such atmosphere on an admin account")
    if atmosphere.status != "ready" or not atmosphere.elements:
        raise SystemExit(f"{atmosphere_id}: not ready ({atmosphere.status})")
    if any(element.status != "ready" for element in atmosphere.elements):
        raise SystemExit(f"{atmosphere_id}: a layer is still regenerating or failed")
    return atmosphere


def copy_audio(atmosphere: Atmosphere, out: Path) -> dict[int, str]:
    target = out / str(atmosphere.id)
    shutil.rmtree(target, ignore_errors=True)
    target.mkdir(parents=True)
    files = {}
    for element in atmosphere.elements:
        source = storage.resolve_audio(element.audio_path)
        if not source.is_file():
            raise SystemExit(f"{atmosphere.id}: missing audio {element.audio_path}")
        shutil.copyfile(source, target / source.name)
        files[element.id] = source.name
    return files


def add(out: Path, ids: list[int]) -> None:
    published = []
    with Session(get_engine()) as session:
        atmospheres = [publishable(session, atmosphere_id) for atmosphere_id in ids]
        for atmosphere in atmospheres:
            entry = public_entry(atmosphere, copy_audio(atmosphere, out))
            published.append(entry)
            print(f"published {atmosphere.id}: {entry['title'] or entry['prompt']}")
    kept = [s for s in load_catalog(out) if s["id"] not in ids]
    save_catalog(out, published + kept)


def remove(out: Path, ids: list[int]) -> None:
    soundscapes = load_catalog(out)
    for atmosphere_id in ids:
        shutil.rmtree(out / str(atmosphere_id), ignore_errors=True)
        print(f"removed {atmosphere_id}")
    save_catalog(out, [s for s in soundscapes if s["id"] not in ids])


def show(out: Path) -> None:
    for entry in load_catalog(out):
        print(f"{entry['id']:>6}  {entry['title'] or entry['prompt']}")


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(prog="publish_demo")
    parser.add_argument("--out", type=Path, default=settings.data_path / "demo")
    parser.add_argument("action", choices=["add", "remove", "list"])
    parser.add_argument("ids", nargs="*", type=int)
    args = parser.parse_args(argv)

    if args.action == "list":
        show(args.out)
    elif not args.ids:
        parser.error(f"{args.action} needs at least one atmosphere id")
    elif args.action == "add":
        add(args.out, args.ids)
    else:
        remove(args.out, args.ids)


if __name__ == "__main__":
    main(sys.argv[1:])
