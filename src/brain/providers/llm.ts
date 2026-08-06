/**
 * Generation selection layer for the JK-TECH-CODE Brain.
 *
 * This module is a thin facade over the `ProviderManager` — the Brain only
 * ever imports from here, never from individual provider implementations.
 *
 * The Brain uses a single deterministic engine: the Search Engine
 * (`search-engine.ts`). It answers by searching the web, ranking sources, and
 * assembling an evidence-based response — no external LLM is called.
 *
 * Methods keep the surface the Brain and its consumers already rely on
 * (`complete`, `stream`, `checkProvider`, `activeProvider`, `getConfiguredModel`,
 * diagnostics, …) so the rest of the app is unchanged.
 */
import {
  providerManager,
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

/** Supported engine keys. */
export type { LLMProviderName } from './interface';
export { LLM_PROVIDER_NAMES, isLLMProviderName } from './interface';

/** Returns the active engine name ("search"). */
export function activeProvider(): LLMProviderName {
  return providerManager.activeProvider();
}

/** The active engine instance. */
export function getProvider() {
  return providerManager.resolveProvider();
}

/** Status of the engine (defaults to the active one) — safe to call repeatedly. */
export async function checkProvider(provider?: LLMProviderName): Promise<ProviderStatus> {
  return providerManager.checkProvider(provider);
}

/** Non-streaming completion through the search engine. */
export async function complete(
  messages: LLMMessage[],
  options: LLMOptions = {},
): Promise<LLMCompleteResult> {
  return providerManager.complete(messages, options);
}

/**
 * Stream a completion. Yields `{ content? }` and `{ thinking? }` chunks in
 * real time.
 */
export async function* stream(
  messages: LLMMessage[],
  options: LLMOptions = {},
): AsyncGenerator<LLMStreamChunk> {
  yield* providerManager.stream(messages, options);
}

/** Model metadata helpers, engine-agnostic. */
export async function modelInfo(provider?: LLMProviderName): Promise<import('./interface').ProviderModelInfo> {
  return providerManager.modelInfo(provider);
}

/** Best-effort gather of whether streaming is currently viable. */
export async function streamingAvailable(): Promise<boolean> {
  return providerManager.streamingAvailable();
}

/** The configured model for the engine. */
export function getConfiguredModel(provider?: LLMProviderName): string {
  return providerManager.getConfiguredModel(provider);
}

/** Where the engine is hosted (none — the search APIs are remote). */
export function getProviderHost(provider?: LLMProviderName): string | undefined {
  return providerManager.getProviderHost(provider);
}

/** Whether automatic cross-provider fallback is enabled (always false now). */
export function fallbackEnabled(): boolean {
  return false;
}

/** The engine chain (always just the search engine). */
export function fallbackOrder(): LLMProviderName[] {
  return ['search'];
}

/** Ordered list of engines to try for a request (always the single engine). */
export function buildFallbackChain(_requested?: LLMProviderName, _fallback?: boolean): LLMProviderName[] {
  return ['search'];
}

/** Health status of the registered engine. */
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

export { ProviderError };
export type {
  LLMStreamChunk,
  LLMCompleteResult,
  LLMOptions,
  ProviderStatus,
  LLMMessage,
} from './interface';
