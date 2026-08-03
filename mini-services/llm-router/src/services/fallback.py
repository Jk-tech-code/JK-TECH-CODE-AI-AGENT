from __future__ import annotations

from typing import Optional

from src.config import ModelCapability, settings
from src.models.schemas import ChatRequest, RoutingRequest
from src.services.providers import ProviderError


class FallbackHandler:
    def __init__(self) -> None:
        self._fallback_order: list[str] = [
            "gpt-4.1", "claude-sonnet", "gemini-2.5-flash", "deepseek-v4",
        ]

    def select_fallback_models(self, failed_model: str, request: ChatRequest) -> list[ModelCapability]:
        candidates: list[ModelCapability] = []
        seen = {failed_model}

        for model_id in self._fallback_order:
            if model_id in seen:
                continue
            cap = settings.model_capability(model_id)
            if cap is None:
                continue
            seen.add(model_id)
            if not self._supports_request(cap, request):
                continue
            candidates.append(cap)
            if len(candidates) >= 3:
                break

        remaining = [m for m in settings.model_registry if m.model_id not in seen]
        for cap in remaining:
            if len(candidates) >= 3:
                break
            if self._supports_request(cap, request):
                candidates.append(cap)

        return candidates

    def select_fallback_for_routing(self, failed_model: str, routing: RoutingRequest) -> list[ModelCapability]:
        candidates: list[ModelCapability] = []
        seen = {failed_model}

        for model_id in self._fallback_order:
            if model_id in seen:
                continue
            cap = settings.model_capability(model_id)
            if cap is None:
                continue
            seen.add(model_id)
            if not self._supports_routing(cap, routing):
                continue
            candidates.append(cap)
            if len(candidates) >= 3:
                break

        remaining = [m for m in settings.model_registry if m.model_id not in seen]
        for cap in remaining:
            if len(candidates) >= 3:
                break
            if self._supports_routing(cap, routing):
                candidates.append(cap)

        return candidates

    def _supports_request(self, cap: ModelCapability, request: ChatRequest) -> bool:
        if request.thinking and not cap.supports_thinking:
            return False
        if request.max_tokens and request.max_tokens > cap.max_tokens:
            return False
        return True

    def _supports_routing(self, cap: ModelCapability, routing: RoutingRequest) -> bool:
        if routing.requires_thinking and not cap.supports_thinking:
            return False
        if routing.requires_vision and not cap.supports_vision:
            return False
        if routing.requires_tools and not cap.supports_tools:
            return False
        if routing.estimated_input_tokens > cap.max_tokens:
            return False
        return True

    def should_retry(self, error: ProviderError, attempt: int) -> bool:
        if attempt >= 3:
            return False
        if error.status_code in (429, 502, 503, 504):
            return True
        if error.status_code >= 500:
            return True
        return False


fallback_handler = FallbackHandler()
