'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Mail, ArrowLeft, Sparkles } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        setError(error.message);
        return;
      }

      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
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
              <Sparkles className="h-6 w-6 text-[var(--accent)]" />
            </div>
            <CardTitle className="font-['Playfair_Display'] text-2xl text-[var(--text-primary)]">
              {sent ? 'Check your email' : 'Reset your password'}
            </CardTitle>
            <CardDescription className="text-[var(--text-muted-70)]">
              {sent
                ? 'We\'ve sent a password reset link to your email.'
                : 'Enter your email and we\'ll send you a reset link.'}
            </CardDescription>
          </CardHeader>

          {sent ? (
            <CardContent className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-[var(--accent)]/10 flex items-center justify-center mx-auto">
                <Mail className="h-8 w-8 text-[var(--accent)]" />
              </div>
              <p className="text-sm text-[var(--text-muted-50)]">
                Didn&apos;t receive the email? Check your spam folder or{' '}
                <button
                  type="button"
                  onClick={() => setSent(false)}
                  className="text-[var(--accent)] hover:underline bg-transparent border-none cursor-pointer"
                >
                  try again
                </button>
                .
              </p>
            </CardContent>
          ) : (
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4">
                {error && (
                  <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3" role="alert">
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[var(--text-muted-70)] text-xs uppercase tracking-wider">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                    className="bg-[var(--background)] border-[var(--border-color)] text-[var(--text-primary)] placeholder:text-[var(--text-muted-30)] focus-visible:ring-[var(--accent)]"
                  />
                </div>
              </CardContent>

              <CardFooter className="flex flex-col gap-3">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold"
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</>
                  ) : (
                    <><Mail className="h-4 w-4 mr-2" />Send Reset Link</>
                  )}
                </Button>
              </CardFooter>
            </form>
          )}

          <CardFooter className="justify-center pt-0">
            <Link href="/login" className="text-sm text-[var(--text-muted-50)] hover:text-[var(--accent)] transition-colors flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" />
              Back to sign in
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
