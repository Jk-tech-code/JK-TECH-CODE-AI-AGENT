/**
 * Groq provider — fast inference via the OpenAI-compatible API.
 *
 * Configured via:
 *   LLM_PROVIDER=groq
 *   GROQ_API_KEY=<key>
 *   GROQ_MODEL=llama-3.3-70b-versatile   (default)
 *   GROQ_BASE_URL=https://api.groq.com/openai/v1   (optional override)
 *   GROQ_TIMEOUT_MS / GROQ_MAX_RETRIES   (optional)
 *
 * Implements the shared `LLMProvider` interface through the OpenAI-compatible
 * core. All errors surface as `ProviderError` with a friendly message.
 */
import { createOpenAICompatProvider, getCompatConfiguredModel, getCompatHost } from './openai-compat-core';

/** Shared singleton — the Brain selects it via `LLM_PROVIDER=groq`. */
export const groqProvider = createOpenAICompatProvider('groq');

export function getGroqConfiguredModel(): string {
  return getCompatConfiguredModel('groq');
}

export function getGroqHost(): string {
  return getCompatHost('groq');
}
