/**
 * OpenAI-compatible Chat Completions core.
 *
 * A single, tested implementation of the `/v1/chat/completions` protocol that
 * backs four providers — OpenAI, Groq, OpenRouter and Together AI — because
 * they all speak the same wire format. Each provider is just a config object
 * (base URL, env var names, default model) plus the shared transport.
 *
 * Responsibilities (identical to the other Brain providers):
 *   • Streaming (SSE) + non-streaming chat completions
 *   • Retry with linear backoff (per-provider `*_MAX_RETRIES`)
 *   • Timeouts on every request (per-provider `*_TIMEOUT_MS`)
 *   • Friendly, human-readable errors via `ProviderError` (retryable flag)
 *   • Best-effort model listing via `GET /v1/models`
 *   • Secret redaction: API keys never appear in messages or logs
 *
 * Secrets are read exclusively from environment variables at call time — they
 * are never logged, never serialized, and never included in error messages.
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

const compatLogger = createLogger('brain:openai-compat');

/** Providers backed by this core. */
const OPENAI_COMPAT_PROVIDERS = ['openai', 'groq', 'openrouter', 'together'] as const;
export type OpenAICompatProviderName = (typeof OPENAI_COMPAT_PROVIDERS)[number];

interface OpenAICompatConfig {
  /** Provider key (e.g. 'groq'). */
  name: OpenAICompatProviderName;
  /** Human label used in messages. */
  label: string;
  /** Default base URL (no trailing slash). */
  baseUrl: string;
  /** Default model when the env var is unset. */
  defaultModel: string;
  /** Extra headers (e.g. OpenRouter attribution). Optional. */
  extraHeaders?: Record<string, string>;
  /** Static model list used when GET /v1/models is unavailable. */
  fallbackModels: string[];
  /** Provider accepts `top_k` in Chat Completions (e.g. Groq). */
  supportsTopK?: boolean;
}

const CONFIGS: Record<OpenAICompatProviderName, OpenAICompatConfig> = {
  openai: {
    name: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1',
    fallbackModels: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini'],
  },
  groq: {
    name: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    supportsTopK: true,
    fallbackModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it', 'qwen-qwq-32b'],
  },
  openrouter: {
    name: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'google/gemini-2.5-flash',
    extraHeaders: {
      // OpenRouter attribution headers (public, non-secret).
      'HTTP-Referer': 'https://jk-ai-agent.vercel.app',
      'X-Title': 'JK-TECH-CODE AI',
    },
    fallbackModels: [
      'google/gemini-2.5-flash',
      'anthropic/claude-sonnet-4',
      'openai/gpt-4o',
      'meta-llama/llama-3.3-70b-instruct',
    ],
  },
  together: {
    name: 'together',
    label: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    fallbackModels: [
      'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      'Qwen/Qwen2.5-72B-Instruct',
      'deepseek-ai/DeepSeek-V3',
      'mistralai/Mixtral-8x7B-Instruct-v0.1',
    ],
  },
};

/** Per-provider env keys: `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_BASE_URL`, … */
function envKey(name: OpenAICompatProviderName, suffix: string): string {
  return `${name.toUpperCase()}_${suffix}`;
}

interface ResolvedCompatConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  extraHeaders: Record<string, string>;
}

/** Read configuration for a provider from the environment (never cached). */
export function readCompatConfig(name: OpenAICompatProviderName): ResolvedCompatConfig {
  const cfg = CONFIGS[name];
  const baseUrl = (process.env[envKey(name, 'BASE_URL')] || cfg.baseUrl).replace(/\/$/, '');
  return {
    apiKey: process.env[envKey(name, 'API_KEY')] || '',
    model: process.env[envKey(name, 'MODEL')] || cfg.defaultModel,
    baseUrl,
    timeoutMs: Number(process.env[envKey(name, 'TIMEOUT_MS')] || 60000),
    maxRetries: Number(process.env[envKey(name, 'MAX_RETRIES')] || 2),
    extraHeaders: cfg.extraHeaders ?? {},
  };
}

export function getCompatConfiguredModel(name: OpenAICompatProviderName): string {
  return readCompatConfig(name).model;
}

export function getCompatHost(name: OpenAICompatProviderName): string {
  return readCompatConfig(name).baseUrl;
}

function resolveModel(name: OpenAICompatProviderName, options: LLMOptions): string {
  return options.model?.trim() ? options.model.trim() : getCompatConfiguredModel(name);
}

