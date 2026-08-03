from __future__ import annotations

import time

from fastapi import APIRouter

from src.config import settings
from src.models.schemas import HealthResponse

router = APIRouter(tags=["health"])

_start_time = time.time()


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service=settings.service_name,
        uptime_seconds=time.time() - _start_time,
        models_available=len(settings.models),
        providers_healthy={m.provider: True for m in settings.models},
    )


@router.get("/health/live")
async def live() -> dict[str, str]:
    return {"status": "alive"}


@router.get("/health/ready")
async def ready() -> dict[str, str]:
    return {"status": "ready"}
