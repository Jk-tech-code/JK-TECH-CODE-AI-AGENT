import { env } from '../config/env';
import { probeHttpWithRetry } from '../utils/http';
import type { ProviderDefinition, ProviderHealth } from '../providers/types';

const CATEGORY = 'search' as const;

function searchHealth(name: string, ok: boolean, latencyMs: number, detail?: string): ProviderHealth {
  return { name, category: CATEGORY, status: ok ? 'connected' : 'failed', latencyMs, detail };
}

/* ── Tavily ── */

const tavilyProvider: ProviderDefinition = {
  name: 'Tavily',
  category: CATEGORY,
  isConfigured: () => env.tavily.apiKey.length > 0,
  check: async () => {
    if (!env.tavily.apiKey) {
      return { name: 'Tavily', category: CATEGORY, status: 'missing', latencyMs: 0 };
    }
    const result = await probeHttpWithRetry('https://api.tavily.com/search', {
      method: 'POST',
      body: JSON.stringify({
        api_key: env.tavily.apiKey,
        query: 'health check',
        max_results: 1,
        search_depth: 'basic',
      }),
    });
    return searchHealth('Tavily', result.ok, result.latencyMs, result.ok ? undefined : `HTTP ${result.status}`);
  },
};

/* ── SerpAPI ── */

const serpapiProvider: ProviderDefinition = {
  name: 'SerpAPI',
  category: CATEGORY,
  isConfigured: () => env.serpapi.apiKey.length > 0,
  check: async () => {
    if (!env.serpapi.apiKey) {
      return { name: 'SerpAPI', category: CATEGORY, status: 'missing', latencyMs: 0 };
    }
    const url = `https://serpapi.com/account.json?api_key=${encodeURIComponent(env.serpapi.apiKey)}`;
    const result = await probeHttpWithRetry(url);
    return searchHealth('SerpAPI', result.ok, result.latencyMs, result.ok ? undefined : `HTTP ${result.status}`);
  },
};

export const searchProviders = [tavilyProvider, serpapiProvider] as const;
