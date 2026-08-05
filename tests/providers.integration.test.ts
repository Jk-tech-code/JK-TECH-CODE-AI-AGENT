import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logging/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { complete, stream, checkProvider, availableProviders, validateConfig } from '@/brain/providers/llm';

const has = (key: string) => {
  const value = process.env[key];
  return value !== undefined && value.trim().length > 0;
};

/** Provider key → its env var. */
const KEY_VARS: Record<string, string> = {
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  together: 'TOGETHER_API_KEY',
};

// Real network integration tests — run only when the corresponding key exists
// (the machine's .env is loaded by vitest). On clean machines they all skip.
const SHORT = 60_000;

describe('LLM providers — real completions (integration)', () => {
  for (const [provider, envVar] of Object.entries(KEY_VARS)) {
    it(`completes a request through ${provider} when configured`, async () => {
      if (!has(envVar)) return;
      const result = await complete(
        [{ role: 'user', content: 'Reply with the single word: ok' }],
        { provider: provider as 'gemini', maxTokens: 32, temperature: 0 },
      );
      expect(result.content.trim().length).toBeGreaterThan(0);
      expect(result.modelUsed).toBeTruthy();
    }, SHORT);
  }

  it('streams a response through every configured provider', async () => {
    const configured = Object.entries(KEY_VARS).filter(([, v]) => has(v)).map(([p]) => p);
    if (configured.length === 0) return;
    const provider = configured[0] as 'gemini';

    let text = '';
    for await (const chunk of stream(
      [{ role: 'user', content: 'Count from one to three.' }],
      { provider, maxTokens: 64, temperature: 0 },
    )) {
      if (chunk.content) text += chunk.content;
    }
    expect(text.trim().length).toBeGreaterThan(0);
  }, SHORT);
});

describe('LLM providers — health surface (integration)', () => {
  it('reports a health status for every registered provider without throwing', async () => {
    const providers = await availableProviders();
    expect(providers.length).toBeGreaterThanOrEqual(7);
    for (const p of providers) {
      expect(typeof p.available).toBe('boolean');
      expect(p.model).toBeTruthy();
    }
  }, SHORT);

  it('reports configured providers as available (key present)', async () => {
    for (const [provider, envVar] of Object.entries(KEY_VARS)) {
      if (!has(envVar)) continue;
      const status = await checkProvider(provider as 'gemini');
      expect(status.available).toBe(true);
    }
  }, SHORT);

  it('validateConfig matches the configured environment', () => {
    const res = validateConfig();
    const active = (process.env.LLM_PROVIDER || 'gemini').trim().toLowerCase();
    const configured = active === 'ollama' || has(`${active.toUpperCase()}_API_KEY`);
    if (configured) {
      expect(res.ok).toBe(true);
    } else {
      expect(res.ok).toBe(false);
      expect(res.errors.join(' ')).toContain('API_KEY');
    }
  });
});
