import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/logging/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { anthropicProvider, getAnthropicConfiguredModel, getAnthropicBaseUrl } from '@/brain/providers/anthropic';

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

function jsonResponse(payload: unknown, status = 200): Response {
  return { ok: status < 400, status, text: async () => JSON.stringify(payload) } as unknown as Response;
}

describe('Anthropic provider — configuration', () => {
  it('reads env config with sane defaults', () => {
    expect(getAnthropicConfiguredModel()).toBe('claude-sonnet-4-20250514');
    expect(getAnthropicBaseUrl()).toBe('https://api.anthropic.com');
    process.env.ANTHROPIC_MODEL = 'claude-3-5-haiku-latest';
    expect(getAnthropicConfiguredModel()).toBe('claude-3-5-haiku-latest');
  });
});

describe('Anthropic provider — completions', () => {
  it('completes and extracts text + thinking blocks', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({
      model: 'claude-sonnet-4-20250514',
      content: [
        { type: 'thinking', thinking: 'hidden reasoning' },
        { type: 'text', text: 'Hello!' },
      ],
    })) as unknown as typeof fetch;

    const res = await anthropicProvider.complete(msg, {});
    expect(res.content).toBe('Hello!');
    expect(res.thinking).toBe('hidden reasoning');
    expect(res.modelUsed).toBe('claude-sonnet-4-20250514');
  });

  it('sends max_tokens and anthropic-version headers', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ model: 'm', content: [{ type: 'text', text: 'ok' }] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await anthropicProvider.complete(msg, { maxTokens: 2048 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/messages');
    expect((init.headers as Record<string, string>)['anthropic-version']).toBe('2023-06-01');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-ant-test');
    const body = JSON.parse(String(init.body));
    expect(body.max_tokens).toBe(2048);
  });

  it('honors per-request model overrides', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ model: 'm', content: [{ type: 'text', text: 'ok' }] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await anthropicProvider.complete(msg, { model: 'claude-3-5-haiku-latest' });
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.model).toBe('claude-3-5-haiku-latest');
  });

  it('merges consecutive same-role messages (Anthropic requires alternation)', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ model: 'm', content: [{ type: 'text', text: 'ok' }] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await anthropicProvider.complete(
      [
        { role: 'user', content: 'first' },
        { role: 'user', content: 'second' },
        { role: 'assistant', content: 'reply' },
      ],
      {},
    );
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.messages).toEqual([
      { role: 'user', content: 'first\n\nsecond' },
      { role: 'assistant', content: 'reply' },
    ]);
  });

  it('prefixes a leading assistant message with a user turn', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ model: 'm', content: [{ type: 'text', text: 'ok' }] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await anthropicProvider.complete([{ role: 'assistant', content: 'hello there' }], {});
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.messages[0].role).toBe('user');
    expect(body.messages[1]).toEqual({ role: 'assistant', content: 'hello there' });
  });

  it('maps 401 to a non-retryable friendly error', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401),
    ) as unknown as typeof fetch;

    const err = await anthropicProvider.complete(msg, {}).catch((e: unknown) => e);
    expect((err as { retryable: boolean }).retryable).toBe(false);
    expect((err as Error).message).toContain('authenticate');
  });

  it('maps 429 to a retryable rate-limit error', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ error: { type: 'rate_limit_error', message: 'rate limited' } }, 429),
    ) as unknown as typeof fetch;

    const err = await anthropicProvider.complete(msg, {}).catch((e: unknown) => e);
    expect((err as { retryable: boolean }).retryable).toBe(true);
    expect((err as Error).message).toContain('rate-limited');
  });

  it('throws a friendly error when the API key is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(anthropicProvider.complete(msg, {})).rejects.toThrow('ANTHROPIC_API_KEY is not configured');
  });
});

describe('Anthropic provider — streaming', () => {
  it('streams text_delta as content and thinking_delta as thinking', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    global.fetch = vi.fn().mockResolvedValue(sseResponse([
      'event: message_start\ndata: {"type":"message_start","message":{"model":"claude-sonnet-4-20250514"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"hmm"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ])) as unknown as typeof fetch;

    const out: string[] = [];
    for await (const chunk of anthropicProvider.stream(msg, {})) {
      if (chunk.thinking) out.push(`[${chunk.thinking}]`);
      if (chunk.content) out.push(chunk.content);
    }
    expect(out).toEqual(['[hmm]', 'Hel', 'lo']);
  });

  it('signals an empty stream as a friendly error', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    // Fresh response per attempt so retries don't re-read a consumed stream.
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(sseResponse([
      'event: message_start\ndata: {"type":"message_start"}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ]))) as unknown as typeof fetch;

    await expect(async () => {
      for await (const _chunk of anthropicProvider.stream(msg, {})) { /* consume */ }
    }).rejects.toThrow('empty response');
  });
});

describe('Anthropic provider — health + info', () => {
  it('reports unavailable with a friendly reason when the key is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const status = await anthropicProvider.check();
    expect(status.available).toBe(false);
    expect(status.reason).toContain('ANTHROPIC_API_KEY');
  });

  it('reports available when configured', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const status = await anthropicProvider.check();
    expect(status.available).toBe(true);
    expect(status.model).toBe('claude-sonnet-4-20250514');
  });

  it('getInfo falls back to curated models when listing fails', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 } as unknown as Response);
    const info = await anthropicProvider.getInfo();
    expect(info.models.length).toBeGreaterThanOrEqual(3);
  });
});
