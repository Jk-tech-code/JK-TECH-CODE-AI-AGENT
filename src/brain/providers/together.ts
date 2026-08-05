/**
 * Together AI provider — open-model inference via the OpenAI-compatible API.
 *
 * Configured via:
 *   LLM_PROVIDER=together
 *   TOGETHER_API_KEY=<key>
 *   TOGETHER_MODEL=meta-llama/Llama-3.3-70B-Instruct-Turbo   (default)
 *   TOGETHER_BASE_URL=https://api.together.xyz/v1   (optional override)
 *   TOGETHER_TIMEOUT_MS / TOGETHER_MAX_RETRIES   (optional)
 *
 * Implements the shared `LLMProvider` interface through the OpenAI-compatible
 * core. All errors surface as `ProviderError` with a friendly message.
 */
import { createOpenAICompatProvider, getCompatConfiguredModel, getCompatHost } from './openai-compat-core';

/** Shared singleton — the Brain selects it via `LLM_PROVIDER=together`. */
export const togetherProvider = createOpenAICompatProvider('together');

export function getTogetherConfiguredModel(): string {
  return getCompatConfiguredModel('together');
}

export function getTogetherHost(): string {
  return getCompatHost('together');
}
