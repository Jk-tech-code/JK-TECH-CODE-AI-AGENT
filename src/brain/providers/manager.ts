/**
 * Provider Manager — the single gateway between the Brain and its generation
 * backend. The Brain never imports a provider implementation directly; it only
 * talks to this manager (through the `llm.ts` facade).
 *
 * The Brain now has exactly ONE engine: the deterministic Search Engine
 * (`search-engine.ts`). This manager keeps the same surface the Brain and its
 * consumers relied on (active provider, health check, completion, streaming,
 * diagnostics) so the rest of the app is unchanged.
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
import { searchEngineProvider } from './search-engine';

const managerLogger = createLogger('brain:provider-manager');

/** Every engine the Brain can use, keyed by name. */
export const PROVIDER_REGISTRY: Record<LLMProviderName, LLMProvider> = {
  search: searchEngineProvider,
};

/** Env var that backs a provider — kept for API compatibility. */
export function providerApiKeyVar(_name: LLMProviderName): string {
  return 'TAVILY_API_KEY';
}

/** True when the engine has what it needs to make calls. */
export function isProviderConfigured(name: LLMProviderName): boolean {
  if (name === 'search') return Boolean(process.env.TAVILY_API_KEY || process.env.SERPAPI_API_KEY);
  return false;
}

export class ProviderManager {
  /**
   * The active engine name. Always 'search' — the deterministic search engine.
   */
  activeProvider(): LLMProviderName {
    return 'search';
  }

  /** Resolve the engine instance for a name (defaults to the active one). */
  resolveProvider(name?: LLMProviderName): LLMProvider {
    const key = name && isLLMProviderName(name) ? name : this.activeProvider();
    return PROVIDER_REGISTRY[key];
  }

  /** Health status of the engine (defaults to the active one). */
  async checkProvider(name?: LLMProviderName): Promise<ProviderStatus> {
    return this.resolveProvider(name).check();
  }

  /** The engine chain is always the single search engine. */
  buildChain(_requested?: LLMProviderName, _fallback?: boolean): LLMProviderName[] {
    return ['search'];
  }

  /**
   * Non-streaming completion through the search engine. `LLM_TIMEOUT_MS` acts
   * as an overall safety net on top of the engine's own runtime.
   */
  async complete(messages: LLMMessage[], options: LLMOptions = {}): Promise<LLMCompleteResult> {
    const { provider: _requested, fallback: _fallback, ...providerOptions } = options;

    const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || 0);
    const call = this.resolveProvider(_requested).complete(messages, providerOptions);
    return timeoutMs > 0 ? await this.withTimeout(call, timeoutMs) : await call;
  }

  /**
   * Streaming completion through the search engine.
   */
  async *stream(messages: LLMMessage[], options: LLMOptions = {}): AsyncGenerator<LLMStreamChunk> {
    const { provider: _requested, fallback: _fallback, ...providerOptions } = options;
    yield* this.resolveProvider(_requested).stream(messages, providerOptions);
  }

  /** Best-effort metadata for the engine. */
  async modelInfo(name?: LLMProviderName): Promise<ProviderModelInfo> {
    return this.resolveProvider(name).getInfo();
  }

  /** Health status of the registered engine (safe to call repeatedly). */
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

  /** The configured default model for the engine. */
  getConfiguredModel(name?: LLMProviderName): string {
    return this.resolveProvider(name).name === 'search' ? 'search-engine' : 'search-engine';
  }

  /** Where the engine is hosted (none — the search APIs are remote). */
  getProviderHost(_name?: LLMProviderName): string | undefined {
    return undefined;
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
    const envKeys = ['TAVILY_API_KEY', 'SERPAPI_API_KEY', 'LLM_TIMEOUT_MS'];
    const env: Record<string, boolean> = {};
    for (const key of envKeys) env[key] = Boolean(process.env[key]);

    return {
      activeProvider: this.activeProvider(),
      fallbackEnabled: false,
      fallbackOrder: ['search'],
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
    if (!isProviderConfigured('search')) {
      errors.push(
        'TAVILY_API_KEY / SERPAPI_API_KEY are not set, so the Brain cannot search. Add a key to .env.local (local) or the Vercel project settings (deployed).',
      );
    }
    return { ok: errors.length === 0, errors };
  }

  /** True when streaming is currently viable. */
  async streamingAvailable(): Promise<boolean> {
    const status = await this.checkProvider();
    return status.available;
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new ProviderError(`${this.activeProvider()} exceeded the LLM_TIMEOUT_MS limit. Please try again.`, true));
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
