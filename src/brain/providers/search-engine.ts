/**
 * Deterministic Search-Engine provider — the Brain's generation backend.
 *
 * Replaces all external LLM integrations (OpenAI, Anthropic, Groq, OpenRouter,
 * Together, Gemini, Ollama) with a single deterministic, evidence-based engine:
 *
 *   1. Extract the user's query from the last user message.
 *   2. Understand the user's real goal (intent + subject analysis).
 *   3. Decide whether web search is needed at all — greetings and identity
 *      questions are answered conversationally with zero external calls.
 *   4. When search is needed, run the ranked + deduped search pipeline.
 *   5. Synthesize a premium, structured answer from the evidence — never a
 *      dump of snippets — with expert reasoning, recommendations, and a
 *      Sources list only at the end.
 *
 * The result surface (`complete` / `stream` / `check` / `getInfo`) matches the
 * `LLMProvider` contract, so the Brain pipeline and its consumers are
 * unchanged. Generation is reproducible: identical queries with the same
 * search results produce identical answers.
 */
import { createLogger } from '@/lib/logging/logger';
import { searchAggregator } from '@/lib/core/search';
import {
  analyzeQuery,
  buildEvidence,
  composeAnswer,
  composeNoSearch,
} from './answer-composer';
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

const searchLogger = createLogger('brain:search-engine');

const PROVIDER_NAME: LLMProviderName = 'search';
const MODEL_NAME = 'search-engine';

const DEFAULT_NUM_RESULTS = 5;

/** A search engine API key is required for generation to be possible. */
function hasSearchKey(): boolean {
  return Boolean(process.env.TAVILY_API_KEY || process.env.SERPAPI_API_KEY);
}

/** Pull the user query out of the message list (last user message). */
function extractQuery(messages: LLMMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'user' && msg.content.trim().length > 0) {
      // Strip any injected [CONTEXT] block so we search the real question.
      return msg.content.split('[CONTEXT]')[0].trim();
    }
  }
  return '';
}

export class SearchEngineProvider implements LLMProvider {
  readonly name: LLMProviderName = PROVIDER_NAME;

  /** Non-throwing availability probe. */
  async check(): Promise<ProviderStatus> {
    if (!hasSearchKey()) {
      return {
        provider: PROVIDER_NAME,
        available: false,
        model: MODEL_NAME,
        reason: 'No search engine configured. Add TAVILY_API_KEY or SERPAPI_API_KEY to .env.local.',
      };
    }
    return { provider: PROVIDER_NAME, available: true, model: MODEL_NAME };
  }

  /** Non-streaming completion — deterministic, evidence-based. */
  async complete(messages: LLMMessage[], options: LLMOptions = {}): Promise<LLMCompleteResult> {
    const start = Date.now();

    const query = extractQuery(messages);
    if (!query) {
      throw new ProviderError('No user message provided to the search engine.', false);
    }

    const analysis = analyzeQuery(query);

    // Greetings, thanks, and identity questions answer conversationally — no search.
    if (!analysis.needsSearch) {
      const content = composeNoSearch(analysis);
      return {
        content,
        thinking: 'No web search needed — answered conversationally.',
        modelUsed: MODEL_NAME,
        latencyMs: Date.now() - start,
      };
    }

    if (!hasSearchKey()) {
      throw new ProviderError(
        'No search engine configured. Add TAVILY_API_KEY or SERPAPI_API_KEY to .env.local.',
        false,
      );
    }

    const numResults = typeof options.maxTokens === 'number' && options.maxTokens > 0
      ? Math.max(2, Math.min(10, Math.round(options.maxTokens / 100)))
      : DEFAULT_NUM_RESULTS;

    searchLogger.info('Search-engine completion', {
      query: query.slice(0, 80),
      intent: analysis.intent,
      numResults,
    });

    const results = await searchAggregator.search({
      query,
      numResults,
      engines: (options as { engines?: Array<'tavily' | 'serpapi'> }).engines,
    });

    if (results.length === 0) {
      return {
        content: composeAnswer(analysis, [], results),
        thinking: 'Search returned no results — reporting insufficiency.',
        modelUsed: MODEL_NAME,
        latencyMs: Date.now() - start,
      };
    }

    const evidence = buildEvidence(results);
    const content = composeAnswer(analysis, evidence, results);

    return {
      content,
      thinking: `Retrieved and ranked ${results.length} sources, then synthesized a ${analysis.intent} answer.`,
      modelUsed: MODEL_NAME,
      latencyMs: Date.now() - start,
    };
  }

  /** Streaming completion — same deterministic content, emitted in chunks. */
  async *stream(messages: LLMMessage[], options: LLMOptions = {}): AsyncGenerator<LLMStreamChunk> {
    const result = await this.complete(messages, options);

    if (result.thinking) {
      yield { thinking: result.thinking };
    }

    // Emit the answer a paragraph at a time so the UI streams live.
    const paragraphs = result.content.split(/(\n\s*\n)/);
    let buffer = '';
    for (const part of paragraphs) {
      buffer += part;
      if (buffer.length >= 60) {
        yield { content: buffer };
        buffer = '';
      }
    }
    if (buffer.length > 0) {
      yield { content: buffer };
    }
  }

  /** Best-effort metadata (model, host, available "models"). */
  async getInfo(): Promise<ProviderModelInfo> {
    return {
      provider: PROVIDER_NAME,
      model: MODEL_NAME,
      models: [{ name: MODEL_NAME }],
    };
  }
}

/** Shared singleton — the Brain selects it as its single generation engine. */
export const searchEngineProvider = new SearchEngineProvider();
