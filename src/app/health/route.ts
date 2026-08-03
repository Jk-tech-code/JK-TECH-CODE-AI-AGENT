import { NextResponse } from 'next/server';
import { checkHealth, healthHttpStatus } from '@/lib/integrations/health';

/** GET /health — status of every integrated provider. */
export async function GET() {
  const payload = await checkHealth();
  return NextResponse.json(payload, { status: healthHttpStatus(payload) });
}
