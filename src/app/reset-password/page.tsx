'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Eye, EyeOff, KeyRound, Sparkles, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true);
      }
    });
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setError(error.message);
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push('/login'), 3000);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [password, confirmPassword, router]);

  if (!sessionReady && !success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 text-[var(--accent)] animate-spin mx-auto mb-4" />
          <p className="text-[var(--text-muted-50)]">Verifying reset link...</p>
        </div>
      </div>
    );
  }

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
              {success ? 'Password updated' : 'Set new password'}
            </CardTitle>
            <CardDescription className="text-[var(--text-muted-70)]">
              {success
                ? 'Your password has been successfully reset.'
                : 'Enter your new password below.'}
            </CardDescription>
          </CardHeader>

          {success ? (
            <CardContent className="text-center space-y-4">
              <CheckCircle2 className="h-16 w-16 text-green-400 mx-auto" />
              <p className="text-sm text-[var(--text-muted-50)]">
                Redirecting you to sign in...
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
                  <Label htmlFor="password" className="text-[var(--text-muted-70)] text-xs uppercase tracking-wider">
                    New Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      autoComplete="new-password"
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

                <div className="space-y-2">
                  <Label htmlFor="confirm-password" className="text-[var(--text-muted-70)] text-xs uppercase tracking-wider">
                    Confirm New Password
                  </Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat your new password"
                    autoComplete="new-password"
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
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Updating...</>
                  ) : (
                    <><KeyRound className="h-4 w-4 mr-2" />Update Password</>
                  )}
                </Button>
              </CardFooter>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
