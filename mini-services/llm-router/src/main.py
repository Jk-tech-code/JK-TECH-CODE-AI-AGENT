from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import make_asgi_app

from src.config import settings
from src.midlware.auth import JWTAuthMiddleware
from src.midlware.logging import RequestLoggingMiddleware, logger
from src.models.database import init_db, run_migrations
from src.models.schemas import ErrorResponse
from src.routers import admin, chat, health, models
from src.services.router import model_router
from src.services.rate_limiter import rate_limiter
from src.utils.cache import cache
from src.utils.telemetry import MetricsMiddleware, setup_telemetry

db_sessionmaker = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_sessionmaker
    logger.info("Starting LLM Router Service", port=settings.port, env=settings.environment)

    try:
        db_sessionmaker = init_db(settings.postgres_dsn)
        await run_migrations(settings.postgres_dsn)
        logger.info("Database connected and migrated")
    except Exception as exc:
        logger.warning("Database unavailable, running without persistence", error=str(exc))

    await model_router.start()
    await rate_limiter.start()
    await cache.connect()

    logger.info(
        "LLM Router Service started",
        models=len(settings.model_registry),
        providers=list(settings.providers.keys()),
    )

    yield

    await model_router.stop()
    await rate_limiter.stop()
    await cache.disconnect()
    logger.info("LLM Router Service stopped")


app = FastAPI(
    title="JK-TECH-CODE LLM Router",
    version="1.0.0",
    description="Cost-aware multi-model LLM routing service with fallback, rate limiting, and monitoring",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(JWTAuthMiddleware)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(MetricsMiddleware)

setup_telemetry(app)

prometheus_app = make_asgi_app()
app.mount("/metrics", prometheus_app)

app.include_router(health.router)
app.include_router(models.router)
app.include_router(chat.router)
app.include_router(admin.router)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled exception", path=request.url.path, error=str(exc))
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            error="Internal server error",
            code="INTERNAL_ERROR",
            request_id=getattr(request.state, "request_id", None),
        ).model_dump(),
    )


@app.get("/")
async def root() -> dict:
    return {
        "service": settings.service_name,
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
    }


def get_db_session():
    return db_sessionmaker()


if __name__ == "__main__":
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=settings.port,
        log_level=settings.log_level,
        workers=4 if settings.environment == "production" else 1,
    )
