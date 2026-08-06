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
function cleanSnippet(snippet: string, maxChars = 320): string {
  const cleaned = snippet.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxChars) return cleaned;
  const cut = cleaned.slice(0, maxChars);
  const lastBoundary = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(' '));
  return lastBoundary > 80 ? cut.slice(0, lastBoundary + 1) : `${cut}…`;
}

const BASIC_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'for', 'to', 'in', 'on', 'at',
  'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'it', 'this', 'that', 'these', 'those', 'i', 'you', 'me', 'my', 'your', 'we',
  'us', 'our', 'they', 'them', 'their', 'he', 'she', 'his', 'her', 'do', 'does',
  'did', 'can', 'could', 'will', 'would', 'should', 'may', 'might', 'not', 'no',
  'yes', 'so', 'just', 'very', 'really', 'more', 'most', 'about', 'into', 'over',
  'after', 'before', 'then', 'now', 'has', 'have', 'had', 'than', 'too',
]);

/** Content tokens of the query (stopwords removed) for relevance scoring. */
function queryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !BASIC_STOPWORDS.has(t));
}

/** Split text into cleaned sentences (handles pipe-separated table fragments). */
function splitSentences(text: string): string[] {
  return text
    .replace(/\|/g, '. ')
    .replace(/([.!?])\s+/g, '$1\n')
    .split('\n')
    .map(cleanSentence)
    .filter((s) => s.length > 0);
}

