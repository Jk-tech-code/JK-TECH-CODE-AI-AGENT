import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { rateLimit } from '@/lib/security/rate-limit';
import { workflowStore } from '@/brain/autonomy';

/** GET /api/workflows — list saved workflows. */
export async function GET() {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return unauthorized();
  const workflows = await workflowStore.list(user.id);
  return NextResponse.json({ workflows });
}

/** POST /api/workflows — create a workflow or run one. Body: { name, steps, ... } */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return unauthorized();

  const rl = rateLimit(`workflows:${user.id}`, { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });

  try {
    const body = (await request.json()) as {
      name?: string;
      description?: string;
      steps?: Array<{ id?: string; stepId?: string; action?: string; title?: string; prompt?: string; inputRef?: string }>;
      run?: boolean;
      workflowId?: string;
      input?: Record<string, unknown>;
    };

    if (body.run && body.workflowId) {
      const result = await workflowStore.run(user.id, body.workflowId, body.input);
      return NextResponse.json({ result });
    }

    if (!body.name?.trim() || !Array.isArray(body.steps) || body.steps.length === 0) {
      return NextResponse.json({ error: 'name and steps are required.' }, { status: 400 });
    }

    const workflow = await workflowStore.create(user.id, {
      name: body.name,
      description: body.description,
      steps: body.steps.map((s) => ({
        id: s.id ?? s.stepId ?? `${s.action}-${Math.random().toString(36).slice(2, 6)}`,
        stepId: s.stepId ?? '',
        action: s.action ?? s.stepId ?? '',
        title: s.title ?? s.action ?? 'Step',
        prompt: s.prompt,
        inputRef: s.inputRef,
      })),
    });
    return NextResponse.json({ workflow });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create workflow.' }, { status: 500 });
  }
}

/** DELETE /api/workflows — delete a workflow. Body: { id } */
export async function DELETE(request: NextRequest) {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  const ok = await workflowStore.delete(user.id, body.id);
  return NextResponse.json({ ok });
}