/**
 * Brain Planning — builds an internal execution plan before the model responds.
 *
 * Drops a structured, thinking scaffold into the system prompt's guidance path
 * so the model reasons in order (e.g. Website → requirements → architecture →
 * frontend → backend → database → security → deployment → testing → answer).
 * The plan itself is invisible to the user.
 */
import type { Complexity, Intent, ReasoningLevel } from './types';

interface PlanPhase {
  label: string;
  hint: string;
}

const intentPhases: Record<Intent, PlanPhase[]> = {
  planning: [
    { label: 'Requirements', hint: 'Clarify the goal and constraints.' },
    { label: 'Architecture', hint: 'Outline components and relationships.' },
    { label: 'Execution steps', hint: 'Ordered, actionable milestones.' },
    { label: 'Verify', hint: 'Confirm the plan meets the goal.' },
  ],
  code: [
    { label: 'Understand', hint: 'Restate what is being built or fixed.' },
    { label: 'Design', hint: 'Choose approach, data structures, APIs.' },
    { label: 'Implement', hint: 'Production-quality code with edge cases.' },
    { label: 'Verify', hint: 'Check correctness, errors, completeness.' },
  ],
  research: [
    { label: 'Gather', hint: 'Identify the key question and sub-questions.' },
    { label: 'Cross-reference', hint: 'Compare evidence; flag contradictions.' },
    { label: 'Synthesize', hint: 'Merge findings into a clear answer.' },
  ],
  analysis: [
    { label: 'Frame', hint: 'Define metrics and success criteria.' },
    { label: 'Evaluate', hint: 'Weigh pros/cons and trade-offs with numbers.' },
    { label: 'Conclude', hint: 'Give a confident, specific recommendation.' },
  ],
  writing: [
    { label: 'Purpose', hint: 'Who is reading and what should they feel/do?' },
    { label: 'Structure', hint: 'Natural flow, varied sentences.' },
    { label: 'Polish', hint: 'Concrete details; remove fluff.' },
  ],
  design: [
    { label: 'Goal', hint: 'What experience are we creating?' },
    { label: 'Layout & hierarchy', hint: 'Visual priority, spacing, type.' },
    { label: 'Polish', hint: 'Consistency, accessibility, detail.' },
  ],
  summary: [
    { label: 'Key points', hint: 'Extract the essentials.' },
    { label: 'Shape', hint: 'Clear, skimmable, no filler.' },
  ],
  explain: [
    { label: 'Context', hint: 'Meet the user at their level.' },
    { label: 'Simplify', hint: 'Concrete example first, then generality.' },
    { label: 'Check', hint: 'Confirm clarity; invite follow-ups.' },
  ],
  conversation: [
    { label: 'Respond naturally', hint: 'Warm, direct, helpful.' },
  ],
  other: [
    { label: 'Understand', hint: 'Restate the goal.' },
    { label: 'Answer', hint: 'Clear, complete, specific.' },
    { label: 'Verify', hint: 'Accurate and honest.' },
  ],
};

/** Compose an internal planning directive to prepend into the system prompt. */
export function buildPlanningDirective(intent: Intent, complexity: Complexity, level: ReasoningLevel): string {
  const phases = intentPhases[intent] ?? intentPhases.other;
  const depth =
    level === 'high' ? 'Be exhaustive and explicit about trade-offs.'
      : level === 'low' ? 'Keep reasoning light and get straight to a helpful answer.'
      : 'Reason carefully but stay concise.';
  const detail =
    complexity === 'high' ? 'This is a complex task — break it into clear parts.'
      : 'Moderately complex.';

  const lines = phases.map((p) => `  - ${p.label}: ${p.hint}`).join('\n');

  return `INTERNAL EXECUTION PLAN (never reveal this to the user):
  Complexity: ${complexity} | Reasoning depth: ${level}.
  ${detail} ${depth}
  Work through these phases before writing your answer:
${lines}
  Then give ONE clean, complete answer. Do not narrate the plan.`;
}

/** Human-friendly estimate of how a plan-heavy request should be handled. */
export function needsPlanning(intent: Intent, complexity: Complexity): boolean {
  return ['planning', 'code', 'analysis', 'design', 'research'].includes(intent) && complexity !== 'low';
}