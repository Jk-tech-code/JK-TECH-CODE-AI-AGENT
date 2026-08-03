from __future__ import annotations

import pytest

from src.models.schemas import ChatMessage, ChatRequest
from src.services.fallback import FallbackHandler, fallback_handler
from src.services.providers import ProviderError


class TestFallbackHandler:
    def test_select_fallback_models(self):
        request = ChatRequest(
            model="gpt-5.5",
            messages=[ChatMessage(role="user", content="test")],
            thinking=False,
        )
        models = fallback_handler.select_fallback_models("gpt-5.5", request)
        assert len(models) >= 1
        assert all(m.model_id != "gpt-5.5" for m in models)

    def test_fallback_excludes_failed_model(self):
        request = ChatRequest(
            model="deepseek-r1",
            messages=[ChatMessage(role="user", content="test")],
        )
        models = fallback_handler.select_fallback_models("deepseek-r1", request)
        assert all(m.model_id != "deepseek-r1" for m in models)

    def test_fallback_respects_thinking_requirement(self):
        request = ChatRequest(
            model="gpt-5.5",
            messages=[ChatMessage(role="user", content="test")],
            thinking=True,
        )
        models = fallback_handler.select_fallback_models("gpt-5.5", request)
        for m in models:
            if not m.supports_thinking:
                assert False, f"Model {m.model_id} does not support thinking but was selected"

    def test_fallback_respects_token_limit(self):
        request = ChatRequest(
            model="gpt-5.5",
            messages=[ChatMessage(role="user", content="test")],
            max_tokens=250000,
        )
        models = fallback_handler.select_fallback_models("gpt-5.5", request)
        for m in models:
            assert m.max_tokens >= 250000

    def test_should_retry_rate_limit(self):
        err = ProviderError("rate limited", "openai", 429)
        assert fallback_handler.should_retry(err, 0) is True
        assert fallback_handler.should_retry(err, 3) is False

    def test_should_retry_server_error(self):
        err = ProviderError("server error", "openai", 502)
        assert fallback_handler.should_retry(err, 0) is True
        assert fallback_handler.should_retry(err, 1) is True
        assert fallback_handler.should_retry(err, 3) is False

    def test_should_not_retry_client_error(self):
        err = ProviderError("bad request", "openai", 400)
        assert fallback_handler.should_retry(err, 0) is False

    def test_should_not_retry_auth_error(self):
        err = ProviderError("unauthorized", "openai", 401)
        assert fallback_handler.should_retry(err, 0) is False
