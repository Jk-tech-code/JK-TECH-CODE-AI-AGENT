'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Send, Sparkles, Mail, MessageSquare } from 'lucide-react';

export default function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !email || !message) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message, category: 'contact' }),
      });

      if (!res.ok) throw new Error('Failed to send');
      setSent(true);
    } catch {
      setError('Failed to send message. Please email us directly at support@jktechcode.com.');
    } finally {
      setLoading(false);
    }
  }, [name, email, message]);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-lg mx-auto px-6 py-20">
        <Link href="/" className="text-sm text-[var(--accent)] hover:underline mb-8 inline-block">&larr; Back to home</Link>

        <Card className="border-[var(--border-color)] bg-[var(--surface)]">
          <CardHeader className="text-center">
            <div className="w-12 h-12 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center mx-auto mb-3">
              {sent ? <Mail className="h-6 w-6 text-green-400" /> : <MessageSquare className="h-6 w-6 text-[var(--accent)]" />}
            </div>
            <CardTitle className="text-2xl text-[var(--text-primary)]">
              {sent ? 'Message sent' : 'Contact us'}
            </CardTitle>
            <CardDescription className="text-[var(--text-muted-70)]">
              {sent
                ? 'We\'ll get back to you as soon as possible.'
                : 'Have a question or feedback? We\'d love to hear from you.'}
            </CardDescription>
          </CardHeader>

          {!sent && (
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={name} onChange={e => setName(e.target.value)} required />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Message</Label>
                  <textarea
                    id="message"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    required
                    rows={5}
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted-30)] focus-visible:ring-[var(--accent)] focus-visible:outline-none"
                  />
                </div>

                <Button type="submit" disabled={loading} className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white">
                  {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  {loading ? 'Sending...' : 'Send Message'}
                </Button>
              </form>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
