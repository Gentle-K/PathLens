import sqlite3

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import router
from app.api.rwa_routes import rwa_router
from app.api.stocks_routes import stocks_router
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
    app.include_router(stocks_router)

    @app.exception_handler(sqlite3.Error)
    async def sqlite_error_handler(_request, _exc):  # pragma: no cover - exercised via integration tests
        return JSONResponse(
            status_code=503,
            content={"detail": "The session store is temporarily unavailable."},
        )

    @app.exception_handler(OSError)
    async def os_error_handler(_request, _exc):  # pragma: no cover - exercised via integration tests
        return JSONResponse(
            status_code=503,
            content={"detail": "The local backend storage is temporarily unavailable."},
        )

    return app


app = create_app()
