import { NextResponse } from 'next/server';
import { checkHealth, healthHttpStatus } from '@/lib/integrations/health';

/** GET /health/cache — Redis. */
export async function GET() {
  const payload = await checkHealth('cache');
  return NextResponse.json(payload, { status: healthHttpStatus(payload) });
}
