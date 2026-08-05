import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logging/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/lib/memory/store', () => ({
  memoryStore: { getAll: vi.fn(), remember: vi.fn() },
}));

vi.mock('@/lib/db', () => ({
  db: { memoryEntry: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), count: vi.fn() } },
}));

import { runCalculator, runTools } from '../src/brain/tools/index';
import { rateLimit } from '../src/lib/security/rate-limit';
import { scoreMemoryConfidence } from '../src/brain/memory';

describe('Brain Tools — calculator', () => {
  it('computes a simple arithmetic expression', () => {
    const r = runCalculator('what is 12 + 5?');
    expect(r.used).toBe(true);
    expect(r.name).toBe('calculator');
    expect(r.output).toContain('17');
  });

  it('respects operator precedence', () => {
    const r = runCalculator('solve 2 + 3 * 4');
    expect(r.output).toContain('14');
  });

  it('handles exponentiation', () => {
    const r = runCalculator('2 ^ 10');
    expect(r.output).toContain('1024');
  });

  it('does not trigger on plain text', () => {
    const r = runCalculator('Tell me about the history of astronomy');
    expect(r.used).toBe(false);
  });

  it('returns null-safe result on malformed input', () => {
    const r = runCalculator('what color is the sky');
    expect(r.used).toBe(false);
  });
});

describe('Brain Tools — dispatcher', () => {
  it('uses the calculator tool through runTools', async () => {
    const out = await runTools({ query: 'what is 7 * 6?' });
    expect(out).toContain('calculator');
    expect(out).toContain('42');
  });

  it('returns empty string when no tool applies', async () => {
    const out = await runTools({ query: 'say hello' });
    expect(out).toBe('');
  });

  it('never throws given an empty query', async () => {
    const out = await runTools({ query: '' });
    expect(typeof out).toBe('string');
  });
});

describe('Brain Memory — confidence scoring', () => {
  const base = {
    accessCount: 1,
    lastAccessed: new Date(),
    createdAt: new Date(),
  };

  it('scores a fresh, single-access memory near the baseline', () => {
    const s = scoreMemoryConfidence(base);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(1);
  });

  it('favors frequently accessed memories', () => {
    const low = scoreMemoryConfidence({ ...base, accessCount: 1 });
    const high = scoreMemoryConfidence({ ...base, accessCount: 50 });
    expect(high).toBeGreaterThan(low);
  });

  it('favors recently accessed memories over stale ones', () => {
    const fresh = scoreMemoryConfidence({ ...base, lastAccessed: new Date() });
    const stale = scoreMemoryConfidence({
      ...base,
      lastAccessed: new Date(Date.now() - 200 * 24 * 3600 * 1000),
    });
    expect(fresh).toBeGreaterThan(stale);
  });

  it('never exceeds 1 even with a perfect relevance score', () => {
    const s = scoreMemoryConfidence({ ...base, score: 1, accessCount: 1000 });
    expect(s).toBeLessThanOrEqual(1);
  });

  it('clamps the relevance-weighted score', () => {
    const withRelevance = scoreMemoryConfidence({ ...base, score: 0.4 });
    const without = scoreMemoryConfidence(base);
    expect(withRelevance).toBeGreaterThan(0);
    expect(withRelevance).toBeLessThanOrEqual(1);
  });
});

describe('Rate limiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('allows requests up to the limit', () => {
    const key = 'test-key';
    const limit = 3;
    expect(rateLimit(key, { limit, windowMs: 60_000 }).allowed).toBe(true);
    expect(rateLimit(key, { limit, windowMs: 60_000 }).allowed).toBe(true);
    expect(rateLimit(key, { limit, windowMs: 60_000 }).allowed).toBe(true);
    expect(rateLimit(key, { limit, windowMs: 60_000 }).allowed).toBe(false);
    expect(rateLimit(key, { limit, windowMs: 60_000 }).remaining).toBe(0);
  });

  it('resets after the window elapses', () => {
    vi.setSystemTime(1000);
    const key = 'window-key';
    const limit = 1;
    rateLimit(key, { limit, windowMs: 5000 });
    expect(rateLimit(key, { limit, windowMs: 5000 }).allowed).toBe(false);

    vi.setSystemTime(7000);
    expect(rateLimit(key, { limit, windowMs: 5000 }).allowed).toBe(true);
  });

  it('treats different keys independently', () => {
    const a = rateLimit('key-a', { limit: 1, windowMs: 60_000 });
    const b = rateLimit('key-b', { limit: 1, windowMs: 60_000 });
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });
});