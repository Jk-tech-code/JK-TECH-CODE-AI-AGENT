import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { syncUser } from '@/lib/auth/sync';
import { createLogger } from '@/lib/logging/logger';

const syncLogger = createLogger('auth-sync');

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const user = await syncUser(session.user);
    return NextResponse.json({ id: user.id, email: user.email });
  } catch (error) {
    syncLogger.error('Auth sync failed', error);
    return NextResponse.json({ error: 'Sync failed.' }, { status: 500 });
  }
}
