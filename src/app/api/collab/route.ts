import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorized, forbidden } from '@/lib/auth';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/security/rate-limit';
import { collaborationStore, projectStore } from '@/brain/autonomy';

/** GET /api/collab?projectId=... — members + comments for a project (role-aware). */
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return unauthorized();
  const projectId = request.nextUrl.searchParams.get('projectId') ?? '';
  if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 });

  const member = await collaborationStore.getMember(user.id, projectId);
  if (!member) return forbidden();

  const [members, comments] = await Promise.all([
    collaborationStore.members(projectId),
    collaborationStore.comments(projectId),
  ]);
  return NextResponse.json({ role: member.role, members, comments });
}

/** POST /api/collab — share a project or add a comment. Body: { projectId, email?, role?, comment? } */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return unauthorized();

  const rl = rateLimit(`collab:${user.id}`, { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });

  try {
    const body = (await request.json()) as {
      projectId?: string;
      email?: string;
      role?: 'viewer' | 'editor' | 'commenter';
      comment?: string;
    };
    if (!body.projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 });

    // Commenting (any member with >= commenter role).
    if (body.comment) {
      const allowed = await collaborationStore.can(user.id, body.projectId, 'commenter');
      if (!allowed) return forbidden();
      const comment = await collaborationStore.addComment(body.projectId, user.id, body.comment);
      return NextResponse.json({ comment });
    }

    // Sharing requires an owner role and a valid target email.
    const owner = await collaborationStore.getMember(user.id, body.projectId);
    if (!owner || owner.role !== 'owner') return forbidden();
    if (!body.email) return NextResponse.json({ error: 'email is required for sharing.' }, { status: 400 });

    const collaborator = await db.user.findUnique({
      where: { email: body.email.toLowerCase().trim() },
      select: { id: true },
    });
    if (!collaborator) {
      // Record a pending invite for the email.
      await collaborationStore.createInvite(user.id, body.projectId, body.email, body.role ?? 'viewer');
      return NextResponse.json({ pending: true, email: body.email });
    }

    const member = await collaborationStore.share(user.id, body.projectId, collaborator.id, body.role ?? 'viewer');
    return NextResponse.json({ member });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to share project.' }, { status: 500 });
  }
}

/** DELETE /api/collab — unshare a member. Body: { projectId, userId } */
export async function DELETE(request: NextRequest) {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as { projectId?: string; userId?: string };
  if (!body.projectId || !body.userId) {
    return NextResponse.json({ error: 'projectId and userId are required.' }, { status: 400 });
  }
  const ok = await collaborationStore.unshare(user.id, body.projectId, body.userId);
  if (!ok) return forbidden();
  return NextResponse.json({ ok: true });
}