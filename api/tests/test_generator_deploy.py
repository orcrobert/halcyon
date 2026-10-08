import pytest


class RecordingDeployer:
    def __init__(self) -> None:
        self.started: list[int] = []

    def is_running(self, profile_id: int) -> bool:
        return False

    def start(self, profile_id: int) -> bool:
        self.started.append(profile_id)
        return True


class FakeProcess:
    def __init__(self, lines: list[str], code: int) -> None:
        self.stdout = iter(lines)
        self._code = code

    def wait(self) -> int:
        return self._code

    def kill(self) -> None:
        return None


@pytest.fixture
def deployer(client):
    recording = RecordingDeployer()
    client.app.state.deployer = recording
    return recording


@pytest.fixture
def deploy_script(tmp_path, monkeypatch):
    from api.app.config import settings

    root = tmp_path / "generators"
    (root / "modal").mkdir(parents=True)
    (root / "modal" / "deploy.py").write_text("")
    monkeypatch.setattr(settings, "generators_dir", str(root))
    return root / "modal" / "deploy.py"


def modal_generator(client, auth, url="https://me--halcyon-generator-generator-web.modal.run"):
    listing = client.post(
        "/api/generators",
        headers=auth,
        json={"name": "Modal", "url": url, "kind": "modal"},
    ).json()["data"]
    return next(g for g in listing["generators"] if g["kind"] == "modal")


