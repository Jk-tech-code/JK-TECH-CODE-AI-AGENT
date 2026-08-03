from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from typing import Awaitable, Callable

import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import Counter, Histogram, generate_latest

from src.config import settings
from src.models.database import init_db, run_migrations
from src.models.schemas import ErrorResponse
from src.routers import brands, generate, health as health_router, models as models_router
from src.utils.cache import cache
from src.utils.telemetry import setup_telemetry

logger = logging.getLogger("visual-processor")
request_counter = Counter("visual_processor_requests_total", "Total requests", ["method", "path", "status"])
request_latency = Histogram("visual_processor_duration_seconds", "Request latency", ["method", "path"],
                            buckets=(0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0))


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Visual Processor Service", extra={"port": settings.port, "env": settings.environment})

    try:
        db_sessionmaker = init_db(settings.postgres_dsn)
        await run_migrations(settings.postgres_dsn)
        logger.info("Database connected and migrated")
    except Exception as exc:
        logger.warning("Database unavailable, running without persistence", exc_info=exc)

    await cache.connect()

    logger.info("Visual Processor Service started", extra={"models": len(settings.models)})

    yield

    await cache.disconnect()
    logger.info("Visual Processor Service stopped")


app = FastAPI(
    title="JK-TECH-CODE Visual Processor",
    version="1.0.0",
    description="AI image generation pipeline with safety, quality assurance, brand compliance, and SEO",
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

setup_telemetry(app)

app.include_router(health_router.router)
app.include_router(models_router.router)
app.include_router(generate.router)
app.include_router(brands.router)


@app.middleware("http")
async def metrics_middleware(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    if request.url.path in ("/metrics", "/health", "/health/live", "/health/ready"):
        return await call_next(request)

    start = time.time()
    response = await call_next(request)
    latency = time.time() - start

    path = request.url.path
    method = request.method
    status_group = f"{response.status_code // 100}xx"
    request_counter.labels(method=method, path=path, status=status_group).inc()
    request_latency.labels(method=method, path=path).observe(latency)

    return response


@app.get("/metrics")
async def metrics() -> Response:
    return Response(content=generate_latest(), media_type="text/plain; charset=utf-8")


@app.get("/")
async def root() -> dict:
    return {
        "service": settings.service_name,
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
    }


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled exception", exc_info=exc, extra={"path": request.url.path})
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(error="Internal server error", code="INTERNAL_ERROR").model_dump(),
    )


if __name__ == "__main__":
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=settings.port,
        log_level=settings.log_level,
        workers=4 if settings.environment == "production" else 1,
    )
