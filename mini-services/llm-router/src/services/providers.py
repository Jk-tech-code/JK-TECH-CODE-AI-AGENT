from __future__ import annotations

import time
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Optional

import httpx
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from src.config import ModelCapability, settings
from src.models.schemas import ChatMessage, ChatRequest, ChatResponse, ChatChoice, Usage


class ProviderError(Exception):
    def __init__(self, message: str, provider: str, status_code: int = 500) -> None:
        self.provider = provider
        self.status_code = status_code
        super().__init__(message)


def _is_retryable(exc: BaseException) -> bool:
    if isinstance(exc, ProviderError):
        return exc.status_code in (429, 502, 503)
    return True


class LLMProvider(ABC):
    def __init__(self, name: str, config_key: str) -> None:
        self.name = name
        self.config = settings.providers[config_key]
        self._client: Optional[httpx.AsyncClient] = None

    async def start(self) -> None:
        base = getattr(self, "base_url", self.config.base_url) or ""
        self._client = httpx.AsyncClient(
            base_url=base,
            timeout=self.config.timeout_seconds,
            limits=httpx.Limits(max_keepalive_connections=10, max_connections=50),
        )

    async def stop(self) -> None:
        if self._client:
            await self._client.aclose()

    @abstractmethod
    async def chat(self, request: ChatRequest, capability: ModelCapability) -> ChatResponse:
        ...

    @abstractmethod
    async def chat_stream(self, request: ChatRequest, capability: ModelCapability) -> AsyncIterator[dict[str, Any]]:
        ...

    async def health(self) -> bool:
        try:
            if self._client:
                resp = await self._client.get("/health", timeout=5.0)
                return resp.status_code < 500
        except Exception:
            return False
        return False


class OpenAIProvider(LLMProvider):
    def __init__(self) -> None:
        super().__init__("openai", "openai")
        self.base_url = self.config.base_url or "https://api.openai.com/v1"

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10), retry=retry_if_exception(_is_retryable))
    async def chat(self, request: ChatRequest, capability: ModelCapability) -> ChatResponse:
        start = time.monotonic()
        payload = self._build_payload(request, capability)
        headers = self._headers()

        resp = await self._client.post(
            f"{self.base_url}/chat/completions",
            json=payload,
            headers=headers,
        )
        data = self._handle_response(resp)

        elapsed = (time.monotonic() - start) * 1000
        return self._parse_response(data, request.model, elapsed)

    async def chat_stream(self, request: ChatRequest, capability: ModelCapability) -> AsyncIterator[dict[str, Any]]:
        payload = self._build_payload(request, capability)
        payload["stream"] = True
        headers = self._headers()

        async with self._client.stream("POST", f"{self.base_url}/chat/completions", json=payload, headers=headers) as resp:
            if resp.status_code >= 400:
                body = await resp.aread()
                raise ProviderError(f"OpenAI stream error: {body.decode()}", "openai", resp.status_code)
            async for line in resp.aiter_lines():
                if line.startswith("data: "):
                    yield {"content": line[6:], "model": request.model}

    def _build_payload(self, request: ChatRequest, capability: ModelCapability) -> dict[str, Any]:
        return {
            "model": request.model if request.model != "auto" else capability.model_id,
            "messages": [{"role": m.role, "content": m.content} for m in request.messages],
            "temperature": request.temperature or 0.7,
            "max_tokens": request.max_tokens or capability.max_tokens,
            "stream": False,
        }

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json",
        }

    def _handle_response(self, resp: httpx.Response) -> dict[str, Any]:
        try:
            data = resp.json()
        except Exception as exc:
            raise ProviderError(f"OpenAI parse error: {resp.text[:200]}", "openai", resp.status_code) from exc
        if resp.status_code >= 400:
            err = data.get("error", {}).get("message", resp.text[:200])
            raise ProviderError(f"OpenAI error: {err}", "openai", resp.status_code)
        return data

    def _parse_response(self, data: dict[str, Any], model: str, latency_ms: float) -> ChatResponse:
        choice = data["choices"][0]
        usage_data = data.get("usage", {})
        usage = Usage(
            prompt_tokens=usage_data.get("prompt_tokens", 0),
            completion_tokens=usage_data.get("completion_tokens", 0),
            total_tokens=usage_data.get("total_tokens", 0),
        )
        return ChatResponse(
            id=data.get("id", f"chatcmpl-{uuid.uuid4().hex[:8]}"),
            created=int(datetime.now(timezone.utc).timestamp()),
            model=model,
            choices=[
                ChatChoice(
                    message=ChatMessage(role="assistant", content=choice["message"]["content"]),
                    finish_reason=choice.get("finish_reason", "stop"),
                )
            ],
            usage=usage,
            provider="openai",
            cost=self._calculate_cost(usage.prompt_tokens, usage.completion_tokens, model),
        )

    def _calculate_cost(self, input_tokens: int, output_tokens: int, model: str) -> float:
        cap = settings.model_capability(model)
        if not cap:
            return 0.0
        return (input_tokens / 1000) * cap.cost_per_1k_input + (output_tokens / 1000) * cap.cost_per_1k_output


