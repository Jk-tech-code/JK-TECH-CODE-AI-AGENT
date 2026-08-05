import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/logging/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { chatComplete, chatStream, redact, getCompatConfiguredModel } from '@/brain/providers/openai-compat-core';
import { groqProvider, getGroqConfiguredModel } from '@/brain/providers/groq';
import { openRouterProvider } from '@/brain/providers/openrouter';
import { togetherProvider } from '@/brain/providers/together';
import { openAICompatProvider } from '@/brain/providers/openai-compat';

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

/** Build a minimal Response-like object with an SSE body. */
function sseResponse(events: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(e));
      controller.close();
    },
  });
  return { ok: true, status: 200, body, text: async () => '' } as unknown as Response;
}

function jsonResponse(payload: unknown, status = 200, ok = status < 400): Response {
  return {
    ok,
    status,
    text: async () => JSON.stringify(payload),
  } as unknown as Response;
}

describe('OpenAI-compatible core — configuration', () => {
  it('reads model config from env with sane defaults', () => {
    process.env.GROQ_MODEL = 'llama-3.1-8b-instant';
    expect(getGroqConfiguredModel()).toBe('llama-3.1-8b-instant');
    delete process.env.GROQ_MODEL;
    expect(getGroqConfiguredModel()).toBe('llama-3.3-70b-versatile');
    expect(getCompatConfiguredModel('openrouter')).toBe('google/gemini-2.5-flash');
    expect(getCompatConfiguredModel('together')).toBe('meta-llama/Llama-3.3-70B-Instruct-Turbo');
    expect(getCompatConfiguredModel('openai')).toBe('gpt-4.1');
  });

  it('honors per-request model overrides', async () => {
    process.env.GROQ_API_KEY = 'gsk-test';
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ model: 'custom-model', choices: [{ message: { content: 'ok' } }] }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await chatComplete('groq', msg, { model: 'custom-model' });
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.model).toBe('custom-model');
  });

  it('forwards top_k for Groq but omits it for OpenAI', async () => {
    process.env.GROQ_API_KEY = 'gsk-test';
    process.env.OPENAI_API_KEY = 'sk-test';
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ model: 'm', choices: [{ message: { content: 'ok' } }] }),
    ) as unknown as typeof fetch;

    await chatComplete('groq', msg, { topK: 40 });
    const groqBody = JSON.parse(String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body));
    expect(groqBody.top_k).toBe(40);

    await chatComplete('openai', msg, { topK: 40 });
    const openaiBody = JSON.parse(String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].body));
    expect(openaiBody.top_k).toBeUndefined();
  });
});

