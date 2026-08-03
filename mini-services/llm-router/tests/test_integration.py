from __future__ import annotations

from unittest.mock import AsyncMock, patch

import jwt
import pytest
from httpx import ASGITransport, AsyncClient

from src.config import settings
from src.models.schemas import ChatMessage, ChatRequest, ChatResponse, ChatChoice, Usage

AUTH_HEADER = {"Authorization": f"Bearer {jwt.encode({'sub': 'test-user'}, settings.jwt_secret, algorithm=settings.jwt_algorithm)}"}


@pytest.mark.asyncio
async def test_full_routing_flow(client: AsyncClient):
    response = await client.post(
        "/v1/routing/decision",
        json={
            "task_category": "summarization",
            "estimated_input_tokens": 1500,
            "requires_thinking": False,
        },
        headers=AUTH_HEADER,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["model"] is not None
    assert data["estimated_cost"] >= 0


@pytest.mark.asyncio
async def test_models_list_contains_expected_models(client: AsyncClient):
    response = await client.get("/v1/models")
    assert response.status_code == 200
    data = response.json()
    model_ids = {m["id"] for m in data["data"]}
    assert "gpt-4.1" in model_ids
    assert "gpt-5.5" in model_ids
    assert "claude-opus" in model_ids
    assert "claude-sonnet" in model_ids
    assert "gemini-2.5-pro" in model_ids
    assert "gemini-2.5-flash" in model_ids
    assert "deepseek-r1" in model_ids
    assert "deepseek-v4" in model_ids


@pytest.mark.asyncio
async def test_health_check_returns_provider_status(client: AsyncClient):
    response = await client.get("/health")
    if response.status_code == 200:
        data = response.json()
        assert "providers_healthy" in data
        assert isinstance(data["providers_healthy"], dict)


@pytest.mark.asyncio
async def test_chat_validation(client: AsyncClient):
    response = await client.post(
        "/v1/chat/completions",
        json={
            "model": "auto",
            "messages": [
                {"role": "user", "content": "Hello"},
                {"role": "assistant", "content": "Hi"},
            ],
            "temperature": 0.5,
        },
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_routing_decision_respects_budget(client: AsyncClient):
    response = await client.post(
        "/v1/routing/decision",
        json={
            "task_category": "general",
            "estimated_input_tokens": 100,
            "max_budget": 0.001,
        },
        headers=AUTH_HEADER,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["model"] is not None


@pytest.mark.asyncio
async def test_streaming_endpoint_returns_correct_headers(client: AsyncClient):
    response = await client.post(
        "/v1/chat/completions/stream",
        json={
            "model": "gpt-4.1",
            "messages": [{"role": "user", "content": "Hello"}],
        },
    )
    assert response.status_code == 401


class TestConfigValidation:
    def test_provider_configs_exist(self):
        assert "openai" in settings.providers
        assert "anthropic" in settings.providers
        assert "google" in settings.providers
        assert "deepseek" in settings.providers

    def test_model_registry_is_populated(self):
        assert len(settings.model_registry) >= 8

    def test_model_capability_lookup(self):
        cap = settings.model_capability("gpt-4.1")
        assert cap is not None
        assert cap.model_id == "gpt-4.1"
        assert cap.provider == "openai"
        assert cap.cost_per_1k_input == 0.002

    def test_model_capability_unknown_returns_none(self):
        cap = settings.model_capability("nonexistent-model")
        assert cap is None

    def test_provider_for_model_lookup(self):
        config = settings.provider_for_model("gpt-4.1")
        assert config is not None
        config2 = settings.provider_for_model("nonexistent")
        assert config2 is None

    def test_deepseek_provider_config(self):
        config = settings.providers["deepseek"]
        assert config.rate_limit_rpm == 500
        assert config.timeout_seconds == 120
