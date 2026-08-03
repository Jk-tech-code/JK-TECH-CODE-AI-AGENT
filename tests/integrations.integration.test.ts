import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logging/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const { aiProviders } = await import('../src/lib/integrations/ai/providers');
const { searchProviders } = await import('../src/lib/integrations/search');
const { supabaseProvider } = await import('../src/lib/integrations/database/supabase');
const { redisProvider, getRedis } = await import('../src/lib/integrations/cache/redis');
const { qdrantProvider, getQdrant } = await import('../src/lib/integrations/vector/qdrant');
const { zapierProvider } = await import('../src/lib/integrations/automation/zapier');
const { checkHealth } = await import('../src/lib/integrations/health');
const { registerAllIntegrations } = await import('../src/lib/integrations/register');
const { runStartupReport } = await import('../src/lib/integrations/startup');

const has = (key: string) => {
  const value = process.env[key];
  return value !== undefined && value.trim().length > 0;
};

describe('AI providers — real connection checks (integration)', () => {
  it('connects to OpenAI when a key is configured', async () => {
    if (!has('OPENAI_API_KEY')) return;
    const provider = aiProviders.find(p => p.name === 'OpenAI')!;
    const health = await provider.check();
    expect(health.status).toBe('connected');
  });

  it('connects to Gemini when a key is configured', async () => {
    if (!has('GEMINI_API_KEY')) return;
    const provider = aiProviders.find(p => p.name === 'Gemini')!;
    const health = await provider.check();
    expect(health.status).toBe('connected');
  });

  it('connects to Claude when a key is configured', async () => {
    if (!has('ANTHROPIC_API_KEY')) return;
    const provider = aiProviders.find(p => p.name === 'Claude')!;
    const health = await provider.check();
    expect(health.status).toBe('connected');
  });

  it('runs a Grok check when a key is configured', async () => {
    if (!has('XAI_API_KEY')) return;
    const provider = aiProviders.find(p => p.name === 'Grok')!;
    const health = await provider.check();
    // A valid key may still be denied if the xAI account has no credits;
    // the check must at least not report 'missing'.
    expect(['connected', 'failed']).toContain(health.status);
  });

  it('connects to DeepSeek when a key is configured', async () => {
    if (!has('DEEPSEEK_API_KEY')) return;
    const provider = aiProviders.find(p => p.name === 'DeepSeek')!;
    const health = await provider.check();
    expect(health.status).toBe('connected');
  });
});

describe('search providers — real connection checks (integration)', () => {
  it('connects to Tavily when a key is configured', async () => {
    if (!has('TAVILY_API_KEY')) return;
    const provider = searchProviders.find(p => p.name === 'Tavily')!;
    const health = await provider.check();
    expect(health.status).toBe('connected');
  });

  it('connects to SerpAPI when a key is configured', async () => {
    if (!has('SERPAPI_API_KEY')) return;
    const provider = searchProviders.find(p => p.name === 'SerpAPI')!;
    const health = await provider.check();
    expect(health.status).toBe('connected');
  });
});

describe('database — real connection checks (integration)', () => {
  it('connects to Supabase when a URL is configured', async () => {
    if (!has('NEXT_PUBLIC_SUPABASE_URL') && !has('SUPABASE_URL')) return;
    const health = await supabaseProvider.check();
    expect(health.status).toBe('connected');
  });

  it('connects to Redis when REDIS_URL is configured', async () => {
    if (!has('REDIS_URL')) return;
    const health = await redisProvider.check();
    // The check itself disconnects after the probe (serverless-friendly).
    expect(health.status).toBe('connected');
    void getRedis;
  });

  it('runs a Qdrant check when QDRANT_URL is configured', async () => {
    if (!has('QDRANT_URL')) return;
    const health = await qdrantProvider.check();
    // A configured-but-unreachable instance is a legitimate outcome;
    // the check must at least not report 'missing'.
    expect(['connected', 'failed']).toContain(health.status);
    void getQdrant();
  });
});

describe('automation — real connection checks (integration)', () => {
  it('validates a configured Zapier webhook URL', async () => {
    if (!has('ZAPIER_WEBHOOK_URL')) return;
    const health = await zapierProvider.check();
    expect(health.status).toBe('connected');
  });
});

describe('full integration surface (integration)', () => {
  it('runs the complete health check and startup report', async () => {
    registerAllIntegrations();
    const payload = await checkHealth();
    expect(payload.providers.length).toBeGreaterThanOrEqual(12);
    expect(payload.timestamp).toBeTruthy();

    const { report, status } = await runStartupReport();
    expect(report).toContain('Overall Status:');
    expect(['ready', 'degraded', 'error']).toContain(status);
  });
});
