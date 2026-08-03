from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class LLMProviderConfig:
    api_key: str
    base_url: Optional[str] = None
    timeout_seconds: int = 60
    max_retries: int = 3
    rate_limit_rpm: int = 100


@dataclass(frozen=True)
class ModelCapability:
    model_id: str
    priority: int
    supports_streaming: bool
    supports_vision: bool
    supports_tools: bool
    supports_thinking: bool
    max_tokens: int
    cost_per_1k_input: float
    cost_per_1k_output: float
    provider: str
    rpm_allowed: int


@dataclass(frozen=True)
class Settings:
    service_name: str = "llm-router"
    port: int = int(os.getenv("PORT", "7200"))
    environment: str = os.getenv("ENVIRONMENT", "production")
    log_level: str = os.getenv("LOG_LEVEL", "info")

    postgres_dsn: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./llm_router.db")
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    qdrant_url: str = os.getenv("QDRANT_URL", "http://localhost:6333")
    qdrant_api_key: Optional[str] = os.getenv("QDRANT_API_KEY")

    jwt_secret: str = os.getenv("JWT_SECRET", "change-me-in-production")
    jwt_algorithm: str = "HS256"
    jwt_expiry_minutes: int = int(os.getenv("JWT_EXPIRY_MINUTES", "60"))

    rate_limiter_url: str = os.getenv("RATE_LIMITER_URL", "http://rate-limiter:7102")
    enable_rate_limiting: bool = os.getenv("ENABLE_RATE_LIMITING", "true").lower() == "true"

    otlp_endpoint: Optional[str] = os.getenv("OTLP_ENDPOINT", "http://otel-collector:4318")
    enable_tracing: bool = os.getenv("ENABLE_TRACING", "true").lower() == "true"

    prometheus_enabled: bool = True

    providers: dict[str, LLMProviderConfig] = field(default_factory=lambda: {
        "openai": LLMProviderConfig(
            api_key=os.getenv("OPENAI_API_KEY", ""),
            timeout_seconds=120,
            rate_limit_rpm=200,
        ),
        "anthropic": LLMProviderConfig(
            api_key=os.getenv("ANTHROPIC_API_KEY", ""),
            timeout_seconds=120,
            rate_limit_rpm=100,
        ),
        "google": LLMProviderConfig(
            api_key=os.getenv("GEMINI_API_KEY", ""),
            base_url=os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com"),
            timeout_seconds=120,
            rate_limit_rpm=150,
        ),
        "deepseek": LLMProviderConfig(
            api_key=os.getenv("DEEPSEEK_API_KEY", ""),
            base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
            timeout_seconds=120,
            rate_limit_rpm=500,
        ),
    })

    model_registry: tuple[ModelCapability, ...] = (
        ModelCapability("gpt-5.5", 1, True, True, True, True, 128000, 0.01, 0.03, "openai", 200),
        ModelCapability("gpt-4.1", 2, True, True, True, False, 32000, 0.002, 0.008, "openai", 200),
        ModelCapability("claude-opus", 1, True, True, True, True, 200000, 0.015, 0.075, "anthropic", 100),
        ModelCapability("claude-sonnet", 2, True, True, True, False, 32000, 0.003, 0.015, "anthropic", 100),
        ModelCapability("gemini-2.5-pro", 1, True, True, True, True, 1048576, 0.005, 0.015, "google", 150),
        ModelCapability("gemini-2.5-flash", 3, True, True, False, False, 32000, 0.0005, 0.0015, "google", 150),
        ModelCapability("deepseek-r1", 1, True, False, False, True, 64000, 0.002, 0.008, "deepseek", 500),
        ModelCapability("deepseek-v4", 2, True, False, True, False, 64000, 0.001, 0.004, "deepseek", 500),
    )

    def provider_for_model(self, model_id: str) -> Optional[LLMProviderConfig]:
        for m in self.model_registry:
            if m.model_id == model_id:
                return self.providers.get(m.provider)
        return None

    def model_capability(self, model_id: str) -> Optional[ModelCapability]:
        for m in self.model_registry:
            if m.model_id == model_id:
                return m
        return None


settings = Settings()
