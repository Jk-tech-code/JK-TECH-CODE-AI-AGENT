from __future__ import annotations

import random
import time
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Optional

from src.config import ModelCapability, settings
from src.models.schemas import ChatRequest, ChatResponse, RoutingDecision, RoutingRequest
from src.services.fallback import fallback_handler
from src.services.providers import (
    AnthropicProvider,
    DeepSeekProvider,
    GeminiProvider,
    LLMProvider,
    OpenAIProvider,
    ProviderError,
)
from src.services.rate_limiter import rate_limiter
from src.utils.cache import cache
from src.utils.telemetry import cost_counter, model_errors, token_counter

TASK_MODEL_MAP: dict[str, list[str]] = {
    "coding": ["deepseek-v4", "deepseek-r1", "gpt-4.1", "claude-sonnet"],
    "reasoning": ["deepseek-r1", "gpt-5.5", "claude-opus", "gemini-2.5-pro"],
    "research": ["gpt-5.5", "gemini-2.5-pro", "claude-opus", "deepseek-r1"],
    "analysis": ["gpt-5.5", "claude-opus", "gemini-2.5-pro", "deepseek-r1"],
    "writing": ["claude-sonnet", "claude-opus", "gpt-4.1", "gemini-2.5-flash"],
    "creative": ["claude-sonnet", "gemini-2.5-flash", "gpt-4.1"],
    "summarization": ["gemini-2.5-flash", "gpt-4.1", "deepseek-v4"],
    "general": ["gpt-4.1", "claude-sonnet", "gemini-2.5-flash", "deepseek-v4"],
}


