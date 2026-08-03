import { NextResponse } from 'next/server';
import { checkHealth, healthHttpStatus } from '@/lib/integrations/health';

/** GET /health/ai — OpenAI, Gemini, Claude, Grok, DeepSeek. */
export async function GET() {
  const payload = await checkHealth('ai');
  return NextResponse.json(payload, { status: healthHttpStatus(payload) });
}
