import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/logging/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { providerManager, PROVIDER_REGISTRY, isProviderConfigured, DEFAULT_FALLBACK_ORDER } from '@/brain/providers/manager';
import { ProviderError } from '@/brain/providers/interface';
import { groqProvider } from '@/brain/providers/groq';
import { openAICompatProvider } from '@/brain/providers/openai-compat';
import {
  activeProvider,
  fallbackEnabled,
  fallbackOrder,
  getEnvDiagnostics,
  validateConfig,
  complete,
  stream,
  getConfiguredModel,
  checkProvider,
} from '@/brain/providers/llm';
import { envProviderName, envDefaultModel } from '@/brain/settings';
import { DEFAULT_SETTINGS } from '@/brain/types';

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

afterEach(() => {
  process.env = originalEnv;
  global.fetch = undefined;
});

const msg = [{ role: 'user' as const, content: 'hello' }];

/** Clear every provider key so tests are hermetic (vitest loads project .env). */
function clearProviderKeys() {
  for (const n of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'TOGETHER_API_KEY']) {
    delete process.env[n];
  }
  delete process.env.LLM_PROVIDER;
  delete process.env.LLM_FALLBACK_ORDER;
  delete process.env.LLM_FALLBACK_ENABLED;
  delete process.env.LLM_TIMEOUT_MS;
}

describe('Provider Manager — selection', () => {
  it('defaults to gemini when LLM_PROVIDER is unset', () => {
    delete process.env.LLM_PROVIDER;
    expect(activeProvider()).toBe('gemini');
  });

  it('selects the configured provider (case-insensitive)', () => {
    process.env.LLM_PROVIDER = 'groq';
    expect(activeProvider()).toBe('groq');
    process.env.LLM_PROVIDER = 'TOGETHER';
    expect(activeProvider()).toBe('together');
  });

  it('falls back to gemini for an unknown provider', () => {
    process.env.LLM_PROVIDER = 'space-x';
    expect(activeProvider()).toBe('gemini');
  });

  it('registers every supported provider', () => {
    for (const name of ['gemini', 'ollama', 'openai', 'groq', 'openrouter', 'anthropic', 'together']) {
      expect(PROVIDER_REGISTRY[name]).toBeDefined();
      expect(PROVIDER_REGISTRY[name].name).toBe(name);
    }
  });

  it('knows which providers are configured', () => {
    delete process.env.GROQ_API_KEY;
    expect(isProviderConfigured('groq')).toBe(false);
    expect(isProviderConfigured('ollama')).toBe(true);
    process.env.GROQ_API_KEY = 'gsk-test';
    expect(isProviderConfigured('groq')).toBe(true);
  });
});

describe('Provider Manager — fallback configuration', () => {
  it('fallback is disabled by default and enabled via env', () => {
    delete process.env.LLM_FALLBACK_ENABLED;
    expect(fallbackEnabled()).toBe(false);
    process.env.LLM_FALLBACK_ENABLED = 'true';
    expect(fallbackEnabled()).toBe(true);
    process.env.LLM_FALLBACK_ENABLED = '1';
    expect(fallbackEnabled()).toBe(true);
    process.env.LLM_FALLBACK_ENABLED = 'false';
    expect(fallbackEnabled()).toBe(false);
  });

  it('uses the default chain when LLM_FALLBACK_ORDER is unset', () => {
    delete process.env.LLM_FALLBACK_ORDER;
    expect(fallbackOrder()).toEqual([...DEFAULT_FALLBACK_ORDER]);
  });

  it('parses a custom fallback order and drops unknown names', () => {
    process.env.LLM_FALLBACK_ORDER = 'groq, openrouter, bogus, anthropic';
    expect(fallbackOrder()).toEqual(['groq', 'openrouter', 'anthropic']);
  });

  it('builds a single-provider chain when fallback is off', () => {
    process.env.LLM_PROVIDER = 'groq';
    delete process.env.LLM_FALLBACK_ENABLED;
    expect(providerManager.buildChain(undefined, false)).toEqual(['groq']);
  });

  it('starts the chain at the requested provider', () => {
    clearProviderKeys();
    process.env.GROQ_API_KEY = 'gsk-test';
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.GEMINI_API_KEY = 'gemini-test';
    const chain = providerManager.buildChain('groq', true);
    expect(chain[0]).toBe('groq');
    expect(chain).toContain('gemini');
    expect(chain).not.toContain('openrouter'); // unconfigured → skipped
  });

  it('filters to configured providers when fallback is on (ollama always eligible)', () => {
    clearProviderKeys();
    process.env.GEMINI_API_KEY = 'gemini-test';
    process.env.LLM_PROVIDER = 'gemini';
    expect(providerManager.buildChain(undefined, true)).toEqual(['gemini', 'ollama']);
  });

  it('keeps ollama as the only fallback when all cloud keys are missing', () => {
    clearProviderKeys();
    process.env.LLM_PROVIDER = 'gemini';
    expect(providerManager.buildChain(undefined, true)).toEqual(['ollama']);
  });

  it('returns the full chain when nothing is configured so a specific error surfaces', () => {
    clearProviderKeys();
    process.env.LLM_PROVIDER = 'gemini';
    // A custom order without ollama means nothing is eligible → full chain.
    process.env.LLM_FALLBACK_ORDER = 'gemini,groq,openrouter,openai,anthropic,together';
    const chain = providerManager.buildChain(undefined, true);
    expect(chain).toEqual(['gemini', 'groq', 'openrouter', 'openai', 'anthropic', 'together']);
  });
});

