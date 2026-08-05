/**
 * Anthropic provider — Claude via the Messages API.
 *
 * Responsibilities (identical to the other Brain providers):
 *   • Streaming (SSE) + non-streaming chat completions
 *   • Retry with linear backoff (ANTHROPIC_MAX_RETRIES)
 *   • Timeouts on every request (ANTHROPIC_TIMEOUT_MS)
 *   • Extended thinking support (surface hidden reasoning as `{ thinking }`)
 *   • Friendly, human-readable errors via `ProviderError`
 *
 * Configured via:
 *   LLM_PROVIDER=anthropic
 *   ANTHROPIC_API_KEY=<key>
 *   ANTHROPIC_MODEL=claude-sonnet-4-20250514   (default)
 *   ANTHROPIC_BASE_URL=https://api.anthropic.com   (optional override)
 *   ANTHROPIC_TIMEOUT_MS / ANTHROPIC_MAX_RETRIES   (optional)
 *
 * Secrets are read exclusively from environment variables and never logged or
 * included in error messages.
 */
import { createLogger } from '@/lib/logging/logger';
import {
  ProviderError,
  type LLMCompleteResult,
  type LLMMessage,
  type LLMOptions,
  type LLMProvider,
  type LLMProviderName,
  type LLMStreamChunk,
  type ProviderModelInfo,
  type ProviderStatus,
} from './interface';

const anthropicLogger = createLogger('brain:anthropic');

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const FALLBACK_MODELS = [
  'claude-sonnet-4-20250514',
  'claude-3-7-sonnet-20250219',
  'claude-3-5-haiku-latest',
  'claude-3-5-sonnet-20241022',
];

interface AnthropicConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
}

