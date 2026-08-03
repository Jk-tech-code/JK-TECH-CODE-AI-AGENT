from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class ModelSpec:
    model_id: str
    name: str
    provider: str
    task_types: tuple[str, ...]
    max_width: int = 2048
    max_height: int = 2048
    supports_editing: bool = False
    supports_inpainting: bool = False
    supports_outpainting: bool = False
    supports_style_transfer: bool = False
    supports_face_preservation: bool = False
    supports_text: bool = False
    supports_svg: bool = False
    quality: float = 8.0
    speed: float = 7.0
    cost_per_image: float = 0.04
    enterprise_ready: bool = True


@dataclass(frozen=True)
class Settings:
    service_name: str = "visual-processor"
    port: int = int(os.getenv("PORT", "7300"))
    environment: str = os.getenv("ENVIRONMENT", "production")
    log_level: str = os.getenv("LOG_LEVEL", "info")

    postgres_dsn: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./visual_processor.db")
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    jwt_secret: str = os.getenv("JWT_SECRET", "change-me-in-production")
    jwt_algorithm: str = "HS256"

    image_processor_url: str = os.getenv("IMAGE_PROCESSOR_URL", "http://image-processor:7101")
    llm_router_url: str = os.getenv("LLM_ROUTER_URL", "http://llm-router:7200")
    max_upload_size_mb: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "50"))
    storage_path: str = os.getenv("STORAGE_PATH", "/data/images")

    otlp_endpoint: Optional[str] = os.getenv("OTLP_ENDPOINT", "http://otel-collector:4318")
    enable_tracing: bool = os.getenv("ENABLE_TRACING", "true").lower() == "true"
    prometheus_enabled: bool = True

    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")

    models: tuple[ModelSpec, ...] = (
        ModelSpec("gemini-2.5-pro-vision", "Gemini 2.5 Pro Vision", "google",
                  ("image-analysis", "visual-research", "multimodal-reasoning", "ocr"),
                  max_width=2048, max_height=2048, quality=8.5, cost_per_image=0.003),
        ModelSpec("openai-dall-e-3", "DALL-E 3", "openai",
                  ("text-to-image", "image-edit", "marketing-asset", "banner", "social-graphic"),
                  max_width=1792, max_height=1024, supports_editing=True, supports_inpainting=True,
                  supports_text=True, quality=9.0, cost_per_image=0.04),
        ModelSpec("flux-pro", "Flux Pro", "black-forest-labs",
                  ("text-to-image", "image-to-image", "product-visualization", "architectural-render",
                   "restoration", "before-after", "nonprofit-storytelling"),
                  max_width=2048, max_height=2048, supports_editing=True, supports_inpainting=True,
                  supports_outpainting=True, supports_style_transfer=True, supports_face_preservation=True,
                  supports_text=True, quality=9.5, cost_per_image=0.05),
        ModelSpec("flux-dev", "Flux Dev", "black-forest-labs",
                  ("text-to-image", "image-to-image", "style-transfer", "logo-concept"),
                  max_width=1024, max_height=1024, supports_editing=True, supports_inpainting=True,
                  supports_style_transfer=True, supports_text=True, quality=8.5, cost_per_image=0.02),
        ModelSpec("stable-diffusion-xl", "Stable Diffusion XL", "stability-ai",
                  ("text-to-image", "image-to-image", "inpainting", "outpainting",
                   "style-transfer", "background-remove"),
                  max_width=1024, max_height=1024, supports_editing=True, supports_inpainting=True,
                  supports_outpainting=True, supports_style_transfer=True, supports_face_preservation=True,
                  quality=8.0, cost_per_image=0.01),
        ModelSpec("stable-diffusion-3", "Stable Diffusion 3", "stability-ai",
                  ("text-to-image", "image-to-image", "infographic"),
                  max_width=1024, max_height=1024, supports_editing=True, supports_inpainting=True,
                  supports_style_transfer=True, supports_text=True, quality=8.5, cost_per_image=0.03),
        ModelSpec("ideogram-v2", "Ideogram v2", "ideogram",
                  ("text-to-image", "logo-concept", "banner", "social-graphic"),
                  max_width=1024, max_height=1024, supports_text=True, quality=9.0, cost_per_image=0.04),
        ModelSpec("midjourney-v7", "Midjourney v7", "midjourney",
                  ("text-to-image", "product-visualization", "architectural-render",
                   "marketing-asset", "nonprofit-storytelling"),
                  max_width=2048, max_height=2048, supports_editing=True, supports_style_transfer=True,
                  supports_face_preservation=True, quality=9.5, speed=5.0, cost_per_image=0.06,
                  enterprise_ready=False),
        ModelSpec("recraft-v3", "Recraft v3", "recraft",
                  ("text-to-image", "marketing-asset", "social-graphic", "logo-concept", "banner"),
                  max_width=1536, max_height=1536, supports_editing=True, supports_inpainting=True,
                  supports_style_transfer=True, supports_text=True, supports_svg=True,
                  quality=9.0, speed=8.0, cost_per_image=0.03),
        ModelSpec("nano-banana-internal", "Nano Banana Pro (Internal)", "jk-tech-code",
                  ("text-to-image", "image-to-image", "image-edit", "inpainting", "outpainting",
                   "background-remove", "upscale", "restoration", "style-transfer",
                   "product-visualization", "infographic", "diagram", "ui-mockup", "logo-concept",
                   "banner", "social-graphic", "nonprofit-storytelling", "before-after",
                   "image-analysis", "ocr", "multimodal-reasoning", "marketing-asset",
                   "website-asset", "presentation-graphic", "architectural-render"),
                  max_width=2048, max_height=2048, supports_editing=True, supports_inpainting=True,
                  supports_outpainting=True, supports_style_transfer=True, supports_face_preservation=True,
                  supports_text=True, supports_svg=True, quality=8.0, speed=7.0, cost_per_image=0.005),
    )

    def model_spec(self, model_id: str) -> Optional[ModelSpec]:
        for m in self.models:
            if m.model_id == model_id:
                return m
        return None

    def models_for_task(self, task_type: str) -> list[ModelSpec]:
        return [m for m in self.models if task_type in m.task_types]


settings = Settings()