describe('Provider Manager — complete with fallback', () => {
  it('falls back to the next provider on a retryable error', async () => {
    clearProviderKeys();
    process.env.LLM_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'gsk-test';
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.LLM_FALLBACK_ENABLED = 'true';

    vi.spyOn(groqProvider, 'complete').mockRejectedValue(new ProviderError('Groq is rate-limited.', true));
    const openaiSpy = vi.spyOn(openAICompatProvider, 'complete').mockResolvedValue({
      content: 'ok', thinking: '', modelUsed: 'gpt-4.1', latencyMs: 10,
    });

    const result = await complete(msg, { provider: 'groq' });
    expect(result.content).toBe('ok');
    expect(openaiSpy).toHaveBeenCalledTimes(1);
  });

  it('does not fall back on a non-retryable error', async () => {
    clearProviderKeys();
    process.env.LLM_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'gsk-test';
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.LLM_FALLBACK_ENABLED = 'true';

    vi.spyOn(groqProvider, 'complete').mockRejectedValue(new ProviderError('Groq could not authenticate.', false));
    const openaiSpy = vi.spyOn(openAICompatProvider, 'complete');

    await expect(complete(msg, { provider: 'groq' })).rejects.toThrow('Groq could not authenticate.');
    expect(openaiSpy).not.toHaveBeenCalled();
  });

  it('tries only the primary provider when fallback is disabled', async () => {
    clearProviderKeys();
    process.env.LLM_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'gsk-test';
    process.env.OPENAI_API_KEY = 'sk-test';
    delete process.env.LLM_FALLBACK_ENABLED;

    vi.spyOn(groqProvider, 'complete').mockRejectedValue(new ProviderError('Groq is down.', true));
    const openaiSpy = vi.spyOn(openAICompatProvider, 'complete');

    await expect(complete(msg, { provider: 'groq' })).rejects.toThrow('Groq is down.');
    expect(openaiSpy).not.toHaveBeenCalled();
  });

  it('surfaces a friendly error for unknown failures', async () => {
    clearProviderKeys();
    process.env.LLM_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'gsk-test';
    vi.spyOn(groqProvider, 'complete').mockRejectedValue(new Error('boom'));

    await expect(complete(msg, { provider: 'groq' })).rejects.toThrow('All LLM providers are unavailable.');
  });

  it('applies a global LLM_TIMEOUT_MS safety net', async () => {
    clearProviderKeys();
    process.env.LLM_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'gsk-test';
    process.env.LLM_TIMEOUT_MS = '50';

    vi.spyOn(groqProvider, 'complete').mockImplementation(
      () => new Promise((_resolve) => { /* never resolves */ }),
    );

    const err = await complete(msg, { provider: 'groq' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).retryable).toBe(true);
    expect((err as Error).message).toContain('LLM_TIMEOUT_MS');
  });
});

