from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter

from src.config import settings
from src.models.schemas import ModelChoice, ModelListResponse

router = APIRouter(tags=["Models"])


@router.get("/v1/models", response_model=ModelListResponse)
async def list_models() -> ModelListResponse:
    now = int(datetime.now(timezone.utc).timestamp())
    data = [
        ModelChoice(
            id=cap.model_id,
            created=now,
            owned_by=cap.provider,
        )
        for cap in settings.model_registry
    ]
    return ModelListResponse(data=data)
