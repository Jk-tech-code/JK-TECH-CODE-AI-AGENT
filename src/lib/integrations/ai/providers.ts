import { getProvider } from '@/lib/ai/provider';
import { env } from '../config/env';
import { probeHttpWithRetry } from '../utils/http';
import type { ProviderDefinition, ProviderHealth } from '../providers/types';

const AI_CATEGORY = 'ai' as const;

function configuredHealth(name: string, ok: boolean, latencyMs: number, detail?: string): ProviderHealth {
  return { name, category: AI_CATEGORY, status: ok ? 'connected' : 'failed', latencyMs, detail };
}

function missingHealth(name: string): ProviderHealth {
  return { name, category: AI_CATEGORY, status: 'missing', latencyMs: 0 };
}

/* ── OpenAI ── */

const openaiProvider: ProviderDefinition = {
  name: 'OpenAI',
  category: AI_CATEGORY,
  isConfigured: () => env.openai.apiKey.length > 0,
  createClient: () => {
    if (!env.openai.apiKey) return null;
    // Reuse the existing cached provider from src/lib/ai/provider.ts (singleton).
    return getProvider();
  },
  check: async () => {
    if (!env.openai.apiKey) return missingHealth('OpenAI');
    const result = await probeHttpWithRetry(`${env.openai.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${env.openai.apiKey}` },
    });
    return configuredHealth('OpenAI', result.ok, result.latencyMs, result.ok ? undefined : `HTTP ${result.status}`);
  },
};

/* ── Google Gemini ── */

const geminiProvider: ProviderDefinition = {
  name: 'Gemini',
  category: AI_CATEGORY,
  isConfigured: () => env.gemini.apiKey.length > 0,
  check: async () => {
    if (!env.gemini.apiKey) return missingHealth('Gemini');
    // Send the key as a header (x-goog-api-key) instead of a URL query string
    // so it never leaks through proxy/access logs or referrer headers.
    const result = await probeHttpWithRetry(`${env.gemini.baseUrl}/v1beta/models`, {
      headers: { 'x-goog-api-key': env.gemini.apiKey },
    });
    return configuredHealth('Gemini', result.ok, result.latencyMs, result.ok ? undefined : `HTTP ${result.status}`);
  },
};

/* ── Anthropic Claude ── */

const claudeProvider: ProviderDefinition = {
  name: 'Claude',
  category: AI_CATEGORY,
  isConfigured: () => env.anthropic.apiKey.length > 0,
  check: async () => {
    if (!env.anthropic.apiKey) return missingHealth('Claude');
    const result = await probeHttpWithRetry(`${env.anthropic.baseUrl}/v1/models`, {
      headers: {
        'x-api-key': env.anthropic.apiKey,
        'anthropic-version': '2023-06-01',
      },
    });
    return configuredHealth('Claude', result.ok, result.latencyMs, result.ok ? undefined : `HTTP ${result.status}`);
  },
};

/* ── xAI Grok ── */

const grokProvider: ProviderDefinition = {
  name: 'Grok',
  category: AI_CATEGORY,
  isConfigured: () => env.grok.apiKey.length > 0,
  check: async () => {
    if (!env.grok.apiKey) return missingHealth('Grok');
    const result = await probeHttpWithRetry(`${env.grok.baseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${env.grok.apiKey}` },
    });
    return configuredHealth('Grok', result.ok, result.latencyMs, result.ok ? undefined : `HTTP ${result.status}`);
  },
};

/* ── DeepSeek ── */

const deepseekProvider: ProviderDefinition = {
  name: 'DeepSeek',
  category: AI_CATEGORY,
  isConfigured: () => env.deepseek.apiKey.length > 0,
  check: async () => {
    if (!env.deepseek.apiKey) return missingHealth('DeepSeek');
    const result = await probeHttpWithRetry(`${env.deepseek.baseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${env.deepseek.apiKey}` },
    });
    return configuredHealth('DeepSeek', result.ok, result.latencyMs, result.ok ? undefined : `HTTP ${result.status}`);
  },
};

export const aiProviders = [
  openaiProvider,
  geminiProvider,
  claudeProvider,
  grokProvider,
  deepseekProvider,
] as const;
