/**
 * AI-provider health definitions.
 *
 * The Brain's generation engines are the DeepSeek LLM (primary) and the
 * deterministic Search Engine (fallback / when no LLM key). Both are surfaced
 * here so the health dashboard reflects what actually answers requests.
 */
import { checkProvider, getConfiguredModel } from '@/brain/providers/llm';
import type { ProviderDefinition, ProviderHealth } from '../providers/types';

const AI_CATEGORY = 'ai' as const;

const DEEPSEEK = 'DeepSeek' as const;
const SEARCH_ENGINE = 'SearchEngine' as const;

const deepseekHealthProvider: ProviderDefinition = {
  name: DEEPSEEK,
  category: AI_CATEGORY,
  isConfigured: () => Boolean(process.env.DEEPSEEK_API_KEY),
  check: async () => {
    const status = await checkProvider('deepseek');
    const health: ProviderHealth = {
      name: DEEPSEEK,
      category: AI_CATEGORY,
      status: status.available ? 'connected' : 'missing',
      latencyMs: 0,
      detail: status.available ? getConfiguredModel('deepseek') : status.reason || 'DeepSeek not configured',
    };
    return health;
  },
};

const searchEngineProvider: ProviderDefinition = {
  name: SEARCH_ENGINE,
  category: AI_CATEGORY,
  isConfigured: () => Boolean(process.env.TAVILY_API_KEY || process.env.SERPAPI_API_KEY),
  check: async () => {
    const status = await checkProvider('search');
    const health: ProviderHealth = {
      name: SEARCH_ENGINE,
      category: AI_CATEGORY,
      status: status.available ? 'connected' : 'missing',
      latencyMs: 0,
      detail: status.available ? getConfiguredModel('search') : status.reason || 'Search engine not configured',
    };
    return health;
  },
};

export const aiProviders = [deepseekHealthProvider, searchEngineProvider] as const;