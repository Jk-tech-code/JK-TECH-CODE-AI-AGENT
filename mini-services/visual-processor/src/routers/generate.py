from __future__ import annotations

import time
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException

from src.config import settings
from src.models.schemas import (
    GeneratedImageOut,
    OptimizedPrompt,
    PipelineResult,
    PipelineStageOut,
    VisualGenerationRequest,
    VisualGenerationResponse,
)
from src.services.brand_memory import brand_memory
from src.services.nonprofit import nonprofit_storyteller
from src.services.prompt_optimizer import prompt_optimizer
from src.services.qa_system import qa_system
from src.services.safety import safety_framework
from src.services.visual_seo import visual_seo
from src.utils.telemetry import generation_counter, quality_counter, safety_blocked

router = APIRouter(prefix="/v1", tags=["generation"])


@router.post("/images/generations", response_model=VisualGenerationResponse)
async def generate_image(request: VisualGenerationRequest) -> VisualGenerationResponse:
    start_time = time.time()
    stages: list[PipelineStageOut] = []
    model_used = request.model_id or "nano-banana-internal"

    t0 = time.time()
    safety_report = safety_framework.analyze_request(request)
    stages.append(PipelineStageOut(
        name="safety", status="passed" if safety_report.passed else "blocked",
        score=safety_report.overall_score, duration_ms=int((time.time() - t0) * 1000),
    ))
    if not safety_report.passed:
        safety_blocked.labels(reason="safety_check").inc()
        return VisualGenerationResponse(
            images=[], model_used=model_used, prompt_used=request.prompt,
            latency_ms=int((time.time() - start_time) * 1000), cost=0.0,
            quality_score=0.0, safety_score=safety_report.overall_score, seo={},
        )

    t0 = time.time()
    opt_result: OptimizedPrompt = await prompt_optimizer.optimize(request)
    stages.append(PipelineStageOut(
        name="prompt_optimization", status="passed",
        duration_ms=int((time.time() - t0) * 1000),
    ))

    brand = None
    if request.brand_id:
        brand = await brand_memory.get(request.brand_id)

    final_prompt = opt_result.optimized
    if brand:
        final_prompt = brand_memory.apply_brand_to_prompt(brand, final_prompt)

    t0 = time.time()
    generated: list[GeneratedImageOut] = []
    for _ in range(request.num_images):
        mock_image = _mock_generate(final_prompt, request)
        generated.append(mock_image)

    stages.append(PipelineStageOut(
        name="generation", status="passed",
        duration_ms=int((time.time() - t0) * 1000),
    ))
    generation_counter.labels(model=model_used, task_type=request.task_type).inc()

    t0 = time.time()
    qa_results = await qa_system.assess(
        {"width": generated[0].width, "height": generated[0].height, "alt_text": generated[0].alt_text},
        final_prompt,
    )
    stages.append(PipelineStageOut(
        name="quality_assurance", status="passed" if qa_results.passed else "failed",
        score=qa_results.overall_score,
        details=f"Issues: {len(qa_results.issues)}",
        duration_ms=int((time.time() - t0) * 1000),
    ))
    quality_counter.labels(passed=str(qa_results.passed)).inc()

    t0 = time.time()
    seo_meta = visual_seo.generate(final_prompt, {
        "url": generated[0].url, "width": generated[0].width,
        "height": generated[0].height, "format": request.format,
    })
    stages.append(PipelineStageOut(
        name="seo", status="passed", duration_ms=int((time.time() - t0) * 1000),
    ))

    total_latency = int((time.time() - start_time) * 1000)
    cost = _estimate_cost(model_used, request.num_images)

    return VisualGenerationResponse(
        images=generated,
        model_used=model_used,
        prompt_used=final_prompt,
        latency_ms=total_latency,
        cost=cost,
        quality_score=qa_results.overall_score,
        safety_score=safety_report.overall_score,
        seo=seo_meta.model_dump(),
    )


@router.post("/images/optimize-prompt", response_model=OptimizedPrompt)
async def optimize_prompt(request: VisualGenerationRequest) -> OptimizedPrompt:
    return await prompt_optimizer.optimize(request)


@router.post("/images/analyze")
async def analyze_image(request: VisualGenerationRequest) -> dict[str, Any]:
    safety = safety_framework.analyze_request(request)
    opt = await prompt_optimizer.optimize(request)
    return {
        "safety": safety.model_dump(),
        "prompt_analysis": opt.model_dump(),
        "recommended_models": [m.model_id for m in settings.models_for_task(request.task_type)],
    }


@router.post("/nonprofit/brief")
async def nonprofit_brief(request: Any) -> dict[str, Any]:
    from src.models.schemas import NonprofitBriefRequest
    req = NonprofitBriefRequest(**request)
    vr = await nonprofit_storyteller.build_request(req)
    return {"generation_request": vr.model_dump()}


def _mock_generate(prompt: str, request: VisualGenerationRequest) -> GeneratedImageOut:
    spec = settings.model_spec(request.model_id or "nano-banana-internal")
    w = request.width or 1024
    h = request.height or 1024
    return GeneratedImageOut(
        id=str(uuid.uuid4()),
        url=f"https://storage.example.com/images/{uuid.uuid4()}.{request.format}",
        width=w, height=h, format=request.format, file_size=512000,
        alt_text=prompt[:100], quality_score=0.85,
    )


def _estimate_cost(model_id: str, num_images: int) -> float:
    spec = settings.model_spec(model_id)
    if spec:
        return spec.cost_per_image * num_images
    return 0.04 * num_images