/** Strip anything that looks like a secret from text before logging. */
export function redact(value: string): string {
  return value
    .replace(/\b(?:sk|sk-proj|sk-ant|gsk|OR)[-_][A-Za-z0-9_\-]{8,}\b/g, '[REDACTED]')
    .replace(/\bAQ\.[A-Za-z0-9_\-]{10,}/g, '[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._\-]{10,}/gi, 'Bearer [REDACTED]');
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

/** Map an HTTP status + body to a friendly `ProviderError`. */
export function errorFromOpenAICompatResponse(
  label: string,
  status: number,
  bodyText: string,
  model: string,
): ProviderError {
  let message = `${label} is temporarily unavailable. Please try again.`;
  let retryable = true;
  let detail = redact(bodyText);
  try {
    const parsed = JSON.parse(bodyText);
    detail = redact(String(parsed?.error?.message ?? parsed?.error?.code ?? parsed?.message ?? bodyText));
  } catch { /* keep raw body */ }

  if (status === 401 || status === 403 || /invalid api key|unauthorized|authentication|permission/i.test(detail)) {
    message = `${label} could not authenticate. Check that ${label.toUpperCase().replace(/ /g, '_')}_API_KEY is valid.`;
    retryable = false;
  } else if (status === 404 || /model not found|does not exist|not found/i.test(detail)) {
    message = `The model "${model}" is not available on ${label}. Check the model name.`;
    retryable = false;
  } else if (status === 400 || /invalid request|bad request|unsupported|context length/i.test(detail)) {
    message = `The request was rejected by ${label} (model "${model}" or parameters). Check the model name and settings.`;
    retryable = false;
  } else if (status === 429 || /rate limit|quota|too many requests/i.test(detail)) {
    message = `${label} is rate-limited right now. Please wait a moment and try again.`;
    retryable = true;
  } else if (status >= 500) {
    message = `${label} is temporarily unavailable. Please try again in a moment.`;
    retryable = true;
  }

  if (status !== 0) compatLogger.warn(`${label} HTTP ${status}: ${detail.slice(0, 300)}`);
  return new ProviderError(message, retryable);
}

/** Build the Chat Completions request body. */
function buildRequestBody(
  messages: LLMMessage[],
  options: LLMOptions,
  model: string,
  stream: boolean,
  supportsTopK = false,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages,
    stream,
  };
  if (options.temperature != null) body.temperature = options.temperature;
  if (options.topP != null) body.top_p = options.topP;
  if (options.maxTokens != null) body.max_tokens = options.maxTokens;
  // Only send top_k to providers that accept it (e.g. Groq); OpenAI rejects
  // unknown parameters, so this stays off for the rest.
  if (supportsTopK && options.topK != null && options.topK > 0) body.top_k = options.topK;
  return body;
}

function headersFor(cfg: ResolvedCompatConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.apiKey}`,
    ...cfg.extraHeaders,
  };
}

function requireApiKey(name: OpenAICompatProviderName): ResolvedCompatConfig {
  const cfg = readCompatConfig(name);
  if (!cfg.apiKey) {
    const varName = envKey(name, 'API_KEY');
    throw new ProviderError(
      `${varName} is not configured. Add it to .env.local (local) or the Vercel project settings (deployed).`,
      false,
    );
  }
  return cfg;
}

/** Extract `{ content, thinking }` from a single non-streamed choice. */
function extractChoice(choice: any): { content: string; thinking: string } {
  const msg = choice?.message ?? {};
  return {
    content: typeof msg.content === 'string' ? msg.content : '',
    thinking: typeof msg.reasoning_content === 'string' ? msg.reasoning_content : '',
  };
}

/** Non-streaming completion for an OpenAI-compatible provider. */
export async function chatComplete(
  name: OpenAICompatProviderName,
  messages: LLMMessage[],
  options: LLMOptions = {},
): Promise<LLMCompleteResult> {
  const cfg = requireApiKey(name);
  const model = resolveModel(name, options);
  const start = Date.now();
  const url = `${cfg.baseUrl}/chat/completions`;

  let lastError: unknown;
  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 300 * attempt));
    try {
      const res = await withTimeout(
        fetch(url, {
          method: 'POST',
          headers: headersFor(cfg),
          body: JSON.stringify(buildRequestBody(messages, options, model, false, CONFIGS[name].supportsTopK)),
        }),
        cfg.timeoutMs,
        `${CONFIGS[name].label} chat`,
      );
      const bodyText = await res.text().catch(() => '');
      if (!res.ok) throw errorFromOpenAICompatResponse(CONFIGS[name].label, res.status, bodyText, model);

      const json = JSON.parse(bodyText);
      const choice = json?.choices?.[0];
      if (!choice) throw errorFromOpenAICompatResponse(CONFIGS[name].label, 0, JSON.stringify(json), model);
      const { content, thinking } = extractChoice(choice);

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

  compatLogger.error(`${CONFIGS[name].label} chat failed after retries`, lastError);
  if (lastError instanceof ProviderError) throw lastError;
  throw new ProviderError(`${CONFIGS[name].label} is temporarily unavailable. Please try again.`, true);
}

/**
 * Streaming completion for an OpenAI-compatible provider (SSE).
 * Yields `{ content? }` and `{ thinking? }` chunks as they arrive.
 */
export async function* chatStream(
  name: OpenAICompatProviderName,
  messages: LLMMessage[],
  options: LLMOptions = {},
): AsyncGenerator<LLMStreamChunk> {
  const cfg = requireApiKey(name);
  const model = resolveModel(name, options);
  const label = CONFIGS[name].label;
  const url = `${cfg.baseUrl}/chat/completions`;

  let lastError: unknown;
  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 300 * attempt));
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: headersFor(cfg),
        body: JSON.stringify(buildRequestBody(messages, options, model, true, CONFIGS[name].supportsTopK)),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        throw errorFromOpenAICompatResponse(label, res.status, bodyText, model);
      }
      if (!res.body) throw new ProviderError(`${label} stream body unavailable.`, true);

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
              const delta = json?.choices?.[0]?.delta ?? {};
              const content = typeof delta.content === 'string' ? delta.content : '';
              const thinking = typeof delta.reasoning_content === 'string' ? delta.reasoning_content : '';
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
        throw new ProviderError(`${label} returned an empty response. Please try again.`, true);
      }
      return;
    } catch (err) {
      lastError = err;
      if (err instanceof ProviderError && !err.retryable) throw err;
    }
  }

  compatLogger.error(`${label} stream failed after retries`, lastError);
  if (lastError instanceof ProviderError) throw lastError;
  throw new ProviderError(`${label} is temporarily unavailable. Please try again.`, true);
}

/** Best-effort model list via GET /v1/models. */
export async function listCompatModels(name: OpenAICompatProviderName): Promise<Array<{ name: string }>> {
  const cfg = readCompatConfig(name);
  if (!cfg.apiKey) return [];
  try {
    const res = await withTimeout(
      fetch(`${cfg.baseUrl}/models`, { method: 'GET', headers: headersFor(cfg) }),
      8000,
      `${CONFIGS[name].label} model list`,
    );
    if (!res.ok) return CONFIGS[name].fallbackModels.map((m) => ({ name: m }));
    const json = await res.json();
    const listed = (json?.data ?? []).map((m: any) => ({ name: String(m?.id ?? '') })).filter((m: { name: string }) => m.name.length > 0);
    return listed.length > 0 ? listed : CONFIGS[name].fallbackModels.map((m) => ({ name: m }));
  } catch {
    return CONFIGS[name].fallbackModels.map((m) => ({ name: m }));
  }
}

/**
 * Build a full `LLMProvider` for an OpenAI-compatible endpoint.
 * Used by openai.ts, groq.ts, openrouter.ts and together.ts.
 */
export function createOpenAICompatProvider(name: OpenAICompatProviderName): LLMProvider {
  return {
    name: name as LLMProviderName,

    async check(): Promise<ProviderStatus> {
      const cfg = readCompatConfig(name);
      if (!cfg.apiKey) {
        return {
          provider: name as LLMProviderName,
          available: false,
          model: cfg.model,
          reason: `${envKey(name, 'API_KEY')} is not configured. Add it to .env.local or the Vercel project settings.`,
        };
      }
      return { provider: name as LLMProviderName, available: true, model: cfg.model };
    },

    complete(messages: LLMMessage[], options: LLMOptions = {}): Promise<LLMCompleteResult> {
      return chatComplete(name, messages, options);
    },

    stream(messages: LLMMessage[], options: LLMOptions = {}): AsyncGenerator<LLMStreamChunk> {
      return chatStream(name, messages, options);
    },

    async getInfo(): Promise<ProviderModelInfo> {
      const cfg = readCompatConfig(name);
      const models = await listCompatModels(name).catch(() => []);
      return { provider: name as LLMProviderName, model: cfg.model, host: cfg.baseUrl, models };
    },
  };
}
