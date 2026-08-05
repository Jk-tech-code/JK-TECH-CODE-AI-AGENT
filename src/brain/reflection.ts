/**
 * Brain Reflection — a lightweight, deterministic self-critique pass run over
 * the generated response when confidence is low. It inspects the text for
 * common weaknesses and, if needed, returns a small set of corrective nudges
 * that the Brain can fold into a regenerated attempt.
 */
import type { Intent } from './types';

export interface ReflectionResult {
  worthRegenerating: boolean;
  reasons: string[];
}

const WEAK_PATTERNS = [
  { re: /\b(i don'?t know|i can'?t|i am unable|unfortunately)\b/i, reason: 'Answer deflects instead of helping.' },
  { re: /^(as an ai|as a language model)/i, reason: 'Falls back on an "AI disclaimer" opening.' },
  { re: /^(certainly|of course|absolutely)!?/i, reason: 'Robotic generic opening.' },
  { re: /lorem ipsum|placeholder|fill this in|tbd\b/i, reason: 'Contains placeholder content.' },
  { re: /\btodo\b/i, reason: 'Contains unfinished TODO markers.' },
];

export function reflect(content: string, intent: Intent): ReflectionResult {
  const reasons: string[] = [];

  if (!content || content.trim().length < 15) {
    reasons.push('Response is effectively empty.');
  }

  for (const p of WEAK_PATTERNS) {
    if (p.re.test(content)) reasons.push(p.reason);
  }

  // A coding request with no code fence and very short text is incomplete.
  if (intent === 'code' && !/```/.test(content) && content.trim().length < 60) {
    reasons.push('Coding request returned very little actual code.');
  }

  return {
    worthRegenerating: reasons.length >= 2 || content.trim().length < 15,
    reasons,
  };
}