/**
 * Autonomy Quality Gate (Phase 13).
 *
 * Every autonomous response is validated before being accepted. Checks
 * accuracy signals, completeness, logic, security and formatting. When
 * confidence is low, the agent asks a clarifying question instead of guessing.
 */
import { scoreConfidence } from '@/brain/confidence';
import { verifyResponse } from '@/brain/verification';

export interface QualityVerdict {
  passed: boolean;
  confidence: number;
  issues: string[];
  /** When low-confidence, the clarifying question to ask the user. */
  clarifyingQuestion?: string;
  sanitized: string;
}

const TRUNCATION_RE = /…|\.{3,}|\[truncated\]|cut off|TO BE CONTINUED|TBC/i;
const UNCERTAINTY_RE = /\b(cannot determine|unable to|no information available|i (don'?t|do not) know|unknown)\b/i;
const EMPHATIC_UNSUPPORTED_RE = /\b(deliver|guarantee|absolutely certain|definitely the (best|only))\b/i;

/** Default clarifying question templates by issue type. */
const CLARIFY: Record<string, string> = {
  completeness: 'This request needs more specifics. Could you clarify the scope, target audience, or expected outcome?',
  specificity: 'I want to give you a precise answer. What specific aspect or format are you looking for?',
  accuracy: 'I have limited information on this. Could you provide more context or a specific source?',
};

export function qualityGate(
  content: string,
  opts: { goal: string; evidence?: string; length?: number },
): QualityVerdict {
  const issues: string[] = [];
  let sanitized = content;

  // 1. Formatting / structural.
  const ver = verifyResponse(content, { intent: 'other', complexity: 'medium' });
  sanitized = ver.sanitized;
  for (const issue of ver.issues ?? []) issues.push(issue);

  if (!content.trim()) issues.push('empty response');

  // 2. Completeness vs the stated goal.
  const goalTokens = opts.goal.toLowerCase().split(/\s+/).filter((w) => w.length > 4).slice(0, 8);
  const covered = goalTokens.filter((t) => content.toLowerCase().includes(t)).length;
  const coverage = goalTokens.length ? covered / goalTokens.length : 1;
  if (coverage < 0.35) issues.push('response does not clearly address the goal');

  // 3. Truncation / incompleteness.
  if (TRUNCATION_RE.test(content)) issues.push('response appears truncated');

  // 4. Honest uncertainty vs fabricated confidence.
  const unsure = UNCERTAINTY_RE.test(content);
  const overclaim = EMPHATIC_UNSUPPORTED_RE.test(content);
  if (overclaim) issues.push('response makes unsupported strong claims');

  // 5. Logical completeness for multi-part goals.
  if (opts.goal.includes(' and ') && content.length < 80) issues.push('response too short for a multi-part request');

  // 6. Confidence score.
  const confidence = scoreConfidence(content, 'planning', 'high');
  const passed = issues.length === 0 && confidence >= 0.5 && !unsure;

  let clarifyingQuestion: string | undefined;
  if (!passed && confidence < 0.5) {
    const type = issues.find((i) => CLARIFY[i]);
    clarifyingQuestion = CLARIFY[type ?? 'accuracy'] ?? CLARIFY.accuracy;
  } else if (!passed && coverage < 0.35) {
    clarifyingQuestion = CLARIFY.completeness;
  }

  return {
    passed,
    confidence,
    issues: [...new Set(issues)].slice(0, 8),
    clarifyingQuestion,
    sanitized,
  };
}