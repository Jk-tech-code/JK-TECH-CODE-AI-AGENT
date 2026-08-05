/**
 * Brain Memory — wraps the existing memory store and adds durable,
 * user/session-scoped persistence via the Prisma MemoryEntry table.
 *
 * Remembers projects, preferences, language/framework choices, business
 * context and past exchanges. Retrieval is scoped and relevance-ranked so we
 * never overload the prompt.
 */
import { memoryStore } from '@/lib/memory/store';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logging/logger';
import type { MemoryType } from '@/lib/core/types';

const memoryLogger = createLogger('brain:memory');

export interface RetrievedMemory {
  content: string;
  type: MemoryType;
  score: number;
}

/** In-memory (existing) recall — fast, process-scoped. */
export async function recallInMemory(query: string, limit = 5): Promise<RetrievedMemory[]> {
  try {
    const results = await memoryStore.recall(query, { limit, minRelevance: 0.05 });
    return results
      .filter((m) => typeof m.content === 'string' && m.content.trim())
      .slice(0, limit)
      .map((m) => ({ content: m.content, type: m.type as MemoryType, score: 0.5 }));
  } catch (err) {
    memoryLogger.error('In-memory recall failed', err);
    return [];
  }
}

/** Durable recall from the DB, scoped to a user. */
export async function recallDurable(
  userId: string | undefined,
  query: string,
  limit = 5,
): Promise<RetrievedMemory[]> {
  if (!userId) return [];
  try {
    const rows = await db.memoryEntry.findMany({
      where: { userId },
      orderBy: { lastAccessed: 'desc' },
      take: Math.max(limit * 3, 10),
    });
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);

    const scored = rows
      .map((row) => {
        const content = row.content.toLowerCase();
        const hits = terms.filter((t) => content.includes(t)).length;
        const score = terms.length ? hits / terms.length : 0;
        return { row, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map((s) => ({ content: s.row.content, type: s.row.type as MemoryType, score: s.score }));
  } catch (err) {
    memoryLogger.error('Durable recall failed', err);
    return [];
  }
}

/** Combined recall across both stores, deduplicated. */
export async function recall(query: string, userId?: string, limit = 5): Promise<RetrievedMemory[]> {
  const [inMemory, durable] = await Promise.all([
    recallInMemory(query, limit),
    recallDurable(userId, query, limit),
  ]);
  const seen = new Set<string>();
  const merged: RetrievedMemory[] = [];
  for (const m of [...durable, ...inMemory]) {
    const key = m.content.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(m);
  }
  return merged.slice(0, limit);
}

export interface StoreMemoryInput {
  type: MemoryType;
  content: string;
  tags?: string[];
  userId?: string;
  ttl?: number;
}

/** Persist a memory to both the in-memory store and (optionally) the DB. */
export async function remember(input: StoreMemoryInput, durable = false): Promise<void> {
  try {
    await memoryStore.store({
      type: input.type,
      content: input.content,
      tags: input.tags ?? [],
      ttl: input.ttl,
    });
  } catch (err) {
    memoryLogger.error('In-memory store failed', err);
  }

  if (durable && input.userId && input.content.trim()) {
    try {
      await db.memoryEntry.upsert({
        where: {
          id: `${input.userId}:${Buffer.from(input.content.slice(0, 200)).toString('base64').slice(0, 60)}`,
        },
        update: { lastAccessed: new Date(), accessCount: { increment: 1 } },
        create: {
          id: `${input.userId}:${Buffer.from(input.content.slice(0, 200)).toString('base64').slice(0, 60)}`,
          userId: input.userId,
          type: input.type,
          content: input.content.slice(0, 4000),
          tags: JSON.stringify(input.tags ?? []),
        },
      });
    } catch (err) {
      memoryLogger.error('Durable store failed', err);
    }
  }
}

/** Convenience: persist the QA exchange as a memory entry. */
export async function rememberExchange(
  userId: string | undefined,
  query: string,
  response: string,
  durable = false,
): Promise<void> {
  if (!query.trim()) return;
  await remember(
    { type: 'conversation', content: query.trim().slice(0, 2000), tags: ['brain:exchange'], userId },
    durable,
  );
  if (response.trim()) {
    await remember(
      { type: 'conversation', content: response.trim().slice(0, 2000), tags: ['brain:response'], userId },
      durable,
    );
  }
}

export interface MemoryItem {
  id: string;
  type: MemoryType;
  content: string;
  tags: string[];
  accessCount: number;
  createdAt: string;
  lastAccessed: string;
  /** 0–1 relevance/recency confidence for search results. */
  confidence: number;
}

/** Confidence from how recently and how often a memory was used. */
export function scoreMemoryConfidence(entry: {
  accessCount: number;
  lastAccessed: Date;
  createdAt: Date;
  ttl?: number | null;
  score?: number;
}): number {
  const now = Date.now();
  const recency = Math.max(0, 1 - (now - entry.lastAccessed.getTime()) / (90 * 24 * 3600 * 1000));
  const freq = Math.min(1, entry.accessCount / 10);
  // Query-relevance dominates when provided; otherwise recency + frequency.
  const base = (recency * 0.6 + freq * 0.4) * 0.8 + 0.2;
  return entry.score != null ? Math.min(1, entry.score * 0.6 + base * 0.4) : Math.min(1, base);
}

function toMemoryItem(row: {
  id: string;
  type: string;
  content: string;
  tags: string;
  accessCount: number;
  createdAt: Date;
  lastAccessed: Date;
  ttl?: number | null;
}, score?: number): MemoryItem {
  return {
    id: row.id,
    type: row.type as MemoryType,
    content: row.content,
    tags: parseTags(row.tags),
    accessCount: row.accessCount,
    createdAt: row.createdAt.toISOString(),
    lastAccessed: row.lastAccessed.toISOString(),
    confidence: scoreMemoryConfidence({ ...row, score }),
  };
}

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return raw ? raw.split(',').map((t) => t.trim()).filter(Boolean) : [];
  }
}

