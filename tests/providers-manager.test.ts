import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/logging/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/lib/core/search', () => {
  const topResults = vi.fn(async () => [
    { title: 'T1', url: 'https://example.com/1', snippet: 'The first search result snippet describes the key finding in detail.', rank: 0.95 },
    { title: 'T2', url: 'https://example.com/2', snippet: 'The second result snippet covers supporting evidence and context.', rank: 0.8 },
  ]);
  return {
    SearchAggregator: class {
      init = vi.fn(async () => undefined);
      search = topResults;
    },
    searchAggregator: {
      init: vi.fn(async () => undefined),
      activeEngines: () => ['tavily'],
      search: topResults,
    },
  };
});

import { providerManager, PROVIDER_REGISTRY, isProviderConfigured } from '@/brain/providers/manager';
import { ProviderError } from '@/brain/providers/interface';
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

const msg = [{ role: 'user' as const, content: 'What is the capital of France?' }];
// Research-style query — the only path that actually triggers web search under
// the intent-gated Brain (writing / QA / etc. answer directly).
const researchMsg = [{ role: 'user' as const, content: 'What are the latest trends in artificial intelligence?' }];

function clearProviderKeys() {
  for (const n of ['TAVILY_API_KEY', 'SERPAPI_API_KEY', 'LLM_PROVIDER', 'LLM_FALLBACK_ORDER', 'LLM_FALLBACK_ENABLED', 'LLM_TIMEOUT_MS']) {
    delete process.env[n];
  }
}

describe('Provider Manager — selection', () => {
  it('always selects the single search engine', () => {
    process.env.LLM_PROVIDER = 'grok';
    expect(activeProvider()).toBe('search');
    process.env.LLM_PROVIDER = 'gemini';
    expect(activeProvider()).toBe('search');
  });

  it('requires a search key to be configured', () => {
    delete process.env.TAVILY_API_KEY;
    delete process.env.SERPAPI_API_KEY;
    expect(isProviderConfigured('search')).toBe(false);
    process.env.TAVILY_API_KEY = 'tvly-test';
    expect(isProviderConfigured('search')).toBe(true);
  });
});

describe('Provider Manager — fallback (single engine)', () => {
  it('fallback is always disabled and the chain is the single engine', () => {
    process.env.LLM_FALLBACK_ENABLED = 'true';
    expect(fallbackEnabled()).toBe(false);
    expect(fallbackOrder()).toEqual(['search']);
    expect(providerManager.buildChain('search', true)).toEqual(['search']);
  });
});

describe('Provider Manager — complete / stream via search engine', () => {
  it('completes from search evidence', async () => {
    clearProviderKeys();
    process.env.TAVILY_API_KEY = 'tvly-test';
    const result = await complete(researchMsg, { maxTokens: 200 });
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.modelUsed).toBe('search-engine');
    expect(result.thinking.length).toBeGreaterThan(0);
  });

  it('streams content chunks', async () => {
    clearProviderKeys();
    process.env.TAVILY_API_KEY = 'tvly-test';
    const chunks: string[] = [];
    for await (const chunk of stream(researchMsg, { maxTokens: 200 })) {
      if (chunk.content) chunks.push(chunk.content);
    }
    // Evidence-derived prose is present (no source URLs surface by default).
    expect(chunks.join('').length).toBeGreaterThan(0);
    expect(chunks.join('')).not.toContain('example.com');
    expect(chunks.join('')).toContain('snippet');
  });

  it('throws a ProviderError when no search key is configured', async () => {
    clearProviderKeys();
    await expect(complete(researchMsg)).rejects.toThrow('search');
  });

  it('surfaces sources only when the user explicitly requests them', async () => {
    clearProviderKeys();
    process.env.TAVILY_API_KEY = 'tvly-test';
    const ask = [{ role: 'user' as const, content: 'Research the latest AI trends and show me your sources.' }];
    const withSources = await complete(ask, { maxTokens: 200 });
    expect(withSources.content).toContain('**Sources**');
    expect(withSources.content).toContain('example.com');
  });

  it('applies a global LLM_TIMEOUT_MS safety net', async () => {
    clearProviderKeys();
    process.env.TAVILY_API_KEY = 'tvly-test';
    process.env.LLM_TIMEOUT_MS = '50';
    vi.spyOn(PROVIDER_REGISTRY.search, 'complete').mockImplementation(
      () => new Promise((_resolve) => { /* never resolves */ }),
    );
    const err = await complete(msg, { maxTokens: 200 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('Provider Manager — diagnostics & validation', () => {
  it('reports env presence without exposing secret values', () => {
    process.env.TAVILY_API_KEY = 'tvly-super-secret-value';
    const diag = getEnvDiagnostics();
    expect(diag.env.TAVILY_API_KEY).toBe(true);
    expect(diag.activeProvider).toBe('search');
    expect(JSON.stringify(diag)).not.toContain('tvly-super-secret-value');
  });

  it('validateConfig reports a missing search key', () => {
    delete process.env.TAVILY_API_KEY;
    delete process.env.SERPAPI_API_KEY;
    const res = validateConfig();
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toContain('TAVILY_API_KEY');
  });

  it('validateConfig passes when a search key is present', () => {
    process.env.TAVILY_API_KEY = 'tvly-test';
    const res = validateConfig();
    expect(res.ok).toBe(true);
  });
});

describe('Provider Manager — model resolution', () => {
  it('returns the search engine model', () => {
    expect(getConfiguredModel()).toBe('search-engine');
    expect(providerManager.getProviderHost()).toBeUndefined();
  });

  it('checkProvider reports unavailable with a friendly reason when the key is missing', async () => {
    delete process.env.TAVILY_API_KEY;
    delete process.env.SERPAPI_API_KEY;
    const status = await checkProvider();
    expect(status.available).toBe(false);
    expect(status.reason).toMatch(/TAVILY|SERPAPI|search/i);
  });
});

describe('Brain settings — search-engine defaults', () => {
  it('defaults to the search engine with plausible values', () => {
    expect(DEFAULT_SETTINGS.provider).toBe('search');
    expect(DEFAULT_SETTINGS.model).toBe('search-engine');
    expect(DEFAULT_SETTINGS.numResults).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_SETTINGS.memoryEnabled).toBe(true);
  });
});