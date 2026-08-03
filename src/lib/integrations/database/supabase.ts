import { env } from '../config/env';
import { probeHttpWithRetry } from '../utils/http';
import type { ProviderDefinition, ProviderHealth } from '../providers/types';

const CATEGORY = 'database' as const;

export const supabaseProvider: ProviderDefinition = {
  name: 'Supabase',
  category: CATEGORY,
  isConfigured: () => env.supabase.url.length > 0 && env.supabase.anonKey.length > 0,
  createClient: () => {
    if (!env.supabase.url || !env.supabase.anonKey) return null;
    // Lazy factory; actual clients are request-scoped via createServerClient
    // in src/utils/supabase/server.ts. We register a token object so the
    // registry can confirm the provider is available.
    return { url: env.supabase.url, anonKey: env.supabase.anonKey };
  },
  check: async () => {
    if (!env.supabase.url) {
      return { name: 'Supabase', category: CATEGORY, status: 'missing', latencyMs: 0 };
    }
    const healthUrl = `${env.supabase.url.replace(/\/$/, '')}/auth/v1/health`;
    const result = await probeHttpWithRetry(healthUrl, {
      headers: env.supabase.anonKey ? { apikey: env.supabase.anonKey } : {},
    });
    return {
      name: 'Supabase',
      category: CATEGORY,
      status: result.ok ? 'connected' : 'failed',
      latencyMs: result.latencyMs,
      detail: result.ok ? undefined : `HTTP ${result.status}`,
    };
  },
};
