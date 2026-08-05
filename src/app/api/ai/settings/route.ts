import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { loadSettings, saveSettings } from '@/brain/settings';
import { checkProvider, modelInfo } from '@/brain/providers/llm';
import { DEFAULT_SETTINGS } from '@/brain/types';

/** GET /api/ai/settings — the caller's stored Brain settings + provider status. */
export async function GET() {
  const user = await getAuthenticatedUser().catch(() => null);
  const settings = await loadSettings(user?.id);
  const status = await checkProvider();
  const info = await modelInfo();

  return NextResponse.json({ settings, defaults: DEFAULT_SETTINGS, provider: status, models: info.models, host: info.host });
}

/** POST /api/ai/settings — persist partial settings (requires auth). */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const allowed: Array<keyof typeof DEFAULT_SETTINGS> = [
      'provider', 'model', 'temperature', 'topP', 'topK', 'maxTokens', 'streaming',
      'memoryEnabled', 'knowledgeEnabled', 'reasoningLevel', 'responseLength',
      'systemPrompt', 'personality',
    ];

    const partial: Partial<typeof DEFAULT_SETTINGS> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) (partial as Record<string, unknown>)[key] = body[key];
    }

    // Sanitize ranges.
    if (typeof partial.temperature === 'number') partial.temperature = Math.min(2, Math.max(0, partial.temperature));
    if (typeof partial.topP === 'number') partial.topP = Math.min(1, Math.max(0.05, partial.topP));
    if (typeof partial.topK === 'number') partial.topK = Math.min(128, Math.max(0, Math.floor(partial.topK)));
    if (typeof partial.maxTokens === 'number') partial.maxTokens = Math.min(32768, Math.max(64, Math.floor(partial.maxTokens)));
    if (partial.reasoningLevel && !['low', 'medium', 'high'].includes(partial.reasoningLevel)) delete partial.reasoningLevel;
    if (partial.responseLength && !['short', 'balanced', 'detailed'].includes(partial.responseLength)) delete partial.responseLength;
    if (partial.provider && !['ollama', 'openai'].includes(partial.provider)) delete partial.provider;
    if (typeof partial.streaming === 'boolean') partial.streaming = partial.streaming;
    if (typeof partial.memoryEnabled === 'boolean') partial.memoryEnabled = partial.memoryEnabled;
    if (typeof partial.knowledgeEnabled === 'boolean') partial.knowledgeEnabled = partial.knowledgeEnabled;
    if (typeof partial.systemPrompt === 'string') partial.systemPrompt = partial.systemPrompt.slice(0, 2000);
    if (typeof partial.personality === 'string') partial.personality = partial.personality.slice(0, 1000);
    if (typeof partial.model === 'string' && partial.model.trim()) partial.model = partial.model.trim();

    const saved = await saveSettings(user.id, partial);
    return NextResponse.json({ saved });
  } catch (error) {
    console.error('Settings save error:', error);
    return NextResponse.json({ error: 'Failed to save settings.' }, { status: 500 });
  }
}