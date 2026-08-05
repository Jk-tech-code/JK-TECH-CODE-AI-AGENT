/**
 * Provider Manager — the single gateway between the Brain and every LLM
 * backend. The Brain never imports a provider implementation directly; it only
 * talks to this manager (through the `llm.ts` facade).
 *
 * Responsibilities:
 *   • Load environment variables (active provider, keys, models, timeouts)
 *   • Select the active provider (`LLM_PROVIDER`, default `gemini`)
 *   • Health checking (`check`, `availableProviders`)
 *   • Automatic fallback to the next configured provider (opt-in via
 *     `LLM_FALLBACK_ENABLED` or the per-user settings toggle)
 *   • Streaming (with graceful pre-stream fallback between providers)
 *   • Error handling (`ProviderError`, never crashes the app)
 *   • Retry logic (delegated to each provider + cross-provider fallback)
 *   • Timeout handling (`LLM_TIMEOUT_MS` safety net on top of per-provider
 *     timeouts)
 *   • Startup diagnostics (`getEnvDiagnostics`, `validateConfig`) — reports
 *     exactly which environment variables are present, never their values.
 *
 * Security: secrets are read exclusively from `process.env`, never logged,
 * never serialized, and never included in error messages.
 */
import { createLogger } from '@/lib/logging/logger';
import {
  isLLMProviderName,
  LLM_PROVIDER_NAMES,
  ProviderError,
  type LLMCompleteResult,
  type LLMMessage,
  type LLMOptions,
  type LLMProvider,
  type LLMProviderName,
  type LLMStreamChunk,
  type ProviderModelInfo,
  type ProviderStatus,
} from './interface';
import { geminiProvider, getGeminiConfiguredModel, getGeminiBaseUrl } from './gemini';
import {
  ollamaProvider,
  isHealthy,
  isModelAvailable,
  listModels,
  getOllamaHost,
  getConfiguredModel as getOllamaConfiguredModel,
} from './ollama';
import { openAICompatProvider, getOpenAIConfiguredModel, getOpenAIHost } from './openai-compat';
import { groqProvider, getGroqConfiguredModel, getGroqHost } from './groq';
import { openRouterProvider, getOpenRouterConfiguredModel, getOpenRouterHost } from './openrouter';
import { togetherProvider, getTogetherConfiguredModel, getTogetherHost } from './together';
import { anthropicProvider, getAnthropicConfiguredModel, getAnthropicBaseUrl } from './anthropic';

const managerLogger = createLogger('brain:provider-manager');

/** Default fallback chain when `LLM_FALLBACK_ORDER` is unset. */
export const DEFAULT_FALLBACK_ORDER: readonly LLMProviderName[] = [
  'gemini',
  'groq',
  'openrouter',
  'openai',
  'anthropic',
  'together',
  'ollama', // local — reached only when the cloud providers all fail
];

/** Every provider the Brain can use, keyed by name. */
export const PROVIDER_REGISTRY: Record<LLMProviderName, LLMProvider> = {
  gemini: geminiProvider,
  ollama: ollamaProvider,
  openai: openAICompatProvider,
  groq: groqProvider,
  openrouter: openRouterProvider,
  anthropic: anthropicProvider,
  together: togetherProvider,
};

/** Env var that holds a provider's API key, e.g. `GROQ_API_KEY`. */
export function providerApiKeyVar(name: LLMProviderName): string {
  return `${name.toUpperCase()}_API_KEY`;
}

/** True when the provider has what it needs to make calls (ollama needs none). */
export function isProviderConfigured(name: LLMProviderName): boolean {
  if (name === 'ollama') return true;
  return Boolean(process.env[providerApiKeyVar(name)]);
}

export class ProviderManager {
  /**
   * The active provider name, driven by `LLM_PROVIDER` (default `gemini`).
   * Unknown values log a loud warning and fall back to gemini — never crash.
   */
  activeProvider(): LLMProviderName {
    const raw = (process.env.LLM_PROVIDER || 'gemini').trim().toLowerCase();
    if (isLLMProviderName(raw)) return raw;
    if (raw !== 'gemini') {
      managerLogger.warn(
        `LLM_PROVIDER="${raw}" is not a supported provider. Falling back to "gemini". Supported: ${LLM_PROVIDER_NAMES.join(', ')}.`,
      );
    }
    return 'gemini';
  }

  /** Resolve the provider instance for a name (defaults to the active one). */
  resolveProvider(name?: LLMProviderName): LLMProvider {
    const key = name && isLLMProviderName(name) ? name : this.activeProvider();
    return PROVIDER_REGISTRY[key];
  }

  /** Health status of one provider (defaults to the active one). */
  async checkProvider(name?: LLMProviderName): Promise<ProviderStatus> {
    return this.resolveProvider(name).check();
  }

