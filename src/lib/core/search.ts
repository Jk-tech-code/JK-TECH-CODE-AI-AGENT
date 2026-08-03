import { AppError } from '@/lib/error/handler';
import { createLogger } from '@/lib/logging/logger';
import type {
  SearchQuery,
  SearchResult,
  ScoredSearchResult,
  SearchEngine,
  CredibilityAssessment,
  SourceType,
} from './types';

const searchLogger = createLogger('search');

const SOURCE_TRUST_RANKING: Record<string, number> = {
  'edu': 0.95,
  'gov': 0.95,
  'who.int': 0.95,
  'nature.com': 0.95,
  'sciencedirect.com': 0.92,
  'ieee.org': 0.92,
  'acm.org': 0.92,
  'arxiv.org': 0.85,
  'reuters.com': 0.88,
  'ap.org': 0.88,
  'bbc.com': 0.85,
  'npr.org': 0.85,
  'wsj.com': 0.85,
  'bloomberg.com': 0.82,
  'github.com': 0.75,
  'wikipedia.org': 0.78,
  'medium.com': 0.45,
  'substack.com': 0.40,
};

const ENGINE_RANKING: Record<SearchEngine, number> = {
  tavily: 0.85,
  brave: 0.80,
  serpapi: 0.75,
  bing: 0.70,
  searxng: 0.60,
};

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

interface SearchRawItem {
  title?: string;
  snippet?: string;
  url?: string;
}

export interface SearchErrorReport {
  engine: SearchEngine;
  message: string;
  type: 'network' | 'permission' | 'timeout' | 'api' | 'empty' | 'unknown';
}

const SUPPORTED_ENGINES: SearchEngine[] = ['tavily', 'serpapi'];

export class SearchAggregator {
  private engineErrors: SearchErrorReport[] = [];

  /**
   * Validate that at least one search engine API key is configured.
   * Safe to call multiple times. Throws AppError 503 when none are set.
   */
  async init(): Promise<void> {
    const hasTavily = !!process.env.TAVILY_API_KEY;
    const hasSerpapi = !!process.env.SERPAPI_API_KEY;
    if (!hasTavily && !hasSerpapi) {
      throw new AppError(
        'No search engine configured. Add TAVILY_API_KEY or SERPAPI_API_KEY to .env.local.',
        503,
        'SEARCH_NOT_CONFIGURED',
      );
    }
  }

  async search(query: SearchQuery): Promise<ScoredSearchResult[]> {
    this.engineErrors = [];

    if (!query.query || query.query.trim().length === 0) {
      searchLogger.warn('Empty search query received');
      return [];
    }

    const allResults = await this.executeParallelSearch(query);

    if (allResults.length === 0 && this.engineErrors.length > 0) {
      searchLogger.warn('All search engines failed', {
        errors: this.engineErrors.map(e => `${e.engine}: ${e.type} - ${e.message}`),
      });
    }

    const scored = this.scoreAndRank(allResults);
    const top = scored.slice(0, query.numResults || 10);

    searchLogger.info('Search completed', {
      query: query.query.slice(0, 80),
      enginesAttempted: (query.engines || SUPPORTED_ENGINES).length,
      totalResults: allResults.length,
      returnedResults: top.length,
      errors: this.engineErrors.length,
    });

    return top;
  }

  getErrors(): SearchErrorReport[] {
    return this.engineErrors;
  }

