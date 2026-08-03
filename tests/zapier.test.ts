import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/server', () => ({
  after: (fn: () => void) => {
    // In unit tests there is no request context; run the work immediately.
    fn();
  },
}));

vi.mock('@/lib/logging/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

let mockWebhookUrl = 'https://hooks.zapier.com/hooks/catch/test/';
vi.mock('@/lib/config', () => ({
  config: {
    services: {
      get zapierWebhook() {
        return mockWebhookUrl;
      },
    },
  },
}));

import {
  sendToZapier,
  fireTaskWebhook,
  resolveZapierEvent,
  resolveZapierEventForAgent,
  validateZapierEvent,
  getZapierWebhookUrl,
  ZAPIER_EVENT_MAP,
} from '../src/lib/services/zapier';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const originalFetch = global.fetch;

beforeEach(() => {
  mockWebhookUrl = 'https://hooks.zapier.com/hooks/catch/test/';
});

afterEach(() => {
  vi.useRealTimers();
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('Zapier event mapping', () => {
  it('maps all ten business event types', () => {
    expect(resolveZapierEvent('inquiry')).toBe('customer.inquiry');
    expect(resolveZapierEvent('booking')).toBe('booking.appointment');
    expect(resolveZapierEvent('quotation')).toBe('quote.website');
    expect(resolveZapierEvent('document')).toBe('document.generated');
    expect(resolveZapierEvent('image')).toBe('image.generated');
    expect(resolveZapierEvent('job')).toBe('job.application');
    expect(resolveZapierEvent('admission')).toBe('admission.school');
    expect(resolveZapierEvent('payment')).toBe('payment.confirmed');
    expect(resolveZapierEvent('ticket')).toBe('ticket.support');
    expect(resolveZapierEvent('contact')).toBe('contact.form');
  });

  it('passes through unknown event types unchanged', () => {
    expect(resolveZapierEvent('custom.event')).toBe('custom.event');
  });

  it('falls back to ai.completion for empty input', () => {
    expect(resolveZapierEvent('')).toBe('ai.completion');
    expect(resolveZapierEvent(undefined as unknown as string)).toBe('ai.completion');
  });

  it('maps agent IDs to appropriate events', () => {
    expect(resolveZapierEventForAgent('doc-agent')).toBe('document');
    expect(resolveZapierEventForAgent('pdf-agent')).toBe('document');
    expect(resolveZapierEventForAgent('research-agent')).toBe('research');
    expect(resolveZapierEventForAgent('planning-agent')).toBe('plan');
    expect(resolveZapierEventForAgent('unknown-agent')).toBe('ai.completion');
  });

  it('exports a complete event map for all business flows', () => {
    const requiredEvents = [
      'customer.inquiry',
      'booking.appointment',
      'quote.website',
      'document.generated',
      'image.generated',
      'job.application',
      'admission.school',
      'payment.confirmed',
      'ticket.support',
      'contact.form',
    ];
    const mappedValues = Object.values(ZAPIER_EVENT_MAP);
    for (const event of requiredEvents) {
      expect(mappedValues).toContain(event);
    }
  });
});

describe('Payload validation', () => {
  it('rejects empty event types', () => {
    expect(validateZapierEvent('', {})).toContain('eventType');
    expect(validateZapierEvent('   ', {})).toContain('eventType');
  });

  it('rejects null, array, or primitive data', () => {
    expect(validateZapierEvent('ticket', null)).toContain('data');
    expect(validateZapierEvent('ticket', undefined)).toContain('data');
    expect(validateZapierEvent('ticket', [1, 2])).toContain('data');
    expect(validateZapierEvent('ticket', 'string')).toContain('data');
  });

  it('accepts valid event + object data', () => {
    expect(validateZapierEvent('ticket', { userId: 'u1' })).toBeNull();
  });
});

describe('sendToZapier', () => {
  it('returns success with the webhook response body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { status: 'success' }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendToZapier('ticket', { userId: 'u1', userMessage: 'Help' });

    expect(result.success).toBe(true);
    expect(result.response).toEqual({ status: 'success' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends the correct payload shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    global.fetch = fetchMock as unknown as typeof fetch;

    const data = { userId: 'u1', sessionId: 's1', userMessage: 'Hello', aiResponse: 'Hi', service: 'chat' };
    await sendToZapier('inquiry', data);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(mockWebhookUrl);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');

    const payload = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(payload.event).toBe('inquiry');
    expect(payload.source).toBe('JK-TECH-CODE-AI');
    expect(typeof payload.timestamp).toBe('string');
    expect(new Date(payload.timestamp as string).getTime()).not.toBeNaN();
    expect(payload.data).toEqual(data);
  });

  it('retries transient HTTP failures and succeeds on a later attempt', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, {}))
      .mockResolvedValueOnce(jsonResponse(503, {}))
      .mockResolvedValueOnce(jsonResponse(200, { delivered: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    vi.useFakeTimers();
    const promise = sendToZapier('payment', { userMessage: 'Paid' });
    await vi.advanceTimersByTimeAsync(500); // backoff after attempt 1
    await vi.advanceTimersByTimeAsync(1000); // backoff after attempt 2
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.response).toEqual({ delivered: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('returns failure after exhausting all retries', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(502, {}));
    global.fetch = fetchMock as unknown as typeof fetch;

    vi.useFakeTimers();
    const promise = sendToZapier('contact', { userMessage: 'Hi' });
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.error).toContain('502');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('times out each attempt after 10 seconds', async () => {
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
          });
        }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    vi.useFakeTimers();
    const promise = sendToZapier('booking', { userMessage: 'Book' });
    await vi.advanceTimersByTimeAsync(10_000); // attempt 1 timeout
    await vi.advanceTimersByTimeAsync(500); // backoff
    await vi.advanceTimersByTimeAsync(10_000); // attempt 2 timeout
    await vi.advanceTimersByTimeAsync(1_000); // backoff
    await vi.advanceTimersByTimeAsync(10_000); // attempt 3 timeout
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('recovers after a network failure', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    vi.useFakeTimers();
    const promise = sendToZapier('job', { userMessage: 'Application' });
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails fast when the webhook URL is not configured', async () => {
    mockWebhookUrl = '';
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendToZapier('ticket', { userMessage: 'Help' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('ZAPIER_WEBHOOK_URL');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails fast on invalid payload without making a request', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendToZapier('', { userMessage: 'x' });

    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never throws, even when fetch itself throws synchronously', async () => {
    const fetchMock = vi.fn(() => {
      throw new Error('sync failure');
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    vi.useFakeTimers();
    const promise = sendToZapier('image', { userMessage: 'Gen' });
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1_000);
    const result = await promise;

    expect(result.success).toBe(false);
  });
});

describe('fireTaskWebhook (fire-and-forget)', () => {
  it('returns void and does not block the caller', () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    global.fetch = fetchMock as unknown as typeof fetch;

    const returned = fireTaskWebhook('contact', {
      userId: 'u1',
      userMessage: 'Hello',
      aiResponse: 'Hi',
      service: 'contact',
      timestamp: new Date().toISOString(),
    });

    expect(returned).toBeUndefined();
  });

  it('fires asynchronously and resolves the underlying send', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    fireTaskWebhook('payment', {
      userId: 'u1',
      userMessage: 'Order #123',
      aiResponse: 'Confirmed',
      service: 'payment',
      timestamp: new Date().toISOString(),
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it('resolves business event keys to mapped event names', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    global.fetch = fetchMock as unknown as typeof fetch;

    fireTaskWebhook('inquiry', {
      userMessage: 'Quote?',
      aiResponse: 'Here is a quote.',
      service: 'inquiry',
      timestamp: new Date().toISOString(),
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(payload.event).toBe('customer.inquiry');
  });
});

describe('getZapierWebhookUrl', () => {
  it('returns the configured URL', () => {
    mockWebhookUrl = 'https://hooks.zapier.com/hooks/catch/abc123/';
    expect(getZapierWebhookUrl()).toBe('https://hooks.zapier.com/hooks/catch/abc123/');
  });

  it('returns undefined when not configured', () => {
    mockWebhookUrl = '';
    expect(getZapierWebhookUrl()).toBeUndefined();
  });
});
