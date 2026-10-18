import json

import pytest

from scripts import publish_demo


def _catalog(out):
    return json.loads((out / "catalog.json").read_text())["soundscapes"]


def test_add_writes_a_public_catalog_and_copies_the_audio(tmp_path, ready_atmosphere):
    out = tmp_path / "demo"
    publish_demo.main(["--out", str(out), "add", str(ready_atmosphere)])

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


def test_republishing_replaces_the_entry_and_remove_deletes_it(tmp_path, ready_atmosphere):
    out = tmp_path / "demo"
    publish_demo.main(["--out", str(out), "add", str(ready_atmosphere)])
    publish_demo.main(["--out", str(out), "add", str(ready_atmosphere)])
    assert len(_catalog(out)) == 1

    publish_demo.main(["--out", str(out), "remove", str(ready_atmosphere)])
    assert _catalog(out) == []
    assert not (out / str(ready_atmosphere)).exists()


def test_refuses_atmospheres_of_non_admin_accounts(tmp_path, client, register, stub_pipeline):
    from api.app.services.pipeline import run_generation

    register(email="owner@halcyon.test")
    guest = {"Authorization": f"Bearer {register(email='guest@halcyon.test')}"}
    created = client.post(
        "/api/atmospheres", headers=guest, json={"prompt": "a quiet harbour"}
    ).json()["data"]["id"]
    run_generation(created)

    with pytest.raises(SystemExit):
        publish_demo.main(["--out", str(tmp_path / "demo"), "add", str(created)])
    assert not (tmp_path / "demo" / "catalog.json").exists()


def test_ready_lists_admin_atmospheres_and_marks_published_ones(
    tmp_path, ready_atmosphere, capsys
):
    out = tmp_path / "demo"
    publish_demo.main(["--out", str(out), "ready"])
    assert f" {ready_atmosphere}  " in capsys.readouterr().out

    publish_demo.main(["--out", str(out), "add", str(ready_atmosphere)])
    capsys.readouterr()
    publish_demo.main(["--out", str(out), "ready"])
    assert capsys.readouterr().out.lstrip().startswith("*")
