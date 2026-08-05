import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { rateLimit } from '@/lib/security/rate-limit';
import { apiKeyStore } from '@/brain/autonomy';

/** GET /api/keys — list the caller's API keys (minus secrets). */
export async function GET() {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return unauthorized();
  const keys = await apiKeyStore.list(user.id);
  return NextResponse.json({ keys });
}

/** POST /api/keys — create a new API key. Body: { name, scopes? } */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return unauthorized();

  const rl = rateLimit(`keys:${user.id}`, { limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });

  try {
    const body = (await request.json()) as { name?: string; scopes?: string[] };
    if (!body.name?.trim()) return NextResponse.json({ error: 'name is required.' }, { status: 400 });
    const key = await apiKeyStore.create(user.id, body.name, body.scopes);
    return NextResponse.json({ key });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create API key.' }, { status: 500 });
  }
}

/** DELETE /api/keys — revoke a key. Body: { id } */
export async function DELETE(request: NextRequest) {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  const ok = await apiKeyStore.revoke(user.id, body.id);
  return NextResponse.json({ ok });
}