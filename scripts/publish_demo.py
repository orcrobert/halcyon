import argparse
import json
import shutil
import sys
from pathlib import Path

from sqlmodel import Session, select

from api.app.config import settings
from api.app.db import get_engine
from api.app.models.tables import Atmosphere, User
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


def name_of(item: Atmosphere | dict) -> str:
    if isinstance(item, dict):
        return item.get("title") or item["prompt"]
    return item.title or item.prompt


def when(atmosphere: Atmosphere) -> str:
    return (atmosphere.generated_at or atmosphere.created_at).strftime("%Y-%m-%d %H:%M")


def publishable(session: Session) -> list[Atmosphere]:
    rows = session.exec(
        select(Atmosphere)
        .join(User)
        .where(User.is_admin.is_(True), Atmosphere.status == "ready")
        .order_by(Atmosphere.created_at.desc(), Atmosphere.id.desc())
    ).all()
    return [
        atmosphere
        for atmosphere in rows
        if atmosphere.elements
        and all(element.status == "ready" for element in atmosphere.elements)
    ]


def find(name: str, items: list) -> list:
    wanted = name.strip().casefold()
    exact = [item for item in items if name_of(item).casefold() == wanted]
    if exact:
        return exact
    partial = [item for item in items if wanted in name_of(item).casefold()]
    if not partial:
        raise SystemExit(f'No soundscape called "{name}". Run "ready" to see the names.')
    names = sorted({name_of(item) for item in partial})
    if len(names) > 1:
        raise SystemExit(
            f'"{name}" matches several soundscapes: '
            + ", ".join(f'"{n}"' for n in names)
            + ". Use the full title."
        )
    return partial


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


def add(out: Path, names: list[str]) -> None:
    published = []
    with Session(get_engine()) as session:
        candidates = publishable(session)
        chosen = []
        for name in names:
            matches = find(name, candidates)
            if len(matches) > 1:
                print(
                    f'{len(matches)} soundscapes are called "{name_of(matches[0])}"; '
                    f"publishing the newest, from {when(matches[0])}"
                )
            chosen.append(matches[0])
        for atmosphere in chosen:
            entry = public_entry(atmosphere, copy_audio(atmosphere, out))
            published.append(entry)
            print(f"published: {name_of(atmosphere)}")
    replaced = {name_of(entry).casefold() for entry in published}
    ids = {entry["id"] for entry in published}
    kept = []
    for entry in load_catalog(out):
        if entry["id"] in ids:
            continue
        if name_of(entry).casefold() in replaced:
            shutil.rmtree(out / str(entry["id"]), ignore_errors=True)
            continue
        kept.append(entry)
    save_catalog(out, published + kept)


def remove(out: Path, names: list[str]) -> None:
    soundscapes = load_catalog(out)
    gone = set()
    for name in names:
        for entry in find(name, soundscapes):
            gone.add(entry["id"])
            shutil.rmtree(out / str(entry["id"]), ignore_errors=True)
            print(f"removed: {name_of(entry)}")
    save_catalog(out, [s for s in soundscapes if s["id"] not in gone])


def show(out: Path) -> None:
    for entry in load_catalog(out):
        print(name_of(entry))


def ready(out: Path) -> None:
    published = {entry["id"] for entry in load_catalog(out)}
    with Session(get_engine()) as session:
        for atmosphere in publishable(session):
            mark = "*" if atmosphere.id in published else " "
            layers = len(atmosphere.elements)
            print(f"{mark} {when(atmosphere)}  {layers} layers  {name_of(atmosphere)}")


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(prog="publish_demo")
    parser.add_argument("--out", type=Path, default=settings.data_path / "demo")
    parser.add_argument("action", choices=["add", "remove", "list", "ready"])
    parser.add_argument("titles", nargs="*")
    args = parser.parse_args(argv)

    if args.action == "list":
        show(args.out)
    elif args.action == "ready":
        ready(args.out)
    elif not args.titles:
        parser.error(f"{args.action} needs at least one soundscape title")
    elif args.action == "add":
        add(args.out, args.titles)
    else:
        remove(args.out, args.titles)


if __name__ == "__main__":
    main(sys.argv[1:])
