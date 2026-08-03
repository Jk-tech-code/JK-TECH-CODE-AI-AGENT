import { NextResponse } from 'next/server';
import { checkHealth, healthHttpStatus } from '@/lib/integrations/health';

/** GET /health/search — Tavily and SerpAPI. */
export async function GET() {
  const payload = await checkHealth('search');
  return NextResponse.json(payload, { status: healthHttpStatus(payload) });
}