describe('Provider Manager — stream with fallback', () => {
  it('falls back when the first provider fails before the first chunk', async () => {
    clearProviderKeys();
    process.env.LLM_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'gsk-test';
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.LLM_FALLBACK_ENABLED = 'true';

    vi.spyOn(groqProvider, 'stream').mockImplementation(async function* () {
      throw new ProviderError('Groq is down.', true);
    });
    const openaiSpy = vi.spyOn(openAICompatProvider, 'stream').mockImplementation(async function* () {
      yield { content: 'hello' };
      yield { content: ' world' };
    });

    const chunks: string[] = [];
    for await (const chunk of stream(msg, { provider: 'groq' })) {
      if (chunk.content) chunks.push(chunk.content);
    }
    expect(chunks.join('')).toBe('hello world');
    expect(openaiSpy).toHaveBeenCalledTimes(1);
  });

  it('does not switch providers after content has started', async () => {
    clearProviderKeys();
    process.env.LLM_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'gsk-test';
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.LLM_FALLBACK_ENABLED = 'true';

    vi.spyOn(groqProvider, 'stream').mockImplementation(async function* () {
      yield { content: 'partial' };
      throw new ProviderError('Mid-stream failure.', true);
    });
    const openaiSpy = vi.spyOn(openAICompatProvider, 'stream');

    await expect(async () => {
      for await (const _chunk of stream(msg, { provider: 'groq' })) { /* consume */ }
    }).rejects.toThrow('Mid-stream failure.');
    expect(openaiSpy).not.toHaveBeenCalled();
  });
});

describe('Provider Manager — diagnostics & validation', () => {
  it('reports env presence without exposing secret values', () => {
    process.env.LLM_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-super-secret-value';
    process.env.OPENAI_MODEL = 'gpt-4.1';
    const diag = getEnvDiagnostics();
    expect(diag.env.OPENAI_API_KEY).toBe(true);
    expect(diag.env.OPENAI_MODEL).toBe(true);
    expect(diag.activeProvider).toBe('openai');
    expect(JSON.stringify(diag)).not.toContain('sk-super-secret-value');
  });

  it('validateConfig reports a missing key for the active provider', () => {
    process.env.LLM_PROVIDER = 'anthropic';
    delete process.env.ANTHROPIC_API_KEY;
    const res = validateConfig();
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toContain('ANTHROPIC_API_KEY');
  });

  it('validateConfig reports an unknown provider', () => {
    process.env.LLM_PROVIDER = 'space-x';
    const res = validateConfig();
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toContain('space-x');
  });

  it('validateConfig passes for ollama without any API key', () => {
    process.env.LLM_PROVIDER = 'ollama';
    const res = validateConfig();
    expect(res.ok).toBe(true);
  });

  it('validateConfig passes when the active provider has a key', () => {
    process.env.LLM_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'gsk-test';
    const res = validateConfig();
    expect(res.ok).toBe(true);
  });
});

describe('Provider Manager — model resolution', () => {
  it('returns the configured model per provider', () => {
    process.env.GROQ_MODEL = 'llama-3.3-70b-versatile';
    expect(getConfiguredModel('groq')).toBe('llama-3.3-70b-versatile');
    expect(getConfiguredModel('openrouter')).toBe('google/gemini-2.5-flash');
    expect(getConfiguredModel('anthropic')).toBe('claude-sonnet-4-20250514');
    expect(getConfiguredModel('together')).toBe('meta-llama/Llama-3.3-70B-Instruct-Turbo');
    delete process.env.OLLAMA_MODEL;
    delete process.env.LLM_MODEL;
    expect(getConfiguredModel('ollama')).toBe('qwen3:4b');
  });

  it('checkProvider reports unavailable with a friendly reason when the key is missing', async () => {
    delete process.env.GROQ_API_KEY;
    const status = await checkProvider('groq');
    expect(status.available).toBe(false);
    expect(status.reason).toContain('GROQ_API_KEY');
  });
});

describe('Brain settings — provider defaults', () => {
  it('resolves the env provider name', () => {
    delete process.env.LLM_PROVIDER;
    expect(envProviderName()).toBe('gemini');
    process.env.LLM_PROVIDER = 'groq';
    expect(envProviderName()).toBe('groq');
    process.env.LLM_PROVIDER = 'together';
    expect(envProviderName()).toBe('together');
  });

  it('maps env defaults for every provider', () => {
    expect(envDefaultModel('gemini')).toBe('gemini-2.5-flash');
    expect(envDefaultModel('groq')).toBe('llama-3.3-70b-versatile');
    expect(envDefaultModel('openrouter')).toBe('google/gemini-2.5-flash');
    expect(envDefaultModel('openai')).toBe('gpt-4.1');
    expect(envDefaultModel('anthropic')).toBe('claude-sonnet-4-20250514');
    expect(envDefaultModel('together')).toBe('meta-llama/Llama-3.3-70B-Instruct-Turbo');
    delete process.env.OLLAMA_MODEL;
    delete process.env.LLM_MODEL;
    expect(envDefaultModel('ollama')).toBe('qwen3:4b');
  });

  it('includes the fallbackEnabled toggle in the defaults', () => {
    expect(DEFAULT_SETTINGS.fallbackEnabled).toBe(false);
  });
});
