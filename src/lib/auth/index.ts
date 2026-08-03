import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createLogger } from '@/lib/logging/logger';
import { syncUser } from './sync';
import { createSupabaseContext } from '@/utils/supabase/context';
import type { SupabaseContext } from '@supabase/server';

const authLogger = createLogger('auth');

export async function getSession() {
  try {
    // @supabase/ssr owns the cookie session; middleware refreshes the token.
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    // Cryptographically verify the access token against the project JWKS.
    const { error } = await createSupabaseContext({ auth: 'user' });
    if (error) {
      authLogger.warn('getSession: JWT verification failed', { message: error.message });
      return null;
    }

    return session;
  } catch (error) {
    authLogger.error('getSession failed', error);
    return null;
  }
}

export async function requireAuth() {
  const session = await getSession();
  if (!session?.user) return null;
  return session;
}

export async function getAuthenticatedUser() {
  const session = await requireAuth();
  if (!session?.user) return null;

  try {
    const user = await syncUser(session.user);
    return user;
  } catch (error) {
    authLogger.error('getAuthenticatedUser: sync failed', error);
    return null;
  }
}

/**
 * Returns the composed @supabase/server context (RLS-scoped `supabase`
 * client, service-role `supabaseAdmin`, and verified user claims), or null
 * when the request is unauthenticated.
 */
export async function getSupabaseContext(): Promise<SupabaseContext | null> {
  return (await createSupabaseContext({ auth: 'user' })).data;
}

export function unauthorized() {
  return NextResponse.json(
    { error: 'Authentication required. Please log in.' },
    { status: 401 },
  );
}

export function forbidden() {
  return NextResponse.json(
    { error: 'You do not have permission to perform this action.' },
    { status: 403 },
  );
}
