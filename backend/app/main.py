from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.api.rwa_routes import rwa_router
from app.config import Settings


def create_app() -> FastAPI:
    settings = Settings.from_env()
    app = FastAPI(
        title="Genius Actuary API",
        version="0.1.0",
        description="MVP backend skeleton for the Genius Actuary orchestrator.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(router)
    app.include_router(rwa_router)
    return app


app = create_app()
