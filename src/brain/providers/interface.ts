/**
 * Brain generation abstraction.
 *
 * The Brain talks to providers through this interface. Today it has two
 * backends:
 *   • `deepseek` — a real language model (DeepSeek, OpenAI-compatible) that
 *     produces full, natural ChatGPT-quality answers when `DEEPSEEK_API_KEY`
 *     is set. This is the preferred engine.
 *   • `search` — a deterministic, evidence-based engine that assembles answers
 *     from ranked web search results (no external LLM). Used as a fallback.
 *
 * Keeping the interface lets the Brain's pipeline and its consumers stay
 * unchanged: the Brain calls `complete`/`stream`/`check` and gets a
 * well-formed answer back.
 */

/** The supported generation backends. */
export type LLMProviderName = 'search' | 'deepseek';

/** All provider keys the Brain can select (registry order, deepseek first). */
export const LLM_PROVIDER_NAMES: readonly LLMProviderName[] = ['deepseek', 'search'];

/** True when the string is a known provider key. */
export function isLLMProviderName(value: string): value is LLMProviderName {
  return value === 'deepseek' || value === 'search';
}

/** A single chat message in the Brain's provider-agnostic format. */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Options forwarded to the generation engine. */
export interface LLMOptions {
  temperature?: number;
  topP?: number;
  /** Top-K sampling; 0 disables. */
  topK?: number;
  /** Approx. result budget for the search engine (2–10, scaled from maxTokens). */
  maxTokens?: number;
  thinking?: boolean;
  /**
   * Override the engine used for this request.
   * Only 'search' is supported; unknown values fall back to 'search'.
   */
  provider?: LLMProviderName;
  /** Reserved for compatibility; ignored by the search engine. */
  model?: string;
  /** Reserved for compatibility; ignored (single engine). */
  fallback?: boolean;
  /** Restrict the search to specific engines when provided. */
  engines?: Array<'tavily' | 'serpapi'>;
  /** Restrict results to a recency window (days); 0 = any date. */
  recencyDays?: number;
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

/** Availability status of the engine — safe to call repeatedly. */
export interface ProviderStatus {
  provider: LLMProviderName;
  available: boolean;
  model: string;
  /** Human-friendly reason when unavailable. */
  reason?: string;
}

/** Engine metadata helper result. */
export interface ProviderModelInfo {
  provider: LLMProviderName;
  model: string;
  host?: string;
  models: Array<{ name: string }>;
}

/**
 * Raised when a generation call fails. `retryable=false` means retrying will
 * not help (e.g. missing search API key); `retryable=true` means transient
 * (rate limit, outage) and safe to retry.
 */
export class ProviderError extends Error {
  constructor(message: string, public retryable: boolean = true) {
    super(message);
    this.name = 'ProviderError';
  }
}

/**
 * The contract every generation backend implements. The Brain never talks to a
 * specific vendor — it calls the active engine through this interface.
 */
export interface LLMProvider {
  readonly name: LLMProviderName;

  /** Non-throwing availability probe. */
  check(): Promise<ProviderStatus>;

  /** Non-streaming completion. Throws ProviderError on failure. */
  complete(messages: LLMMessage[], options?: LLMOptions): Promise<LLMCompleteResult>;

  /** Streaming completion. Throws ProviderError on failure. */
  stream(messages: LLMMessage[], options?: LLMOptions): AsyncGenerator<LLMStreamChunk>;

  /** Best-effort metadata (model, host, available models). Never throws. */
  getInfo(): Promise<ProviderModelInfo>;
}