  /**
   * The fallback chain as a list of provider names.
   * `LLM_FALLBACK_ORDER` (comma-separated) overrides the default order.
   */
  fallbackOrder(): LLMProviderName[] {
    const raw = (process.env.LLM_FALLBACK_ORDER || '').trim().toLowerCase();
    if (!raw) return [...DEFAULT_FALLBACK_ORDER];
    const names = raw
      .split(',')
      .map((s) => s.trim())
      .filter(isLLMProviderName);
    return names.length > 0 ? names : [...DEFAULT_FALLBACK_ORDER];
  }

  /** Master switch for automatic fallback (`LLM_FALLBACK_ENABLED=true|1`). */
  fallbackEnabled(): boolean {
    const raw = (process.env.LLM_FALLBACK_ENABLED || '').trim().toLowerCase();
    return raw === 'true' || raw === '1';
  }

  /**
   * Build the ordered list of providers to try for one request.
   * Starts from the requested provider (or the active one), follows the
   * fallback order after it, and — when fallback is on — skips providers
   * that are not configured.
   */
  buildChain(requested?: LLMProviderName, fallback?: boolean): LLMProviderName[] {
    const order = this.fallbackOrder();
    const primary = requested && isLLMProviderName(requested) ? requested : this.activeProvider();
    const chain = [primary, ...order.filter((n) => n !== primary)];

    const enabled = fallback ?? this.fallbackEnabled();
    if (!enabled) return chain.slice(0, 1);

    const configured = chain.filter((n) => isProviderConfigured(n));
    // If nothing is configured, return the full chain so the first provider
    // surfaces its specific "API key not configured" error to the user.
    if (configured.length === 0) return chain;
    if (requested && isLLMProviderName(requested) && !isProviderConfigured(requested)) {
      managerLogger.warn(
        `Requested provider "${requested}" is not configured (${providerApiKeyVar(requested)} missing). Falling back to: ${configured.join(', ')}.`,
      );
    }
    return configured;
  }

  /**
   * Non-streaming completion through the requested provider, with automatic
   * fallback to the next configured provider when enabled. `LLM_TIMEOUT_MS`
   * acts as an overall safety net on top of each provider's own timeout.
   */
  async complete(messages: LLMMessage[], options: LLMOptions = {}): Promise<LLMCompleteResult> {
    const chain = this.buildChain(options.provider, options.fallback);
    const { provider: _requested, fallback: _fallback, ...providerOptions } = options;

    const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || 0);
    let lastError: unknown;

    for (const name of chain) {
      const provider = PROVIDER_REGISTRY[name];
      try {
        const call = provider.complete(messages, providerOptions);
        return timeoutMs > 0 ? await this.withTimeout(call, timeoutMs, name) : await call;
      } catch (err) {
        lastError = err;
        if (err instanceof ProviderError && !err.retryable) throw err;
        managerLogger.warn(`Provider "${name}" failed, ${this.hasNext(chain, name) ? 'trying next provider.' : 'no more providers.'}`, {
          retryable: err instanceof ProviderError ? err.retryable : true,
        });
      }
    }

