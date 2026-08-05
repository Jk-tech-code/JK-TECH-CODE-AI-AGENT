import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/logging/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/lib/db', () => ({
  db: {
    $queryRaw: vi.fn(),
  },
}));

vi.mock('@/lib/ai/provider', () => ({
  getProvider: () => ({ chat: vi.fn() }),
}));

vi.mock('@/brain/providers/ollama', () => ({
  isHealthy: vi.fn(async () => false),
  getConfiguredModel: () => 'qwen3:4b',
  getOllamaHost: () => 'http://localhost:11434',
}));

vi.mock('ioredis', () => {
  class MockRedis {
    ping = vi.fn();
    disconnect = vi.fn();
    constructor() {}
  }
  return { default: MockRedis };
});

vi.mock('@qdrant/js-client-rest', () => {
  class MockQdrantClient {
    getCollections = vi.fn();
    constructor() {}
  }
  return { QdrantClient: MockQdrantClient };
});

const { env, hasEnv, getEnvPresenceReport } = await import('../src/lib/integrations/config/env');
const { serviceRegistry, summarizeStatus, formatStartupReport } = await import('../src/lib/integrations/providers/registry');
const { registerAllIntegrations } = await import('../src/lib/integrations/register');
const { checkHealth, healthHttpStatus } = await import('../src/lib/integrations/health');
const { probeHttp, probeHttpWithRetry, safeUrl } = await import('../src/lib/integrations/utils/http');
const { redisProvider, getRedis } = await import('../src/lib/integrations/cache/redis');
const { qdrantProvider, getQdrant } = await import('../src/lib/integrations/vector/qdrant');
const { postgresProvider } = await import('../src/lib/integrations/database/postgres');
const { supabaseProvider } = await import('../src/lib/integrations/database/supabase');
const { zapierProvider } = await import('../src/lib/integrations/automation/zapier');
const { aiProviders } = await import('../src/lib/integrations/ai/providers');
const { searchProviders } = await import('../src/lib/integrations/search');

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

afterEach(() => {
  process.env = originalEnv;
  global.fetch = undefined;
});

describe('env config', () => {
  it('reads credentials from environment variables only', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(env.openai.apiKey).toBe('sk-test');
    delete process.env.OPENAI_API_KEY;
    expect(env.openai.apiKey).toBe('');
  });

  it('returns false for missing variables', () => {
    delete process.env.TAVILY_API_KEY;
    expect(hasEnv('TAVILY_API_KEY')).toBe(false);
  });

  it('produces a presence report without exposing values', () => {
    process.env.OPENAI_API_KEY = 'sk-secret-123';
    process.env.QDRANT_URL = '';
    const report = getEnvPresenceReport();
    expect(report.OPENAI_API_KEY).toBe(true);
    expect(report.QDRANT_URL).toBe(false);
    expect(JSON.stringify(report)).not.toContain('sk-secret-123');
  });

  it('exposes typed accessors with sane defaults', () => {
    expect(env.openai.baseUrl).toContain('openai.com');
    // redisUrl has no default — absent means 'not configured' (reported as missing)
    expect(env.redisUrl).toBe('');
    expect(typeof env.zapier.webhookUrl).toBe('string');
  });
});

describe('service registry (DI container)', () => {
  it('registers each provider exactly once', () => {
    registerAllIntegrations();
    const before = serviceRegistry.list().length;
    registerAllIntegrations(); // second call is a no-op
    expect(serviceRegistry.list().length).toBe(before);
  });

  it('registers all expected providers', () => {
    registerAllIntegrations();
    const names = serviceRegistry.list().map(d => d.name);
    expect(names).toContain('OpenAI');
    expect(names).toContain('Gemini');
    expect(names).toContain('Claude');
    expect(names).toContain('Grok');
    expect(names).toContain('DeepSeek');
    expect(names).toContain('Supabase');
    expect(names).toContain('PostgreSQL');
    expect(names).toContain('Redis');
    expect(names).toContain('Zapier');
    expect(names).toContain('Tavily');
    expect(names).toContain('SerpAPI');
    expect(names).toContain('Qdrant');
  });

  it('never overwrites an existing registration', () => {
    registerAllIntegrations();
    const original = serviceRegistry.list().length;
    serviceRegistry.register({
      name: 'OpenAI', category: 'ai', isConfigured: () => false,
      check: async () => ({ name: 'OpenAI', category: 'ai' as const, status: 'missing' as const, latencyMs: 0 }),
    });
    expect(serviceRegistry.list().length).toBe(original);
  });

  it('creates lazy singletons and returns the same instance', async () => {
    process.env.QDRANT_URL = 'http://localhost:6333';
    const first = getQdrant();
    const second = getQdrant();
    expect(first).not.toBeNull();
    expect(first).toBe(second);
  });
});

