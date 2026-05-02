from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from ai.app.routers import sessions
from ai.app.config import settings

app = FastAPI(title="Soundscape Generator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.backend_origin],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@app.middleware("http")
async def require_service_secret(request: Request, call_next):
    if request.url.path in ("/health", "/docs", "/openapi.json", "/redoc"):
        return await call_next(request)

    if settings.ai_service_secret is None:
        return JSONResponse(
            {"detail": "AI_SERVICE_SECRET is not configured."},
            status_code=500,
        )

    provided = request.headers.get("x-ai-service-secret")
    if provided != settings.ai_service_secret:
        return JSONResponse(
            {"detail": "Invalid service secret."},
            status_code=401,
        )

    return await call_next(request)


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(sessions.router)
