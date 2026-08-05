import { NextResponse } from 'next/server';
import { getAuthenticatedUser, forbidden } from '@/lib/auth';
import { buildAutonomyReport } from '@/brain/autonomy';

/** GET /api/autonomy/status — admin observability report for the autonomy stack. */
export async function GET() {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user || user.role !== 'admin') return forbidden();

  const report = await buildAutonomyReport({ userId: user.id });
  return NextResponse.json(report);
}