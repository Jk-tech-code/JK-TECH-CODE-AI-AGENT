import type { OptimizedPrompt } from '../types';

export class PromptOptimizer {
  enhanceBasicPrompt(prompt: string): string {
    const trimmed = prompt.trim();
    if (!trimmed) return trimmed;

    let optimized = trimmed;

    if (!/\.\s*$/.test(optimized)) {
      optimized += '.';
    }

    const qualityTerms = ['high quality', 'detailed', 'sharp focus'];
    const hasQuality = qualityTerms.some(t => optimized.toLowerCase().includes(t.toLowerCase()));
    if (!hasQuality) {
      optimized = `High quality, detailed, sharp focus. ${optimized}`;
    }

    const lightingTerms = ['lighting', 'illumination', 'lit'];
    const hasLighting = lightingTerms.some(t => optimized.toLowerCase().includes(t.toLowerCase()));
    if (!hasLighting) {
      optimized = `${optimized} Professional lighting.`;
    }

    return optimized;
  }

  async enhance(prompt: string): Promise<OptimizedPrompt> {
    const optimized = this.enhanceBasicPrompt(prompt);
    const wordCount = prompt.split(/\s+/).length;
    const composition = wordCount < 10 ? 'Simple centered composition with clear subject.' : 'Consider rule of thirds or dynamic composition.';
    const lighting = 'Professional studio lighting with soft shadows.';
    const emotionalIntent = 'Professional and engaging.';

    return {
      original: prompt,
      optimized,
      composition,
      lighting,
      emotionalIntent,
      visualHierarchy: 'Subject first, background second, details third.',
      brandRequirements: [],
      negativePrompt: 'blurry, low quality, distorted, ugly, bad anatomy, watermark, text, signature',
    };
  }
}

export const promptOptimizer = new PromptOptimizer();
