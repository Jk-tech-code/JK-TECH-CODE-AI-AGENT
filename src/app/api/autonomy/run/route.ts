import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { rateLimit } from '@/lib/security/rate-limit';
import { taskPlanner, taskExecutor, qualityGate } from '@/brain/autonomy';

/** POST /api/autonomy/run — plan + execute a goal end-to-end. */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return unauthorized();

  const rl = rateLimit(`autonomy:run:${user.id}`, { limit: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded. Try again shortly.' }, {
      status: 429,
      headers: { 'Retry-After': String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))) },
    });
  }

  try {
    const body = (await request.json()) as {
      goal?: string;
      planId?: string;
      projectId?: string;
      maxSteps?: number;
      validate?: boolean;
    };
    const goal = (body.goal ?? '').trim();
    if (!goal) return NextResponse.json({ error: 'goal is required.' }, { status: 400 });
    if (goal.length > 3000) return NextResponse.json({ error: 'Goal too long.' }, { status: 400 });

    // If only the goal is given we plan then execute. planId is reserved for
    // the streaming executor (future); today execution always plans fresh.
    const plan = await taskPlanner.createPlan(goal, { maxSteps: body.maxSteps });
    const result = await taskExecutor.executePlan(plan, {
      userId: user.id,
      projectId: body.projectId,
    });

    // Assemble the deliverable from executed steps (no LLM dependency needed).
    const stepsText = result.plan.steps
      .map((s) => `## ${s.title}\n\n${s.status === 'completed' ? (s.output ?? '') : s.status === 'failed' ? `⚠ ${s.error ?? 'failed'}` : `— ${s.status}`}`)
      .join('\n\n');
    const deliverable = `# ${goal}\n\n${stepsText}\n\n---\nProgress: ${result.plan.progress}% | Status: ${result.plan.status}`;

    // Optional internal quality validation (Phase 13).
    let quality;
    if (body.validate !== false) {
      quality = qualityGate(deliverable, { goal });
      if (!quality.passed && quality.clarifyingQuestion) {
        // Ask for clarification instead of returning a weak guess.
        return NextResponse.json({
          needsClarification: true,
          question: quality.clarifyingQuestion,
          issues: quality.issues,
          plan: result.plan,
        });
      }
    }

    return NextResponse.json({
      deliverable,
      plan: result.plan,
      progress: result.plan.progress,
      status: result.plan.status,
      succeeded: result.succeeded,
      totalLatencyMs: result.totalLatencyMs,
      quality,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to run autonomy task.' }, { status: 500 });
  }
}