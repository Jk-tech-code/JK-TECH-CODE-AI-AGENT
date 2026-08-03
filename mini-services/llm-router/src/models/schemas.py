from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str = Field(..., pattern=r"^(system|user|assistant)$")
    content: str


class ChatRequest(BaseModel):
    model: str = Field(default="gpt-4.1", description="Model identifier or 'auto' for automatic routing")
    messages: list[ChatMessage]
    stream: bool = False
    temperature: Optional[float] = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(default=None, ge=1, le=256000)
    thinking: bool = False
    user_id: Optional[str] = None


class ModelChoice(BaseModel):
    id: str
    object: str = "model"
    created: int
    owned_by: str = "llm-router"


class ModelListResponse(BaseModel):
    object: str = "list"
    data: list[ModelChoice]


class Usage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class ChatChoice(BaseModel):
    index: int = 0
    message: ChatMessage
    finish_reason: str = "stop"


class ChatResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: list[ChatChoice]
    usage: Usage = Field(default_factory=Usage)
    provider: str = ""
    cost: float = 0.0


class ChatStreamChunk(BaseModel):
    id: str
    object: str = "chat.completion.chunk"
    created: int
    model: str
    choices: list[dict[str, Any]]


class RoutingRequest(BaseModel):
    task_category: str = Field(..., pattern=r"^(coding|reasoning|research|analysis|writing|creative|summarization|general)$")
    requires_thinking: bool = False
    requires_vision: bool = False
    requires_tools: bool = False
    estimated_input_tokens: int = Field(default=1000, ge=1)
    max_budget: Optional[float] = None
    preferred_provider: Optional[str] = None


class RoutingDecision(BaseModel):
    model: str
    provider: str
    estimated_cost: float
    capability_match: float
    priority: int
    reason: str


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str = "1.0.0"
    uptime_seconds: float
    models_available: int
    providers_healthy: dict[str, bool]


class ErrorResponse(BaseModel):
    error: str
    code: str
    detail: Optional[str] = None
    request_id: Optional[str] = None
