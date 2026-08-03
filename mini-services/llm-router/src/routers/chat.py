from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from fastapi import APIRouter, HTTPException, Request
from sse_starlette.sse import EventSourceResponse

from src.models.schemas import ChatRequest, ChatResponse, RoutingDecision, RoutingRequest
from src.services.router import model_router

router = APIRouter(tags=["Chat"])


@router.post("/v1/chat/completions", response_model=ChatResponse)
async def chat_completion(request: Request, body: ChatRequest) -> ChatResponse:
    if not body.messages:
        raise HTTPException(status_code=400, detail="messages is required")

    try:
        response = await model_router.route_chat(body)
        return response
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/v1/chat/completions/stream")
async def chat_completion_stream(request: Request, body: ChatRequest) -> EventSourceResponse:
    if not body.messages:
        raise HTTPException(status_code=400, detail="messages is required")

    body.stream = True

    async def event_generator() -> AsyncIterator[dict[str, Any]]:
        try:
            async for chunk in model_router.stream_chat(body):
                yield {
                    "event": "delta",
                    "data": json.dumps(chunk),
                }
        except Exception as exc:
            yield {
                "event": "error",
                "data": json.dumps({"error": str(exc)}),
            }

        yield {
            "event": "done",
            "data": "[DONE]",
        }

    return EventSourceResponse(event_generator())


@router.post("/v1/routing/decision", response_model=RoutingDecision)
async def get_routing_decision(body: RoutingRequest) -> RoutingDecision:
    try:
        decision = model_router.select_model(body)
        return decision
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
