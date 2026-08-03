from __future__ import annotations

import json
from typing import Optional

import httpx

from src.config import settings
from src.models.schemas import NonprofitBriefRequest, VisualGenerationRequest


class NonprofitStoryteller:
    async def build_request(self, input: NonprofitBriefRequest) -> VisualGenerationRequest:
        system_prompt = (
            "You are a nonprofit storytelling specialist. Translate nonprofit needs into ethical, "
            "emotionally resonant visual briefs. Priorities: dignity, truthful representation, "
            "emotional authenticity, cultural sensitivity, mission alignment. "
            "Avoid stereotypes. Focus on solutions and hope. "
            "Output JSON: { \"prompt\": \"...\", \"emotional_intent\": \"...\", "
            "\"composition\": \"...\", \"sensitive_content\": bool, \"cultural_notes\": \"...\" }"
        )

        user_prompt = json.dumps({
            "organization": input.organization_name,
            "mission": input.mission,
            "campaign": input.campaign_name or "General awareness",
            "audience": input.audience or "General public",
            "emotional_goal": input.emotional_goal or "Inspire action",
            "stories": input.real_stories or [],
            "region": input.region or "Global",
        })

        brief = {}
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{settings.llm_router_url}/v1/chat/completions",
                    json={
                        "model": "gpt-4.1",
                        "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
                        "temperature": 0.7,
                    },
                    headers={"Authorization": f"Bearer {settings.jwt_secret}"},
                )
                data = resp.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")
                cleaned = content.replace("```json", "").replace("```", "").strip()
                brief = json.loads(cleaned)
        except Exception:
            brief = {"prompt": input.mission}

        return VisualGenerationRequest(
            prompt=brief.get("prompt", input.mission),
            task_type="nonprofit-storytelling",
            nonprofit_mode=True,
            storytelling_context={
                "organization_name": input.organization_name,
                "mission": input.mission,
                "campaign_name": input.campaign_name,
                "audience": input.audience,
                "emotional_goal": input.emotional_goal,
                "real_stories": input.real_stories,
                "region": input.region,
                "sensitive_content": brief.get("sensitive_content", False),
            },
        )

    async def generate_impact_story(self, org_name: str, mission: str, beneficiary: str,
                                    transformation: str, metric: Optional[str] = None,
                                    region: Optional[str] = None) -> VisualGenerationRequest:
        prompt = (
            f"Before-and-after visual showing the impact of {org_name}'s work with "
            f"{beneficiary} in {region or 'communities in need'}. {transformation}"
        )
        if metric:
            prompt += f" Result: {metric}."
        prompt += (
            " Style: Documentary photography, warm natural lighting, authentic and dignified portrayal. "
            "Emotional tone: Hopeful, realistic, respectful."
        )

        return VisualGenerationRequest(
            prompt=prompt,
            task_type="before-after",
            nonprofit_mode=True,
            storytelling_context={
                "organization_name": org_name,
                "mission": mission,
                "emotional_goal": "Inspire hope and demonstrate impact",
            },
        )


nonprofit_storyteller = NonprofitStoryteller()
