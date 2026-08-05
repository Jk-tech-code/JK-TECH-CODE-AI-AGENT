/**
 * Gemini provider — the default cloud LLM backend for JK-TECH-CODE Brain.
 *
 * Talks to the Google Generative Language API over HTTPS (works on Vercel and
 * any serverless runtime — no local service required). Responsibilities:
 *   • Streaming + non-streaming chat      • Timeouts and retry with backoff
 *   • Friendly, human-readable errors     • Model metadata via the API
 *
 * Configured via:
 *   LLM_PROVIDER=gemini
 *   GEMINI_API_KEY=<key>
 *   GEMINI_MODEL=gemini-2.5-flash   (default)
 *
 * Failures never crash the app — they surface as `ProviderError` with a
 * friendly message so the Brain can show it to the user instead of a blank
 * response.
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

const geminiLogger = createLogger('brain:gemini');

interface GeminiConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
}

function readConfig(): GeminiConfig {
  const baseUrl = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  return {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    baseUrl,
    timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS || 60000),
    maxRetries: Number(process.env.GEMINI_MAX_RETRIES || 2),
  };
}

export function getGeminiConfiguredModel(): string {
  return readConfig().model;
}

export function getGeminiBaseUrl(): string {
  return readConfig().baseUrl;
}

/** Fetch-like with an AbortSignal timeout helper. */
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

/** Gemini uses "model" for the assistant role; "user" covers everything else. */
function mapRole(role: LLMMessage['role']): 'user' | 'model' {
  return role === 'assistant' ? 'model' : 'user';
}

/** Build the REST request body from provider-agnostic messages. */
function buildRequestBody(
  messages: LLMMessage[],
  options: LLMOptions,
): Record<string, unknown> {
  const system = messages.find((m) => m.role === 'system')?.content;
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: mapRole(m.role),
      parts: [{ text: m.content }],
    }));

  const generationConfig: Record<string, unknown> = {};
  if (options.temperature != null) generationConfig.temperature = options.temperature;
  if (options.topP != null) generationConfig.topP = options.topP;
  if (options.topK != null && options.topK > 0) generationConfig.topK = options.topK;
  if (options.maxTokens != null) generationConfig.maxOutputTokens = options.maxTokens;
  // Gemini 2.5 models reason by default; surface the hidden thoughts when the
  // Brain asks for thinking output.
  if (options.thinking !== false) {
    generationConfig.thinkingConfig = { includeThoughts: true };
  }

  return {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents,
    generationConfig,
  };
}

/** Extract `{ content, thinking }` from a single Gemini candidate. */
function extractCandidate(candidate: any): { content: string; thinking: string } {
  let content = '';
  let thinking = '';
  const parts = candidate?.content?.parts ?? [];
  for (const part of parts) {
    if (part?.thought === true) {
      thinking += part.text ?? '';
    } else {
      content += part.text ?? '';
    }
  }
  return { content, thinking };
}

/** Friendly error from a Gemini error payload / HTTP status. */
function errorFromResponse(status: number, bodyText: string, model: string): ProviderError {
  let message = 'Gemini is temporarily unavailable. Please try again.';
  let retryable = true;
  let detail = bodyText;
  try {
    const parsed = JSON.parse(bodyText);
    detail = parsed?.error?.message ?? parsed?.error?.status ?? bodyText;
  } catch { /* keep raw body */ }

  if (status === 400 || status === 404 || /not found|not supported|invalid argument/i.test(detail)) {
    message = `The Gemini model "${model}" is not available or the request was invalid. Check GEMINI_MODEL.`;
    retryable = false;
  } else if (status === 401 || status === 403 || /api key|permission|unauthorized/i.test(detail)) {
    message = 'Gemini could not authenticate. Check that GEMINI_API_KEY is valid and billing is enabled.';
    retryable = false;
  } else if (status === 429 || /rate limit|resource exhausted/i.test(detail)) {
    message = 'Gemini is rate-limited right now. Please wait a moment and try again.';
    retryable = true;
  } else if (status >= 500) {
    message = 'Gemini is temporarily unavailable. Please try again in a moment.';
    retryable = true;
  }

  if (status !== 0) geminiLogger.warn(`Gemini HTTP ${status}: ${detail}`);
  return new ProviderError(message, retryable);
}

/** Ensure the API key is configured — throws a friendly ProviderError if not. */
function requireApiKey(): GeminiConfig {
  const cfg = readConfig();
  if (!cfg.apiKey) {
    throw new ProviderError(
      'GEMINI_API_KEY is not configured. Add it to .env.local (local) or the Vercel project settings (deployed).',
      false,
    );
  }
  return cfg;
}

function endpoint(cfg: GeminiConfig, action: 'generateContent' | 'streamGenerateContent', model: string): string {
  return `${cfg.baseUrl}/v1beta/models/${encodeURIComponent(model)}:${action}`;
}

function headers(cfg: GeminiConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-goog-api-key': cfg.apiKey,
  };
}