function readConfig(): AnthropicConfig {
  const baseUrl = (process.env.ANTHROPIC_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  return {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    baseUrl,
    timeoutMs: Number(process.env.ANTHROPIC_TIMEOUT_MS || 60000),
    maxRetries: Number(process.env.ANTHROPIC_MAX_RETRIES || 2),
  };
}

export function getAnthropicConfiguredModel(): string {
  return readConfig().model;
}

export function getAnthropicBaseUrl(): string {
  return readConfig().baseUrl;
}

function requireApiKey(): AnthropicConfig {
  const cfg = readConfig();
  if (!cfg.apiKey) {
    throw new ProviderError(
      'ANTHROPIC_API_KEY is not configured. Add it to .env.local (local) or the Vercel project settings (deployed).',
      false,
    );
  }
  return cfg;
}

function resolveModel(options: LLMOptions): string {
  return options.model?.trim() ? options.model.trim() : getAnthropicConfiguredModel();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      ctrl.abort();
      reject(new Error(`${what} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Anthropic requires `max_tokens`. Default 1024 when not provided. */
function resolveMaxTokens(options: LLMOptions): number {
  return options.maxTokens ?? 1024;
}

/**
 * Build the Messages API request body.
 * Anthropic requires strictly alternating user/assistant roles and a first
 * message from the user, so consecutive same-role turns are merged and a
 * leading assistant turn gets a user prefix — otherwise the API returns 400.
 */
function buildRequestBody(messages: LLMMessage[], options: LLMOptions, model: string): Record<string, unknown> {
  const system = messages.find((m) => m.role === 'system')?.content;
  const chat: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const last = chat[chat.length - 1];
    if (last && last.role === role) {
      last.content = `${last.content}\n\n${m.content}`;
    } else {
      chat.push({ role, content: m.content });
    }
  }
  if (chat.length > 0 && chat[0].role === 'assistant') {
    chat.unshift({ role: 'user', content: 'Continue.' });
  }

  const body: Record<string, unknown> = {
    model,
    max_tokens: resolveMaxTokens(options),
    messages: chat,
  };
  if (system) body.system = system;
  if (options.temperature != null && options.thinking !== true) body.temperature = options.temperature;
  if (options.topP != null) body.top_p = options.topP;

  // Extended thinking: only when explicitly requested (Brain "thinking" plan).
  // Anthropic requires temperature=1 (or unset) while thinking is enabled.
  if (options.thinking === true) {
    const budget = Math.min(Math.max(resolveMaxTokens(options), 1024), 32000);
    body.thinking = { type: 'enabled', budget_tokens: budget };
  }

  return body;
}

function headersFor(cfg: AnthropicConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': cfg.apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
  };
}

/** Extract `{ content, thinking }` from a non-streamed response. */
function extractContentBlocks(blocks: any[]): { content: string; thinking: string } {
  let content = '';
  let thinking = '';
  for (const block of blocks ?? []) {
    if (block?.type === 'thinking') {
      thinking += block.thinking ?? '';
    } else if (block?.type === 'text') {
      content += block.text ?? '';
    }
  }
  return { content, thinking };
}

/** Friendly error from an Anthropic error payload / HTTP status. */
function errorFromAnthropicResponse(status: number, bodyText: string, model: string): ProviderError {
  let message = 'Claude is temporarily unavailable. Please try again.';
  let retryable = true;
  let detail = bodyText;
  try {
    const parsed = JSON.parse(bodyText);
    detail = parsed?.error?.message ?? parsed?.error?.type ?? bodyText;
  } catch { /* keep raw body */ }

  if (status === 401 || status === 403 || /authentication|permission|invalid x-api-key|api key/i.test(detail)) {
    message = 'Claude could not authenticate. Check that ANTHROPIC_API_KEY is valid.';
    retryable = false;
  } else if (status === 404 || /model.*not found|not_found/i.test(detail)) {
    message = `The Claude model "${model}" is not available. Check ANTHROPIC_MODEL.`;
    retryable = false;
  } else if (status === 400 || /invalid request|bad request/i.test(detail)) {
    message = 'Claude rejected the request. Check the model name and parameters.';
    retryable = false;
  } else if (status === 429 || /rate limit|overloaded/i.test(detail)) {
    message = 'Claude is rate-limited right now. Please wait a moment and try again.';
    retryable = true;
  } else if (status >= 500) {
    message = 'Claude is temporarily unavailable. Please try again in a moment.';
    retryable = true;
  }

  if (status !== 0) anthropicLogger.warn(`Anthropic HTTP ${status}: ${String(detail).slice(0, 300)}`);
  return new ProviderError(message, retryable);
}

/** Non-streaming completion. */
async function anthropicComplete(
  messages: LLMMessage[],
  options: LLMOptions = {},
): Promise<LLMCompleteResult> {
  const cfg = requireApiKey();
  const model = resolveModel(options);
  const start = Date.now();
  const url = `${cfg.baseUrl}/v1/messages`;

  let lastError: unknown;
  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 300 * attempt));
    try {
      const res = await withTimeout(
        fetch(url, {
          method: 'POST',
          headers: headersFor(cfg),
          body: JSON.stringify(buildRequestBody(messages, options, model)),
        }),
        cfg.timeoutMs,
        'Anthropic messages',
      );
      const bodyText = await res.text().catch(() => '');
      if (!res.ok) throw errorFromAnthropicResponse(res.status, bodyText, model);

      const json = JSON.parse(bodyText);
      const { content, thinking } = extractContentBlocks(json?.content);

      return {
        content,
        thinking,
        modelUsed: (json?.model as string) || model,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      lastError = err;
      if (err instanceof ProviderError && !err.retryable) throw err;
    }
  }

  anthropicLogger.error('Anthropic messages failed after retries', lastError);
  if (lastError instanceof ProviderError) throw lastError;
  throw new ProviderError('Claude is temporarily unavailable. Please try again.', true);
}

/**
 * Streaming completion (SSE). Anthropic streams typed events; we forward
 * `text_delta` as content and `thinking_delta` as hidden thinking.
 */
async function* anthropicStream(
  messages: LLMMessage[],
  options: LLMOptions = {},
): AsyncGenerator<LLMStreamChunk> {
  const cfg = requireApiKey();
  const model = resolveModel(options);
  const url = `${cfg.baseUrl}/v1/messages`;

  let lastError: unknown;
  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 300 * attempt));
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: headersFor(cfg),
        body: JSON.stringify({ ...buildRequestBody(messages, options, model), stream: true }),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        throw errorFromAnthropicResponse(res.status, bodyText, model);
      }
      if (!res.body) throw new ProviderError('Claude stream body unavailable.', true);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let sawContent = false;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || '';
        for (const event of events) {
          let dataLine = '';
          for (const line of event.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data:')) dataLine = trimmed.slice(5).trim();
          }
          if (!dataLine || dataLine === '[DONE]') continue;
          try {
            const json = JSON.parse(dataLine);
            if (json?.type === 'content_block_delta') {
              const delta = json.delta ?? {};
              if (delta.type === 'text_delta' && typeof delta.text === 'string' && delta.text) {
                sawContent = true;
                yield { content: delta.text };
              } else if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string' && delta.thinking) {
                yield { thinking: delta.thinking };
              }
            }
          } catch { /* skip malformed fragments */ }
        }
      }

      if (!sawContent) {
        throw new ProviderError('Claude returned an empty response. Please try again.', true);
      }
      return;
    } catch (err) {
      lastError = err;
      if (err instanceof ProviderError && !err.retryable) throw err;
    }
  }

  anthropicLogger.error('Anthropic stream failed after retries', lastError);
  if (lastError instanceof ProviderError) throw lastError;
  throw new ProviderError('Claude is temporarily unavailable. Please try again.', true);
}

/** Best-effort model list (GET /v1/models requires an admin key; fall back to curated list). */
async function anthropicListModels(cfg: AnthropicConfig): Promise<Array<{ name: string }>> {
  try {
    const res = await withTimeout(
      fetch(`${cfg.baseUrl}/v1/models`, {
        method: 'GET',
        headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': ANTHROPIC_VERSION },
      }),
      8000,
      'Anthropic model list',
    );
    if (!res.ok) return FALLBACK_MODELS.map((m) => ({ name: m }));
    const json = await res.json();
    const listed = (json?.data ?? []).map((m: any) => ({ name: String(m?.id ?? '') })).filter((m: { name: string }) => m.name);
    return listed.length > 0 ? listed : FALLBACK_MODELS.map((m) => ({ name: m }));
  } catch {
    return FALLBACK_MODELS.map((m) => ({ name: m }));
  }
}

/**
 * AnthropicProvider — Claude backend implementing `LLMProvider`.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name: LLMProviderName = 'anthropic';

  async check(): Promise<ProviderStatus> {
    const cfg = readConfig();
    if (!cfg.apiKey) {
      return {
        provider: 'anthropic',
        available: false,
        model: cfg.model,
        reason: 'ANTHROPIC_API_KEY is not configured. Add it to .env.local or the Vercel project settings.',
      };
    }
    return { provider: 'anthropic', available: true, model: cfg.model };
  }

  complete(messages: LLMMessage[], options?: LLMOptions): Promise<LLMCompleteResult> {
    return anthropicComplete(messages, options);
  }

  stream(messages: LLMMessage[], options?: LLMOptions): AsyncGenerator<LLMStreamChunk> {
    return anthropicStream(messages, options);
  }

  async getInfo(): Promise<ProviderModelInfo> {
    const cfg = readConfig();
    const models = cfg.apiKey ? await anthropicListModels(cfg).catch(() => []) : [];
    return { provider: 'anthropic', model: cfg.model, host: cfg.baseUrl, models };
  }
}

/** Shared singleton — the Brain selects it via `LLM_PROVIDER=anthropic`. */
export const anthropicProvider = new AnthropicProvider();