describe('health check engine', () => {
  it('runs checks for all providers without throwing', async () => {
    registerAllIntegrations();
    const payload = await checkHealth();
    expect(payload.providers.length).toBeGreaterThanOrEqual(12);
    // In tests most providers lack credentials → degraded, never throws.
    expect(['ready', 'degraded', 'error']).toContain(payload.status);
    expect(payload.timestamp).toBeTruthy();
    expect(payload.checkedCount).toBe(payload.providers.length);
  });

  it('filters by category', async () => {
    registerAllIntegrations();
    const ai = await checkHealth('ai');
    expect(ai.providers.every(p => p.category === 'ai')).toBe(true);
    expect(ai.providers.length).toBe(6); // OpenAI, Gemini, Claude, Grok, DeepSeek, Ollama
  });

  it('maps status to HTTP codes', () => {
    expect(healthHttpStatus({ status: 'ready', timestamp: '', providers: [], checkedCount: 0 })).toBe(200);
    expect(healthHttpStatus({ status: 'degraded', timestamp: '', providers: [], checkedCount: 0 })).toBe(200);
    expect(healthHttpStatus({ status: 'error', timestamp: '', providers: [], checkedCount: 0 })).toBe(503);
  });
});

describe('startup report formatting', () => {
  it('formats the ASCII report table', () => {
    const checks = [
      { name: 'OpenAI', category: 'ai' as const, status: 'connected' as const, latencyMs: 120 },
      { name: 'Gemini', category: 'ai' as const, status: 'missing' as const, latencyMs: 0 },
      { name: 'Redis', category: 'cache' as const, status: 'failed' as const, latencyMs: 5 },
    ];
    const report = formatStartupReport(checks);
    expect(report).toContain('OpenAI');
    expect(report).toContain('✅ Connected');
    expect(report).toContain('⚠️ Missing configuration');
    expect(report).toContain('❌ Connection failed');
    expect(report).toContain('Overall Status: ERROR');
  });

  it('summarizes status correctly', () => {
    expect(summarizeStatus([{ name: 'a', category: 'ai', status: 'connected', latencyMs: 1 }])).toBe('ready');
    expect(summarizeStatus([{ name: 'a', category: 'ai', status: 'missing', latencyMs: 1 }])).toBe('degraded');
    expect(summarizeStatus([{ name: 'a', category: 'ai', status: 'failed', latencyMs: 1 }])).toBe('error');
    expect(summarizeStatus([])).toBe('degraded');
  });
});

