from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter

from src.config import settings

router = APIRouter(tags=["models"])


@router.get("/v1/models")
async def list_models() -> dict:
    models_list = []
    for m in settings.models:
        models_list.append({
            "id": m.model_id,
            "name": m.name,
            "provider": m.provider,
            "task_types": list(m.task_types),
            "supports_editing": m.supports_editing,
            "supports_text": m.supports_text,
            "max_width": m.max_width,
            "max_height": m.max_height,
            "quality": m.quality,
            "cost_per_image": m.cost_per_image,
            "created": int(datetime.now(timezone.utc).timestamp()),
            "owned_by": m.provider,
        })
    return {"object": "list", "data": models_list}
