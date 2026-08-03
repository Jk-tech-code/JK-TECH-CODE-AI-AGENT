from __future__ import annotations

import time

from fastapi import APIRouter

from src.config import settings
from src.models.schemas import HealthResponse
from src.services.router import model_router

router = APIRouter(tags=["Health"])

_start_time = time.monotonic()


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    providers_healthy = await model_router.check_all_health()
    return HealthResponse(
        status="ok" if any(providers_healthy.values()) else "degraded",
        service=settings.service_name,
        uptime_seconds=time.monotonic() - _start_time,
        models_available=len(settings.model_registry),
        providers_healthy=providers_healthy,
    )


@router.get("/health/ready", response_model=dict)
async def readiness() -> dict:
    return {"status": "ready", "service": settings.service_name}


@router.get("/health/live", response_model=dict)
async def liveness() -> dict:
    return {"status": "alive", "service": settings.service_name}
