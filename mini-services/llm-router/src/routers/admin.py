from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.models.database import ModelMetrics, RequestLog

router = APIRouter(tags=["Admin"], prefix="/admin")


@router.get("/metrics/overview")
async def metrics_overview(
    hours: int = Query(default=24, ge=1, le=168),
) -> dict:
    return {
        "models": [
            {
                "model": cap.model_id,
                "provider": cap.provider,
                "cost_per_1k_input": cap.cost_per_1k_input,
                "cost_per_1k_output": cap.cost_per_1k_output,
                "max_tokens": cap.max_tokens,
                "supports_streaming": cap.supports_streaming,
                "supports_thinking": cap.supports_thinking,
                "supports_vision": cap.supports_vision,
                "supports_tools": cap.supports_tools,
            }
            for cap in settings.model_registry
        ],
        "period_hours": hours,
    }


@router.get("/logs")
async def get_logs(
    limit: int = Query(default=50, ge=1, le=500),
    model: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
) -> list[dict]:
    return []


@router.get("/providers")
async def list_providers() -> dict:
    from src.services.router import model_router

    health = await model_router.check_all_health()
    return {
        "providers": [
            {
                "name": name,
                "healthy": healthy,
                "models": [m.model_id for m in settings.model_registry if m.provider == name],
            }
            for name, healthy in health.items()
        ]
    }
