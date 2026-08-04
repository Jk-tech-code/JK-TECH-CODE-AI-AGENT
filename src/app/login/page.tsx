'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Eye, EyeOff, ArrowRight, Sparkles, Mail, Github } from 'lucide-react';
import { OAuthButtons } from '@/components/oauth-buttons';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNeedsVerification(false);

    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes('Email not confirmed')) {
          setNeedsVerification(true);
          setError('Please verify your email before signing in.');
        } else {
          setError('Invalid email or password.');
        }
        return;
      }

      // Sync profile to database
      if (data.user) {
        await fetch('/api/auth/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: data.user.id }),
        }).catch(() => {});
      }

      router.push('/');
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [email, password, router]);

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[var(--background)] px-4 overflow-hidden">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -top-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-[var(--accent)]/10 blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 h-[24rem] w-[24rem] rounded-full bg-[var(--accent)]/5 blur-[100px]" />
      </div>
      <div className="w-full max-w-md relative">
        <div className="text-center mb-8">
          <Link href="/" className="font-['Playfair_Display'] font-bold text-2xl text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors">
            JK-TECH-CODE<span className="text-[var(--accent)]">.</span>
          </Link>
        </div>

        <Card className="border-[var(--border-color)] bg-[var(--surface)] backdrop-blur-sm">
          <CardHeader className="text-center">
            <div className="w-12 h-12 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="h-6 w-6 text-[var(--accent)]" />
            </div>
            <CardTitle className="font-['Playfair_Display'] text-2xl text-[var(--text-primary)]">
              Welcome back
            </CardTitle>
            <CardDescription className="text-[var(--text-muted-70)]">
              Sign in to your account to continue
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3" role="alert">
                  <p>{error}</p>
                  {needsVerification && (
                    <Link
                      href={`/verify-email?email=${encodeURIComponent(email)}`}
                      className="inline-flex items-center gap-1 mt-2 text-[var(--accent)] hover:underline font-medium"
                    >
                      <Mail className="h-3 w-3" />
                      Resend verification email
                    </Link>
                  )}
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

              <div className="space-y-2">
                <Label htmlFor="password" className="text-[var(--text-muted-70)] text-xs uppercase tracking-wider">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                    className="bg-[var(--background)] border-[var(--border-color)] text-[var(--text-primary)] placeholder:text-[var(--text-muted-30)] focus-visible:ring-[var(--accent)] pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted-50)] hover:text-[var(--text-primary)] transition-colors bg-transparent border-none cursor-pointer p-0"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold"
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Signing in...</>
                ) : (
                  <><ArrowRight className="h-4 w-4 mr-2" />Sign In</>
                )}
              </Button>
              <div className="flex items-center justify-between w-full">
                <button
                  type="button"
                  onClick={() => router.push('/forgot-password')}
                  className="text-xs text-[var(--text-muted-50)] hover:text-[var(--accent)] transition-colors bg-transparent border-none cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>

              <div className="relative my-1">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-[var(--border-color)]" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-[var(--surface)] px-2 text-[var(--text-muted-50)]">or continue with</span>
                </div>
              </div>

              <OAuthButtons redirectTo="/dashboard" />

              <p className="text-sm text-[var(--text-muted-50)]">
                Don&apos;t have an account?{' '}
                <Link href="/register" className="text-[var(--accent)] hover:underline font-medium">
                  Create one
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