    if (lastError instanceof ProviderError) throw lastError;
    throw new ProviderError('All LLM providers are unavailable. Please try again.', true);
  }

  /**
   * Streaming completion with graceful pre-stream fallback: if a provider
   * fails *before yielding its first chunk*, the next provider is tried.
   * A failure after content has started is surfaced to the caller (a
   * mid-stream switch would corrupt the response).
   */
  async *stream(messages: LLMMessage[], options: LLMOptions = {}): AsyncGenerator<LLMStreamChunk> {
    const chain = this.buildChain(options.provider, options.fallback);
    const { provider: _requested, fallback: _fallback, ...providerOptions } = options;

    let lastError: unknown;
    for (const name of chain) {
      const provider = PROVIDER_REGISTRY[name];
      let sawChunk = false;
      try {
        for await (const chunk of provider.stream(messages, providerOptions)) {
          sawChunk = true;
          yield chunk;
        }
        return; // completed cleanly on this provider
      } catch (err) {
        lastError = err;
        if (err instanceof ProviderError && !err.retryable) throw err;
        if (sawChunk) throw err; // cannot switch providers mid-stream
        managerLogger.warn(`Provider "${name}" failed before streaming, trying next provider.`);
      }
    }

    if (lastError instanceof ProviderError) throw lastError;
    throw new ProviderError('All LLM providers are unavailable. Please try again.', true);
  }

  /** Best-effort metadata for one provider (model, host, available models). */
  async modelInfo(name?: LLMProviderName): Promise<ProviderModelInfo> {
    return this.resolveProvider(name).getInfo();
  }

  /** Health status of every registered provider (safe to call repeatedly). */
  async availableProviders(): Promise<ProviderStatus[]> {
    return Promise.all(
      LLM_PROVIDER_NAMES.map((name) =>
        PROVIDER_REGISTRY[name].check().catch(() => ({
          provider: name,
          available: false,
          model: '',
          reason: 'Health check failed.',
        })),
      ),
    );
  }

  /** The configured default model for a provider (defaults to the active one). */
  getConfiguredModel(name?: LLMProviderName): string {
    switch (name ?? this.activeProvider()) {
      case 'gemini': return getGeminiConfiguredModel();
      case 'ollama': return getOllamaConfiguredModel();
      case 'openai': return getOpenAIConfiguredModel();
      case 'groq': return getGroqConfiguredModel();
      case 'openrouter': return getOpenRouterConfiguredModel();
      case 'anthropic': return getAnthropicConfiguredModel();
      case 'together': return getTogetherConfiguredModel();
      default: return '';
    }
  }

  /** Where the provider is hosted (base URL / host). */
  getProviderHost(name?: LLMProviderName): string | undefined {
    switch (name ?? this.activeProvider()) {
      case 'gemini': return getGeminiBaseUrl();
      case 'ollama': return getOllamaHost();
      case 'openai': return getOpenAIHost();
      case 'groq': return getGroqHost();
      case 'openrouter': return getOpenRouterHost();
      case 'anthropic': return getAnthropicBaseUrl();
      case 'together': return getTogetherHost();
      default: return undefined;
    }
  }

  /**
   * Environment diagnostics — presence booleans only, never values.
   * Safe to expose in logs, the admin dashboard, or the settings page.
   */
  getEnvDiagnostics(): {
    activeProvider: LLMProviderName;
    fallbackEnabled: boolean;
    fallbackOrder: LLMProviderName[];
    configuredProviders: Array<{ name: LLMProviderName; configured: boolean; model: string }>;
    env: Record<string, boolean>;
  } {
    const envKeys = [
      'LLM_PROVIDER',
      'LLM_FALLBACK_ENABLED',
      'LLM_FALLBACK_ORDER',
      'LLM_TIMEOUT_MS',
      ...LLM_PROVIDER_NAMES.flatMap((name) =>
        name === 'ollama'
          ? ['OLLAMA_HOST', 'OLLAMA_MODEL']
          : [providerApiKeyVar(name), `${name.toUpperCase()}_MODEL`],
      ),
    ];
    const env: Record<string, boolean> = {};
    for (const key of envKeys) env[key] = Boolean(process.env[key]);

    return {
      activeProvider: this.activeProvider(),
      fallbackEnabled: this.fallbackEnabled(),
      fallbackOrder: this.fallbackOrder(),
      configuredProviders: LLM_PROVIDER_NAMES.map((name) => ({
        name,
        configured: isProviderConfigured(name),
        model: this.getConfiguredModel(name),
      })),
      env,
    };
  }

  /**
   * Startup configuration validation. Reports every problem without throwing,
   * so callers can surface clear diagnostics (startup report, admin UI).
   */
  validateConfig(): { ok: boolean; errors: string[] } {
    const errors: string[] = [];
    const raw = (process.env.LLM_PROVIDER || 'gemini').trim().toLowerCase();
    if (!isLLMProviderName(raw)) {
      errors.push(
        `LLM_PROVIDER="${raw}" is not a supported provider. Use one of: ${LLM_PROVIDER_NAMES.join(', ')}.`,
      );
    }
    const active = this.activeProvider();
    if (active !== 'ollama' && !isProviderConfigured(active)) {
      errors.push(
        `${providerApiKeyVar(active)} is not set, so "${active}" cannot be used. Add the key to .env.local (local) or the Vercel project settings (deployed), or set LLM_PROVIDER to a configured provider.`,
      );
    }
    if (this.fallbackEnabled() && this.fallbackOrder().length < 2) {
      errors.push('LLM_FALLBACK_ENABLED=true but the fallback order has fewer than two providers.');
    }
    return { ok: errors.length === 0, errors };
  }

  /** True when streaming is currently viable for the active provider. */
  async streamingAvailable(): Promise<boolean> {
    const status = await this.checkProvider();
    return status.available;
  }

  private hasNext(chain: LLMProviderName[], current: LLMProviderName): boolean {
    return chain.indexOf(current) < chain.length - 1;
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, name: LLMProviderName): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new ProviderError(`${name} exceeded the LLM_TIMEOUT_MS limit. Please try again.`, true));
      }, timeoutMs);
      promise.then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); },
      );
    });
  }
}

/** Shared singleton used by the Brain through the `llm.ts` facade. */
export const providerManager = new ProviderManager();

// ─── Ollama helpers re-exported for backwards compatibility ───
export { isHealthy, isModelAvailable, listModels, getOllamaHost };
export type { OllamaModelInfo, OllamaChatMessage } from './ollama';
