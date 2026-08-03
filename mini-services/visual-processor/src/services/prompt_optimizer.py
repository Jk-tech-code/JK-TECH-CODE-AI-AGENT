from __future__ import annotations

import json
from typing import Optional

import httpx

from src.config import settings
from src.models.schemas import OptimizedPrompt, VisualGenerationRequest


TASK_PROMPT_GUIDES: dict[str, str] = {
    "text-to-image": "Focus on visual clarity, composition, lighting, and emotional impact.",
    "image-to-image": "Emphasize the transformation while preserving key elements from the reference.",
    "infographic": "Prioritize information hierarchy, readability, data visualization clarity, and brand consistency.",
    "diagram": "Focus on clear relationships between elements, labeling, directional flow, and technical accuracy.",
    "logo-concept": "Emphasize simplicity, scalability, brand identity, and vector-friendly shapes.",
    "ui-mockup": "Focus on layout grid, component spacing, color system, typography hierarchy, and interaction states.",
    "nonprofit-storytelling": "Prioritize emotional authenticity, dignity of subjects, realistic representation, and mission alignment.",
    "marketing-asset": "Emphasize CTA clarity, visual hierarchy, brand compliance, and platform-specific dimensions.",
    "social-graphic": "Focus on scroll-stopping visual hook, text readability, brand colors, and platform optimization.",
    "banner": "Emphasize clear focal point, readable text overlay, brand presence, and aspect ratio requirements.",
    "product-visualization": "Focus on product detail, lighting accuracy, context setting, and lifestyle integration.",
    "architectural-render": "Emphasize structural accuracy, material realism, lighting simulation, and spatial context.",
    "before-after": "Show clear transformation with consistent framing, lighting, and perspective in both panels.",
    "background-remove": "Preserve subject edge detail, handle complex boundaries, maintain natural appearance.",
    "upscale": "Increase resolution while preserving detail, avoid artifacts, enhance sharpness naturally.",
    "restoration": "Repair damage, reduce noise, restore colors, preserve original character and authenticity.",
    "style-transfer": "Apply target style while preserving content structure, maintain coherent visual elements.",
}


COMMON_NEGATIVE = "blurry, low quality, distorted, ugly, deformed, watermark, text, signature, extra fingers, bad anatomy"


class PromptOptimizer:
    async def optimize(self, request: VisualGenerationRequest) -> OptimizedPrompt:
        guide = TASK_PROMPT_GUIDES.get(request.task_type, "Focus on visual quality, composition, and prompt clarity.")

        system_msg = (
            f"You are a professional prompt engineer for AI image generation. Task type: {request.task_type}. "
            f"{guide}\n\n"
            f"Respond in JSON with keys: optimized, composition, lighting, emotional_intent, visual_hierarchy, brand_requirements, negative_prompt"
        )

        user_msg = f"Original request: {request.prompt}"
        if request.style:
            user_msg += f"\nStyle: {request.style}"
        if request.brand_id:
            user_msg += f"\nBrand ID: {request.brand_id}"

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{settings.llm_router_url}/v1/chat/completions",
                    json={
                        "model": "gpt-4.1",
                        "messages": [
                            {"role": "system", "content": system_msg},
                            {"role": "user", "content": user_msg},
                        ],
                        "temperature": 0.7,
                    },
                    headers={"Authorization": f"Bearer {settings.jwt_secret}"},
                )
                data = resp.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")
        except Exception:
            content = "{}"

        try:
            cleaned = content.replace("```json", "").replace("```", "").strip()
            parsed = json.loads(cleaned)
        except (json.JSONDecodeError, Exception):
            parsed = {}

        return OptimizedPrompt(
            original=request.prompt,
            optimized=parsed.get("optimized", request.prompt),
            composition=parsed.get("composition", "Standard composition"),
            lighting=parsed.get("lighting", "Natural lighting"),
            emotional_intent=parsed.get("emotional_intent", "Neutral"),
            visual_hierarchy=parsed.get("visual_hierarchy", "Centered focal point"),
            brand_requirements=parsed.get("brand_requirements", []),
            negative_prompt=parsed.get("negative_prompt", self._default_negative(request.task_type)),
        )

    async def enhance_basic(self, input_text: str) -> str:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{settings.llm_router_url}/v1/chat/completions",
                    json={
                        "model": "gpt-4.1",
                        "messages": [
                            {
                                "role": "system",
                                "content": (
                                    "You are a professional prompt engineer. Convert a basic image request "
                                    "into a detailed, optimized prompt. Add subject description, setting, "
                                    "lighting, composition, color palette, mood, style, and camera details. "
                                    "Output only the enhanced prompt."
                                ),
                            },
                            {"role": "user", "content": input_text},
                        ],
                    },
                    headers={"Authorization": f"Bearer {settings.jwt_secret}"},
                )
                data = resp.json()
                return data.get("choices", [{}])[0].get("message", {}).get("content", input_text)
        except Exception:
            return input_text

    def _default_negative(self, task_type: str) -> str:
        specific: dict[str, str] = {
            "nonprofit-storytelling": f"{COMMON_NEGATIVE}, overly polished, fake, staged, exploitative, stereotypical, degrading",
            "infographic": f"{COMMON_NEGATIVE}, cluttered, unreadable text, inconsistent spacing, poor hierarchy",
            "logo-concept": f"{COMMON_NEGATIVE}, complex, busy, raster artifacts, too many colors, clip art style",
            "ui-mockup": f"{COMMON_NEGATIVE}, unrealistic content, placeholder text, misaligned elements",
            "architectural-render": f"{COMMON_NEGATIVE}, unrealistic lighting, incorrect perspective, floating elements",
            "before-after": f"{COMMON_NEGATIVE}, inconsistent lighting, mismatched perspectives, different framing",
        }
        return specific.get(task_type, COMMON_NEGATIVE)


prompt_optimizer = PromptOptimizer()
