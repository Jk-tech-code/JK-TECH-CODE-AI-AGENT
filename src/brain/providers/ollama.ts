/**
 * Ollama provider — the primary LLM backend for JK-TECH-CODE AI Brain.
 *
 * Talks to a local Ollama instance (default http://localhost:11434) over its
 * native HTTP + NDJSON streaming API. Responsibilities:
 *   • Health check + model availability  • Streaming and non-streaming chat
 *   • Retry with backoff                 • Timeouts on every request
 *   • Automatic detection of configured model (and friendly error when missing)
 *
 * The provider never throws for "model offline / missing model" in a way that
 * crashes the app — it returns structured errors (`OllamaUnavailableError`,
 * `ModelNotFoundError`) so callers can present a friendly message + Retry.
 */
import { createLogger } from '@/lib/logging/logger';

const ollamaLogger = createLogger('brain:ollama');

/** Raised when the Ollama server cannot be reached (down, or host unreachable). */
export class OllamaUnavailableError extends Error {
  constructor(message = 'Local AI is currently unavailable.') {
    super(message);
    this.name = 'OllamaUnavailableError';
  }
}

/** Raised when the server is reachable but the requested model is not installed. */
export class ModelNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelNotFoundError';
  }
}

export interface OllamaOptions {
  /** Extra sampler options passed verbatim to Ollama `/api/chat` options. */
  temperature?: number;
  topP?: number;
  /** Top-K sampling; 0 disables. */
  topK?: number;
  maxTokens?: number;
  /** qwen3 derivative models: set false to disable hidden "thinking". */
  thinking?: boolean;
}

export interface OllamaModelInfo {
  name: string;
  /** e.g. "qwen3" */
  family?: string;
  parameterSize?: string;
  quantization?: string;
  contextLength?: number;
}

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaConfig {
  host: string;
  model: string;
  /** Reconnect / request timeout in ms. */
  timeoutMs: number;
  maxRetries: number;
}

function readConfig(): OllamaConfig {
  const host = (process.env.OLLAMA_HOST || 'http://localhost:11434').replace(/\/$/, '');
  const model = process.env.OLLAMA_MODEL || process.env.LLM_MODEL || 'qwen3:4b';
  return {
    host,
    model,
    timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS || 60000),
    maxRetries: Number(process.env.OLLAMA_MAX_RETRIES || 2),
  };
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

/**
 * Parse an NDJSON streaming body into `{ thinking?, content? }` chunks.
 * Iterates each `message` object in place; the caller decides what to emit.
 */
export async function* streamChatRaw(
  messages: OllamaChatMessage[],
  options: OllamaOptions = {},
): AsyncGenerator<{ thinking: string; content: string; done: boolean }, void, undefined> {
  const cfg = readConfig();

  const payload = {
    model: cfg.model,
    messages,
    stream: true,
    options: {
      ...(options.temperature != null ? { temperature: options.temperature } : {}),
      ...(options.topP != null ? { top_p: options.topP } : {}),
      ...(options.topK != null && options.topK > 0 ? { top_k: options.topK } : {}),
      ...(options.maxTokens != null ? { num_predict: options.maxTokens } : {}),
      ...(options.thinking != null ? { think: options.thinking } : {}),
    },
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);

  let lastError: unknown;
  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 300 * attempt));
    }
    try {
      const res = await fetch(`${cfg.host}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        if (res.status === 404 || /model.*not found/i.test(text)) {
          throw new ModelNotFoundError(
            `The model "${cfg.model}" is not installed locally. Run: ollama pull ${cfg.model}`,
          );
        }
        throw new OllamaUnavailableError(`Ollama returned HTTP ${res.status}.`);
      }
      if (!res.body) throw new OllamaUnavailableError('Ollama stream body unavailable.');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const json = JSON.parse(trimmed);
            const thinking = json.message?.thinking ?? '';
            const content = json.message?.content ?? '';
            const doneFlag = !!json.done;
            yield { thinking, content, done: doneFlag };
          } catch {
            // Ignore malformed fragments.
          }
        }
      }

      clearTimeout(timer);
      return; // succeeded
    } catch (err) {
      lastError = err;
      if (err instanceof ModelNotFoundError || err instanceof OllamaUnavailableError) {
        clearTimeout(timer);
        throw err;
      }
    }
  }

  clearTimeout(timer);
  ollamaLogger.error('Ollama stream failed after retries', lastError);
  throw new OllamaUnavailableError();
}

/** Non-streaming chat completion returning the full assistant text. */
export async function chatComplete(
  messages: OllamaChatMessage[],
  options: OllamaOptions = {},
): Promise<{ content: string; thinking: string; modelUsed: string; latencyMs: number }> {
  const cfg = readConfig();
  const start = Date.now();

  const payload = {
    model: cfg.model,
    messages,
    stream: false,
    options: {
      ...(options.temperature != null ? { temperature: options.temperature } : {}),
      ...(options.topP != null ? { top_p: options.topP } : {}),
      ...(options.topK != null && options.topK > 0 ? { top_k: options.topK } : {}),
      ...(options.maxTokens != null ? { num_predict: options.maxTokens } : {}),
      ...(options.thinking != null ? { think: options.thinking } : {}),
    },
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);

  let lastError: unknown;
  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 300 * attempt));
    try {
      const res = await fetch(`${cfg.host}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        if (res.status === 404 || /model.*not found/i.test(text)) {
          throw new ModelNotFoundError(
            `The model "${cfg.model}" is not installed locally. Run: ollama pull ${cfg.model}`,
          );
        }
        throw new OllamaUnavailableError(`Ollama returned HTTP ${res.status}.`);
      }
      const json = await res.json();
      clearTimeout(timer);
      return {
        content: json.message?.content ?? '',
        thinking: json.message?.thinking ?? '',
        modelUsed: json.model || cfg.model,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      lastError = err;
      if (err instanceof ModelNotFoundError || err instanceof OllamaUnavailableError) {
        clearTimeout(timer);
        throw err;
      }
    }
  }

  clearTimeout(timer);
  ollamaLogger.error('Ollama chat complete failed after retries', lastError);
  throw new OllamaUnavailableError();
}

/** Lightweight health check: reachable? server up? */
export async function isHealthy(): Promise<boolean> {
  const cfg = readConfig();
  try {
    const res = await withTimeout(
      fetch(`${cfg.host}/api/tags`, { method: 'GET' }),
      4000,
      'Ollama health check',
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** List installed models (their `name` field). */
export async function listModels(): Promise<OllamaModelInfo[]> {
  const cfg = readConfig();
  const res = await fetch(`${cfg.host}/api/tags`);
  if (!res.ok) return [];
  const json = await res.json();
  const models: OllamaModelInfo[] = (json.models ?? []).map((m: any) => ({
    name: m.name,
    family: m.details?.family,
    parameterSize: m.details?.parameter_size,
    quantization: m.details?.quantization_level,
    contextLength: m.details?.context_length,
  }));
  return models;
}

/** Returns true when the configured model is installed locally. */
export async function isModelAvailable(): Promise<boolean> {
  const cfg = readConfig();
  try {
    const models = await listModels();
    return models.some((m) => m.name === cfg.model || m.name.startsWith(`${cfg.model.split(':')[0]}:`));
  } catch {
    return false;
  }
}

export function getConfiguredModel(): string {
  return readConfig().model;
}

export function getOllamaHost(): string {
  return readConfig().host;
}