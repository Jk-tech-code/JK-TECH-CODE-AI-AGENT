'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Eye, EyeOff, UserPlus, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password || !confirmPassword) {
      setError('Please fill in all required fields.');
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
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name || undefined, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Registration failed.');
        return;
      }

      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [name, email, password, confirmPassword, router]);

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
              Create your account
            </CardTitle>
            <CardDescription className="text-[var(--text-muted-70)]">
              Start writing like a human, not a machine
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3" role="alert">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="name" className="text-[var(--text-muted-70)] text-xs uppercase tracking-wider">
                  Name <span className="text-[var(--text-muted-30)]">(optional)</span>
                </Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  className="bg-[var(--background)] border-[var(--border-color)] text-[var(--text-primary)] placeholder:text-[var(--text-muted-30)] focus-visible:ring-[var(--accent)]"
                />
              </div>

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
                  Confirm Password
                </Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
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
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating account...</>
                ) : (
                  <><UserPlus className="h-4 w-4 mr-2" />Create Account</>
                )}
              </Button>
              <p className="text-sm text-[var(--text-muted-50)]">
                Already have an account?{' '}
                <Link href="/login" className="text-[var(--accent)] hover:underline font-medium">
                  Sign in
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
