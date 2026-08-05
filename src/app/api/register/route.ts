import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createLogger } from '@/lib/logging/logger';
import { syncUser } from '@/lib/auth/sync';

const registerLogger = createLogger('register');

/**
 * POST /api/register
 *
 * Creates a new user account via Supabase Auth.
 * This ensures login (which also uses Supabase Auth) works seamlessly.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ error: 'Invalid input types.' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
    }

    // Use Supabase Auth to create the user (consistent with login).
    // The confirmation email must point back to the app's callback route so
    // the generated link matches the allowed Redirect URLs in both local
    // (http://localhost:3000/**) and production (https://jk-ai-agent.vercel.app/**).
    const origin = new URL(request.url).origin;
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name || null,
        },
        emailRedirectTo: `${origin}/api/auth/callback`,
      },
    });

    if (error) {
      registerLogger.warn('Supabase signUp failed', { error: error.message });

      if (error.message.includes('already registered')) {
        return NextResponse.json(
          { error: 'An account with this email already exists.' },
          { status: 409 },
        );
      }

      return NextResponse.json(
        { error: error.message || 'Registration failed.' },
        { status: 400 },
      );
    }

    if (!data.user) {
      return NextResponse.json(
        { error: 'Registration failed. Please try again.' },
        { status: 500 },
      );
    }

    await syncUser(data.user);

    registerLogger.info('Account created via Supabase Auth', {
      userId: data.user.id,
      email: data.user.email,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Account created successfully. Please check your email to confirm your account (if required).',
        userId: data.user.id,
      },
      { status: 201 },
    );
  } catch (error) {
    registerLogger.error('Register API error', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }
}
