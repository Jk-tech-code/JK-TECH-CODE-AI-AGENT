from __future__ import annotations

from datetime import date
from typing import Any

from src.models.schemas import VisualSeoMetadata


import re

STOP_WORDS = frozenset({
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
    "this", "that", "these", "those", "it", "its", "very", "just",
})


class VisualSEO:
    def generate(self, prompt: str, image: dict[str, Any]) -> VisualSeoMetadata:
        words = re.sub(r"[^a-z0-9\s]", "", prompt.lower()).split()
        keywords = self._extract_keywords(words)
        filename = self._generate_filename(prompt, image.get("format", "png"))
        alt_text = self._generate_alt_text(prompt)
        title = self._generate_title(prompt)
        description = self._generate_description(prompt)

        return VisualSeoMetadata(
            filename=filename,
            alt_text=alt_text,
            title=title,
            description=description,
            keywords=keywords,
            og_tags={
                "image": image.get("url", ""),
                "image_alt": alt_text,
                "image_width": image.get("width", 0),
                "image_height": image.get("height", 0),
                "image_type": f"image/{image.get('format', 'png')}",
            },
            twitter_card={
                "card": "summary_large_image",
                "image": image.get("url", ""),
                "image_alt": alt_text,
            },
        )

    def _generate_filename(self, prompt: str, fmt: str) -> str:
        slug = re.sub(r"[^a-z0-9]+", "-", prompt.lower()).strip("-")[:60]
        today = date.today().isoformat()
        return f"{slug}-{today}.{fmt}" if slug else f"generated-{today}.{fmt}"

    def _generate_alt_text(self, prompt: str) -> str:
        alt = re.sub(r"^(a |an |the )", "", prompt, flags=re.IGNORECASE)
        alt = re.sub(r"create|generate|make|design|produce", "", alt, flags=re.IGNORECASE).strip()
        if len(alt) > 120:
            alt = alt[:117] + "..."
        return alt or "Generated image from JK-TECH-CODE AI"

    def _generate_title(self, prompt: str) -> str:
        title = re.split(r"[,.:;!?]", prompt)[0]
        title = re.sub(r"^(create|generate|make|design|produce)\s+", "", title, flags=re.IGNORECASE).strip()
        if len(title) > 60:
            title = title[:57] + "..."
        return title or "Generated Visual"

    def _generate_description(self, prompt: str) -> str:
        return (prompt[:157] + "...") if len(prompt) > 160 else prompt

    def _extract_keywords(self, words: list[str]) -> list[str]:
        freq: dict[str, int] = {}
        for w in words:
            if w not in STOP_WORDS and len(w) > 2:
                freq[w] = freq.get(w, 0) + 1
        return [w for w, _ in sorted(freq.items(), key=lambda x: -x[1])[:10]]


visual_seo = VisualSEO()