class AnthropicProvider(LLMProvider):
    def __init__(self) -> None:
        super().__init__("anthropic", "anthropic")
        self.base_url = "https://api.anthropic.com/v1"

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10), retry=retry_if_exception(_is_retryable))
    async def chat(self, request: ChatRequest, capability: ModelCapability) -> ChatResponse:
        start = time.monotonic()
        system, messages = self._split_system(request.messages)
        payload = self._build_payload(request, capability, system, messages)
        headers = self._headers()

        resp = await self._client.post(f"{self.base_url}/messages", json=payload, headers=headers)
        data = self._handle_response(resp)

        elapsed = (time.monotonic() - start) * 1000
        content = ""
        for block in data.get("content", []):
            if block.get("type") == "text":
                content += block.get("text", "")

        usage_data = data.get("usage", {})
        usage = Usage(
            prompt_tokens=usage_data.get("input_tokens", 0),
            completion_tokens=usage_data.get("output_tokens", 0),
            total_tokens=usage_data.get("input_tokens", 0) + usage_data.get("output_tokens", 0),
        )
        return ChatResponse(
            id=data.get("id", f"msg_{uuid.uuid4().hex[:8]}"),
            created=int(datetime.now(timezone.utc).timestamp()),
            model=request.model,
            choices=[ChatChoice(message=ChatMessage(role="assistant", content=content))],
            usage=usage,
            provider="anthropic",
            cost=self._calculate_cost(usage.prompt_tokens, usage.completion_tokens, request.model),
        )

    async def chat_stream(self, request: ChatRequest, capability: ModelCapability) -> AsyncIterator[dict[str, Any]]:
        system, messages = self._split_system(request.messages)
        payload = self._build_payload(request, capability, system, messages)
        payload["stream"] = True
        headers = self._headers()

        async with self._client.stream("POST", f"{self.base_url}/messages", json=payload, headers=headers) as resp:
            if resp.status_code >= 400:
                body = await resp.aread()
                raise ProviderError(f"Anthropic stream error: {body.decode()[:200]}", "anthropic", resp.status_code)
            async for line in resp.aiter_lines():
                if line.startswith("data: "):
                    yield {"content": line[6:], "model": request.model}

    def _split_system(self, messages: list[ChatMessage]) -> tuple[Optional[str], list[dict[str, str]]]:
        system = None
        rest = []
        for m in messages:
            if m.role == "system" and system is None:
                system = m.content
            else:
                rest.append({"role": m.role, "content": m.content})
        return system, rest

    def _build_payload(self, request: ChatRequest, capability: ModelCapability, system: Optional[str], messages: list[dict[str, str]]) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": request.model if request.model != "auto" else capability.model_id,
            "messages": messages,
            "max_tokens": request.max_tokens or capability.max_tokens,
            "temperature": request.temperature or 0.7,
        }
        if system:
            payload["system"] = system
        return payload

    def _headers(self) -> dict[str, str]:
        return {
            "x-api-key": self.config.api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }

    def _handle_response(self, resp: httpx.Response) -> dict[str, Any]:
        try:
            data = resp.json()
        except Exception as exc:
            raise ProviderError(f"Anthropic parse error: {resp.text[:200]}", "anthropic", resp.status_code) from exc
        if resp.status_code >= 400:
            err = data.get("error", {}).get("message", resp.text[:200])
            raise ProviderError(f"Anthropic error: {err}", "anthropic", resp.status_code)
        return data

    def _calculate_cost(self, input_tokens: int, output_tokens: int, model: str) -> float:
        cap = settings.model_capability(model)
        if not cap:
            return 0.0
        return (input_tokens / 1000) * cap.cost_per_1k_input + (output_tokens / 1000) * cap.cost_per_1k_output


