import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorized } from '@/lib/auth';
import { rateLimit } from '@/lib/security/rate-limit';
import { unifiedSearch } from '@/brain/autonomy';

/** GET /api/search?q=... — unified search across chats/projects/memory/files/notes. */
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) return unauthorized();

  const rl = rateLimit(`search:${user.id}`, { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });

  const q = request.nextUrl.searchParams.get('q') ?? '';
  if (!q.trim()) return NextResponse.json({ results: [] });

  const types = (request.nextUrl.searchParams.get('types') ?? '')
    .split(',')
    .filter((t): t is 'conversations' | 'projects' | 'memory' | 'files' | 'notes' =>
      ['conversations', 'projects', 'memory', 'files', 'notes'].includes(t));

  const results = await unifiedSearch.search(user.id, { q, types, limit: 10 });
  return NextResponse.json({ results });
}