from __future__ import annotations

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from prometheus_client import Counter
from starlette.types import ASGIApp

from src.config import settings

generation_counter = Counter("visual_processor_generations_total", "Images generated", ["model", "task_type"])
quality_counter = Counter("visual_processor_quality_results_total", "Quality check results", ["passed"])
safety_blocked = Counter("visual_processor_safety_blocked_total", "Requests blocked by safety", ["reason"])


def setup_telemetry(app: ASGIApp) -> None:
    if settings.enable_tracing and settings.otlp_endpoint:
        resource = Resource.create({"service.name": settings.service_name})
        provider = TracerProvider(resource=resource)
        exporter = OTLPSpanExporter(endpoint=f"{settings.otlp_endpoint}/v1/traces")
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)
        FastAPIInstrumentor.instrument_app(app)
