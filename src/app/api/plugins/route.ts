import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { rateLimit } from '@/lib/security/rate-limit';
import { pluginRegistry } from '@/brain/autonomy';

/** GET /api/plugins — list plugins with health. */
export async function GET() {
  const list = pluginRegistry.all();
  return NextResponse.json({ plugins: list });
}

/** POST /api/plugins — enable/disable a plugin (auth). Body: { id, enabled }. */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return unauthorized();

  const rl = rateLimit(`plugins:${user.id}`, { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });

  try {
    const body = (await request.json()) as { id?: string; enabled?: boolean };
    if (!body.id || typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'id and enabled are required.' }, { status: 400 });
    }
    await pluginRegistry.setEnabled(body.id, body.enabled, user.id);
    return NextResponse.json({ ok: true, id: body.id, enabled: body.enabled });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update plugin.' }, { status: 500 });
  }
}