describe('OpenAI-compatible core — completions', () => {
  it('completes and parses the first choice', async () => {
    process.env.GROQ_API_KEY = 'gsk-test';
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ model: 'llama-3.3-70b-versatile', choices: [{ message: { content: 'Hi there' } }] }),
    ) as unknown as typeof fetch;

    const res = await chatComplete('groq', msg, {});
    expect(res.content).toBe('Hi there');
    expect(res.modelUsed).toBe('llama-3.3-70b-versatile');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('extracts reasoning_content as thinking', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ model: 'gpt-4.1', choices: [{ message: { content: 'answer', reasoning_content: 'think' } }] }),
    ) as unknown as typeof fetch;

    const res = await chatComplete('openai', msg, {});
    expect(res.content).toBe('answer');
    expect(res.thinking).toBe('think');
  });

  it('maps 401 to a non-retryable friendly error', async () => {
    process.env.GROQ_API_KEY = 'gsk-test';
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ error: { message: 'invalid api key' } }, 401, false),
    ) as unknown as typeof fetch;

    const err = await chatComplete('groq', msg, {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as { retryable: boolean }).retryable).toBe(false);
    expect((err as Error).message).toContain('authenticate');
  });

  it('maps 429 to a retryable rate-limit error', async () => {
    process.env.GROQ_API_KEY = 'gsk-test';
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ error: { message: 'rate limit exceeded' } }, 429, false),
    ) as unknown as typeof fetch;

    const err = await chatComplete('groq', msg, {}).catch((e: unknown) => e);
    expect((err as { retryable: boolean }).retryable).toBe(true);
    expect((err as Error).message).toContain('rate-limited');
  });

  it('maps 404 model errors as non-retryable', async () => {
    process.env.GROQ_API_KEY = 'gsk-test';
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ error: { message: 'model not found' } }, 404, false),
    ) as unknown as typeof fetch;

    const err = await chatComplete('groq', msg, {}).catch((e: unknown) => e);
    expect((err as { retryable: boolean }).retryable).toBe(false);
    expect((err as Error).message).toContain('not available');
  });

  it('retries transient failures then succeeds', async () => {
    process.env.GROQ_API_KEY = 'gsk-test';
    process.env.GROQ_MAX_RETRIES = '1';
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(jsonResponse({ model: 'm', choices: [{ message: { content: 'ok' } }] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await chatComplete('groq', msg, {});
    expect(res.content).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws a friendly error after exhausting retries', async () => {
    process.env.GROQ_API_KEY = 'gsk-test';
    process.env.GROQ_MAX_RETRIES = '1';
    global.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    await expect(chatComplete('groq', msg, {})).rejects.toThrow('temporarily unavailable');
  });

  it('throws a friendly error when the API key is missing', async () => {
    delete process.env.GROQ_API_KEY;
    await expect(chatComplete('groq', msg, {})).rejects.toThrow('GROQ_API_KEY is not configured');
  });
});

describe('OpenAI-compatible core — streaming', () => {
  it('streams content deltas and stops at [DONE]', async () => {
    process.env.GROQ_API_KEY = 'gsk-test';
    global.fetch = vi.fn().mockResolvedValue(sseResponse([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
      'data: [DONE]\n\n',
    ])) as unknown as typeof fetch;

    const out: string[] = [];
    for await (const chunk of chatStream('groq', msg, {})) {
      if (chunk.content) out.push(chunk.content);
    }
    expect(out.join('')).toBe('Hello');
  });

  it('yields reasoning_content as thinking chunks', async () => {
    process.env.GROQ_API_KEY = 'gsk-test';
    global.fetch = vi.fn().mockResolvedValue(sseResponse([
      'data: {"choices":[{"delta":{"reasoning_content":"thinking..."}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"answer"}}]}\n\n',
      'data: [DONE]\n\n',
    ])) as unknown as typeof fetch;

    const out: string[] = [];
    for await (const chunk of chatStream('groq', msg, {})) {
      if (chunk.thinking) out.push(`[${chunk.thinking}]`);
      if (chunk.content) out.push(chunk.content);
    }
    expect(out).toEqual(['[thinking...]', 'answer']);
  });

  it('signals an empty stream as a friendly error', async () => {
    process.env.GROQ_API_KEY = 'gsk-test';
    // Fresh response per attempt so retries don't re-read a consumed stream.
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(sseResponse(['data: [DONE]\n\n']))) as unknown as typeof fetch;

    await expect(async () => {
      for await (const _chunk of chatStream('groq', msg, {})) { /* consume */ }
    }).rejects.toThrow('empty response');
  });

  it('provider singletons stream through the shared core', async () => {
    process.env.GROQ_API_KEY = 'gsk-test';
    global.fetch = vi.fn().mockResolvedValue(sseResponse([
      'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
      'data: [DONE]\n\n',
    ])) as unknown as typeof fetch;

    const chunks: string[] = [];
    for await (const chunk of groqProvider.stream(msg, {})) {
      if (chunk.content) chunks.push(chunk.content);
    }
    expect(chunks.join('')).toBe('hi');
  });
});

describe('OpenAI-compatible providers — health + info', () => {
  it('reports unavailable with a friendly reason when the key is missing', async () => {
    delete process.env.OPENROUTER_API_KEY;
    const status = await openRouterProvider.check();
    expect(status.available).toBe(false);
    expect(status.reason).toContain('OPENROUTER_API_KEY');
  });

  it('reports available when configured (no network call)', async () => {
    process.env.TOGETHER_API_KEY = 'together-test';
    process.env.OPENAI_API_KEY = 'sk-test';
    const [together, openai] = await Promise.all([
      togetherProvider.check(),
      openAICompatProvider.check(),
    ]);
    expect(together.available).toBe(true);
    expect(openai.available).toBe(true);
  });

  it('getInfo falls back to curated models when the models endpoint fails', async () => {
    process.env.TOGETHER_API_KEY = 'together-test';
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 } as unknown as Response);
    const info = await togetherProvider.getInfo();
    expect(info.models.length).toBeGreaterThan(0);
  });
});

describe('OpenAI-compatible core — secret redaction', () => {
  it('redacts API-key-looking tokens from text', () => {
    const text = 'key sk-proj-abc123XYZ789 failed and Bearer sk-ant-api03-secret also AQ.Ab8RN6J2UUSS8L';
    const out = redact(text);
    expect(out).not.toContain('sk-proj-abc123XYZ789');
    expect(out).not.toContain('sk-ant-api03-secret');
    expect(out).not.toContain('AQ.Ab8RN6J2UUSS8L');
    expect(out).toContain('[REDACTED]');
  });

  it('keeps normal text intact', () => {
    expect(redact('rate limit exceeded')).toBe('rate limit exceeded');
  });
});
