/**
 * Provider Manager — the single gateway between the Brain and its generation
 * backends. The Brain never imports a provider implementation directly; it only
 * talks to this manager (through the `llm.ts` facade).
 *
 * The Brain has two engines:
 *   • `deepseek` — a real LLM (primary). Used whenever `DEEPSEEK_API_KEY` is set.
 *   • `search`   — the deterministic Search Engine (fallback / when no LLM key).
 *
 * This manager keeps the same surface the Brain and its consumers relied on
 * (active provider, health check, completion, streaming, diagnostics) while
 * swapping in the best available engine.
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
import { deepseekProvider } from './deepseek';

const managerLogger = createLogger('brain:provider-manager');

/** Every engine the Brain can use, keyed by name. */
export const PROVIDER_REGISTRY: Record<LLMProviderName, LLMProvider> = {
  search: searchEngineProvider,
  deepseek: deepseekProvider,
};

/** Env var that backs a provider — kept for API compatibility. */
export function providerApiKeyVar(name: LLMProviderName): string {
  return name === 'deepseek' ? 'DEEPSEEK_API_KEY' : 'TAVILY_API_KEY';
}

/** True when the engine has what it needs to make calls. */
export function isProviderConfigured(name: LLMProviderName): boolean {
  if (name === 'deepseek') return Boolean(process.env.DEEPSEEK_API_KEY);
  if (name === 'search') return Boolean(process.env.TAVILY_API_KEY || process.env.SERPAPI_API_KEY);
  return false;
}

export class ProviderManager {
  /**
   * The active engine name. DeepSeek when an LLM key is present, otherwise the
   * deterministic Search Engine.
   */
  activeProvider(): LLMProviderName {
    return isProviderConfigured('deepseek') ? 'deepseek' : 'search';
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

  /** The engine chain: DeepSeek first (when configured), then Search Engine. */
  buildChain(_requested?: LLMProviderName, _fallback?: boolean): LLMProviderName[] {
    return isProviderConfigured('deepseek') ? ['deepseek', 'search'] : ['search'];
  }

  /**
   * Non-streaming completion through the best available engine. When DeepSeek
   * fails (or a search key exists), it falls back to the Search Engine so the
   * user always gets an answer. `LLM_TIMEOUT_MS` acts as an overall safety net.
   */
  async complete(messages: LLMMessage[], options: LLMOptions = {}): Promise<LLMCompleteResult> {
    const { provider: requested, fallback, ...providerOptions } = options;
    const primary = requested && isLLMProviderName(requested) ? requested : this.activeProvider();
    const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || 0);

    const call = this.resolveProvider(primary).complete(messages, providerOptions);
    try {
      return timeoutMs > 0 ? await this.withTimeout(call, timeoutMs) : await call;
    } catch (err) {
      const canFallback = fallback !== false && primary === 'deepseek' && isProviderConfigured('search');
      if (canFallback) {
        managerLogger.warn('DeepSeek failed, falling back to Search Engine', {
          error: err instanceof Error ? err.message : String(err),
        });
        const fallbackCall = this.resolveProvider('search').complete(messages, providerOptions);
        return timeoutMs > 0 ? await this.withTimeout(fallbackCall, timeoutMs) : await fallbackCall;
      }
      throw err;
    }
  }

  /**
   * Streaming completion through the best available engine, with the same
   * DeepSeek → Search Engine fallback on failure.
   */
  async *stream(messages: LLMMessage[], options: LLMOptions = {}): AsyncGenerator<LLMStreamChunk> {
    const { provider: requested, fallback, ...providerOptions } = options;
    const primary = requested && isLLMProviderName(requested) ? requested : this.activeProvider();

    try {
      yield* this.resolveProvider(primary).stream(messages, providerOptions);
    } catch (err) {
      const canFallback = fallback !== false && primary === 'deepseek' && isProviderConfigured('search');
      if (canFallback) {
        managerLogger.warn('DeepSeek stream failed, falling back to Search Engine', {
          error: err instanceof Error ? err.message : String(err),
        });
        yield* this.resolveProvider('search').stream(messages, providerOptions);
        return;
      }
      throw err;
    }
  }

  /** Best-effort metadata for the engine. */
  async modelInfo(name?: LLMProviderName): Promise<ProviderModelInfo> {
    return this.resolveProvider(name).getInfo();
  }

  /** Health status of the registered engines (safe to call repeatedly). */
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
    const key = name && isLLMProviderName(name) ? name : this.activeProvider();
    if (key === 'deepseek') return process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    return 'search-engine';
  }

  /** Where the engine is hosted (DeepSeek API, or none for the Search Engine). */
  getProviderHost(name?: LLMProviderName): string | undefined {
    return this.resolveProvider(name).name === 'deepseek'
      ? (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com')
      : undefined;
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
    const envKeys = ['DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL', 'DEEPSEEK_BASE_URL', 'TAVILY_API_KEY', 'SERPAPI_API_KEY', 'LLM_TIMEOUT_MS'];
    const env: Record<string, boolean> = {};
    for (const key of envKeys) env[key] = Boolean(process.env[key]);

    return {
      activeProvider: this.activeProvider(),
      fallbackEnabled: isProviderConfigured('deepseek') && isProviderConfigured('search'),
      fallbackOrder: this.buildChain(),
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
    const hasDeepSeek = isProviderConfigured('deepseek');
    const hasSearch = isProviderConfigured('search');
    if (!hasDeepSeek && !hasSearch) {
      errors.push(
        'No AI engine configured. Add DEEPSEEK_API_KEY to .env.local for ChatGPT-quality replies, or TAVILY_API_KEY / SERPAPI_API_KEY for the Search Engine.',
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
