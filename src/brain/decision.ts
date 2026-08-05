/**
 * Brain Decision — the top-level arbiter for a single request.
 *
 * Decides the generation strategy (whether to stream, how deep to reason,
 * whether to enable thinking, and what sampling parameters to send) based on
 * the intent/complexity analysis and stored user settings. This is where the
 * plumbing between analysis and provider options lives.
 */
import type { BrainSettings, Complexity, Intent, ReasoningLevel } from './types';

export interface GenerationPlan {
  temperature: number;
  topP: number;
  maxTokens: number;
  /** Enable the model's extended thinking when the reasoning level demands it. */
  thinking: boolean;
  streaming: boolean;
}

export function decideGenerationPlan(
  intent: Intent,
  complexity: Complexity,
  settings: BrainSettings,
): GenerationPlan {
  const level: ReasoningLevel = settings.reasoningLevel ?? 'medium';

  // Base temperature from settings.
  let temperature = clamp(settings.temperature ?? 0.7, 0, 2);

  // Creative/tasks benefit from slightly higher temp; precise ones lower.
  if (intent === 'code' || intent === 'analysis') temperature = Math.min(temperature, 0.6);
  if (intent === 'writing' || intent === 'design') temperature = Math.max(temperature, 0.8);

  // Max tokens from settings, overridden by task complexity.
  let maxTokens = settings.maxTokens ?? 1024;
  if (complexity === 'high') maxTokens = Math.max(maxTokens, 2048);
  if (settings.responseLength === 'short') maxTokens = Math.min(maxTokens, 800);
  if (settings.responseLength === 'detailed') maxTokens = Math.max(maxTokens, 2048);

  // Thinking enabled only when the user wants a deeper reasoning pass.
  const thinking = level === 'high';

  return {
    temperature: round1(temperature),
    topP: clamp(settings.topP ?? 0.9, 0.05, 1),
    maxTokens,
    thinking,
    streaming: settings.streaming !== false,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Whether the Brain should remember this exchange by default. */
export function shouldPersistMemory(settings: BrainSettings): boolean {
  return settings.memoryEnabled !== false;
}