describe('http probing utils', () => {
  it('probes a URL and returns status + latency', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
    const result = await probeHttp('https://example.com');
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('never throws on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;
    const result = await probeHttp('https://example.com');
    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
  });

  it('retries transient failures then reports success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;

    vi.useFakeTimers();
    const promise = probeHttpWithRetry('https://example.com');
    await vi.advanceTimersByTimeAsync(400);
    const result = await promise;
    vi.useRealTimers();

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry 4xx errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    global.fetch = fetchMock as unknown as typeof fetch;
    const result = await probeHttpWithRetry('https://example.com');
    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('redacts query strings from logged URLs', () => {
    expect(safeUrl('https://api.example.com/v1/models?key=secret')).toBe('https://api.example.com/v1/models');
  });
});

describe('AI provider health checks', () => {
  it('reports missing configuration without network calls', async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;

    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    for (const provider of aiProviders) {
      if (provider.name === 'Ollama') continue; // local, always attempted
      const health = await provider.check();
      expect(health.status).toBe('missing');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Ollama reports failed when the local server is down', async () => {
    const ollama = aiProviders.find(p => p.name === 'Ollama')!;
    expect(ollama.isConfigured()).toBe(true); // local, always attempted
    const health = await ollama.check();
    expect(health.status).toBe('failed');
    expect(health.detail).toContain('Local AI');
  });

  it('reports connected when the models endpoint responds', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.GEMINI_API_KEY = 'gemini-test';
    process.env.ANTHROPIC_API_KEY = 'claude-test';
    process.env.XAI_API_KEY = 'xai-test';
    process.env.DEEPSEEK_API_KEY = 'deepseek-test';

    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;

    for (const provider of aiProviders) {
      if (provider.name === 'Ollama') continue; // covered separately (local)
      const health = await provider.check();
      expect(health.status).toBe('connected');
    }
  });

  it('reports failed when the models endpoint errors', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 }) as unknown as typeof fetch;
    const openai = aiProviders.find(p => p.name === 'OpenAI')!;
    const health = await openai.check();
    expect(health.status).toBe('failed');
    expect(health.detail).toContain('401');
  });
});

describe('database provider health checks', () => {
  it('PostgreSQL reports missing without DATABASE_URL', async () => {
    delete process.env.DATABASE_URL;
    const health = await postgresProvider.check();
    expect(health.status).toBe('missing');
  });

  it('PostgreSQL reports connected on successful SELECT 1', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@host/db';
    const { db } = await import('@/lib/db');
    (db.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([{ '?column?': 1 }]);
    const health = await postgresProvider.check();
    expect(health.status).toBe('connected');
  });

  it('Supabase reports missing without a URL', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_URL;
    const health = await supabaseProvider.check();
    expect(health.status).toBe('missing');
  });

  it('Supabase probes the auth health endpoint', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://xyz.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'anon';
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
    const health = await supabaseProvider.check();
    expect(health.status).toBe('connected');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://xyz.supabase.co/auth/v1/health',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

describe('cache + vector + automation provider health checks', () => {
  it('Redis reports missing without REDIS_URL', async () => {
    delete process.env.REDIS_URL;
    const health = await redisProvider.check();
    expect(health.status).toBe('missing');
  });

  it('Redis reports connected on PONG', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const client = getRedis();
    (client as any).ping.mockResolvedValue('PONG');
    const health = await redisProvider.check();
    expect(health.status).toBe('connected');
  });

  it('Qdrant reports missing without QDRANT_URL', async () => {
    delete process.env.QDRANT_URL;
    const health = await qdrantProvider.check();
    expect(health.status).toBe('missing');
  });

  it('Qdrant reports connected on getCollections success', async () => {
    process.env.QDRANT_URL = 'http://localhost:6333';
    const client = getQdrant();
    (client as any).getCollections.mockResolvedValue({ collections: [] });
    const health = await qdrantProvider.check();
    expect(health.status).toBe('connected');
  });

  it('Zapier validates webhook URL format without POSTing', async () => {
    process.env.ZAPIER_WEBHOOK_URL = 'https://hooks.zapier.com/hooks/catch/123/abc/';
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const health = await zapierProvider.check();
    expect(health.status).toBe('connected');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('search provider health checks', () => {
  it('reports missing configuration without API keys', async () => {
    delete process.env.TAVILY_API_KEY;
    delete process.env.SERPAPI_API_KEY;
    for (const provider of searchProviders) {
      const health = await provider.check();
      expect(health.status).toBe('missing');
    }
  });

  it('reports connected when endpoints respond', async () => {
    process.env.TAVILY_API_KEY = 'tvly-test';
    process.env.SERPAPI_API_KEY = 'serp-test';
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
    for (const provider of searchProviders) {
      const health = await provider.check();
      expect(health.status).toBe('connected');
    }
  });
});
