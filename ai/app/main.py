from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from ai.app.routers import sessions

app = FastAPI(title="Soundscape Generator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router)
