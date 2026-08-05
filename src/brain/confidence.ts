/**
 * Brain Confidence — heuristic confidence scoring for a generated response.
 *
 * Combines several cheap signals to estimate how confident the Brain is in the
 * answer. This is internal; a low score can trigger a re-generation/reflection
 * pass rather than being surfaced bluntly.
 */
import type { Complexity, Intent } from './types';

export function scoreConfidence(content: string, intent: Intent, complexity: Complexity): number {
  if (!content || !content.trim()) return 0;

  let score = 0.75;

  const trimmed = content.trim();

  // Length / completeness
  if (trimmed.length < 20) score -= 0.15;
  if (trimmed.length > 80) score += 0.05;

  // Hedging / uncertainty reductions
  const hedges = ['i think', 'maybe', 'perhaps', "i'm not sure", 'not sure', 'possibly', 'could be', 'i guess'];
  const hedgeCount = hedges.filter((h) => trimmed.toLowerCase().includes(h)).length;
  score -= Math.min(0.25, hedgeCount * 0.05);

  // Signals of weak answers
  if (/i don'?t know|i am unable|i can'?t help/i.test(trimmed)) score -= 0.2;

  // High-complexity tasks that produced a very short answer are suspect
  if (complexity === 'high' && trimmed.length < 100) score -= 0.15;
  if (complexity === 'low' && trimmed.length < 30) score -= 0.05;

  // Hollow/placeholder markers
  if (/lorem ipsum|todo|placeholder|as an ai language model/i.test(trimmed)) score -= 0.2;

  // Fenced code perfect-confidence for coding intents
  if (intent === 'code' && /```/.test(trimmed)) score += 0.05;

  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}

/** Should we run a reflection/regeneration pass given the score? */
export function needsReflection(confidence: number): boolean {
  return confidence < 0.5;
}