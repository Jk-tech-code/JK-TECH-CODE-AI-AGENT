function getConfig() {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret && process.env.NODE_ENV === 'production' && process.env.CI !== 'true') {
    throw new Error('Missing required environment variable: JWT_SECRET');
  }

  return {
    jwt: {
      get secret() {
        if (!jwtSecret && process.env.NODE_ENV === 'production') {
          throw new Error('JWT_SECRET is required in production');
        }
        return jwtSecret || '';
      },
    },
    supabase: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '',
      serviceKey: process.env.SUPABASE_SECRET_KEY || '',
      jwksUrl: process.env.SUPABASE_JWKS_URL || '',
    },
    services: {
      llmRouter: process.env.LLM_ROUTER_URL || 'http://localhost:7200',
      visualProcessor: process.env.VISUAL_PROCESSOR_URL || 'http://localhost:7300',
      zapierWebhook: process.env.ZAPIER_WEBHOOK_URL || '',
      zapierWebhookSecret: process.env.ZAPIER_WEBHOOK_SECRET || '',
    },
    embedding: {
      provider: (process.env.EMBEDDING_PROVIDER || 'fallback') as 'openai' | 'voyage' | 'cohere' | 'gemini' | 'fallback',
      openaiKey: process.env.OPENAI_API_KEY || '',
      voyageKey: process.env.VOYAGE_API_KEY || '',
      cohereKey: process.env.COHERE_API_KEY || '',
      geminiKey: process.env.GEMINI_API_KEY || '',
    },
  };
}

export const config = getConfig();
