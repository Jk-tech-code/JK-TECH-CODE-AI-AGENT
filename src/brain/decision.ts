/**
 * Brain Decision — the top-level arbiter for a single request.
 *
 * Decides the generation strategy (whether to stream, how deep to reason,
 * whether a deeper search pass is needed) from the intent/complexity analysis
 * and stored user settings. The search engine is deterministic, so the plan
 * no longer carries sampling parameters (temperature / topP / topK).
 */
import type { BrainSettings, Complexity, Intent, ReasoningLevel } from './types';

export interface GenerationPlan {
  /** Number of search results consulted when building the answer. */
  numResults: number;
  /** Restrict results to a recency window (days); 0 = any date. */
  recencyDays: number;
  /** Enable a deeper reasoning pass when the reasoning level demands it. */
  thinking: boolean;
  streaming: boolean;
}

export function decideGenerationPlan(
  intent: Intent,
  complexity: Complexity,
  settings: BrainSettings,
): GenerationPlan {
  const level: ReasoningLevel = settings.reasoningLevel ?? 'medium';

  // Result budget: research/analysis benefits from more results.
  let numResults = clamp(settings.numResults ?? 5, 2, 10);
  if (intent === 'research' || intent === 'analysis') numResults = Math.max(numResults, 6);
  if (complexity === 'high') numResults = Math.max(numResults, 7);

  // Thinking enabled only when the user wants a deeper reasoning pass.
  const thinking = level === 'high';

  // Detailed answers consult slightly more sources.
  if (settings.responseLength === 'detailed') numResults = Math.min(10, numResults + 2);
  if (settings.responseLength === 'short') numResults = Math.max(2, numResults - 2);

  return {
    numResults,
    recencyDays: clamp(settings.recencyDays ?? 0, 0, 365),
    thinking,
    streaming: settings.streaming !== false,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Whether the Brain should remember this exchange by default. */
export function shouldPersistMemory(settings: BrainSettings): boolean {
  return settings.memoryEnabled !== false;
}