from __future__ import annotations

import json
from typing import Any, Optional

from src.config import settings
from src.models.schemas import BrandProfileCreate, BrandProfileOut


DEFAULT_BRAND = {
    "colors": {"primary": "#000000", "secondary": "#ffffff", "accent": "#ff5c00", "background": "#1a1e24", "text": "#efe9df", "palette": []},
    "typography": {"heading_font": "Playfair Display", "body_font": "Inter", "font_weights": {}},
    "imagery_style": "Cinematic documentary, warm tones, authentic",
    "icon_style": "Minimalist line icons",
    "layout": {"grid_columns": 12, "spacing": "16px", "max_width": "1200px"},
    "logo_placement": "bottom-right",
    "voice": {"tone": "Professional but approachable", "vocabulary": [], "avoid_words": []},
}


class BrandMemory:
    def __init__(self) -> None:
        self._brands: dict[str, dict[str, Any]] = {}

    async def create(self, user_id: str, profile: BrandProfileCreate) -> BrandProfileOut:
        import uuid
        from datetime import datetime, timezone

        brand_id = str(uuid.uuid4())
        entry = {
            "id": brand_id,
            "name": profile.name,
            "user_id": user_id,
            "logo_url": profile.logo_url,
            "colors": profile.colors or DEFAULT_BRAND["colors"],
            "typography": profile.typography or DEFAULT_BRAND["typography"],
            "imagery_style": profile.imagery_style or DEFAULT_BRAND["imagery_style"],
            "icon_style": profile.icon_style or DEFAULT_BRAND["icon_style"],
            "logo_placement": profile.logo_placement,
            "brand_voice": profile.brand_voice or DEFAULT_BRAND["voice"]["tone"],
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        self._brands[brand_id] = entry
        return BrandProfileOut(**entry)

    async def get(self, brand_id: str) -> Optional[BrandProfileOut]:
        entry = self._brands.get(brand_id)
        if entry:
            return BrandProfileOut(**entry)
        return None

    async def list_by_user(self, user_id: str) -> list[BrandProfileOut]:
        return [
            BrandProfileOut(**b) for b in self._brands.values()
            if b.get("user_id") == user_id
        ]

    async def update(self, brand_id: str, profile: BrandProfileCreate) -> Optional[BrandProfileOut]:
        from datetime import datetime, timezone

        entry = self._brands.get(brand_id)
        if not entry:
            return None
        entry["name"] = profile.name
        if profile.logo_url is not None:
            entry["logo_url"] = profile.logo_url
        if profile.colors is not None:
            entry["colors"] = profile.colors
        if profile.typography is not None:
            entry["typography"] = profile.typography
        if profile.imagery_style is not None:
            entry["imagery_style"] = profile.imagery_style
        if profile.icon_style is not None:
            entry["icon_style"] = profile.icon_style
        entry["logo_placement"] = profile.logo_placement
        if profile.brand_voice is not None:
            entry["brand_voice"] = profile.brand_voice
        entry["updated_at"] = datetime.now(timezone.utc)
        return BrandProfileOut(**entry)

    async def delete(self, brand_id: str) -> bool:
        return self._brands.pop(brand_id, None) is not None

    def apply_brand_to_prompt(self, brand: BrandProfileOut, prompt: str) -> str:
        enriched = prompt
        if brand.colors:
            palette = brand.colors.get("palette", []) or [brand.colors.get("primary", ""), brand.colors.get("secondary", "")]
            if palette:
                enriched += f"\nBrand colors: {', '.join(palette[:5])}"
        if brand.imagery_style:
            enriched += f"\nBrand imagery style: {brand.imagery_style}"
        if brand.typography:
            enriched += f"\nTypography: {brand.typography.get('heading_font', '')}"
        return enriched

    def get_default(self) -> BrandProfileOut:
        import uuid
        from datetime import datetime, timezone

        return BrandProfileOut(
            id="default",
            name="JK-TECH-CODE Default",
            logo_url=None,
            colors=DEFAULT_BRAND["colors"],
            typography=DEFAULT_BRAND["typography"],
            imagery_style=DEFAULT_BRAND["imagery_style"],
            icon_style=DEFAULT_BRAND["icon_style"],
            logo_placement=DEFAULT_BRAND["logo_placement"],
            brand_voice=DEFAULT_BRAND["voice"]["tone"],
            created_at=datetime.now(timezone.utc),
        )


brand_memory = BrandMemory()
