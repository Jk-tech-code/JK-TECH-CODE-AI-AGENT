import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { rateLimit } from '@/lib/security/rate-limit';
import { taskPlanner } from '@/brain/autonomy';

/** POST /api/autonomy/plan — decompose a goal into a task plan. */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return unauthorized();

  const rl = rateLimit(`autonomy:plan:${user.id}`, { limit: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded. Try again shortly.' }, {
      status: 429,
      headers: { 'Retry-After': String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))) },
    });
  }

  try {
    const body = (await request.json()) as { goal?: string; maxSteps?: number };
    const goal = (body.goal ?? '').trim();
    if (!goal) return NextResponse.json({ error: 'goal is required.' }, { status: 400 });
    if (goal.length > 3000) return NextResponse.json({ error: 'Goal too long.' }, { status: 400 });

    const plan = await taskPlanner.createPlan(goal, { maxSteps: body.maxSteps });
    return NextResponse.json({ plan });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create plan.' }, { status: 500 });
  }
}

/** GET /api/autonomy/plan — health/availability probe. */
export async function GET() {
  return NextResponse.json({ ok: true, service: 'autonomy-planner' });
}