/**
 * Provider selection layer for the JK-TECH-CODE Brain.
 *
 * Picks the active LLM backend from `LLM_PROVIDER`:
 *   • "ollama" (default) — local Ollama + Qwen3. Falls back gracefully to the
 *     existing OpenAI-compatible provider only when a model key is configured,
 *     otherwise surfaces a friendly "Local AI unavailable" error.
 *   • "openai" — the pre-existing OpenAI-compatible provider.
 *
 * Every method is non-throwing and returns structured results so the Brain
 * pipeline can present a friendly message and a Retry affordance without
 * ever crashing the application.
 */
import {
  streamChatRaw,
  chatComplete,
  isHealthy,
  listModels,
  isModelAvailable,
  getConfiguredModel,
  getOllamaHost,
  OllamaUnavailableError,
  ModelNotFoundError,
} from './ollama';
import { createLogger } from '@/lib/logging/logger';

const llmLogger = createLogger('brain:llm');

export type LLMProviderName = 'ollama' | 'openai';

export interface ProviderStatus {
  provider: LLMProviderName;
  available: boolean;
  model: string;
  /** Human-friendly reason when unavailable. */
  reason?: string;
}

/** Streaming chunk exposed uniformly to the Brain. */
export interface LLMStreamChunk {
  /** Actual final content to show the user. */
  content?: string;
  /** Hidden/orchestrator-level thinking (shown as "Thinking…"). */
  thinking?: string;
}

export interface LLMCompleteResult {
  content: string;
  thinking: string;
  modelUsed: string;
  latencyMs: number;
}

export interface LLMOptions {
  temperature?: number;
  topP?: number;
  /** Top-K sampling; 0 disables. */
  topK?: number;
  maxTokens?: number;
  thinking?: boolean;
}

export class ProviderError extends Error {
  constructor(message: string, public retryable: boolean = true) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** Returns the active provider name (env-driven). */
export function activeProvider(): LLMProviderName {
  return (process.env.LLM_PROVIDER || 'ollama').toLowerCase() === 'openai'
    ? 'openai'
    : 'ollama';
}

/** Status of the active provider — safe to call repeatedly. */
export async function checkProvider(): Promise<ProviderStatus> {
  const provider = activeProvider();

  if (provider === 'ollama') {
    const model = getConfiguredModel();
    const reachable = await isHealthy();
    if (!reachable) {
      return {
        provider,
        available: false,
        model,
        reason: 'Local AI is currently unavailable. Make sure Ollama is running.',
      };
    }
    return { provider, available: true, model };
  }

  // openai (compat) provider
  const model = process.env.OPENAI_MODEL || 'gpt-4.1';
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return { provider, available: false, model, reason: 'OPENAI_API_KEY is not configured.' };
  }
  return { provider, available: true, model };
}

/** Non-streaming completion through the active provider. */
export async function complete(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: LLMOptions = {},
): Promise<LLMCompleteResult> {
  const provider = activeProvider();

  if (provider === 'ollama') {
    try {
      const result = await chatComplete(messages, {
        temperature: options.temperature,
        topP: options.topP,
        topK: options.topK,
        maxTokens: options.maxTokens,
        thinking: options.thinking,
      });
      return {
        content: result.content,
        thinking: result.thinking,
        modelUsed: result.modelUsed,
        latencyMs: result.latencyMs,
      };
    } catch (err) {
      if (err instanceof ModelNotFoundError) {
        throw new ProviderError(err.message, false);
      }
      if (err instanceof OllamaUnavailableError) {
        throw new ProviderError('Local AI is currently unavailable.', true);
      }
      throw new ProviderError('Local AI is currently unavailable.', true);
    }
  }

  // openai fallback
  // Lazy-import to avoid loading provider module when unused.
  try {
    const { default: getOpenAIResult } = await import('./openai-compat');
    return await getOpenAIResult(messages, options);
  } catch {
    throw new ProviderError('LLM provider is not configured.', true);
  }
}

/**
 * Stream a completion through the active provider.
 * Yields `{ content? }` and `{ thinking? }` chunks in real time.
 */
export async function* stream(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: LLMOptions = {},
): AsyncGenerator<LLMStreamChunk> {
  const provider = activeProvider();

  if (provider === 'ollama') {
    try {
      for await (const chunk of streamChatRaw(messages, {
        temperature: options.temperature,
        topP: options.topP,
        topK: options.topK,
        maxTokens: options.maxTokens,
        thinking: options.thinking,
      })) {
        yield {
          content: chunk.content || undefined,
          thinking: chunk.thinking || undefined,
        };
      }
      return;
    } catch (err) {
      if (err instanceof ModelNotFoundError) {
        throw new ProviderError(err.message, false);
      }
      throw new ProviderError('Local AI is currently unavailable.', true);
    }
  }

  // openai fallback stream
  try {
    const { getOpenAIStream } = await import('./openai-compat');
    yield* getOpenAIStream(messages, options);
  } catch {
    throw new ProviderError('LLM provider is not configured.', true);
  }
}

/** Model metadata helpers, provider-agnostic. */
export async function modelInfo() {
  if (activeProvider() === 'ollama') {
    return { provider: 'ollama' as const, model: getConfiguredModel(), host: getOllamaHost(), models: await listModels() };
  }
  return { provider: 'openai' as const, model: process.env.OPENAI_MODEL || 'gpt-4.1', host: undefined, models: [] };
}

/** Best-effort gather of whether streaming is currently viable. */
export async function streamingAvailable(): Promise<boolean> {
  const status = await checkProvider();
  return status.available;
}

export { isHealthy, isModelAvailable, listModels, getConfiguredModel, getOllamaHost };
export type { OllamaModelInfo, OllamaChatMessage } from './ollama';