  private async executeParallelSearch(query: SearchQuery): Promise<SearchResult[]> {
    const engines = query.engines || SUPPORTED_ENGINES;
    const results: SearchResult[] = [];

    for (const engine of engines) {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          if (attempt > 0) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
          }
          const engineResults = await this.searchSingleEngine(
            query.query, engine, query.numResults || 5, query.recencyDays,
          );
          results.push(...engineResults);
          lastError = null;
          break; // success, exit retry loop
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          const message = lastError.message;

          if (attempt < MAX_RETRIES) {
            searchLogger.warn(`Search engine ${engine} attempt ${attempt + 1} failed, retrying`, {
              engine,
              attempt: attempt + 1,
              error: message,
            });
          }
        }
      }

      if (lastError) {
        const message = lastError.message;
        const type = this.classifyError(message);
        searchLogger.error(`Search engine ${engine} failed after ${MAX_RETRIES + 1} attempts`, lastError, {
          engine,
          type,
        });
        this.engineErrors.push({ engine, message, type });
      }
    }

    return results;
  }

  private classifyError(message: string): SearchErrorReport['type'] {
    const lower = message.toLowerCase();
    if (lower.includes('network') || lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('fetch failed')) return 'network';
    if (lower.includes('permission') || lower.includes('forbidden') || lower.includes('unauthorized') || lower.includes('api key') || lower.includes('not configured')) return 'permission';
    if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('econnreset')) return 'timeout';
    if (lower.includes('rate limit') || lower.includes('too many') || lower.includes('quota') || lower.includes('4') || lower.includes('5')) return 'api';
    return 'unknown';
  }

  private async searchSingleEngine(
    query: string,
    engine: SearchEngine,
    num: number,
    recencyDays?: number,
  ): Promise<SearchResult[]> {
    const startTime = Date.now();
    const count = Math.min(num, 10);

    let raw: SearchRawItem[];
    if (engine === 'tavily') {
      raw = await this.searchTavily(query, count, recencyDays);
    } else if (engine === 'serpapi') {
      raw = await this.searchSerpapi(query, count);
    } else {
      throw new Error(`Search engine ${engine} is not configured. Supported: ${SUPPORTED_ENGINES.join(', ')}`);
    }

    const latencyMs = Date.now() - startTime;

    if (!raw.length) {
      this.engineErrors.push({ engine, message: 'No results returned', type: 'empty' });
      return [];
    }

    searchLogger.info(`Engine ${engine} returned ${raw.length} results`, {
      engine,
      resultCount: raw.length,
      latencyMs,
    });

    return raw.map((r: SearchRawItem) => ({
      title: r.title || '',
      snippet: r.snippet || '',
      url: r.url || '',
      engine,
      domain: this.extractDomain(r.url || ''),
    }));
  }

  private async searchTavily(query: string, num: number, recencyDays?: number): Promise<SearchRawItem[]> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) throw new AppError('TAVILY_API_KEY is not configured.', 503, 'SEARCH_NOT_CONFIGURED');

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: num,
        search_depth: 'basic',
        topic: 'general',
        ...(recencyDays ? { days: recencyDays } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(`Tavily search failed with status ${response.status}`);
    }

    const data = await response.json() as { results?: Array<{ title?: string; url?: string; content?: string }> };
    return (data.results || []).map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
    }));
  }

  private async searchSerpapi(query: string, num: number): Promise<SearchRawItem[]> {
    const apiKey = process.env.SERPAPI_API_KEY;
    if (!apiKey) throw new AppError('SERPAPI_API_KEY is not configured.', 503, 'SEARCH_NOT_CONFIGURED');

    const params = new URLSearchParams({
      engine: 'google',
      q: query,
      api_key: apiKey,
      num: String(num),
    });
    const url = `https://serpapi.com/search.json?${params.toString()}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`SerpAPI search failed with status ${response.status}`);
    }

    const data = await response.json() as { organic_results?: Array<{ title?: string; link?: string; snippet?: string }> };
    return (data.organic_results || []).map(r => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet,
    }));
  }

  private scoreAndRank(results: SearchResult[]): ScoredSearchResult[] {
    const seen = new Set<string>();
    const unique: SearchResult[] = [];

    for (const r of results) {
      const key = r.url;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(r);
      }
    }

    return unique
      .map(r => {
        const credibility = this.assessCredibility(r);
        const freshness = this.assessFreshness(r);
        const sourceTrust = this.assessSourceTrust(r);
        const overallScore = this.computeOverallScore(credibility, freshness, sourceTrust);

        return {
          ...r,
          credibilityScore: credibility.score,
          freshnessScore: freshness,
          sourceTrustScore: sourceTrust,
          overallScore,
        };
      })
      .sort((a, b) => b.overallScore - a.overallScore);
  }

  private assessCredibility(result: SearchResult): CredibilityAssessment {
    const domain = result.domain || '';
    const knownTrust = Object.entries(SOURCE_TRUST_RANKING).find(([key]) =>
      domain.endsWith(key)
    );

    const domainTrust = knownTrust ? knownTrust[1] : 0.4;
    const engineTrust = ENGINE_RANKING[result.engine] || 0.5;
    const snippetQuality = result.snippet.length > 100 ? 0.8 : result.snippet.length > 50 ? 0.6 : 0.4;

    return {
      score: (domainTrust * 0.4 + engineTrust * 0.3 + snippetQuality * 0.3),
      factors: {
        domainTrust,
        freshnessDays: 0,
        sourceType: this.classifySource(domain),
        citationCount: 0,
        factualConsistency: snippetQuality,
      },
    };
  }

  private assessFreshness(_result: SearchResult): number {
    return 0.7;
  }

  private assessSourceTrust(result: SearchResult): number {
    const domain = result.domain || '';
    const known = Object.entries(SOURCE_TRUST_RANKING).find(([key]) =>
      domain.endsWith(key)
    );
    return known ? known[1] : 0.4;
  }

  private computeOverallScore(credibility: CredibilityAssessment, freshness: number, sourceTrust: number): number {
    return credibility.score * 0.4 + freshness * 0.3 + sourceTrust * 0.3;
  }

  private classifySource(domain: string): SourceType {
    if (domain.endsWith('.edu') || domain.includes('arxiv') || domain.includes('scholar')) return 'academic';
    if (domain.endsWith('.gov')) return 'government';
    if (domain.includes('wikipedia') || domain.includes('who.int') || domain.includes('un.org')) return 'official';
    if (domain.includes('reuters') || domain.includes('bbc') || domain.includes('ap.org') || domain.includes('npr')) return 'news';
    if (domain.includes('github') || domain.includes('docs')) return 'documentation';
    if (domain.includes('medium') || domain.includes('substack') || domain.includes('blog')) return 'blog';
    if (domain.includes('reddit') || domain.includes('twitter') || domain.includes('facebook')) return 'social';
    if (domain.includes('stackoverflow') || domain.includes('quora')) return 'forum';
    return 'unknown';
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return '';
    }
  }
}

export const searchAggregator = new SearchAggregator();
