import { createOpenAI } from '@ai-sdk/openai';
import { AppError } from '@/lib/error/handler';

export const DEFAULT_MODEL_ID = process.env.OPENAI_MODEL || 'gpt-4.1';

function resolveBaseURL(): string | undefined {
  const url = process.env.OPENAI_BASE_URL;
  if (!url) return undefined;
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

let cachedProvider: ReturnType<typeof createOpenAI> | null = null;

/**
 * Lazily builds (and caches) the shared OpenAI-compatible provider.
 * Throws AppError 503 when OPENAI_API_KEY is missing so API routes
 * return a structured error instead of failing silently.
 */
export function getProvider() {
  if (cachedProvider) return cachedProvider;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AppError(
      'OPENAI_API_KEY is not configured. Add it to .env.local.',
      503,
      'PROVIDER_NOT_CONFIGURED',
    );
  }

  cachedProvider = createOpenAI({
    apiKey,
    baseURL: resolveBaseURL(),
  });
  return cachedProvider;
}

/**
 * Returns a model instance for a given logical model id.
 * All logical model ids resolve to the configured OpenAI-compatible
 * model (OPENAI_MODEL), since a single API key backs the provider.
 * Uses the Chat Completions endpoint for maximum compatibility.
 */
export function getModel(modelId?: string) {
  return getProvider().chat(modelId || DEFAULT_MODEL_ID);
}

export function resolveModelAlias(_logical: string): string {
  return DEFAULT_MODEL_ID;
}
