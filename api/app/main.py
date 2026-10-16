import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from api.app.config import settings
from api.app.db import init_db
from api.app.routers import admin, atmospheres, auth, elements, generators, updates
from api.app.routers import settings as settings_router
from api.app.services.accounts import ensure_admin
from api.app.services.modal_deploy import DeployRunner, reclaim_deploys
from api.app.services.pipeline import regenerate_element, run_generation
from api.app.services.updates import AutoUpdater, UpdateRunner, ensure_updater_token
from api.app.worker import GenerationWorker, reclaim_interrupted

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    promoted = ensure_admin()
    if promoted:
        logger.warning("Made %s the administrator as the oldest account", promoted)

    reclaimed = reclaim_interrupted()
    if reclaimed:
        logger.warning("Marked %s interrupted job(s) as failed", reclaimed)

    stranded = reclaim_deploys()
    if stranded:
        logger.warning("Marked %s interrupted deploy(s) as failed", stranded)

    worker = GenerationWorker(run_generation, regenerate_element)
    worker.start()
    app.state.worker = worker
    app.state.deployer = DeployRunner()

    ensure_updater_token()
    app.state.updater = UpdateRunner()
    auto_updater = AutoUpdater(app.state.updater)
    auto_updater.start()

    yield

    auto_updater.stop()
    worker.stop()


app = FastAPI(
    title="Halcyon",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

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
    return {"status": "ok", "version": settings.halcyon_version}


app.include_router(auth.router)
app.include_router(settings_router.router, prefix="/api/settings")
app.include_router(generators.router, prefix="/api/generators")
app.include_router(admin.router)
app.include_router(updates.router)
app.include_router(
    settings_router.router, prefix=f"{admin.USER_PREFIX}/settings", tags=["admin"]
)
app.include_router(
    generators.router, prefix=f"{admin.USER_PREFIX}/generators", tags=["admin"]
)
app.include_router(atmospheres.router)
app.include_router(elements.router)


def mount_frontend(target: FastAPI) -> None:
    dist = settings.frontend_dist_path.resolve()
    if not (dist / "index.html").is_file():
        logger.info("No frontend build at %s; serving the API only", dist)
        return

    target.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @target.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        candidate = (dist / path).resolve()
        if path and candidate.is_relative_to(dist) and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(dist / "index.html")


mount_frontend(app)
