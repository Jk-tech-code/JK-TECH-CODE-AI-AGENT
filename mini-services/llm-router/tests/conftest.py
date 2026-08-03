from __future__ import annotations

from typing import AsyncGenerator, Generator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from src.config import ModelCapability, Settings, settings
from src.models.schemas import ChatMessage, ChatRequest, ChatResponse, ChatChoice, Usage
from src.services.router import model_router


@pytest.fixture(autouse=True)
def reset_settings():
    yield


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    from src.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def chat_request() -> ChatRequest:
    return ChatRequest(
        model="gpt-4.1",
        messages=[
            ChatMessage(role="user", content="Hello, how are you?"),
        ],
        temperature=0.7,
    )


@pytest.fixture
def chat_response() -> ChatResponse:
    return ChatResponse(
        id="test-cmpl-001",
        created=1700000000,
        model="gpt-4.1",
        choices=[
            ChatChoice(
                message=ChatMessage(role="assistant", content="I'm doing well, thank you!"),
                finish_reason="stop",
            )
        ],
        usage=Usage(prompt_tokens=10, completion_tokens=8, total_tokens=18),
        provider="openai",
        cost=0.0001,
    )


@pytest.fixture
def sample_capability() -> ModelCapability:
    return ModelCapability(
        model_id="gpt-4.1",
        priority=2,
        supports_streaming=True,
        supports_vision=True,
        supports_tools=True,
        supports_thinking=False,
        max_tokens=32000,
        cost_per_1k_input=0.002,
        cost_per_1k_output=0.008,
        provider="openai",
        rpm_allowed=200,
    )
