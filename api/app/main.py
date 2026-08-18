import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from api.app.config import settings
from api.app.db import init_db
from api.app.routers import atmospheres, auth, elements, generators
from api.app.routers import settings as settings_router
from api.app.services.pipeline import regenerate_element, run_generation
from api.app.worker import GenerationWorker, reclaim_interrupted

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    reclaimed = reclaim_interrupted()
    if reclaimed:
        logger.warning("Marked %s interrupted job(s) as failed", reclaimed)

    worker = GenerationWorker(run_generation, regenerate_element)
    worker.start()
    app.state.worker = worker

    yield

    worker.stop()


app = FastAPI(title="Halcyon", lifespan=lifespan)

if settings.frontend_origin:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(settings_router.router)
app.include_router(generators.router)
app.include_router(atmospheres.router)
app.include_router(elements.router)


def mount_frontend(target: FastAPI) -> None:
    dist = settings.frontend_dist_path
    if not (dist / "index.html").is_file():
        logger.info("No frontend build at %s; serving the API only", dist)
        return

    target.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @target.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        candidate = dist / path
        if path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(dist / "index.html")


mount_frontend(app)
