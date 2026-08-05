/**
 * Autonomy API Platform (Phase 11).
 *
 * Issues scoped API keys for programmatic access to the autonomy endpoints.
 * Keys are stored hashed (SHA-256) so plaintext never persists; a bare rate
 * limiter is applied per-key. Auth for these routes still requires the GUI
 * session unless an `x-api-key` header is supplied.
 */
import { createHash, randomBytes } from 'crypto';
import { createLogger } from '@/lib/logging/logger';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/security/rate-limit';

const apiLogger = createLogger('autonomy:api');
const PREFS_PREFIX = 'autonomy:apikeys';

function hash(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export interface IssuedKey {
  id: string;
  name: string;
  /** Shown only once, at creation. */
  key?: string;
  createdAt: number;
  lastUsedAt?: number;
  scopes: string[];
}

export class ApiKeyStore {
  /** Create a key. Returns the plaintext exactly once. */
  async create(userId: string, name: string, scopes: string[] = ['*']): Promise<IssuedKey> {
    const plaintext = `jk_${randomBytes(24).toString('hex')}`;
    const id = randomBytes(8).toString('hex');
    const entry: IssuedKey = {
      id,
      name: name.slice(0, 80),
      createdAt: Date.now(),
      scopes: scopes.slice(0, 10),
      key: plaintext,
    };
    await this.writeEntry(userId, id, { ...entry, key: undefined, hash: hash(plaintext) });
    return entry;
  }

  async list(userId: string): Promise<IssuedKey[]> {
    const entries = await this.readEntries(userId);
    return entries.map((e) => ({
      id: e.id,
      name: typeof e.name === 'string' ? e.name : 'unnamed',
      createdAt: typeof e.createdAt === 'number' ? e.createdAt : 0,
      lastUsedAt: typeof e.lastUsedAt === 'number' ? e.lastUsedAt : undefined,
      scopes: Array.isArray(e.scopes) ? e.scopes.map(String) : ['*'],
    }));
  }

  async revoke(userId: string, id: string): Promise<boolean> {
    try {
      await db.userPreference.deleteMany({ where: { userId, key: `${PREFS_PREFIX}:${id}` } });
      return true;
    } catch {
      return false;
    }
  }

  /** Verify a presented key against stored hashes (any user). Returns the key id + scopes or null. */
  async authenticate(headerValue: string): Promise<{ userId: string; scopes: string[] } | null> {
    const presented = headerValue.replace(/^Bearer\s+/i, '').trim();
    if (!presented) return null;
    const h = hash(presented);
    try {
      const rows = await db.userPreference.findMany({
        where: { key: { startsWith: `${PREFS_PREFIX}:` } },
      });
      for (const row of rows) {
        try {
          const parsed = JSON.parse(row.value) as { hash?: string; scopes?: string[] };
          if (parsed.hash === h) {
            // Update lastUsedAt in the stored blob (best-effort).
            const fresh = JSON.parse(row.value);
            fresh.lastUsedAt = Date.now();
            await db.userPreference.update({ where: { id: row.id }, data: { value: JSON.stringify(fresh) } }).catch(() => {});
            return { userId: row.userId, scopes: parsed.scopes ?? ['*'] };
          }
        } catch {
          /* skip malformed entry */
        }
      }
    } catch (err) {
      apiLogger.warn('API key lookup failed', { error: err instanceof Error ? err.message : String(err) });
    }
    return null;
  }

  private async writeEntry(userId: string, id: string, entry: Record<string, unknown>): Promise<void> {
    try {
      await db.userPreference.upsert({
        where: { userId_key: { userId, key: `${PREFS_PREFIX}:${id}` } },
        update: { value: JSON.stringify(entry) },
        create: { userId, key: `${PREFS_PREFIX}:${id}`, value: JSON.stringify(entry) },
      });
    } catch (err) {
      apiLogger.error('Failed to persist API key', err);
      throw err;
    }
  }

  private async readEntries(userId: string): Promise<Array<Record<string, unknown> & { id: string }>> {
    try {
      const rows = await db.userPreference.findMany({
        where: { userId, key: { startsWith: `${PREFS_PREFIX}:` } },
        orderBy: { updatedAt: 'desc' },
      });
      return rows
        .map((r) => {
          try {
            return JSON.parse(r.value) as Record<string, unknown> & { id: string };
          } catch {
            return null;
          }
        })
        .filter((x): x is Record<string, unknown> & { id: string } => !!x);
    } catch {
      return [];
    }
  }
}

export const apiKeyStore = new ApiKeyStore();

/** Convenience for routes: enforce rate limit per key. */
export function rateLimitApiKey(keyId: string, limit = 100, windowMs = 60_000): boolean {
  return rateLimit(`apikey:${keyId}`, { limit, windowMs }).allowed;
}