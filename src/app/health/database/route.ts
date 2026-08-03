import { NextResponse } from 'next/server';
import { checkHealth, healthHttpStatus } from '@/lib/integrations/health';

/** GET /health/database — PostgreSQL and Supabase. */
export async function GET() {
  const payload = await checkHealth('database');
  return NextResponse.json(payload, { status: healthHttpStatus(payload) });
}