/** Non-streaming completion. */
async function geminiComplete(
  messages: LLMMessage[],
  options: LLMOptions = {},
): Promise<LLMCompleteResult> {
  const cfg = requireApiKey();
  // Per-request model override (from user settings) wins over the env default.
  const model = options.model?.trim() ? options.model.trim() : cfg.model;
  const start = Date.now();
  const url = `${endpoint(cfg, 'generateContent', model)}?alt=json`;

  let lastError: unknown;
  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 300 * attempt));
    try {
      const res = await withTimeout(
        fetch(url, {
          method: 'POST',
          headers: headers(cfg),
          body: JSON.stringify(buildRequestBody(messages, options)),
        }),
        cfg.timeoutMs,
        'Gemini generateContent',
      );
      const bodyText = await res.text().catch(() => '');
      if (!res.ok) throw errorFromResponse(res.status, bodyText, model);

      const json = JSON.parse(bodyText);
      const candidate = json?.candidates?.[0];
      if (!candidate) throw errorFromResponse(0, JSON.stringify(json), model);
      const { content, thinking } = extractCandidate(candidate);

      return {
        content,
        thinking,
        modelUsed: json?.modelVersion || model,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      lastError = err;
      if (err instanceof ProviderError && !err.retryable) throw err;
    }
  }

  geminiLogger.error('Gemini generateContent failed after retries', lastError);
  if (lastError instanceof ProviderError) throw lastError;
  throw new ProviderError('Gemini is temporarily unavailable. Please try again.', true);
}

/**
 * Streaming completion via the SSE `streamGenerateContent` endpoint.
 * Yields `{ content? }` and `{ thinking? }` chunks as they arrive.
 */
async function* geminiStream(
  messages: LLMMessage[],
  options: LLMOptions = {},
): AsyncGenerator<LLMStreamChunk> {
  const cfg = requireApiKey();
  const model = options.model?.trim() ? options.model.trim() : cfg.model;
  const url = `${endpoint(cfg, 'streamGenerateContent', model)}?alt=sse`;

  let lastError: unknown;
  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 300 * attempt));
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: headers(cfg),
        body: JSON.stringify(buildRequestBody(messages, options)),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        throw errorFromResponse(res.status, bodyText, model);
      }
      if (!res.body) throw new ProviderError('Gemini stream body unavailable.', true);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let sawContent = false;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by blank lines; each `data:` line holds JSON.
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || '';
        for (const event of events) {
          for (const line of event.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
              const json = JSON.parse(payload);
              const candidate = json?.candidates?.[0];
              if (!candidate) continue;
              const { content, thinking } = extractCandidate(candidate);
              if (thinking) yield { thinking };
              if (content) {
                sawContent = true;
                yield { content };
              }
            } catch { /* skip malformed fragments */ }
          }
        }
      }

      if (!sawContent) {
        throw new ProviderError('Gemini returned an empty response. Please try again.', true);
      }
      return;
    } catch (err) {
      lastError = err;
      if (err instanceof ProviderError && !err.retryable) throw err;
    }
  }

  geminiLogger.error('Gemini stream failed after retries', lastError);
  if (lastError instanceof ProviderError) throw lastError;
  throw new ProviderError('Gemini is temporarily unavailable. Please try again.', true);
}

/** List available Gemini models via the API (best-effort). */
async function geminiListModels(): Promise<Array<{ name: string }>> {
  const cfg = requireApiKey();
  try {
    const res = await withTimeout(
      fetch(`${cfg.baseUrl}/v1beta/models?pageSize=100`, {
        method: 'GET',
        headers: { 'x-goog-api-key': cfg.apiKey },
      }),
      8000,
      'Gemini model list',
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json.models ?? [])
      .filter((m: any) => /^models\/gemini/.test(m?.name ?? ''))
      .map((m: any) => ({ name: (m.name as string).replace(/^models\//, '') }));
  } catch {
    return [];
  }
}

/**
 * GeminiProvider — the default cloud LLM backend.
 */
export class GeminiProvider implements LLMProvider {
  readonly name: LLMProviderName = 'gemini';

  async check(): Promise<ProviderStatus> {
    const cfg = readConfig();
    if (!cfg.apiKey) {
      return {
        provider: 'gemini',
        available: false,
        model: cfg.model,
        reason: 'GEMINI_API_KEY is not configured. Add it to .env.local or the Vercel project settings.',
      };
    }
    return { provider: 'gemini', available: true, model: cfg.model };
  }

  complete(messages: LLMMessage[], options?: LLMOptions): Promise<LLMCompleteResult> {
    return geminiComplete(messages, options);
  }

  stream(messages: LLMMessage[], options?: LLMOptions): AsyncGenerator<LLMStreamChunk> {
    return geminiStream(messages, options);
  }

  async getInfo(): Promise<ProviderModelInfo> {
    const cfg = readConfig();
    let models: Array<{ name: string }> = [];
    if (cfg.apiKey) models = await geminiListModels().catch(() => []);
    return { provider: 'gemini', model: cfg.model, host: cfg.baseUrl, models };
  }
}

/** Shared singleton — the Brain selects it via `LLM_PROVIDER=gemini`. */
export const geminiProvider = new GeminiProvider();
