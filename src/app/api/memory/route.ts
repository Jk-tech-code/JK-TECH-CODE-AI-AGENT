import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  listMemories,
  updateMemory,
  forgetMemory,
  clearMemories,
  memoryStats,
  remember,
} from '@/brain/memory';
import { createLogger } from '@/lib/logging/logger';
import { rateLimit } from '@/lib/security/rate-limit';

const memoryLogger = createLogger('api:memory');

const MEMORY_TYPES = ['project', 'preference', 'knowledge', 'fact', 'conversation', 'session'];

/**
 * /api/memory — durable Brain memory management (requires auth).
 *
 *   GET    /api/memory?query=&type=&tags=&limit= → list/search + stats
 *   POST   /api/memory  { type, content, tags }  → store a memory
 *   PATCH  /api/memory  { id, content?, type?, tags? } → edit
 *   DELETE /api/memory?id=…        → forget one memory
 *   DELETE /api/memory             → clear all (confirmation via header)
 */
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  try {
    const { searchParams } = request.nextUrl;
    const query = searchParams.get('query') || undefined;
    const type = searchParams.get('type') || undefined;
    const tags = searchParams.get('tags')?.split(',').map((t) => t.trim()).filter(Boolean);
    const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') || 50)));

    const [memories, stats] = await Promise.all([
      listMemories(user.id, { query, type, tags, limit }),
      memoryStats(user.id),
    ]);

    return NextResponse.json({ memories, stats });
  } catch (error) {
    memoryLogger.error('GET /api/memory failed', error);
    return NextResponse.json({ error: 'Failed to load memories.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const rl = rateLimit(`memory:write:${user.id}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many memory writes. Please slow down.' }, { status: 429 });
  }

  try {
    const body = (await request.json()) as { type?: string; content?: string; tags?: string[] };
    const type = body.type && MEMORY_TYPES.includes(body.type) ? (body.type as 'knowledge') : 'knowledge';
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const tags = Array.isArray(body.tags)
      ? body.tags.filter((t): t is string => typeof t === 'string').slice(0, 10)
      : [];

    if (!content) {
      return NextResponse.json({ error: 'Memory content is required.' }, { status: 400 });
    }

    await remember({ type, content: content.slice(0, 4000), tags, userId: user.id }, true);
    return NextResponse.json({ ok: true });
  } catch (error) {
    memoryLogger.error('POST /api/memory failed', error);
    return NextResponse.json({ error: 'Failed to store memory.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  try {
    const body = (await request.json()) as {
      id?: string;
      content?: string;
      type?: string;
      tags?: string[];
    };
    if (!body.id) return NextResponse.json({ error: 'Memory id is required.' }, { status: 400 });

    const updated = await updateMemory(user.id, body.id, {
      content: typeof body.content === 'string' ? body.content : undefined,
      type: body.type && MEMORY_TYPES.includes(body.type) ? (body.type as never) : undefined,
      tags: Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === 'string').slice(0, 10) : undefined,
    });

    if (!updated) return NextResponse.json({ error: 'Memory not found.' }, { status: 404 });
    return NextResponse.json({ memory: updated });
  } catch (error) {
    memoryLogger.error('PATCH /api/memory failed', error);
    return NextResponse.json({ error: 'Failed to update memory.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  try {
    const { searchParams } = request.nextUrl;
    const id = searchParams.get('id');
    const clearAll = searchParams.get('all') === 'true';

    if (clearAll) {
      const count = await clearMemories(user.id);
      return NextResponse.json({ ok: true, deleted: count });
    }

    if (!id) return NextResponse.json({ error: 'Memory id is required.' }, { status: 400 });
    const ok = await forgetMemory(user.id, id);
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: 'Memory not found.' }, { status: 404 });
  } catch (error) {
    memoryLogger.error('DELETE /api/memory failed', error);
    return NextResponse.json({ error: 'Failed to delete memory.' }, { status: 500 });
  }
}
