import json

import pytest

from scripts import publish_demo


def _catalog(out):
    return json.loads((out / "catalog.json").read_text())["soundscapes"]


def _name(client, auth, atmosphere_id):
    data = client.get(f"/api/atmospheres/{atmosphere_id}", headers=auth).json()["data"]
    return data["title"] or data["prompt"]


def _generate(client, headers, prompt):
    from api.app.services.pipeline import run_generation

    created = client.post(
        "/api/atmospheres", headers=headers, json={"prompt": prompt}
    ).json()["data"]["id"]
    run_generation(created)
    return created


def _retitle(atmosphere_id, title):
    from sqlmodel import Session

    from api.app.db import get_engine
    from api.app.models.tables import Atmosphere

    with Session(get_engine()) as session:
        atmosphere = session.get(Atmosphere, atmosphere_id)
        atmosphere.title = title
        session.add(atmosphere)
        session.commit()


def test_add_by_title_writes_a_public_catalog_and_copies_the_audio(
    tmp_path, client, auth, ready_atmosphere
):
    out = tmp_path / "demo"
    publish_demo.main(["--out", str(out), "add", _name(client, auth, ready_atmosphere)])

    [entry] = _catalog(out)
    assert entry["id"] == ready_atmosphere
    assert entry["status"] == "ready"
    assert entry["style"] is None and entry["timings"] is None
    assert len(entry["elements"]) == 2
    for element in entry["elements"]:
        assert element["quality"] is None
        assert element["audio_url"].startswith(f"/catalog/{ready_atmosphere}/")
        name = element["audio_url"].rsplit("/", 1)[1]
        assert (out / str(ready_atmosphere) / name).is_file()


def test_titles_match_case_insensitively_and_by_unique_part(
    tmp_path, client, auth, ready_atmosphere
):
    _retitle(ready_atmosphere, "Rainy Library")
    out = tmp_path / "demo"
    publish_demo.main(["--out", str(out), "add", "rainy library"])
    publish_demo.main(["--out", str(out), "add", "LIBRARY"])
    assert [entry["id"] for entry in _catalog(out)] == [ready_atmosphere]

    publish_demo.main(["--out", str(out), "remove", "rainy"])
    assert _catalog(out) == []
    assert not (out / str(ready_atmosphere)).exists()


def test_a_shared_title_publishes_the_newest_take_and_replaces_the_older(
    tmp_path, client, auth, ready_atmosphere
):
    _retitle(ready_atmosphere, "Harbour Night")
    out = tmp_path / "demo"
    publish_demo.main(["--out", str(out), "add", "Harbour Night"])

    newer = _generate(client, auth, "a quiet harbour at night")
    _retitle(newer, "Harbour Night")
    publish_demo.main(["--out", str(out), "add", "Harbour Night"])

    assert [entry["id"] for entry in _catalog(out)] == [newer]
    assert not (out / str(ready_atmosphere)).exists()


def test_an_ambiguous_part_of_a_title_is_refused(tmp_path, client, auth, ready_atmosphere):
    _retitle(ready_atmosphere, "Night Harbour")
    _retitle(_generate(client, auth, "a forest at night"), "Night Forest")

    with pytest.raises(SystemExit, match="several"):
        publish_demo.main(["--out", str(tmp_path / "demo"), "add", "night"])


def test_soundscapes_of_non_admin_accounts_cannot_be_found(
    tmp_path, client, register, stub_pipeline
):
    register(email="owner@halcyon.test")
    guest = {"Authorization": f"Bearer {register(email='guest@halcyon.test')}"}
    created = _generate(client, guest, "a quiet harbour")
    _retitle(created, "Guest Harbour")

    with pytest.raises(SystemExit, match="No soundscape"):
        publish_demo.main(["--out", str(tmp_path / "demo"), "add", "Guest Harbour"])
    assert not (tmp_path / "demo" / "catalog.json").exists()


def test_ready_lists_titles_and_marks_published_ones(
    tmp_path, client, auth, ready_atmosphere, capsys
):
    _retitle(ready_atmosphere, "Rainy Library")
    out = tmp_path / "demo"
    publish_demo.main(["--out", str(out), "ready"])
    line = capsys.readouterr().out.strip()
    assert line.endswith("Rainy Library") and not line.startswith("*")

    publish_demo.main(["--out", str(out), "add", "Rainy Library"])
    capsys.readouterr()
    publish_demo.main(["--out", str(out), "ready"])
    assert capsys.readouterr().out.startswith("*")
