from __future__ import annotations

import jwt
import pytest
from httpx import ASGITransport, AsyncClient

from src.config import settings

TEST_TOKEN = jwt.encode({"sub": "test-user"}, settings.jwt_secret, algorithm=settings.jwt_algorithm)
AUTH_HEADER = {"Authorization": f"Bearer {TEST_TOKEN}"}


class TestHealthAPI:
    @pytest.mark.asyncio
    async def test_health_endpoint(self, client: AsyncClient):
        response = await client.get("/health")
        assert response.status_code in (200, 502)
        if response.status_code == 200:
            data = response.json()
            assert data["status"] in ("ok", "degraded")
            assert data["service"] == "llm-router"
            assert data["models_available"] > 0

    @pytest.mark.asyncio
    async def test_liveness(self, client: AsyncClient):
        response = await client.get("/health/live")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "alive"

    @pytest.mark.asyncio
    async def test_readiness(self, client: AsyncClient):
        response = await client.get("/health/ready")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"


class TestModelsAPI:
    @pytest.mark.asyncio
    async def test_list_models(self, client: AsyncClient):
        response = await client.get("/v1/models")
        assert response.status_code == 200
        data = response.json()
        assert data["object"] == "list"
        assert len(data["data"]) > 0
        model_ids = [m["id"] for m in data["data"]]
        assert "gpt-4.1" in model_ids
        assert "deepseek-r1" in model_ids
        assert "claude-opus" in model_ids
        assert "gemini-2.5-pro" in model_ids


class TestChatAPI:
    @pytest.mark.asyncio
    async def test_chat_missing_messages(self, client: AsyncClient):
        response = await client.post("/v1/chat/completions", json={"model": "gpt-4.1"}, headers=AUTH_HEADER)
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_chat_unauthorized(self, client: AsyncClient):
        response = await client.post(
            "/v1/chat/completions",
            json={
                "model": "gpt-4.1",
                "messages": [{"role": "user", "content": "hello"}],
            },
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_chat_auth_failure(self, client: AsyncClient):
        response = await client.post(
            "/v1/chat/completions",
            json={
                "model": "gpt-4.1",
                "messages": [{"role": "user", "content": "hello"}],
            },
            headers={"Authorization": "Bearer invalid-token"},
        )
        assert response.status_code == 401


class TestRoutingAPI:
    @pytest.mark.asyncio
    async def test_routing_decision(self, client: AsyncClient):
        response = await client.post(
            "/v1/routing/decision",
            json={
                "task_category": "coding",
                "estimated_input_tokens": 500,
                "requires_thinking": False,
            },
            headers=AUTH_HEADER,
        )
        assert response.status_code == 200
        data = response.json()
        assert "model" in data
        assert "provider" in data
        assert "estimated_cost" in data
        assert data["estimated_cost"] > 0

    @pytest.mark.asyncio
    async def test_routing_with_thinking(self, client: AsyncClient):
        response = await client.post(
            "/v1/routing/decision",
            json={
                "task_category": "reasoning",
                "requires_thinking": True,
                "estimated_input_tokens": 2000,
            },
            headers=AUTH_HEADER,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["model"] in ("deepseek-r1", "gpt-5.5", "claude-opus", "gemini-2.5-pro")

    @pytest.mark.asyncio
    async def test_routing_invalid_category(self, client: AsyncClient):
        response = await client.post(
            "/v1/routing/decision",
            json={
                "task_category": "invalid",
                "estimated_input_tokens": 100,
            },
            headers=AUTH_HEADER,
        )
        assert response.status_code == 422


class TestAdminAPI:
    @pytest.mark.asyncio
    async def test_root_endpoint(self, client: AsyncClient):
        response = await client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["service"] == "llm-router"
        assert data["version"] == "1.0.0"
