'use client';

import { useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Mail, CheckCircle2, Sparkles } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email');
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState('');

  const handleResend = useCallback(async () => {
    if (!email) return;
    setResending(true);
    setError('');

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email,
        password: 'placeholder',
        options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
      });

      if (error && !error.message.includes('already registered')) {
        setError(error.message);
        return;
      }

      setResent(true);
    } catch {
      setError('Failed to resend. Please try again.');
    } finally {
      setResending(false);
    }
  }, [email]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="font-['Playfair_Display'] font-bold text-2xl text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors">
            JK-TECH-CODE<span className="text-[var(--accent)]">.</span>
          </Link>
        </div>

        <Card className="border-[var(--border-color)] bg-[var(--surface)]">
          <CardHeader className="text-center">
            <div className="w-12 h-12 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center mx-auto mb-3">
              {resent ? <CheckCircle2 className="h-6 w-6 text-green-400" /> : <Mail className="h-6 w-6 text-[var(--accent)]" />}
            </div>
            <CardTitle className="font-['Playfair_Display'] text-2xl text-[var(--text-primary)]">
              {resent ? 'Email sent' : 'Verify your email'}
            </CardTitle>
            <CardDescription className="text-[var(--text-muted-70)]">
              {resent
                ? 'A new verification email has been sent.'
                : 'We\'ve sent a verification link to your email. Please check your inbox.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="text-center space-y-4">
            {email && (
              <p className="text-sm text-[var(--text-muted-50)]">
                Sent to: <span className="text-[var(--text-primary)] font-medium">{email}</span>
              </p>
            )}
            <p className="text-sm text-[var(--text-muted-50)]">
              Didn&apos;t receive the email? Check your spam folder or resend below.
            </p>
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            {!resent && (
              <Button
                type="button"
                onClick={handleResend}
                disabled={resending || !email}
                variant="outline"
                className="w-full"
              >
                {resending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Resending...</>
                ) : (
                  <><Mail className="h-4 w-4 mr-2" />Resend verification email</>
                )}
              </Button>
            )}

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            <Link
              href="/login"
              className="text-sm text-[var(--accent)] hover:underline text-center"
            >
              Go to sign in
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}
