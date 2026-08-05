import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { rateLimit } from '@/lib/security/rate-limit';
import { automationStore } from '@/brain/autonomy';

/** GET /api/automations — list the caller's scheduled tasks. */
export async function GET() {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return unauthorized();
  const jobs = await automationStore.list(user.id);
  return NextResponse.json({ jobs });
}

/** POST /api/automations — create or update a schedule. Body: { name, frequency, action, actionType, ... } */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return unauthorized();

  const rl = rateLimit(`automations:${user.id}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });

  try {
    const body = (await request.json()) as {
      id?: string;
      name?: string;
      frequency?: 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly';
      action?: string;
      actionType?: 'workflow' | 'goal' | 'reminder' | 'backup' | 'sync';
      enabled?: boolean;
    };

    if (body.id) {
      const updated = await automationStore.update(user.id, body.id, {
        enabled: body.enabled,
        name: body.name,
        frequency: body.frequency,
        action: body.action,
        actionType: body.actionType,
      });
      if (!updated) return NextResponse.json({ error: 'Automation not found.' }, { status: 404 });
      return NextResponse.json({ job: updated });
    }

    if (!body.name?.trim() || !body.frequency || !body.action) {
      return NextResponse.json({ error: 'name, frequency and action are required.' }, { status: 400 });
    }
    const job = await automationStore.create(user.id, {
      name: body.name,
      frequency: body.frequency,
      action: body.action,
      actionType: body.actionType ?? 'goal',
    });
    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save automation.' }, { status: 500 });
  }
}

/** DELETE /api/automations — remove a schedule. Body: { id } */
export async function DELETE(request: NextRequest) {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  const ok = await automationStore.delete(user.id, body.id);
  return NextResponse.json({ ok });
}