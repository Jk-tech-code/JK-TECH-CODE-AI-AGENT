import { db } from '@/lib/db';
import { createLogger } from '@/lib/logging/logger';

const authLogger = createLogger('auth-sync');

export async function syncUser(supabaseUser: {
  id: string;
  email?: string | null;
  user_metadata?: { name?: string; avatar_url?: string };
}) {
  try {
    const existing = await db.user.findUnique({ where: { id: supabaseUser.id } });

    if (existing) {
      const updated = await db.user.update({
        where: { id: supabaseUser.id },
        data: {
          email: supabaseUser.email ?? existing.email,
          name: supabaseUser.user_metadata?.name ?? existing.name,
          avatarUrl: supabaseUser.user_metadata?.avatar_url ?? existing.avatarUrl,
        },
      });
      return updated;
    }

    const created = await db.user.create({
      data: {
        id: supabaseUser.id,
        email: supabaseUser.email ?? 'unknown@email.com',
        name: supabaseUser.user_metadata?.name ?? null,
        avatarUrl: supabaseUser.user_metadata?.avatar_url ?? null,
      },
    });
    authLogger.info('User profile created', { userId: created.id, email: created.email });
    return created;
  } catch (error) {
    authLogger.error('syncUser failed', error);
    throw error;
  }
}