class ModelRouter:
    def __init__(self) -> None:
        self.providers: dict[str, LLMProvider] = {
            "openai": OpenAIProvider(),
            "anthropic": AnthropicProvider(),
            "google": GeminiProvider(),
            "deepseek": DeepSeekProvider(),
        }

    async def start(self) -> None:
        for p in self.providers.values():
            await p.start()

    async def stop(self) -> None:
        for p in self.providers.values():
            await p.stop()

    async def route_chat(self, request: ChatRequest) -> ChatResponse:
        if request.model and request.model != "auto":
            cap = settings.model_capability(request.model)
            if cap is None:
                raise ValueError(f"Unknown model: {request.model}")
            provider = self.providers.get(cap.provider)
            if provider is None:
                raise ValueError(f"No provider for model: {request.model}")
            trace_id = uuid.uuid4().hex[:12]
            return await self._execute_with_fallback(provider, request, cap, trace_id)

        routing = self._build_routing(request)
        decision = self.select_model(routing)
        cap = settings.model_capability(decision.model)
        if cap is None:
            raise ValueError(f"Routed to unknown model: {decision.model}")
        provider = self.providers.get(cap.provider)
        if provider is None:
            raise ValueError(f"No provider for routed model: {decision.model}")
        request.model = decision.model
        trace_id = uuid.uuid4().hex[:12]
        return await self._execute_with_fallback(provider, request, cap, trace_id)

    async def stream_chat(self, request: ChatRequest) -> AsyncIterator[dict[str, Any]]:
        if request.model and request.model != "auto":
            cap = settings.model_capability(request.model)
            if cap is None:
                raise ValueError(f"Unknown model: {request.model}")
            provider = self.providers.get(cap.provider)
            if provider is None:
                raise ValueError(f"No provider for model: {request.model}")
            async for chunk in provider.chat_stream(request, cap):
                yield chunk
            return

        routing = self._build_routing(request)
        decision = self.select_model(routing)
        cap = settings.model_capability(decision.model)
        if cap is None:
            raise ValueError(f"Routed to unknown model: {decision.model}")
        provider = self.providers.get(cap.provider)
        if provider is None:
            raise ValueError(f"No provider for routed model: {decision.model}")
        request.model = decision.model
        async for chunk in provider.chat_stream(request, cap):
            yield chunk

    def select_model(self, routing: RoutingRequest) -> RoutingDecision:
        candidates = TASK_MODEL_MAP.get(routing.task_category, TASK_MODEL_MAP["general"])
        scored: list[tuple[float, ModelCapability]] = []

        for model_id in candidates:
            cap = settings.model_capability(model_id)
            if cap is None:
                continue
            if routing.requires_thinking and not cap.supports_thinking:
                continue
            if routing.requires_vision and not cap.supports_vision:
                continue
            if routing.requires_tools and not cap.supports_tools:
                continue
            if routing.estimated_input_tokens > cap.max_tokens:
                continue

            cost_score = 1.0 / (cap.cost_per_1k_input + cap.cost_per_1k_output + 0.001)
            priority_score = 1.0 / (cap.priority + 0.1)
            total_score = cost_score * 0.4 + priority_score * 0.6

            if routing.preferred_provider and cap.provider == routing.preferred_provider:
                total_score *= 1.5

            scored.append((total_score, cap))

        if not scored and routing.task_category != "general":
            return self.select_model(RoutingRequest(task_category="general"))

        if not scored:
            fallback_candidates = settings.model_registry
            for cap in fallback_candidates:
                cost_score = 1.0 / (cap.cost_per_1k_input + cap.cost_per_1k_output + 0.001)
                priority_score = 1.0 / (cap.priority + 0.1)
                scored.append((cost_score * 0.4 + priority_score * 0.6, cap))

        scored.sort(key=lambda x: x[0], reverse=True)
        selected = scored[0][1]

        estimated_input_cost = (routing.estimated_input_tokens / 1000) * selected.cost_per_1k_input
        estimated_output_cost = (routing.estimated_input_tokens / 1000) * selected.cost_per_1k_output * 0.5
        estimated_cost = estimated_input_cost + estimated_output_cost

        if routing.max_budget is not None and estimated_cost > routing.max_budget:
            for score, cap in scored[1:]:
                alt_cost = (routing.estimated_input_tokens / 1000) * cap.cost_per_1k_input
                if alt_cost <= routing.max_budget:
                    selected = cap
                    break

        return RoutingDecision(
            model=selected.model_id,
            provider=selected.provider,
            estimated_cost=estimated_cost,
            capability_match=scored[0][0],
            priority=selected.priority,
            reason=f"Best match for {routing.task_category} with cost ${estimated_cost:.6f}",
        )

    async def _execute_with_fallback(
        self, provider: LLMProvider, request: ChatRequest, capability: ModelCapability, trace_id: str
    ) -> ChatResponse:
        attempt = 0
        last_error: Optional[ProviderError] = None

        while attempt < 3:
            try:
                rate_limiter.increment(request.model, request.user_id)
                response = await provider.chat(request, capability)
                self._record_metrics(response, trace_id)
                return response
            except ProviderError as exc:
                attempt += 1
                model_errors.labels(request.model, provider.name, str(exc.status_code)).inc()
                last_error = exc
                if not fallback_handler.should_retry(exc, attempt):
                    break
                time.sleep(1.0 * attempt)

        fallback_models = fallback_handler.select_fallback_models(request.model, request)
        for fb_cap in fallback_models:
            fb_provider = self.providers.get(fb_cap.provider)
            if fb_provider is None:
                continue
            try:
                request.model = fb_cap.model_id
                response = await fb_provider.chat(request, fb_cap)
                self._record_metrics(response, trace_id)
                return response
            except ProviderError:
                continue

        raise ProviderError(
            f"All models failed for request {trace_id}. Last error: {last_error}",
            "llm-router",
            502,
        )

    def _build_routing(self, request: ChatRequest) -> RoutingRequest:
        last_msg = request.messages[-1].content if request.messages else ""
        estimated_tokens = len(last_msg.split()) * 1.5

        task = "general"
        if any(kw in last_msg.lower() for kw in ["code", "function", "bug", "debug", "implement"]):
            task = "coding"
        elif any(kw in last_msg.lower() for kw in ["explain", "why", "how", "reason", "think"]):
            task = "reasoning"
        elif any(kw in last_msg.lower() for kw in ["research", "search", "find", "look up"]):
            task = "research"
        elif any(kw in last_msg.lower() for kw in ["analyze", "compare", "evaluate"]):
            task = "analysis"
        elif any(kw in last_msg.lower() for kw in ["write", "draft", "essay", "blog", "email", "article"]):
            task = "writing"
        elif any(kw in last_msg.lower() for kw in ["creative", "story", "poem", "idea", "brainstorm"]):
            task = "creative"
        elif any(kw in last_msg.lower() for kw in ["summarize", "summary", "tl;dr"]):
            task = "summarization"

        return RoutingRequest(
            task_category=task,
            requires_thinking=request.thinking,
            estimated_input_tokens=int(estimated_tokens),
        )

    def _get_capability(self, model_id: str) -> Optional[ModelCapability]:
        return settings.model_capability(model_id)

    def _record_metrics(self, response: ChatResponse, trace_id: str) -> None:
        token_counter.labels(response.model, "input").inc(response.usage.prompt_tokens)
        token_counter.labels(response.model, "output").inc(response.usage.completion_tokens)
        cost_counter.labels(response.model, response.provider).inc(response.cost)

    def get_health(self) -> dict[str, bool]:
        return {name: False for name in self.providers}

    async def check_all_health(self) -> dict[str, bool]:
        results: dict[str, bool] = {}
        for name, provider in self.providers.items():
            try:
                results[name] = await provider.health()
            except Exception:
                results[name] = False
        return results


model_router = ModelRouter()