/** Strip markdown/formatting noise from a sentence so it reads naturally. */
function cleanSentence(s: string): string {
  return s
    .replace(/^#+\s*/, '')
    .replace(/#+\s*$/, '')
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/^\[\d+\]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface EvidenceSentence {
  text: string;
  sourceIndex: number;
  domain: string;
  url: string;
  score: number;
}

/** Words that usually open a step/instruction sentence. */
const STEP_CUES = new Set([
  'step', 'first', 'second', 'third', 'next', 'then', 'finally', 'start',
  'begin', 'choose', 'pick', 'create', 'set', 'add', 'design', 'build',
  'launch', 'plan', 'use', 'write', 'make', 'decide', 'register', 'buy',
  'install', 'connect', 'publish', 'setup', 'set-up',
]);

function scoreSentence(s: string, tokens: string[], idx: number, total: number): number {
  let score = 0;
  score += Math.max(0, (total - idx) / total) * 2;
  const lower = s.toLowerCase();
  let hits = 0;
  for (const t of tokens) if (lower.includes(t)) hits += 1;
  score += hits * 1.6;
  const len = s.length;
  if (len < 28) score -= 3;
  if (len > 280) score -= 1;
  if (/\d/.test(s)) score += 0.3;
  if (lower.includes('...') || lower.includes('click here') || lower.includes('read more')) score -= 4;
  return score;
}

/** Extract, score, and de-duplicate the strongest sentences across sources. */
function buildEvidence(results: ScoredSearchResult[]): EvidenceSentence[] {
  const tokens = queryTokens(results.map((r) => r.title).join(' ') || '');
  const out: EvidenceSentence[] = [];
  const seen = new Set<string>();

  for (const r of results) {
    const sourceIdx = results.indexOf(r);
    const sentences = splitSentences(cleanSnippet(r.snippet));
    sentences.forEach((s, idx) => {
      const norm = s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
      if (!norm || norm.length < 24) return;
      if (seen.has(norm)) return;
      seen.add(norm);
      out.push({
        text: s,
        sourceIndex: sourceIdx,
        domain: r.domain || r.title,
        url: r.url,
        score: scoreSentence(s, tokens, idx, sentences.length) + r.overallScore * 3,
      });
    });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, 10);
}

type QueryIntent = 'how-to' | 'what-is' | 'why' | 'general';

function detectIntent(query: string): QueryIntent {
  const q = query.toLowerCase();
  if (/(how do i|how can i|how to|help me|guide|steps|tips|tutorial|walkthrough)/.test(q)) return 'how-to';
  if (/(what is|what are|define|explain|meaning of)/.test(q)) return 'what-is';
  if (/^why\b/.test(q)) return 'why';
  return 'general';
}

/** A short, natural rephrase of the user's topic for the opening line. */
function friendlyTopic(query: string): string {
  let q = query.trim().replace(/[.!?]+$/, '');
  // Cut off trailing request clauses ("Help me…", "Can you…").
  q = q.replace(/\.\s*(help me|can you|could you)[\s\S]*$/i, '');
  q = q.replace(/^(i want to|i need to|help me|please|can you|could you|how do i|how can i|how to)\s+/i, '');

  const verbMatch = q.match(/^(build|make|create|start|set up|setup|plan)\s*(.+)$/i);
  if (verbMatch) {
    const gerunds: Record<string, string> = {
      build: 'building', make: 'making', create: 'creating', start: 'starting',
      'set up': 'setting up', setup: 'setting up', plan: 'planning',
    };
    const verb = verbMatch[1].toLowerCase();
    return `${gerunds[verb] || verb} ${verbMatch[2].trim()}`;
  }

  const clean = q.replace(/\s+/g, ' ').trim();
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : 'your website';
}

function joinClause(sentence: string): string {
  return sentence.charAt(0).toLowerCase() === sentence.charAt(0) ? sentence.charAt(0).toUpperCase() + sentence.slice(1) : sentence;
}

/** Deterministically synthesize a conversational, cited answer from evidence. */
function assembleAnswer(query: string, results: ScoredSearchResult[]): string {
  if (results.length === 0) {
    return (
      `I couldn't find reliable sources for "${query}".\n\n` +
      'No search results were returned, so I can\'t give an evidence-backed answer to this. ' +
      'Try rephrasing the question, or adding more context, and I\'ll search again.'
    );
  }

  const intent = detectIntent(query);
  const evidence = buildEvidence(results);
  const topic = friendlyTopic(query);
  const lines: string[] = [];

  // ── Intro ──────────────────────────────────────────────────────────────
  if (intent === 'how-to') {
    lines.push(
      `Great question. ${topic} is very doable when you break it into clear, ordered steps — ` +
      `and the sources below line up on the same approach.\n`,
    );
  } else if (intent === 'what-is') {
    lines.push(`Here's a straightforward explanation of ${topic}, based on the most reliable sources I found.\n`);
  } else if (intent === 'why') {
    lines.push(`Here's the short answer, backed by the sources below.\n`);
  } else {
    lines.push(`Here's a practical summary of ${topic}, put together from reliable sources.\n`);
  }

  // ── Step-by-step plan (how-to) ─────────────────────────────────────────
  let detail: EvidenceSentence[] = [];
  if (intent === 'how-to') {
    const stepSentences = evidence.filter((e) => {
      const firstWord = e.text.toLowerCase().split(/\s+/)[0].replace(/[^a-z'-]/g, '');
      return STEP_CUES.has(firstWord) || /^\d+[.)]/.test(e.text) || /\b(step|steps)\b/i.test(e.text);
    });

    const plan = (stepSentences.length >= 2 ? stepSentences : evidence).slice(0, 6);
    if (plan.length > 0) {
      lines.push('**Step-by-step plan**\n');
      plan.forEach((e, i) => {
        const cite = `[${e.sourceIndex + 1}]`;
        lines.push(`${i + 1}. ${e.text} ${cite}`);
      });
      lines.push('');
    }

    const used = new Set(plan);
    detail = evidence.filter((e) => !used.has(e)).slice(0, 2);
    if (detail.length > 0) {
      detail.forEach((e) => used.add(e));
      lines.push('**A few important details**\n');
      detail.forEach((e) => {
        lines.push(`- ${e.text} [${e.sourceIndex + 1}]`);
      });
      lines.push('');
    }
  } else {
    // ── Key points (non how-to) ──────────────────────────────────────────
    const points = evidence.slice(0, 4);
    lines.push('**Key points**\n');
    points.forEach((e) => {
      lines.push(`- ${e.text} [${e.sourceIndex + 1}]`);
    });
    lines.push('');
  }

  // ── Bottom line ────────────────────────────────────────────────────────
  const usedSet = new Set(intent === 'how-to' ? detail : evidence.slice(0, 4));
  const bottom = evidence.find((e) => !usedSet.has(e)) || evidence[0];
  if (bottom) {
    lines.push(`**Bottom line:** ${joinClause(bottom.text)} [${bottom.sourceIndex + 1}]\n`);
  }

  // ── Sources ────────────────────────────────────────────────────────────
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
        ? `Retrieved and ranked ${results.length} sources, then synthesized a cited answer.`
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
