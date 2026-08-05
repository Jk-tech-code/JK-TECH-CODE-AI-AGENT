import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { automationStore, workflowStore } from '@/brain/autonomy';

/**
 * POST /api/automations/run — trigger all due automations for the caller.
 * Used by a scheduler (Vercel cron) or manually from the UI.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return unauthorized();

  const due = await automationStore.due(user.id);
  const results: Array<{ id: string; ok: boolean; result: string }> = [];

  for (const job of due) {
    try {
      if (job.actionType === 'workflow' && job.action) {
        const res = await workflowStore.run(user.id, job.action);
        const result = `Workflow ran ${res.steps.length} steps: ${res.succeeded ? 'succeeded' : 'failed'}.`;
        results.push({ id: job.id, ok: res.succeeded, result });
        await automationStore.markRun(user.id, job.id, { completedAt: Date.now(), ok: res.succeeded, result });
      } else {
        const result = `[automation:${job.actionType}] ${job.action.slice(0, 200)}`;
        results.push({ id: job.id, ok: true, result });
        await automationStore.markRun(user.id, job.id, { completedAt: Date.now(), ok: true, result });
      }
    } catch (err) {
      results.push({ id: job.id, ok: false, result: err instanceof Error ? err.message : 'failed' });
    }
  }

  return NextResponse.json({ ran: results.length, results });
}