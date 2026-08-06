/**
 * AI-provider health definitions.
 *
 * Future note: external LLM vendors (OpenAI, Gemini, Claude, Grok, DeepSeek,
 * Ollama) were removed. The Brain's generation engine is now the deterministic
 * Search Engine, so the "ai" category in the health surface reports that one
 * engine.
 */
import { checkProvider, getConfiguredModel } from '@/brain/providers/llm';
import type { ProviderDefinition, ProviderHealth } from '../providers/types';

const AI_CATEGORY = 'ai' as const;

const SEARCH_ENGINE = 'SearchEngine' as const;

const searchEngineProvider: ProviderDefinition = {
  name: SEARCH_ENGINE,
  category: AI_CATEGORY,
  isConfigured: () => Boolean(process.env.TAVILY_API_KEY || process.env.SERPAPI_API_KEY),
  check: async () => {
    const status = await checkProvider();
    const health: ProviderHealth = {
      name: SEARCH_ENGINE,
      category: AI_CATEGORY,
      status: status.available ? 'connected' : 'missing',
      latencyMs: 0,
      detail: status.available ? getConfiguredModel() : status.reason || 'Search engine not configured',
    };
    return health;
  },
};

export const aiProviders = [searchEngineProvider] as const;