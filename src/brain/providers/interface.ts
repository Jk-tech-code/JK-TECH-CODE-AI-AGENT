/**
 * LLM provider abstraction for the JK-TECH-CODE Brain.
 *
 * A provider is any backend that can complete and stream chat messages:
 *   • GeminiProvider    — Google Gemini (cloud; default on Vercel)
 *   • OllamaProvider    — local development (Ollama + Qwen3)
 *   • OpenAICompatProvider — OpenAI (native)
 *   • GroqProvider      — Groq (fast inference, OpenAI-compatible API)
 *   • OpenRouterProvider — OpenRouter (unified gateway, OpenAI-compatible)
 *   • TogetherProvider  — Together AI (OpenAI-compatible)
 *   • AnthropicProvider — Anthropic Claude (Messages API)
 *
 * Every provider is non-throwing in a controlled way: availability is reported
 * via `check()`, and request failures surface as `ProviderError` with a
 * human-friendly message and a `retryable` flag so the Brain can present a
 * friendly message + Retry affordance instead of a blank response.
 */

/** Supported provider keys, driven by `LLM_PROVIDER`. */
export type LLMProviderName =
  | 'gemini'
  | 'ollama'
  | 'openai'
  | 'groq'
  | 'openrouter'
  | 'anthropic'
  | 'together';

/** All provider keys the Brain can select (registry order). */
export const LLM_PROVIDER_NAMES: readonly LLMProviderName[] = [
  'gemini',
  'ollama',
  'openai',
  'groq',
  'openrouter',
  'anthropic',
  'together',
];

/** True when the string is a known provider key. */
export function isLLMProviderName(value: string): value is LLMProviderName {
  return (LLM_PROVIDER_NAMES as readonly string[]).includes(value);
}

/** A single chat message in the Brain's provider-agnostic format. */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Sampling / generation options forwarded to the provider. */
export interface LLMOptions {
  temperature?: number;
  topP?: number;
  /** Top-K sampling; 0 disables. */
  topK?: number;
  maxTokens?: number;
  thinking?: boolean;
  /**
   * Override the provider used for this request.
   * Defaults to the `LLM_PROVIDER` env var (or the stored Brain setting).
   */
  provider?: LLMProviderName;
  /** Override the model for this request. Defaults to the provider's env model. */
  model?: string;
  /**
   * Allow automatic fallback to the next provider in the chain when this
   * request fails with a retryable error. Defaults to `LLM_FALLBACK_ENABLED`.
   */
  fallback?: boolean;
}

/** Streaming chunk exposed uniformly to the Brain. */
export interface LLMStreamChunk {
  /** Actual final content to show the user. */
  content?: string;
  /** Hidden/orchestrator-level thinking (shown as "Thinking…"). */
  thinking?: string;
}

/** Result of a non-streaming completion. */
export interface LLMCompleteResult {
  content: string;
  thinking: string;
  modelUsed: string;
  latencyMs: number;
}

/** Availability status of a provider — safe to call repeatedly. */
export interface ProviderStatus {
  provider: LLMProviderName;
  available: boolean;
  model: string;
  /** Human-friendly reason when unavailable. */
  reason?: string;
}

/** Provider metadata helper result. */
export interface ProviderModelInfo {
  provider: LLMProviderName;
  model: string;
  host?: string;
  models: Array<{ name: string }>;
}

/**
 * Raised when a provider call fails. `retryable=false` means retrying will not
 * help (e.g. invalid API key); `retryable=true` means transient (rate limit,
 * outage) and safe to retry.
 */
export class ProviderError extends Error {
  constructor(message: string, public retryable: boolean = true) {
    super(message);
    this.name = 'ProviderError';
  }
}

/**
 * The contract every LLM backend implements. The Brain never talks to a
 * specific vendor — it calls the active provider through this interface.
 */
export interface LLMProvider {
  readonly name: LLMProviderName;

  /** Non-throwing availability probe for the active provider. */
  check(): Promise<ProviderStatus>;

  /** Non-streaming completion. Throws ProviderError on failure. */
  complete(messages: LLMMessage[], options?: LLMOptions): Promise<LLMCompleteResult>;

  /** Streaming completion. Throws ProviderError on failure. */
  stream(messages: LLMMessage[], options?: LLMOptions): AsyncGenerator<LLMStreamChunk>;

  /** Best-effort metadata (model, host, available models). Never throws. */
  getInfo(): Promise<ProviderModelInfo>;
}
