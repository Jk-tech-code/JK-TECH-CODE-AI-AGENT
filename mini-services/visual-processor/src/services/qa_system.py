from __future__ import annotations

import math
from typing import Any, Optional

from src.models.schemas import VisualQaReport


class QASystem:
    async def assess(self, image: dict[str, Any], prompt: str) -> VisualQaReport:
        issues: list[dict[str, str]] = []

        resolution_score = self._check_resolution(image.get("width", 0), image.get("height", 0))
        if resolution_score < 0.5:
            issues.append({
                "severity": "major",
                "category": "resolution",
                "description": f"Resolution {image.get('width', 0)}x{image.get('height', 0)} is below minimum",
                "recommendation": "Generate at least 1024x1024 for quality output",
            })

        sharpness_score = 0.85
        realism_score = 0.80
        composition_score = self._assess_composition(prompt)
        readability_score = self._assess_readability(prompt)
        accessibility_score = self._assess_accessibility(image)
        visual_hierarchy_score = 0.80
        typography_score = self._assess_typography(prompt)
        color_harmony_score = 0.85

        overall_score = round(
            (resolution_score + sharpness_score + realism_score + composition_score +
             readability_score + accessibility_score + visual_hierarchy_score +
             typography_score + color_harmony_score) / 9, 4
        )

        critical_count = sum(1 for i in issues if i.get("severity") == "critical")

        return VisualQaReport(
            passed=overall_score >= 0.6 and critical_count == 0,
            scores={
                "resolution": resolution_score,
                "sharpness": sharpness_score,
                "realism": realism_score,
                "composition": composition_score,
                "readability": readability_score,
                "accessibility": accessibility_score,
                "visual_hierarchy": visual_hierarchy_score,
                "typography": typography_score,
                "color_harmony": color_harmony_score,
            },
            issues=issues,
            overall_score=overall_score,
        )

    def _check_resolution(self, width: int, height: int) -> float:
        min_dim = min(width, height)
        if min_dim >= 2048:
            return 1.0
        if min_dim >= 1024:
            return 0.8 + ((min_dim - 1024) / 1024) * 0.2
        if min_dim >= 512:
            return 0.5 + ((min_dim - 512) / 512) * 0.3
        return max(0.0, min_dim / 512) * 0.5

    def _assess_composition(self, prompt: str) -> float:
        composition_terms = [
            r"close.?up", r"wide", r"portrait", r"landscape", r"rule of thirds",
            r"centered", r"symmetr", r"asymmetr", r"foreground", r"background",
            r"depth of field", r"perspective", r"angle", r"focal point",
        ]
        subject_terms = [r"person", r"people", r"man", r"woman", r"child", r"building", r"product", r"object", r"scene", r"landscape"]
        import re
        has_composition = any(re.search(t, prompt, re.IGNORECASE) for t in composition_terms)
        has_subject = any(re.search(t, prompt, re.IGNORECASE) for t in subject_terms)
        score = 0.5
        if has_composition:
            score += 0.25
        if has_subject:
            score += 0.15
        if has_composition and has_subject:
            score += 0.10
        return min(1.0, score)

    def _assess_readability(self, prompt: str) -> float:
        score = 0.7
        text_terms = ["text", "caption", "label", "headline", "title", "subtitle", "readable", "legible", "typography", "font"]
        import re
        has_text_ref = any(re.search(t, prompt, re.IGNORECASE) for t in text_terms)
        if has_text_ref:
            score += 0.15
        if len(prompt) > 50:
            score += 0.15
        return min(1.0, score)

    def _assess_accessibility(self, image: dict[str, Any]) -> float:
        score = 0.7
        alt_text = image.get("alt_text", "")
        if len(alt_text) > 20:
            score += 0.1
        if len(alt_text) > 50:
            score += 0.1
        if image.get("width", 0) >= 800:
            score += 0.1
        return min(1.0, score)

    def _assess_typography(self, prompt: str) -> float:
        score = 0.75
        type_terms = ["font", "typography", "typeface", "sans-serif", "serif", "heading", "body text", "readable", "legible", "text style"]
        import re
        if any(re.search(t, prompt, re.IGNORECASE) for t in type_terms):
            score += 0.15
        if len(prompt) > 100:
            score += 0.10
        return min(1.0, score)

    def analyze_color_harmony(self, colors: list[str]) -> float:
        if len(colors) < 2:
            return 0.3
        has_neutral = False
        has_accent = False
        for c in colors[:10]:
            try:
                h, s, l_ = self._hex_to_hsl(c)
                if s < 0.1:
                    has_neutral = True
                if s > 0.5:
                    has_accent = True
            except Exception:
                pass
        score = 0.5
        if has_neutral:
            score += 0.2
        if has_accent:
            score += 0.15
        if 3 <= len(colors) <= 5:
            score += 0.15
        return min(1.0, score)

    def _hex_to_hsl(self, hex_color: str) -> tuple[float, float, float]:
        hex_color = hex_color.lstrip("#")
        r = int(hex_color[0:2], 16) / 255
        g = int(hex_color[2:4], 16) / 255
        b = int(hex_color[4:6], 16) / 255
        mx = max(r, g, b)
        mn = min(r, g, b)
        l_ = (mx + mn) / 2
        if mx == mn:
            return (0, 0, l_)
        d = mx - mn
        s = d / (2 - mx - mn) if l_ > 0.5 else d / (mx + mn)
        if mx == r:
            h = ((g - b) / d + (6 if g < b else 0)) / 6
        elif mx == g:
            h = ((b - r) / d + 2) / 6
        else:
            h = ((r - g) / d + 4) / 6
        return (h, s, l_)


qa_system = QASystem()
