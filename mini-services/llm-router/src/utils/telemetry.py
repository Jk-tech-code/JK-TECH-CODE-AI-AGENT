from __future__ import annotations

from typing import Optional

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from prometheus_client import Counter, Gauge, Histogram
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.types import ASGIApp

from src.config import settings

request_counter = Counter(
    "llm_router_requests_total",
    "Total requests",
    ["model", "provider", "status"],
)

request_latency = Histogram(
    "llm_router_request_duration_seconds",
    "Request latency in seconds",
    ["model", "provider"],
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0),
)

token_counter = Counter(
    "llm_router_tokens_total",
    "Tokens consumed",
    ["model", "type"],
)

cost_counter = Counter(
    "llm_router_cost_total",
    "Cost in USD",
    ["model", "provider"],
)

active_requests = Gauge(
    "llm_router_active_requests",
    "Currently active requests",
    ["model"],
)

provider_health_gauge = Gauge(
    "llm_router_provider_health",
    "Provider health status (1=healthy, 0=unhealthy)",
    ["provider"],
)

model_errors = Counter(
    "llm_router_model_errors_total",
    "Model errors",
    ["model", "provider", "error_type"],
)


def setup_telemetry(app: ASGIApp) -> None:
    if settings.enable_tracing and settings.otlp_endpoint:
        resource = Resource.create({"service.name": settings.service_name})
        provider = TracerProvider(resource=resource)
        exporter = OTLPSpanExporter(endpoint=f"{settings.otlp_endpoint}/v1/traces")
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)
        FastAPIInstrumentor.instrument_app(app)


class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint):
        if request.url.path.startswith("/metrics") or request.url.path.startswith("/health"):
            return await call_next(request)

        model = request.path_params.get("model", "unknown") if hasattr(request, "path_params") else "unknown"
        if request.url.path == "/v1/chat/completions":
            try:
                body = await request.json()
                model = body.get("model", "auto")
            except Exception:
                model = "unknown"

        provider = ""
        labels = (model, provider)

        active_requests.labels(model).inc()
        with request_latency.labels(model, provider).time():
            response = await call_next(request)

        status = "2xx" if 200 <= response.status_code < 300 else "5xx" if response.status_code >= 500 else "4xx"
        request_counter.labels(model, provider, status).inc()
        active_requests.labels(model).dec()

        return response
