from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from src.models.schemas import ChatMessage, ChatRequest
from src.services.providers import OpenAIProvider, ProviderError


class TestOpenAIProvider:
    @pytest.mark.asyncio
    async def test_chat_success(self, chat_request, chat_response, sample_capability):
        provider = OpenAIProvider()
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "test-cmpl-001",
            "choices": [
                {
                    "message": {"content": "I'm doing well, thank you!"},
                    "finish_reason": "stop",
                }
            ],
            "usage": {"prompt_tokens": 10, "completion_tokens": 8, "total_tokens": 18},
        }
        mock_client.post.return_value = mock_response
        provider._client = mock_client

        response = await provider.chat(chat_request, sample_capability)
        assert response.id == "test-cmpl-001"
        assert response.choices[0].message.content == "I'm doing well, thank you!"
        assert response.usage.prompt_tokens == 10
        assert response.provider == "openai"

    @pytest.mark.asyncio
    async def test_chat_api_error(self, chat_request, sample_capability):
        provider = OpenAIProvider()
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 401
        mock_response.json.return_value = {"error": {"message": "Invalid API key"}}
        mock_client.post.return_value = mock_response
        provider._client = mock_client

        with pytest.raises(ProviderError) as exc:
            await provider.chat(chat_request, sample_capability)
        assert exc.value.status_code == 401

    @pytest.mark.asyncio
    async def test_chat_retry_on_429(self, chat_request, sample_capability):
        provider = OpenAIProvider()
        mock_client = AsyncMock(spec=httpx.AsyncClient)

        fail_response = MagicMock(spec=httpx.Response)
        fail_response.status_code = 429
        fail_response.json.return_value = {"error": {"message": "Rate limited"}}

        success_response = MagicMock(spec=httpx.Response)
        success_response.status_code = 200
        success_response.json.return_value = {
            "id": "test-cmpl-002",
            "choices": [{"message": {"content": "OK"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8},
        }

        mock_client.post.side_effect = [fail_response, success_response]
        provider._client = mock_client

        response = await provider.chat(chat_request, sample_capability)
        assert response.choices[0].message.content == "OK"

    def test_parse_response(self):
        provider = OpenAIProvider()
        data = {
            "id": "cmpl-test",
            "choices": [
                {
                    "message": {"content": "Hello!"},
                    "finish_reason": "stop",
                }
            ],
            "usage": {"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8},
        }
        response = provider._parse_response(data, "gpt-4.1", 100.0)
        assert response.model == "gpt-4.1"
        assert response.choices[0].message.content == "Hello!"
        assert response.usage.total_tokens == 8

    def test_calculate_cost(self, sample_capability):
        provider = OpenAIProvider()
        cost = provider._calculate_cost(1000, 500, "gpt-4.1")
        expected = (1000 / 1000) * 0.002 + (500 / 1000) * 0.008
        assert cost == expected


class TestProviderError:
    def test_provider_error_attributes(self):
        err = ProviderError("Test error", "openai", 503)
        assert err.provider == "openai"
        assert err.status_code == 503
        assert str(err) == "Test error"