def save_token(client, auth):
    response = client.put(
        "/api/settings",
        headers=auth,
        json={"modal_token_id": "ak-test", "modal_token_secret": "as-test"},
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_the_listing_carries_option_specs_and_defaults(client, auth):
    generator = modal_generator(client, auth)
    listing = client.get("/api/generators", headers=auth).json()["data"]

    keys = {spec["key"] for spec in listing["option_specs"]}
    assert {"gpu", "musicgen_model", "style_eval_q"} <= keys
    assert generator["options"]["gpu"] == "A10G"
    assert generator["pending_changes"] == []
    assert listing["deploy"]["credentials"] is None


def test_the_modal_token_is_stored_but_never_returned(client, auth):
    body = save_token(client, auth)

    assert body["modal_token_id"] == "ak-test"
    assert body["modal_token_set"] is True
    assert "as-test" not in str(body)


def test_a_deploy_option_change_is_pending_until_deployed(client, auth):
    generator = modal_generator(client, auth)

    listing = client.put(
        f"/api/generators/{generator['id']}/options",
        headers=auth,
        json={"options": {"gpu": "L40S", "style_eval_q": 5}},
    ).json()["data"]
    updated = next(g for g in listing["generators"] if g["id"] == generator["id"])

    assert updated["options"]["gpu"] == "L40S"
    assert updated["pending_changes"] == ["gpu"]


def test_request_options_never_need_a_redeploy(client, auth):
    generator = modal_generator(client, auth)

    listing = client.put(
        f"/api/generators/{generator['id']}/options",
        headers=auth,
        json={"options": {"style_cfg_beta": 2.5}},
    ).json()["data"]

    assert listing["generators"][0]["pending_changes"] == []


def test_resetting_an_option_returns_it_to_the_default(client, auth):
    generator = modal_generator(client, auth)
    url = f"/api/generators/{generator['id']}/options"

    client.put(url, headers=auth, json={"options": {"gpu": "T4"}})
    listing = client.put(url, headers=auth, json={"options": {"gpu": None}}).json()["data"]

    assert listing["generators"][0]["options"]["gpu"] == "A10G"
    assert listing["generators"][0]["pending_changes"] == []


def test_invalid_options_are_rejected(client, auth):
    generator = modal_generator(client, auth)
    url = f"/api/generators/{generator['id']}/options"

    for options in ({"gpu": "TPU"}, {"style_eval_q": 9}, {"nonsense": 1}, {"style_preload": "yes"}):
        assert client.put(url, headers=auth, json={"options": options}).status_code == 422


def test_deploy_options_do_not_apply_to_other_hosts(client, auth):
    listing = client.post(
        "/api/generators",
        headers=auth,
        json={"name": "Colab", "url": "https://x.ngrok-free.app", "kind": "colab"},
    ).json()["data"]
    colab = listing["generators"][0]

    response = client.put(
        f"/api/generators/{colab['id']}/options",
        headers=auth,
        json={"options": {"gpu": "T4"}},
    )

    assert response.status_code == 422
    assert "gpu" not in colab["options"]


def test_request_options_reach_the_generator(client, auth, stub_pipeline, monkeypatch):
    import api.app.services.generator as generator_module
    from api.app.services.pipeline import run_generation

    generator = modal_generator(client, auth)
    client.put(
        f"/api/generators/{generator['id']}/options",
        headers=auth,
        json={"options": {"style_eval_q": 6}},
    )

    sent = {}
    original_post = generator_module.requests.post

    def capture(url, **kwargs):
        sent.update(kwargs["json"])
        return original_post(url, **kwargs)

    monkeypatch.setattr(generator_module.requests, "post", capture)

    atmosphere_id = client.post(
        "/api/atmospheres", headers=auth, json={"prompt": "a rainy library"}
    ).json()["data"]["id"]
    run_generation(atmosphere_id)

    assert sent["options"] == {"style_eval_q": 6, "style_cfg_beta": 5.0}


def test_deploy_needs_a_modal_token(client, auth, deployer, deploy_script):
    generator = modal_generator(client, auth)

    response = client.post(f"/api/generators/{generator['id']}/deploy", headers=auth)

    assert response.status_code == 409
    assert deployer.started == []


def test_deploy_starts_in_the_background(client, auth, deployer, deploy_script):
    save_token(client, auth)
    generator = modal_generator(client, auth)

    response = client.post(f"/api/generators/{generator['id']}/deploy", headers=auth)

    assert response.status_code == 202
    assert deployer.started == [generator["id"]]
    assert response.json()["data"]["generators"][0]["deploy_status"] == "deploying"


def test_only_modal_generators_deploy(client, auth, deployer, deploy_script):
    save_token(client, auth)
    listing = client.post(
        "/api/generators",
        headers=auth,
        json={"name": "Box", "url": "http://gpu.lan:9000", "kind": "local"},
    ).json()["data"]

    response = client.post(
        f"/api/generators/{listing['generators'][0]['id']}/deploy", headers=auth
    )

    assert response.status_code == 409


def test_a_new_modal_generator_is_created_and_deployed(client, auth, deployer, deploy_script):
    save_token(client, auth)

    response = client.post("/api/generators/modal", headers=auth, json={})

    assert response.status_code == 202
    generator = response.json()["data"]["generators"][0]
    assert generator["kind"] == "modal"
    assert generator["url"] == ""
    assert generator["is_active"] is False
    assert deployer.started == [generator["id"]]


def test_a_generator_without_a_url_cannot_be_activated(client, auth, deployer, deploy_script):
    save_token(client, auth)
    generator = client.post("/api/generators/modal", headers=auth, json={}).json()["data"]["generators"][0]

    response = client.post(f"/api/generators/{generator['id']}/activate", headers=auth)

    assert response.status_code == 409


def test_a_successful_deploy_records_the_url_and_clears_pending(
    client, auth, deployer, deploy_script, monkeypatch
):
    from api.app.services import modal_deploy

    save_token(client, auth)
    generator = client.post("/api/generators/modal", headers=auth, json={}).json()["data"]["generators"][0]
    client.put(
        f"/api/generators/{generator['id']}/options",
        headers=auth,
        json={"options": {"gpu": "L4"}},
    )

    seen = {}

    def fake_popen(command, **kwargs):
        seen["command"] = command
        seen["env"] = kwargs["env"]
        return FakeProcess(
            [
                "Building image...\n",
                "\x1b[32m✓\x1b[0m Created web => https://me--halcyon-generator-generator-web.modal.run\n",
            ],
            0,
        )

    monkeypatch.setattr(modal_deploy.subprocess, "Popen", fake_popen)
    modal_deploy.run_deploy(generator["id"])

    after = client.get("/api/generators", headers=auth).json()["data"]["generators"][0]
    assert after["deploy_status"] == "ready"
    assert after["url"] == "https://me--halcyon-generator-generator-web.modal.run"
    assert after["is_active"] is True
    assert after["pending_changes"] == []
    assert "\x1b" not in after["deploy_log"]
    assert seen["command"][-2:] == ["deploy", str(deploy_script)]
    assert seen["env"]["HALCYON_MODAL_GPU"] == "L4"
    assert seen["env"]["MODAL_TOKEN_ID"] == "ak-test"
    assert seen["env"]["MODAL_TOKEN_SECRET"] == "as-test"


def test_a_failed_deploy_keeps_the_change_pending(
    client, auth, deployer, deploy_script, monkeypatch
):
    from api.app.services import modal_deploy

    save_token(client, auth)
    generator = modal_generator(client, auth)
    client.put(
        f"/api/generators/{generator['id']}/options",
        headers=auth,
        json={"options": {"gpu": "H100"}},
    )

    monkeypatch.setattr(
        modal_deploy.subprocess,
        "Popen",
        lambda command, **kwargs: FakeProcess(["Error: token rejected\n"], 1),
    )
    modal_deploy.run_deploy(generator["id"])

    after = client.get("/api/generators", headers=auth).json()["data"]["generators"][0]
    assert after["deploy_status"] == "failed"
    assert after["deploy_error"] == "Error: token rejected"
    assert after["pending_changes"] == ["gpu"]


def test_interrupted_deploys_are_marked_failed_on_boot(client, auth, deployer, deploy_script):
    from api.app.services.modal_deploy import INTERRUPTED, reclaim_deploys

    save_token(client, auth)
    generator = modal_generator(client, auth)
    client.post(f"/api/generators/{generator['id']}/deploy", headers=auth)

    assert reclaim_deploys() == 1

    after = client.get("/api/generators", headers=auth).json()["data"]["generators"][0]
    assert after["deploy_status"] == "failed"
    assert after["deploy_error"] == INTERRUPTED
