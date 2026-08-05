import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { rateLimit } from '@/lib/security/rate-limit';
import { projectStore } from '@/brain/autonomy';

/** GET /api/projects — list the caller's projects. */
export async function GET() {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return unauthorized();
  const projects = await projectStore.list(user.id);
  return NextResponse.json({ projects });
}

/** POST /api/projects — create a project. Body: { name, description?, goals? } */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return unauthorized();

  const rl = rateLimit(`projects:${user.id}`, { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });

  try {
    const body = (await request.json()) as { name?: string; description?: string; goals?: string[] };
    if (!body.name?.trim()) return NextResponse.json({ error: 'name is required.' }, { status: 400 });
    const project = await projectStore.create(user.id, {
      name: body.name,
      description: body.description,
      goals: body.goals,
    });
    return NextResponse.json({ project });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create project.' }, { status: 500 });
  }
}