/**
 * List durable memories for a user, optionally filtered by query terms, type,
 * and tags. Ordered by confidence descending.
 */
export async function listMemories(
  userId: string,
  opts: { query?: string; type?: string; tags?: string[]; limit?: number } = {},
): Promise<MemoryItem[]> {
  if (!userId) return [];
  const { query, type, tags, limit = 50 } = opts;

  try {
    const rows = await db.memoryEntry.findMany({
      where: {
        userId,
        ...(type ? { type } : {}),
        ...(tags && tags.length > 0 ? { tags: { contains: tags[0] } } : {}),
      },
      orderBy: { lastAccessed: 'desc' },
      take: Math.min(limit * 5, 200),
    });

    const terms = (query || '').toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    let items = rows.map((row) => {
      const content = row.content.toLowerCase();
      const hits = terms.filter((t) => content.includes(t)).length;
      const score = terms.length ? hits / terms.length : 0;
      return toMemoryItem(row, terms.length ? score : undefined);
    });

    if (terms.length > 0) {
      items = items.filter((m) => m.confidence >= 0.25).sort((a, b) => b.confidence - a.confidence);
    }
    return items.slice(0, limit);
  } catch (err) {
    memoryLogger.error('Failed to list memories', err);
    return [];
  }
}

/** Edit a memory (content, type, or tags). Returns the updated item or null. */
export async function updateMemory(
  userId: string,
  id: string,
  patch: { content?: string; type?: MemoryType; tags?: string[] },
): Promise<MemoryItem | null> {
  if (!userId) return null;
  try {
    const existing = await db.memoryEntry.findFirst({ where: { id, userId } });
    if (!existing) return null;

    const updated = await db.memoryEntry.update({
      where: { id },
      data: {
        ...(patch.content != null ? { content: patch.content.slice(0, 4000) } : {}),
        ...(patch.type != null ? { type: patch.type } : {}),
        ...(patch.tags != null ? { tags: JSON.stringify(patch.tags) } : {}),
      },
    });
    return toMemoryItem(updated);
  } catch (err) {
    memoryLogger.error('Failed to update memory', err);
    return null;
  }
}

/** Forget a single memory. Returns true when deleted. */
export async function forgetMemory(userId: string, id: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const existing = await db.memoryEntry.findFirst({ where: { id, userId } });
    if (!existing) return false;
    await db.memoryEntry.delete({ where: { id } });
    memoryStore.forget(id);
    return true;
  } catch (err) {
    memoryLogger.error('Failed to forget memory', err);
    return false;
  }
}

/** Forget all durable memories for a user. Returns the count deleted. */
export async function clearMemories(userId: string): Promise<number> {
  if (!userId) return 0;
  try {
    const deleted = await db.memoryEntry.deleteMany({ where: { userId } });
    return deleted.count;
  } catch (err) {
    memoryLogger.error('Failed to clear memories', err);
    return 0;
  }
}

/** Summary stats about a user's durable memories. */
export async function memoryStats(userId: string): Promise<{
  total: number;
  byType: Record<string, number>;
  averageConfidence: number;
}> {
  if (!userId) return { total: 0, byType: {}, averageConfidence: 0 };
  try {
    const rows = await db.memoryEntry.findMany({
      where: { userId },
      select: { type: true, content: true, createdAt: true, lastAccessed: true, accessCount: true },
    });
    const byType: Record<string, number> = {};
    let confidenceSum = 0;
    for (const row of rows) {
      byType[row.type] = (byType[row.type] || 0) + 1;
      confidenceSum += scoreMemoryConfidence(row);
    }
    return {
      total: rows.length,
      byType,
      averageConfidence: rows.length ? confidenceSum / rows.length : 0,
    };
  } catch (err) {
    memoryLogger.error('Failed to compute memory stats', err);
    return { total: 0, byType: {}, averageConfidence: 0 };
  }
}