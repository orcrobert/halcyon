import threading

from api.app.worker import GenerationWorker


def test_worker_runs_submitted_jobs():
    seen: list[int] = []
    done = threading.Event()

    def handler(atmosphere_id: int) -> None:
        seen.append(atmosphere_id)
        if len(seen) == 2:
            done.set()

    worker = GenerationWorker(handler)
    worker.start()
    worker.submit(1)
    worker.submit(2)

    assert done.wait(timeout=5)
    worker.stop()
    assert seen == [1, 2]


def test_worker_survives_a_failing_job():
    seen: list[int] = []
    done = threading.Event()

    def handler(atmosphere_id: int) -> None:
        if atmosphere_id == 1:
            raise RuntimeError("generator exploded")
        seen.append(atmosphere_id)
        done.set()

    worker = GenerationWorker(handler)
    worker.start()
    worker.submit(1)
    worker.submit(2)

    assert done.wait(timeout=5)
    worker.stop()
    assert seen == [2]


def test_create_enqueues_generation(client, auth):
    response = client.post(
        "/api/atmospheres", headers=auth, json={"prompt": "a rainy library"}
    )

    assert response.status_code == 202
    assert client.app.state.worker.submitted == [response.json()["data"]["id"]]
