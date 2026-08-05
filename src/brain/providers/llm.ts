/**
 * Provider selection layer for the JK-TECH-CODE Brain.
 *
 * This module is a thin facade over the `ProviderManager` — the Brain only
 * ever imports from here, never from individual provider implementations.
 *
 * Supported providers (selected via `LLM_PROVIDER`):
 *   • "gemini"     (default) — Google Gemini, works on Vercel and any
 *     serverless runtime. Configured with GEMINI_API_KEY + GEMINI_MODEL.
 *   • "ollama"     — local Ollama + Qwen3 for local development.
 *   • "openai"     — OpenAI (native).
 *   • "groq"       — Groq (fast inference).
 *   • "openrouter" — OpenRouter unified gateway.
 *   • "anthropic"  — Anthropic Claude.
 *   • "together"   — Together AI.
 *
 * Automatic fallback between providers is available and configurable via
 * `LLM_FALLBACK_ENABLED` / `LLM_FALLBACK_ORDER` (or the per-user settings
 * toggle). Methods are non-throwing in a controlled way and return structured
 * results so the Brain pipeline can present a friendly message and a Retry
 * affordance without ever crashing.
 */
import {
  providerManager,
  isHealthy,
  isModelAvailable,
  listModels,
  getOllamaHost,
  isProviderConfigured,
  PROVIDER_REGISTRY,
} from './manager';
import {
  ProviderError,
  type LLMCompleteResult,
  type LLMMessage,
  type LLMOptions,
  type LLMProviderName,
  type LLMStreamChunk,
  type ProviderStatus,
} from './interface';

/** Supported provider keys. */
export type { LLMProviderName } from './interface';
export { LLM_PROVIDER_NAMES, isLLMProviderName } from './interface';

/** Returns the active provider name (env-driven; default "gemini"). */
export function activeProvider(): LLMProviderName {
  return providerManager.activeProvider();
}

/** The active provider instance. */
export function getProvider() {
  return providerManager.resolveProvider();
}

/** Status of one provider (defaults to the active one) — safe to call repeatedly. */
export async function checkProvider(provider?: LLMProviderName): Promise<ProviderStatus> {
  return providerManager.checkProvider(provider);
}

/** Non-streaming completion with optional cross-provider fallback. */
export async function complete(
  messages: LLMMessage[],
  options: LLMOptions = {},
): Promise<LLMCompleteResult> {
  return providerManager.complete(messages, options);
}

/**
 * Stream a completion. Yields `{ content? }` and `{ thinking? }` chunks in
 * real time. Falls back to the next provider only before the first chunk.
 */
export async function* stream(
  messages: LLMMessage[],
  options: LLMOptions = {},
): AsyncGenerator<LLMStreamChunk> {
  yield* providerManager.stream(messages, options);
}

/** Model metadata helpers, provider-agnostic. */
export async function modelInfo(provider?: LLMProviderName): Promise<import('./interface').ProviderModelInfo> {
  return providerManager.modelInfo(provider);
}

/** Best-effort gather of whether streaming is currently viable. */
export async function streamingAvailable(): Promise<boolean> {
  return providerManager.streamingAvailable();
}

/** The configured model for one provider (defaults to the active one). */
export function getConfiguredModel(provider?: LLMProviderName): string {
  return providerManager.getConfiguredModel(provider);
}

/** Where a provider is hosted (base URL / host). */
export function getProviderHost(provider?: LLMProviderName): string | undefined {
  return providerManager.getProviderHost(provider);
}

// ─── Fallback + diagnostics (Provider Manager surface) ───

/** Whether automatic cross-provider fallback is enabled (env-driven). */
export function fallbackEnabled(): boolean {
  return providerManager.fallbackEnabled();
}

/** The ordered fallback chain (env-driven, with a sane default). */
export function fallbackOrder(): LLMProviderName[] {
  return providerManager.fallbackOrder();
}

/** Ordered list of providers to try for a request starting at `requested`. */
export function buildFallbackChain(requested?: LLMProviderName, fallback?: boolean): LLMProviderName[] {
  return providerManager.buildChain(requested, fallback);
}

/** Health status of every registered provider. */
export function availableProviders() {
  return providerManager.availableProviders();
}

/** Environment diagnostics — presence booleans only, never values. */
export function getEnvDiagnostics() {
  return providerManager.getEnvDiagnostics();
}

/** Startup configuration validation — clear errors, never throws. */
export function validateConfig(): { ok: boolean; errors: string[] } {
  return providerManager.validateConfig();
}

export { isProviderConfigured, PROVIDER_REGISTRY, providerManager };

// ─── Backwards-compatible re-exports (Ollama helpers used by integrations) ───
export { isHealthy, isModelAvailable, listModels, getOllamaHost };
export { ProviderError };
export type {
  LLMStreamChunk,
  LLMCompleteResult,
  LLMOptions,
  ProviderStatus,
  LLMMessage,
} from './interface';
export type { OllamaModelInfo, OllamaChatMessage } from './ollama';
