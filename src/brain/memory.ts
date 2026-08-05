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