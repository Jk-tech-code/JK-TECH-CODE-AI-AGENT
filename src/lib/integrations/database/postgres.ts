import { db } from '@/lib/db';
import { env } from '../config/env';
import { sanitizeDetail } from '../utils/http';
import type { ProviderDefinition, ProviderHealth } from '../providers/types';

const CATEGORY = 'database' as const;

export const postgresProvider: ProviderDefinition = {
  name: 'PostgreSQL',
  category: CATEGORY,
  isConfigured: () => env.databaseUrl.length > 0,
  createClient: () => (env.databaseUrl ? db : null), // reuse existing Prisma singleton
  check: async () => {
    if (!env.databaseUrl) {
      return { name: 'PostgreSQL', category: CATEGORY, status: 'missing', latencyMs: 0 };
    }
    const start = Date.now();
    try {
      await db.$queryRaw`SELECT 1`;
      return { name: 'PostgreSQL', category: CATEGORY, status: 'connected', latencyMs: Date.now() - start };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        name: 'PostgreSQL',
        category: CATEGORY,
        status: 'failed',
        latencyMs: Date.now() - start,
        detail: sanitizeDetail(message),
      };
    }
  },
};
