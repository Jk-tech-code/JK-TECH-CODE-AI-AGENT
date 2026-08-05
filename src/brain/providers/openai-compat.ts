/**
 * OpenAI provider — native OpenAI Chat Completions for the Brain.
 *
 * Implements the shared `LLMProvider` interface through the OpenAI-compatible
 * core (`openai-compat-core.ts`), which provides streaming (SSE), retries,
 * timeouts and friendly error mapping. This module keeps the historical
 * `getOpenAIResult` / `getOpenAIStream` exports so any existing callers keep
 * working unchanged.
 *
 * Configured via:
 *   LLM_PROVIDER=openai
 *   OPENAI_API_KEY=<key>
 *   OPENAI_MODEL=gpt-4.1   (default)
 *   OPENAI_BASE_URL=https://api.openai.com/v1   (optional override)
 *   OPENAI_TIMEOUT_MS / OPENAI_MAX_RETRIES   (optional)
 */
import {
  createOpenAICompatProvider,
  chatComplete,
  chatStream,
  getCompatConfiguredModel,
  getCompatHost,
  type OpenAICompatProviderName,
} from './openai-compat-core';
import type { LLMCompleteResult, LLMMessage, LLMOptions, LLMStreamChunk } from './interface';

const PROVIDER_NAME: OpenAICompatProviderName = 'openai';

/** Shared singleton — the Brain selects it via `LLM_PROVIDER=openai`. */
export const openAICompatProvider = createOpenAICompatProvider(PROVIDER_NAME);

export function getOpenAIConfiguredModel(): string {
  return getCompatConfiguredModel(PROVIDER_NAME);
}

export function getOpenAIHost(): string {
  return getCompatHost(PROVIDER_NAME);
}

/** Legacy export: non-streaming completion (backwards compatible). */
export default async function getOpenAIResult(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: LLMOptions,
): Promise<LLMCompleteResult> {
  return chatComplete(PROVIDER_NAME, messages, options);
}

/** Legacy export: streaming completion (backwards compatible). */
export async function* getOpenAIStream(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: LLMOptions,
): AsyncGenerator<LLMStreamChunk> {
  yield* chatStream(PROVIDER_NAME, messages as LLMMessage[], options);
}
