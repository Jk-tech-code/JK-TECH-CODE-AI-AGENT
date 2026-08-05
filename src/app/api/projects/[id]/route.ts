import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { projectStore } from '@/brain/autonomy';

/** GET /api/projects/[id] — fetch one project. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return unauthorized();
  const { id } = await params;
  const project = await projectStore.get(user.id, id);
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  return NextResponse.json({ project });
}

/** PATCH /api/projects/[id] — update name/goals/description/notes. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return unauthorized();
  const { id } = await params;

  try {
    const body = (await request.json()) as {
      name?: string;
      description?: string;
      goals?: string[];
      notes?: string[];
      note?: string;
    };
    if (body.note) {
      const project = await projectStore.addNote(user.id, id, body.note);
      if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
      return NextResponse.json({ project });
    }
    const project = await projectStore.update(user.id, id, {
      name: body.name,
      description: body.description,
      goals: body.goals,
      notes: body.notes,
    });
    if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    return NextResponse.json({ project });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update project.' }, { status: 500 });
  }
}

/** POST /api/projects/[id]/files — save a file into the project. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return unauthorized();
  const { id } = await params;

  try {
    const body = (await request.json()) as { name?: string; path?: string; content?: string };
    if (!body.name || !body.content) {
      return NextResponse.json({ error: 'name and content are required.' }, { status: 400 });
    }
    const project = await projectStore.saveFile(user.id, id, {
      name: body.name,
      path: body.path,
      content: body.content,
    });
    if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    return NextResponse.json({ project });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save file.' }, { status: 500 });
  }
}

/** DELETE /api/projects/[id] — remove a project. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return unauthorized();
  const { id } = await params;
  const ok = await projectStore.delete(user.id, id);
  if (!ok) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}