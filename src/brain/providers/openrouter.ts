/**
 * OpenRouter provider — unified gateway to many models via the
 * OpenAI-compatible API.
 *
 * Configured via:
 *   LLM_PROVIDER=openrouter
 *   OPENROUTER_API_KEY=<key>
 *   OPENROUTER_MODEL=google/gemini-2.5-flash   (default)
 *   OPENROUTER_BASE_URL=https://openrouter.ai/api/v1   (optional override)
 *   OPENROUTER_TIMEOUT_MS / OPENROUTER_MAX_RETRIES   (optional)
 *
 * Implements the shared `LLMProvider` interface through the OpenAI-compatible
 * core. All errors surface as `ProviderError` with a friendly message.
 */
import { createOpenAICompatProvider, getCompatConfiguredModel, getCompatHost } from './openai-compat-core';

/** Shared singleton — the Brain selects it via `LLM_PROVIDER=openrouter`. */
export const openRouterProvider = createOpenAICompatProvider('openrouter');

export function getOpenRouterConfiguredModel(): string {
  return getCompatConfiguredModel('openrouter');
}

export function getOpenRouterHost(): string {
  return getCompatHost('openrouter');
}
