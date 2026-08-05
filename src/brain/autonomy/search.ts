/**
 * Autonomy Unified Search (Phase 9).
 *
 * Searches across the user's chats, projects, memory, knowledge base,
 * generated code and notes in one call. Returns ranked, typed results and the
 * source ADDRESS actionable navigation to the matching item.
 */
import { createLogger } from '@/lib/logging/logger';
import { db } from '@/lib/db';
import { memoryStore } from '@/lib/memory/store';
import { listMemories } from '@/brain/memory';
import { projectStore } from './projects';
import type { SearchResult } from './types';

const searchLogger = createLogger('autonomy:search');

export interface SearchOptions {
  q: string;
  types?: Array<'conversations' | 'projects' | 'memory' | 'files' | 'notes'>;
  limit?: number;
}

export type { SearchResult } from './types';

export class UnifiedSearch {
  async search(userId: string, opts: SearchOptions): Promise<SearchResult[]> {
    const q = (opts.q ?? '').trim().toLowerCase();
    const limit = opts.limit ?? 10;
    if (!q) return [];
    const want = new Set(opts.types ?? ['conversations', 'projects', 'memory', 'files', 'notes']);
    const results: SearchResult[] = [];

    await Promise.all([
      want.has('conversations') && this.searchConversations(userId, q, results),
      want.has('projects') && this.searchProjects(userId, q, results),
      want.has('memory') && this.searchMemory(userId, q, results),
      want.has('files') && this.searchFiles(userId, q, results),
      want.has('notes') && this.searchNotes(userId, q, results),
    ]);

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  private async searchConversations(userId: string, q: string, out: SearchResult[]): Promise<void> {
    try {
      const rows = await db.conversation.findMany({
        where: {
          userId: userId || undefined,
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { messages: { some: { content: { contains: q, mode: 'insensitive' } } } },
          ],
        },
        include: { _count: { select: { messages: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 6,
      });
      for (const c of rows) {
        const snippet = c.title || `Conversation (${c._count.messages} messages)`;
        out.push({ type: 'conversation', title: c.title || 'Untitled chat', snippet, route: `/dashboard?conversation=${c.id}`, score: 10 });
      }
    } catch (err) {
      searchLogger.warn('conversation search failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async searchProjects(userId: string, q: string, out: SearchResult[]): Promise<void> {
    const projects = await projectStore.list(userId);
    for (const p of projects) {
      if (p.name.toLowerCase().includes(q) || p.goals.some((g) => g.toLowerCase().includes(q))) {
        out.push({
          type: 'project',
          title: p.name,
          snippet: p.description || p.goals.join('; '),
          route: `/projects/${p.id}`,
          score: 20,
        });
      }
    }
  }

  private async searchMemory(userId: string, q: string, out: SearchResult[]): Promise<void> {
    try {
      const memories = await listMemories(userId ?? '', { query: q, limit: 5 });
      for (const m of memories) {
        out.push({ type: 'memory', title: `Memory (${m.type})`, snippet: m.content.slice(0, 140), route: `/settings/memory`, score: 18 });
      }
    } catch {
      // DB unavailable — best-effort in-memory scan.
      const cached = await memoryStore.recall(q, { limit: 5 }).catch(() => []);
      for (const m of cached) {
        const text = m.content ?? '';
        if (text.toLowerCase().includes(q)) {
          out.push({ type: 'memory', title: 'Memory', snippet: text.slice(0, 140), route: '/settings/memory', score: 15 });
        }
      }
    }
  }

  private async searchFiles(userId: string, q: string, out: SearchResult[]): Promise<void> {
    try {
      const docs = await db.document.findMany({
        where: {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { content: { contains: q, mode: 'insensitive' } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      for (const d of docs) {
        const idx = (d.content ?? '').toLowerCase().indexOf(q);
        const snippet = idx >= 0 ? d.content!.slice(idx, idx + 120) : (d.content ?? '').slice(0, 120);
        out.push({ type: 'file', title: d.title, snippet, route: `/dashboard?file=${d.id}`, score: 12 });
      }
    } catch (err) {
      searchLogger.warn('file search failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async searchNotes(userId: string, q: string, out: SearchResult[]): Promise<void> {
    const projects = await projectStore.list(userId);
    for (const p of projects) {
      for (const note of p.notes) {
        if (note.toLowerCase().includes(q)) {
          out.push({ type: 'note', title: `Note in ${p.name}`, snippet: note.slice(0, 140), route: `/projects/${p.id}`, score: 8 });
        }
      }
    }
  }
}

export const unifiedSearch = new UnifiedSearch();