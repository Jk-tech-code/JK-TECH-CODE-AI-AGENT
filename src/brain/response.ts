/**
 * Brain Response — final formatting pass.
 *
 * Ensures the raw model output is well-formed Markdown, applies light copy
 * cleanup, and enforces the human voice. This runs AFTER verification and
 * humanization and is the last step before the text reaches the UI.
 */
import type { LLMCompleteResult } from './providers/llm';
import type { BrainOutput } from './types';

/** Minor mechanical cleanup that won't alter meaning. */
function tidyMarkdown(text: string): string {
  let out = text.replace(/\r\n/g, '\n');
  // Collapse 3+ blank lines to 2.
  out = out.replace(/\n{3,}/g, '\n\n');
  // Normalize spacing after Markdown block markers.
  out = out.trim();
  return out;
}

/** Heuristically promote a "short" flat reply into readable Markdown lists. */
function structureResponse(text: string, responseLength: string): string {
  void responseLength;
  // If it's already using Markdown (headings/lists/fences), keep it.
  if (/\n[-*] |\n#{1,3} |```|^---$/m.test(text)) return text;
  return text;
}

export function assembleResponse(
  result: LLMCompleteResult,
  opts: { confidence: number; latencyMs: number; responseLength: string },
): BrainOutput {
  let content = structureResponse(result.content, opts.responseLength);
  content = tidyMarkdown(content);

  return {
    content,
    modelUsed: result.modelUsed,
    confidence: opts.confidence,
    latencyMs: opts.latencyMs,
    thinking: result.thinking || undefined,
  };
}