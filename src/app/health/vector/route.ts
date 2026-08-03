import { NextResponse } from 'next/server';
import { checkHealth, healthHttpStatus } from '@/lib/integrations/health';

/** GET /health/vector — Qdrant. */
export async function GET() {
  const payload = await checkHealth('vector');
  return NextResponse.json(payload, { status: healthHttpStatus(payload) });
}
