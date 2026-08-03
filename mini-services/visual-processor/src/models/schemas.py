from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class VisualGenerationRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=5000)
    negative_prompt: Optional[str] = None
    task_type: str = Field(default="text-to-image",
                           pattern=r"^(text-to-image|image-to-image|image-edit|inpainting|outpainting|background-remove|upscale|restoration|style-transfer|product-visualization|infographic|diagram|ui-mockup|logo-concept|banner|social-graphic|presentation-graphic|architectural-render|website-asset|nonprofit-storytelling|before-after|image-analysis|visual-research|ocr|multimodal-reasoning|marketing-asset)$")
    model_id: Optional[str] = None
    width: Optional[int] = Field(default=None, ge=64, le=4096)
    height: Optional[int] = Field(default=None, ge=64, le=4096)
    size_preset: Optional[str] = Field(default=None,
                                       pattern=r"^(social-square|social-portrait|social-story|banner|hero|thumbnail|logo|presentation|document|icon|wide)$")
    format: str = Field(default="png", pattern=r"^(png|jpg|webp|svg|avif)$")
    num_images: int = Field(default=1, ge=1, le=4)
    seed: Optional[int] = None
    style: Optional[str] = None
    reference_image_url: Optional[str] = None
    mask_image_url: Optional[str] = None
    brand_id: Optional[str] = None
    nonprofit_mode: bool = False
    storytelling_context: Optional[dict[str, Any]] = None
    user_id: Optional[str] = None


class GeneratedImageOut(BaseModel):
    id: str
    url: str
    width: int
    height: int
    format: str
    file_size: int
    alt_text: str
    quality_score: float


class VisualGenerationResponse(BaseModel):
    images: list[GeneratedImageOut]
    model_used: str
    prompt_used: str
    latency_ms: int
    cost: float
    quality_score: float
    safety_score: float
    seo: dict[str, Any]


class PipelineStageOut(BaseModel):
    name: str
    status: str
    score: Optional[float] = None
    details: Optional[str] = None
    duration_ms: Optional[int] = None


class PipelineResult(BaseModel):
    stages: list[PipelineStageOut]
    passed: bool
    final_images: list[GeneratedImageOut] = []
    error: Optional[str] = None


class OptimizedPrompt(BaseModel):
    original: str
    optimized: str
    composition: str
    lighting: str
    emotional_intent: str
    visual_hierarchy: str
    brand_requirements: list[str] = []
    negative_prompt: str = ""


class BrandProfileCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    logo_url: Optional[str] = None
    colors: Optional[dict[str, Any]] = None
    typography: Optional[dict[str, Any]] = None
    imagery_style: Optional[str] = None
    icon_style: Optional[str] = None
    logo_placement: str = "bottom-right"
    brand_voice: Optional[str] = None


class BrandProfileOut(BaseModel):
    id: str
    name: str
    logo_url: Optional[str]
    colors: Optional[dict[str, Any]]
    typography: Optional[dict[str, Any]]
    imagery_style: Optional[str]
    icon_style: Optional[str]
    logo_placement: str
    brand_voice: Optional[str]
    created_at: datetime


class VisualQaReport(BaseModel):
    passed: bool
    scores: dict[str, float]
    issues: list[dict[str, str]]
    overall_score: float


class VisualSafetyReport(BaseModel):
    passed: bool
    checks: dict[str, dict[str, Any]]
    overall_score: float


class VisualSeoMetadata(BaseModel):
    filename: str
    alt_text: str
    title: str
    description: str
    keywords: list[str]
    og_tags: dict[str, Any]
    twitter_card: dict[str, Any]


class NonprofitBriefRequest(BaseModel):
    organization_name: str
    mission: str
    campaign_name: Optional[str] = None
    audience: Optional[str] = None
    emotional_goal: Optional[str] = None
    real_stories: Optional[list[str]] = None
    region: Optional[str] = None


class VisualAgentTask(BaseModel):
    agent_id: str
    input: str
    context: Optional[dict[str, Any]] = None


class VisualAgentResponse(BaseModel):
    agent_id: str
    result: str
    confidence: float
    metadata: dict[str, Any]


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str = "1.0.0"
    uptime_seconds: float
    models_available: int
    providers_healthy: dict[str, bool]


class ErrorResponse(BaseModel):
    error: str
    code: str
    detail: Optional[str] = None
    request_id: Optional[str] = None
