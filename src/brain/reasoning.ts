/**
 * Brain Reasoning — pre-generation analysis of the request.
 *
 * Before the main LLM call, the Brain assesses what the user actually needs,
 * what information is missing, and what to emphasise in the prompt. Output is
 * internal and reflects into the system guidance, never into the reply.
 */
import type { Complexity, Intent, ReasoningLevel } from './types';

export interface ReasoningDirective {
  emphasis: string;
  missingInfoNote?: string;
  reasoningLevel: ReasoningLevel;
}

/**
 * Build a reasoning directive that steers the model before it responds.
 */
export function buildReasoningDirective(
  query: string,
  intent: Intent,
  complexity: Complexity,
  level: ReasoningLevel,
): ReasoningDirective {
  const emphasis = intentEmphasis(query, intent);
  const missingInfoNote = inferMissingInfo(query);
  return { emphasis, missingInfoNote, reasoningLevel: level };
}

function intentEmphasis(query: string, intent: Intent): string {
  switch (intent) {
    case 'code':
      return 'Write working, production-quality code. Explain the approach briefly, include error handling and edge cases.';
    case 'research':
      return 'Give a well-grounded answer. Where there is uncertainty or conflicting information, say so explicitly and prefer verifiable sources.';
    case 'analysis':
      return 'Weigh concrete pros/cons and trade-offs. Use numbers and a clear, defensible conclusion.';
    case 'planning':
      return 'Provide a structured, actionable plan with clear milestones and a logical order.';
    case 'writing':
      return 'Write naturally and specifically. Vary sentence length; add concrete details; keep it human.';
    case 'explain':
      return 'Explain clearly, meeting the user at their level. Use a concrete example early.';
    case 'summary':
      return 'Summarize tightly. Keep the most important points; skip fluff.';
    case 'design':
      return 'Give concrete design direction: hierarchy, layout, spacing, colour, and rationale.';
    default:
      return 'Answer helpfully and directly with a clear structure.';
  }
}

function inferMissingInfo(query: string): string | undefined {
  const hasGoal = /\b(i want|my goal|help me|i need|please)\b/i.test(query);
  const hasScope = /\b(for|using|with)\b/i.test(query);
  if (!hasGoal && !hasScope) {
    return 'If the request is ambiguous, briefly state what additional detail would help, then give the best answer with reasonable assumptions.';
  }
  return undefined;
}