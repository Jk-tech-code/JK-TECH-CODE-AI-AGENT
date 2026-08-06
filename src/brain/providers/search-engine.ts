/**
 * Deterministic Search-Engine provider — the Brain's generation backend.
 *
 * Replaces all external LLM integrations (OpenAI, Anthropic, Groq, OpenRouter,
 * Together, Gemini, Ollama) with a single deterministic, evidence-based engine:
 *
 *   1. Extract the user's query from the last user message.
 *   2. Run the web search pipeline (Tavily / SerpAPI) with ranking + dedupe.
 *   3. Build an evidence set from the top snippets (clean, attributed text).
 *   4. Deterministically assemble the answer from that evidence — never
 *      fabricating facts beyond the retrieved snippets.
 *   5. When no sources are found, state the insufficiency instead of guessing.
 *
 * The result surface (`complete` / `stream` / `check` / `getInfo`) matches the
 * `LLMProvider` contract, so the Brain pipeline and its consumers are
 * unchanged. Generation is reproducible: identical queries with the same
 * search results produce identical answers.
 */
import { createLogger } from '@/lib/logging/logger';
import { searchAggregator } from '@/lib/core/search';
import type { ScoredSearchResult } from '@/lib/core/types';
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

/** Trim a snippet to a clean, sentence-boundary-limited excerpt. */
function cleanSnippet(snippet: string, maxChars = 220): string {
  const cleaned = snippet.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxChars) return cleaned;
  const cut = cleaned.slice(0, maxChars);
  const lastBoundary = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(' '));
  return lastBoundary > 80 ? cut.slice(0, lastBoundary + 1) : `${cut}…`;
}

/** Deterministically assemble a Markdown answer from ranked evidence. */
function assembleAnswer(query: string, results: ScoredSearchResult[]): string {
  if (results.length === 0) {
    return (
      `I couldn't find reliable sources for "${query}".\n\n` +
      'No search results were returned, so I can\'t give an evidence-backed answer to this. ' +
      'Try rephrasing the question, or adding more context, and I\'ll search again.'
    );
  }

  const lines: string[] = [];
  lines.push(`Here's what I found about "${query}" from reliable sources:\n`);

  results.slice(0, DEFAULT_NUM_RESULTS).forEach((r, i) => {
    const title = r.title.trim();
    const domain = r.domain ? ` — *${r.domain}*` : '';
    const score = Math.round(r.overallScore * 100);
    lines.push(`${i + 1}. ${title}${domain}`);
    lines.push(`   ${cleanSnippet(r.snippet)}`);
    if (r.url) lines.push(`   Source: ${r.url}`);
    lines.push(`   _(credibility score: ${score}/100)_\n`);
  });

  lines.push('**Sources**');
  results.slice(0, DEFAULT_NUM_RESULTS).forEach((r, i) => {
    if (r.url) lines.push(`${i + 1}. [${r.title || r.domain || 'Source'}](${r.url})`);
  });

  return lines.join('\n');
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
    if (!hasSearchKey()) {
      throw new ProviderError(
        'No search engine configured. Add TAVILY_API_KEY or SERPAPI_API_KEY to .env.local.',
        false,
      );
    }

    const query = extractQuery(messages);
    if (!query) {
      throw new ProviderError('No user message provided to the search engine.', false);
    }

    const numResults = typeof options.maxTokens === 'number' && options.maxTokens > 0
      ? Math.max(2, Math.min(10, Math.round(options.maxTokens / 100)))
      : DEFAULT_NUM_RESULTS;

    searchLogger.info('Search-engine completion', { query: query.slice(0, 80), numResults });

    const results = await searchAggregator.search({
      query,
      numResults,
      engines: (options as { engines?: Array<'tavily' | 'serpapi'> }).engines,
    });

    const content = assembleAnswer(query, results);
    const latencyMs = Date.now() - start;

    return {
      content,
      thinking: results.length > 0
        ? `Retrieved ${results.length} sources, ranked by credibility.`
        : 'Search returned no results — reporting insufficiency.',
      modelUsed: MODEL_NAME,
      latencyMs,
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
