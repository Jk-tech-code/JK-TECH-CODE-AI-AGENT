'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Brain, Loader2, Search, Trash2, Pencil, Check, X, Database, Sparkles, Info,
} from 'lucide-react';

interface MemoryItem {
  id: string;
  type: string;
  content: string;
  tags: string[];
  accessCount: number;
  createdAt: string;
  lastAccessed: string;
  confidence: number;
}

interface MemoryStats {
  total: number;
  byType: Record<string, number>;
  averageConfidence: number;
}

const TYPE_LABELS: Record<string, string> = {
  project: 'Project',
  preference: 'Preference',
  knowledge: 'Knowledge',
  fact: 'Fact',
  conversation: 'Conversation',
  session: 'Session',
};

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function typeColor(type: string) {
  switch (type) {
    case 'project': return 'bg-sky-500/10 text-sky-500';
    case 'preference': return 'bg-violet-500/10 text-violet-500';
    case 'knowledge': return 'bg-emerald-500/10 text-emerald-500';
    case 'fact': return 'bg-amber-500/10 text-amber-500';
    case 'conversation': return 'bg-rose-500/10 text-rose-500';
    default: return 'bg-[var(--surface-hover)] text-[var(--text-muted-70)]';
  }
}

export default function MemorySettingsPage() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState('');
  const [newType, setNewType] = useState('knowledge');
  const [newContent, setNewContent] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('query', query.trim());
      if (typeFilter) params.set('type', typeFilter);
      const res = await fetch(`/api/memory?${params.toString()}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error('Failed to load memories');
      const data = await res.json();
      setMemories(data.memories || []);
      setStats(data.stats || null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      toast.error('Could not load memories.');
    } finally {
      setLoading(false);
    }
  }, [query, typeFilter]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => { clearTimeout(t); abortRef.current?.abort(); };
  }, [load]);

  const clearAll = useCallback(async () => {
    if (!confirm('Forget ALL memories? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/memory?all=true', { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setMemories([]);
      toast.success('All memories forgotten.');
    } catch {
      toast.error('Failed to clear memories.');
    }
  }, []);

  const forgetOne = useCallback(async (id: string) => {
    if (!confirm('Forget this memory?')) return;
    try {
      const res = await fetch(`/api/memory?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setMemories(prev => prev.filter(m => m.id !== id));
      toast.success('Memory forgotten.');
    } catch {
      toast.error('Failed to forget memory.');
    }
  }, []);

  const startEdit = useCallback((m: MemoryItem) => {
    setEditingId(m.id);
    setEditContent(m.content);
    setEditTags(m.tags.join(', '));
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditContent('');
    setEditTags('');
  }, []);

  const saveEdit = useCallback(async (m: MemoryItem) => {
    setSaving(true);
    try {
      const res = await fetch('/api/memory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: m.id,
          content: editContent.trim(),
          tags: editTags.split(',').map(t => t.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error();
      setMemories(prev => prev.map(x =>
        x.id === m.id ? { ...x, content: editContent.trim(), tags: editTags.split(',').map(t => t.trim()).filter(Boolean) } : x,
      ));
      cancelEdit();
      toast.success('Memory updated.');
    } catch {
      toast.error('Failed to update memory.');
    } finally {
      setSaving(false);
    }
  }, [editContent, editTags, cancelEdit]);

  const addMemory = useCallback(async () => {
    if (!newContent.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: newType, content: newContent.trim() }),
      });
      if (!res.ok) throw new Error();
      setNewContent('');
      await load();
      toast.success('Memory saved.');
    } catch {
      toast.error('Failed to save memory.');
    } finally {
      setSaving(false);
    }
  }, [newContent, newType, load]);

  const filteredStats = useMemo(() => {
    if (!stats) return null;
    const total = typeFilter ? memories.length : stats.total;
    return { ...stats, total };
  }, [stats, typeFilter, memories.length]);

  return (
    <div className="min-h-dvh bg-[var(--background)] pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[var(--border-color)] bg-[var(--surface)]/80 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link href="/settings/ai" className="text-sm text-[var(--text-muted-50)] hover:text-[var(--accent)] transition-colors">
            &larr; AI Settings
          </Link>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent)] text-white shadow-soft">
            <Brain className="h-4 w-4" />
          </div>
          <h1 className="font-['Playfair_Display'] text-lg font-bold text-[var(--text-primary)]">Memory</h1>
          {stats && (
            <span className="ml-auto rounded-full border border-[var(--border-color)] bg-[var(--surface)] px-2.5 py-1 text-[11px] text-[var(--text-muted-70)]">
              {filteredStats?.total ?? 0} memories
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 pt-8">
        {/* Stats overview */}
        {stats && (
          <Card>
            <CardContent className="grid grid-cols-2 gap-4 pt-6 sm:grid-cols-4">
              <div>
                <p className="text-2xl font-bold text-[var(--text-primary)]">{stats.total}</p>
                <p className="text-xs text-[var(--text-muted-50)]">Total memories</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--text-primary)]">
                  {Math.round(stats.averageConfidence * 100)}%
                </p>
                <p className="text-xs text-[var(--text-muted-50)]">Avg. confidence</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--text-primary)]">{Object.keys(stats.byType).length}</p>
                <p className="text-xs text-[var(--text-muted-50)]">Memory types</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--text-primary)]">{stats.byType.project ?? 0}</p>
                <p className="text-xs text-[var(--text-muted-50)]">Projects</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Add memory */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[var(--accent)]" /> Add a Memory
            </CardTitle>
            <CardDescription>Teach the Brain something it should remember.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="w-full sm:w-40">
                <Label htmlFor="new-type" className="sr-only">Type</Label>
                <select
                  id="new-type"
                  className="h-9 w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                >
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <Input
                className="flex-1"
                placeholder="e.g. The client prefers Tailwind over CSS Modules on this project."
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void addMemory(); }}
              />
              <Button onClick={() => void addMemory()} disabled={saving || !newContent.trim()} className="bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Search + list */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-4 w-4 text-[var(--accent)]" /> Stored Memories
            </CardTitle>
            <CardDescription>Search, edit, or forget what the Brain knows.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted-30)]" />
                <Input
                  className="pl-9"
                  placeholder="Search memories…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <select
                className="h-9 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 sm:w-40"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">All types</option>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
              </div>
            ) : memories.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <Info className="h-8 w-8 text-[var(--text-muted-30)]" />
                <p className="text-sm text-[var(--text-muted-50)]">
                  {query.trim() || typeFilter ? 'No memories match your filter.' : 'No memories yet — they accumulate as you chat.'}
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {memories.map(m => (
                  <li
                    key={m.id}
                    className="rounded-xl border border-[var(--border-color)] bg-[var(--surface)] p-3 transition-colors hover:border-[var(--accent)]/30"
                  >
                    {editingId === m.id ? (
                      <div className="space-y-2">
                        <textarea
                          rows={3}
                          className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                        />
                        <Input
                          placeholder="tags, comma separated"
                          value={editTags}
                          onChange={(e) => setEditTags(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" className="bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]" onClick={() => void saveEdit(m)} disabled={saving}>
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={cancelEdit}>
                            <X className="h-3.5 w-3.5" /> Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${typeColor(m.type)}`}>
                            {TYPE_LABELS[m.type] || m.type}
                          </span>
                          <span className="ml-auto text-[11px] text-[var(--text-muted-30)]">
                            {Math.round(m.confidence * 100)}% confidence · used {m.accessCount}× · {formatDate(m.lastAccessed)}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-primary)]">{m.content}</p>
                        {m.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {m.tags.map(t => (
                              <span key={t} className="rounded bg-[var(--surface-hover)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted-70)]">#{t}</span>
                            ))}
                          </div>
                        )}
                        <div className="mt-3 flex items-center justify-end gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => startEdit(m)} className="text-[var(--text-muted-70)] hover:text-[var(--accent)]">
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => void forgetOne(m.id)} className="text-[var(--text-muted-70)] hover:text-red-500">
                            <Trash2 className="h-3.5 w-3.5" /> Forget
                          </Button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {!loading && memories.length > 0 && (
              <div className="flex justify-end border-t border-[var(--border-color)] pt-3">
                <Button size="sm" variant="ghost" onClick={() => void clearAll()} className="text-red-500 hover:bg-red-500/10">
                  <Trash2 className="h-3.5 w-3.5" /> Forget all memories
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
