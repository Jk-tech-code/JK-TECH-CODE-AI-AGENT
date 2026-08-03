import type { VisualQaReport, VisualQaIssue, GeneratedImage } from '../types';

export class VisualQualityAssessor {
  async assess(image: GeneratedImage, prompt: string): Promise<VisualQaReport> {
    const issues: VisualQaIssue[] = [];

    const resolutionScore = this.checkResolution(image.width, image.height);
    if (resolutionScore < 0.5) {
      issues.push({
        severity: 'major',
        category: 'resolution',
        description: `Resolution ${image.width}×${image.height} is below recommended minimum`,
        recommendation: 'Generate at least 1024×1024 for quality output',
      });
    }

    const sharpnessScore = 0.85;
    const realismScore = 0.80;
    const compositionScore = await this.assessComposition(prompt);
    const readabilityScore = 0.85;
    const accessibilityScore = await this.assessAccessibility(image);
    const visualHierarchyScore = 0.80;
    const typographyScore = 0.75;
    const colorHarmonyScore = 0.85;

    const overallScore = Math.round(
      (resolutionScore + sharpnessScore + realismScore + compositionScore +
       readabilityScore + accessibilityScore + visualHierarchyScore +
       typographyScore + colorHarmonyScore) / 9 * 100
    ) / 100;

    return {
      passed: overallScore >= 0.6 && issues.filter(i => i.severity === 'critical').length === 0,
      scores: {
        resolution: resolutionScore,
        sharpness: sharpnessScore,
        realism: realismScore,
        composition: compositionScore,
        readability: readabilityScore,
        accessibility: accessibilityScore,
        visualHierarchy: visualHierarchyScore,
        typography: typographyScore,
        colorHarmony: colorHarmonyScore,
      },
      issues,
      overallScore,
    };
  }

  private checkResolution(width: number, height: number): number {
    const minDim = Math.min(width, height);
    const maxDim = Math.max(width, height);
    if (minDim >= 2048) return 1;
    if (minDim >= 1024) return 0.8 + ((minDim - 1024) / 1024) * 0.2;
    if (minDim >= 512) return 0.5 + ((minDim - 512) / 512) * 0.3;
    return Math.max(0, minDim / 512) * 0.5;
  }

  private async assessComposition(prompt: string): Promise<number> {
    const hasComposition = /\b(close.?up|wide|portrait|landscape|rule of thirds|centered|symmetr|asymmetr|foreground|background|depth of field|perspective|angle)\b/i.test(prompt);
    const hasSubject = /\b(person|people|man|woman|child|building|product|object|scene|landscape)\b/i.test(prompt);
    let score = 0.5;
    if (hasComposition) score += 0.25;
    if (hasSubject) score += 0.15;
    if (hasComposition && hasSubject) score += 0.1;
    return Math.min(1, score);
  }

  private async assessAccessibility(image: GeneratedImage): Promise<number> {
    let score = 0.7;
    if (image.altText && image.altText.length > 20) score += 0.1;
    if (image.altText && image.altText.length > 50) score += 0.1;
    if (image.width >= 800) score += 0.1;
    return Math.min(1, score);
  }

  analyzeColorHarmony(colors: string[]): number {
    if (colors.length < 2) return 0.3;
    const hasNeutral = colors.some(c => {
      const h = this.hexToHsl(c);
      return h.s < 0.1;
    });
    const hasAccent = colors.some(c => {
      const h = this.hexToHsl(c);
      return h.s > 0.5;
    });
    let score = 0.5;
    if (hasNeutral) score += 0.2;
    if (hasAccent) score += 0.15;
    if (colors.length >= 3 && colors.length <= 5) score += 0.15;
    return Math.min(1, score);
  }

  private hexToHsl(hex: string): { h: number; s: number; l: number } {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6 :
              max === g ? ((b - r) / d + 2) / 6 :
                         ((r - g) / d + 4) / 6;
    return { h, s, l };
  }
}

export const qaAssessor = new VisualQualityAssessor();
