import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from ai.app.config import settings
from ai.app.db import init_db
from ai.app.routers import atmospheres, auth, elements, generate
from ai.app.routers import settings as settings_router
from ai.app.services.pipeline import run_generation
from ai.app.worker import GenerationWorker, reclaim_interrupted

logger = logging.getLogger(__name__)

LEGACY_PREFIX = "/generate"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    reclaimed = reclaim_interrupted()
    if reclaimed:
        logger.warning("Marked %s interrupted atmosphere(s) as failed", reclaimed)

    worker = GenerationWorker(run_generation)
    worker.start()
    app.state.worker = worker

    yield

    worker.stop()


app = FastAPI(title="Halcyon", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, settings.backend_origin],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def require_service_secret(request: Request, call_next):
    if not request.url.path.startswith(LEGACY_PREFIX):
        return await call_next(request)

    if settings.ai_service_secret is None:
        return JSONResponse(
            {"detail": "AI_SERVICE_SECRET is not configured."},
            status_code=500,
        )

    if request.headers.get("x-ai-service-secret") != settings.ai_service_secret:
        return JSONResponse({"detail": "Invalid service secret."}, status_code=401)

    return await call_next(request)


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(settings_router.router)
app.include_router(atmospheres.router)
app.include_router(elements.router)
app.include_router(generate.router)
