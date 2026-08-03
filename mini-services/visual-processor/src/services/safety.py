from __future__ import annotations

import re
from typing import Any, Optional

from src.models.schemas import VisualSafetyReport, VisualGenerationRequest

COPYRIGHTED_PATTERNS = [
    r"mickey|disney|marvel|dc.?comics|harry.?potter",
    r"star.?wars|star.?trek|lord.?of.?the.?rings",
    r"nike|adidas|apple.?logo|coca.?cola|pepsi",
    r"pokemon|pikachu|mario|zelda|nintendo",
    r"fifa|olympics|nba|nfl|mlb|super.?bowl",
    r"spider.?man|batman|superman|wonder.?woman|avengers",
]

TRADEMARKED_PATTERNS = [
    r"photoshop|iphone|windows|android|java|javascript",
    r"trademark|registered|tm|copyright|patent|™|®",
]

RESTRICTED_CONTENT = [
    r"nudity|explicit|nsfw|porn|sexual|erotic",
    r"violence|gore|blood|torture|murder|weapon",
    r"hate.?speech|discriminat|racist|racism|sexist",
    r"child.?abuse|minor|underage",
    r"terrorism|extremist|bomb|weapon.?mass",
    r"self.?harm|suicide|eating.?disorder",
    r"illegal|drug.?production|weapon.?manufacturing",
    r"misinformation|fake.?news|conspiracy",
]

MISINFORMATION_TERMS = [
    r"fake|hoax|conspiracy|false.?narrative|misleading|deceptive",
    r"deep.?fake|manipulated|fabricated",
]


class SafetyFramework:
    def analyze_request(self, request: VisualGenerationRequest) -> VisualSafetyReport:
        prompt = request.prompt.lower()

        checks: dict[str, dict[str, Any]] = {
            "copyright": self._check_patterns(prompt, COPYRIGHTED_PATTERNS, "copyright"),
            "trademark": self._check_patterns(prompt, TRADEMARKED_PATTERNS, "trademark"),
            "deepfake": self._check_deepfake(request),
            "misinformation": self._check_misinformation(prompt, request),
            "authenticity": self._check_authenticity(prompt),
            "content_policy": self._check_patterns(prompt, RESTRICTED_CONTENT, "content_policy"),
        }

        all_passed = all(c["passed"] for c in checks.values())
        overall_score = sum(c["confidence"] for c in checks.values()) / len(checks)

        return VisualSafetyReport(passed=all_passed, checks=checks, overall_score=round(overall_score, 4))

    def _check_patterns(self, prompt: str, patterns: list[str], check_name: str) -> dict[str, Any]:
        for pattern in patterns:
            if re.search(pattern, prompt, re.IGNORECASE):
                return {"passed": False, "confidence": 0.2, "issues": [f"Flagged by {check_name} check: pattern matched"]}
        return {"passed": True, "confidence": 0.95, "issues": []}

    def _check_deepfake(self, request: VisualGenerationRequest) -> dict[str, Any]:
        has_ref = bool(request.reference_image_url)
        is_person = bool(re.search(r"person|man|woman|face|portrait|realistic photo", request.prompt, re.IGNORECASE))
        issues: list[str] = []
        if has_ref and is_person:
            issues.append("Reference image with person generation requires consent verification")
        return {
            "passed": not (has_ref and is_person),
            "confidence": 0.5 if issues else 0.9,
            "issues": issues,
        }

    def _check_misinformation(self, prompt: str, request: VisualGenerationRequest) -> dict[str, Any]:
        issues: list[str] = []
        for pattern in MISINFORMATION_TERMS:
            if re.search(pattern, prompt, re.IGNORECASE):
                issues.append("Prompt contains misinformation-related terms")
                break
        if request.nonprofit_mode and re.search(r"exaggerat|misleading|fabricat|falsify|decept", prompt, re.IGNORECASE):
            issues.append("Nonprofit mode prohibits exaggerated or misleading representations")
        return {
            "passed": len(issues) == 0,
            "confidence": 0.3 if issues else 0.95,
            "issues": issues,
        }

    def _check_authenticity(self, prompt: str) -> dict[str, Any]:
        issues: list[str] = []
        if re.search(r"watermark|fake.?signature|counterfeit|forgery|impersonat", prompt, re.IGNORECASE):
            issues.append("Request appears to involve deceptive content creation")
        return {
            "passed": len(issues) == 0,
            "confidence": 0.4 if issues else 0.9,
            "issues": issues,
        }


safety_framework = SafetyFramework()