class GeminiProvider(LLMProvider):
    def __init__(self) -> None:
        super().__init__("google", "google")
        self.base_url = f"{self.config.base_url}/v1beta/openai"

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10), retry=retry_if_exception(_is_retryable))
    async def chat(self, request: ChatRequest, capability: ModelCapability) -> ChatResponse:
        start = time.monotonic()
        payload = {
            "model": request.model if request.model != "auto" else capability.model_id,
            "messages": [{"role": m.role, "content": m.content} for m in request.messages],
            "temperature": request.temperature or 0.7,
            "max_tokens": request.max_tokens or capability.max_tokens,
        }
        headers = {"Authorization": f"Bearer {self.config.api_key}", "Content-Type": "application/json"}

        resp = await self._client.post(f"{self.base_url}/chat/completions", json=payload, headers=headers)
        if resp.status_code >= 400:
            raise ProviderError(f"Gemini error: {resp.text[:200]}", "gemini", resp.status_code)

        data = resp.json()
        elapsed = (time.monotonic() - start) * 1000
        choice = data["choices"][0]
        usage_data = data.get("usage", {})
        usage = Usage(
            prompt_tokens=usage_data.get("prompt_tokens", 0),
            completion_tokens=usage_data.get("completion_tokens", 0),
            total_tokens=usage_data.get("total_tokens", 0),
        )
        cap = settings.model_capability(request.model)
        cost = 0.0
        if cap:
            cost = (usage.prompt_tokens / 1000) * cap.cost_per_1k_input + (usage.completion_tokens / 1000) * cap.cost_per_1k_output

        return ChatResponse(
            id=f"chatcmpl-{uuid.uuid4().hex[:8]}",
            created=int(datetime.now(timezone.utc).timestamp()),
            model=request.model,
            choices=[ChatChoice(message=ChatMessage(role="assistant", content=choice["message"]["content"]))],
            usage=usage,
            provider="google",
            cost=cost,
        )

    async def chat_stream(self, request: ChatRequest, capability: ModelCapability) -> AsyncIterator[dict[str, Any]]:
        payload = {
            "model": request.model if request.model != "auto" else capability.model_id,
            "messages": [{"role": m.role, "content": m.content} for m in request.messages],
            "temperature": request.temperature or 0.7,
            "max_tokens": request.max_tokens or capability.max_tokens,
            "stream": True,
        }
        headers = {"Authorization": f"Bearer {self.config.api_key}", "Content-Type": "application/json"}

        async with self._client.stream("POST", f"{self.base_url}/chat/completions", json=payload, headers=headers) as resp:
            if resp.status_code >= 400:
                body = await resp.aread()
                raise ProviderError(f"Gemini stream error: {body.decode()[:200]}", "gemini", resp.status_code)
            async for line in resp.aiter_lines():
                if line.startswith("data: "):
                    yield {"content": line[6:], "model": request.model}


class DeepSeekProvider(LLMProvider):
    def __init__(self) -> None:
        super().__init__("deepseek", "deepseek")
        self.base_url = self.config.base_url or "https://api.deepseek.com"

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10), retry=retry_if_exception(_is_retryable))
    async def chat(self, request: ChatRequest, capability: ModelCapability) -> ChatResponse:
        start = time.monotonic()
        payload = {
            "model": request.model if request.model != "auto" else capability.model_id,
            "messages": [{"role": m.role, "content": m.content} for m in request.messages],
            "temperature": request.temperature or 0.7,
            "max_tokens": request.max_tokens or capability.max_tokens,
        }
        headers = {"Authorization": f"Bearer {self.config.api_key}", "Content-Type": "application/json"}

        resp = await self._client.post(f"{self.base_url}/v1/chat/completions", json=payload, headers=headers)
        if resp.status_code >= 400:
            raise ProviderError(f"DeepSeek error: {resp.text[:200]}", "deepseek", resp.status_code)

        data = resp.json()
        elapsed = (time.monotonic() - start) * 1000
        choice = data["choices"][0]
        usage_data = data.get("usage", {})
        usage = Usage(
            prompt_tokens=usage_data.get("prompt_tokens", 0),
            completion_tokens=usage_data.get("completion_tokens", 0),
            total_tokens=usage_data.get("total_tokens", 0),
        )
        cap = settings.model_capability(request.model)
        cost = 0.0
        if cap:
            cost = (usage.prompt_tokens / 1000) * cap.cost_per_1k_input + (usage.completion_tokens / 1000) * cap.cost_per_1k_output

        return ChatResponse(
            id=f"chatcmpl-{uuid.uuid4().hex[:8]}",
            created=int(datetime.now(timezone.utc).timestamp()),
            model=request.model,
            choices=[ChatChoice(message=ChatMessage(role="assistant", content=choice["message"]["content"]))],
            usage=usage,
            provider="deepseek",
            cost=cost,
        )

    async def chat_stream(self, request: ChatRequest, capability: ModelCapability) -> AsyncIterator[dict[str, Any]]:
        payload = {
            "model": request.model if request.model != "auto" else capability.model_id,
            "messages": [{"role": m.role, "content": m.content} for m in request.messages],
            "temperature": request.temperature or 0.7,
            "max_tokens": request.max_tokens or capability.max_tokens,
            "stream": True,
        }
        headers = {"Authorization": f"Bearer {self.config.api_key}", "Content-Type": "application/json"}

        async with self._client.stream("POST", f"{self.base_url}/v1/chat/completions", json=payload, headers=headers) as resp:
            if resp.status_code >= 400:
                body = await resp.aread()
                raise ProviderError(f"DeepSeek stream error: {body.decode()[:200]}", "deepseek", resp.status_code)
            async for line in resp.aiter_lines():
                if line.startswith("data: "):
                    yield {"content": line[6:], "model": request.model}
