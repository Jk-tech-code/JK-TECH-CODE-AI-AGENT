import { createLogger } from '@/lib/logging/logger';

const httpLogger = createLogger('integrations-http');

export interface ProbeResult {
  ok: boolean;
  status: number;
  latencyMs: number;
}

export interface ProbeOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Perform an HTTP probe with a timeout. Never throws — returns a ProbeResult
 * with ok=false on any failure. Logs errors without exposing secrets.
 */
export async function probeHttp(url: string, options: ProbeOptions = {}): Promise<ProbeResult> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body,
      signal: controller.signal,
      cache: 'no-store',
    });
    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error && err.name === 'AbortError'
      ? `request timed out after ${timeoutMs}ms`
      : err instanceof Error ? err.message : String(err);
    httpLogger.warn('Health probe failed', { url: safeUrl(url), error: message });
    return { ok: false, status: 0, latencyMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

/** Redact query strings and credentials from a URL before logging. */
export function safeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return '(invalid url)';
  }
}

/**
 * Sanitize an error detail string before it is exposed via public health
 * endpoints. Strips anything that looks like a credential (API key, token,
 * password, JWT) and long opaque values that could contain secrets.
 */
export function sanitizeDetail(detail: string, maxLength = 200): string {
  let value = detail;

  // API keys / tokens: sk-..., eyJ... (JWTs), tvly-..., xai-..., etc.
  value = value.replace(/(sk-[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_\-.]{8,}|[a-z0-9_-]{8,}:[A-Za-z0-9_-]{8,})/g, '[REDACTED]');
  // Password-style pairs: pass=xxx, password: xxx, pwd xxx
  value = value.replace(/(pass(word)?\s*[:=]\s*)\S+/gi, '$1[REDACTED]');
  // Bearer tokens
  value = value.replace(/(bearer\s+)\S+/gi, '$1[REDACTED]');
  // Generic long query strings
  value = value.replace(/([?&](?:key|token|apikey|api_key|secret|sig)=)[^&\s]+/gi, '$1[REDACTED]');

  return value.slice(0, maxLength);
}

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 300;

/**
 * Retry a transient HTTP probe failure (network error, 5xx, or 429) up to
 * MAX_RETRIES extra attempts with a short backoff.
 */
export async function probeHttpWithRetry(url: string, options: ProbeOptions = {}): Promise<ProbeResult> {
  let last = await probeHttp(url, options);

  for (let attempt = 1; attempt <= MAX_RETRIES && !last.ok; attempt++) {
    const isTransient = last.status === 0 || last.status >= 500 || last.status === 429;
    if (!isTransient) break;

    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
    last = await probeHttp(url, options);
  }

  return last;
}
