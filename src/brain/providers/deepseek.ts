/**
 * DeepSeek LLM provider — the Brain's real language-model backend.
 *
 * DeepSeek exposes an OpenAI-compatible chat-completions API
 * (`https://api.deepseek.com/chat/completions`), so this provider talks to it
 * over plain `fetch` with no SDK dependency. When `DEEPSEEK_API_KEY` is set,
 * this becomes the Brain's primary generation engine and produces full,
 * natural ChatGPT-quality answers. When it isn't set (or a call fails), the
 * provider manager falls back to the deterministic Search Engine.
 *
 * Models: `deepseek-chat` (DeepSeek-V3) and `deepseek-reasoner` (DeepSeek-R1).
 * The `deepseek-reasoner` model streams hidden chain-of-thought as
 * `reasoning_content`; this provider surfaces those as `thinking` chunks.
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

const deepseekLogger = createLogger('brain:deepseek');

const PROVIDER_NAME: LLMProviderName = 'deepseek';
const BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const DEFAULT_MAX_TOKENS = 2048;

function apiKey(): string {
  return process.env.DEEPSEEK_API_KEY || '';
}

function hasKey(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

function resolveModel(options: LLMOptions): string {
  return options.model && options.model.trim() ? options.model : DEFAULT_MODEL;
}

function normalizeMessages(messages: LLMMessage[]): LLMMessage[] {
  const out = messages.filter((m) => m.content && m.content.trim().length > 0);
  if (out.length === 0) {
    throw new ProviderError('No non-empty messages to send to the model.', false);
  }
  return out;
}

interface DeepSeekDelta {
  content?: string | null;
  reasoning_content?: string | null;
}

interface DeepSeekChoice {
  message?: { content?: string | null; reasoning_content?: string | null };
  delta?: DeepSeekDelta;
  finish_reason?: string | null;
}

interface DeepSeekErrorBody {
  error?: { message?: string };
}

function retryableFromStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function requestBody(
  messages: LLMMessage[],
  options: LLMOptions,
  stream: boolean,
): Promise<Response> {
  if (!hasKey()) {
    throw new ProviderError(
      'DEEPSEEK_API_KEY is not configured. Add it to .env.local.',
      false,
    );
  }

  const body: Record<string, unknown> = {
    model: resolveModel(options),
    messages: normalizeMessages(messages),
    stream,
    max_tokens: options.maxTokens && options.maxTokens > 0 ? options.maxTokens : DEFAULT_MAX_TOKENS,
  };
  if (typeof options.temperature === 'number') body.temperature = options.temperature;

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let reason: string;
    try {
      const errBody = (await res.json()) as DeepSeekErrorBody;
      reason = errBody?.error?.message || `DeepSeek API returned HTTP ${res.status}.`;
    } catch {
      reason = `DeepSeek API returned HTTP ${res.status}.`;
    }
    throw new ProviderError(reason, retryableFromStatus(res.status));
  }

  return res;
}

export class DeepSeekProvider implements LLMProvider {
  readonly name: LLMProviderName = PROVIDER_NAME;

  /** Non-throwing availability probe. */
  async check(): Promise<ProviderStatus> {
    if (!hasKey()) {
      return {
        provider: PROVIDER_NAME,
        available: false,
        model: DEFAULT_MODEL,
        reason: 'DEEPSEEK_API_KEY is not set. Add it to .env.local to enable ChatGPT-quality replies.',
      };
    }
    return { provider: PROVIDER_NAME, available: true, model: DEFAULT_MODEL };
  }

  /** Non-streaming completion. */
  async complete(messages: LLMMessage[], options: LLMOptions = {}): Promise<LLMCompleteResult> {
    const start = Date.now();
    const res = await requestBody(messages, options, false);

    let data: { choices?: DeepSeekChoice[]; model?: string } = {};
    try {
      data = (await res.json()) as { choices?: DeepSeekChoice[]; model?: string };
    } catch {
      throw new ProviderError('DeepSeek returned an unreadable response.', true);
    }

    const choice = data.choices && data.choices[0];
    const content = (choice?.message?.content || '').trim();
    const thinking = (choice?.message?.reasoning_content || '').trim();

    if (!content) {
      throw new ProviderError('DeepSeek returned an empty reply. Please try again.', true);
    }

    deepseekLogger.info('DeepSeek completion', {
      model: data?.model || resolveModel(options),
      latencyMs: Date.now() - start,
    });

    return {
      content,
      thinking: thinking || '',
      modelUsed: `deepseek:${data?.model || resolveModel(options)}`,
      latencyMs: Date.now() - start,
    };
  }

  /** Streaming completion — emits SSE deltas as content/thinking. */
  async *stream(messages: LLMMessage[], options: LLMOptions = {}): AsyncGenerator<LLMStreamChunk> {
    const res = await requestBody(messages, options, true);
    if (!res.body) {
      throw new ProviderError('DeepSeek returned no stream body.', true);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let done = false;

    try {
      while (!done) {
        const { done: readerDone, value } = await reader.read();
        if (readerDone) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);

          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          if (payload === '[DONE]') {
            done = true;
            break;
          }

          let json: { choices?: DeepSeekChoice[] };
          try {
            json = JSON.parse(payload) as { choices?: DeepSeekChoice[] };
          } catch {
            continue;
          }

          const delta = json.choices?.[0]?.delta;
          if (!delta) continue;
          if (delta.reasoning_content) {
            yield { thinking: delta.reasoning_content };
          }
          if (delta.content) {
            yield { content: delta.content };
          }
          if (json.choices?.[0]?.finish_reason) {
            done = true;
            break;
          }
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // ignore
      }
    }
  }

  /** Best-effort metadata. */
  async getInfo(): Promise<ProviderModelInfo> {
    return {
      provider: PROVIDER_NAME,
      model: resolveModel({}),
      models: [{ name: 'deepseek-chat' }, { name: 'deepseek-reasoner' }],
    };
  }
}

/** Shared singleton — the provider manager selects it when a key is set. */
export const deepseekProvider = new DeepSeekProvider();