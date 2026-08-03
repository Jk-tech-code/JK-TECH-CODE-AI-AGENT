/**
 * Typed environment access for third-party integrations.
 *
 * All credentials are read exclusively from process.env — never hardcoded.
 * Values are read live on each access (via getters) so the health checks and
 * tests always observe the current environment.
 */

export function getEnv(name: string): string {
  return process.env[name] ?? '';
}

export function hasEnv(name: string): boolean {
  const value = process.env[name];
  return value !== undefined && value !== null && value.trim().length > 0;
}

export const env = {
  /* ── AI providers ── */
  get openai() {
    return {
      apiKey: getEnv('OPENAI_API_KEY'),
      baseUrl: getEnv('OPENAI_BASE_URL') || 'https://api.openai.com/v1',
      model: getEnv('OPENAI_MODEL') || 'gpt-4.1',
    };
  },
  get gemini() {
    return {
      apiKey: getEnv('GEMINI_API_KEY'),
      baseUrl: getEnv('GEMINI_BASE_URL') || 'https://generativelanguage.googleapis.com',
    };
  },
  get anthropic() {
    return {
      apiKey: getEnv('ANTHROPIC_API_KEY'),
      baseUrl: getEnv('ANTHROPIC_BASE_URL') || 'https://api.anthropic.com',
    };
  },
  get grok() {
    return {
      apiKey: getEnv('XAI_API_KEY'),
      baseUrl: getEnv('XAI_BASE_URL') || 'https://api.x.ai',
    };
  },
  get deepseek() {
    return {
      apiKey: getEnv('DEEPSEEK_API_KEY'),
      baseUrl: getEnv('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com',
    };
  },

  /* ── Database ── */
  get databaseUrl() {
    return getEnv('DATABASE_URL');
  },

  /* ── Supabase ── */
  get supabase() {
    return {
      url: getEnv('NEXT_PUBLIC_SUPABASE_URL') || getEnv('SUPABASE_URL'),
      anonKey: getEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || getEnv('SUPABASE_PUBLISHABLE_KEY'),
      serviceKey: getEnv('SUPABASE_SECRET_KEY'),
      jwksUrl: getEnv('SUPABASE_JWKS_URL'),
    };
  },

  /* ── Cache ── */
  get redisUrl() {
    return getEnv('REDIS_URL');
  },

  /* ── Vector ── */
  get qdrant() {
    return {
      url: getEnv('QDRANT_URL'),
      apiKey: getEnv('QDRANT_API_KEY'),
    };
  },

  /* ── Search ── */
  get tavily() {
    return { apiKey: getEnv('TAVILY_API_KEY') };
  },
  get serpapi() {
    return { apiKey: getEnv('SERPAPI_API_KEY') };
  },

  /* ── Automation ── */
  get zapier() {
    return { webhookUrl: getEnv('ZAPIER_WEBHOOK_URL') };
  },
};

/** Names of every env var the integrations layer understands. */
export const KNOWN_ENV_KEYS = [
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL',
  'GEMINI_API_KEY',
  'GEMINI_BASE_URL',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'XAI_API_KEY',
  'XAI_BASE_URL',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_BASE_URL',
  'DATABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_JWKS_URL',
  'REDIS_URL',
  'QDRANT_URL',
  'QDRANT_API_KEY',
  'TAVILY_API_KEY',
  'SERPAPI_API_KEY',
  'ZAPIER_WEBHOOK_URL',
] as const;

/**
 * Summary of which env vars are present.
 * Values are never exposed — only boolean presence flags.
 */
export function getEnvPresenceReport(): Record<string, boolean> {
  const report: Record<string, boolean> = {};
  for (const key of KNOWN_ENV_KEYS) {
    report[key] = hasEnv(key);
  }
  return report;
}
