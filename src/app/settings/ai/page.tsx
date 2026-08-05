'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Brain, Cpu, Sparkles, Loader2, Save, CheckCircle2, Database, FileText,
} from 'lucide-react';
import { DEFAULT_SETTINGS, type BrainSettings } from '@/brain/types';

const PROVIDER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'gemini', label: 'Gemini (cloud, default)' },
  { value: 'ollama', label: 'Ollama (local)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'groq', label: 'Groq' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'anthropic', label: 'Anthropic Claude' },
  { value: 'together', label: 'Together AI' },
];

const MODEL_PRESETS: Record<string, string[]> = {
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'],
  ollama: ['qwen3:4b', 'qwen3:8b', 'qwen3:14b'],
  openai: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it', 'qwen-qwq-32b'],
  openrouter: ['google/gemini-2.5-flash', 'anthropic/claude-sonnet-4', 'openai/gpt-4o', 'meta-llama/llama-3.3-70b-instruct'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-3-7-sonnet-20250219', 'claude-3-5-haiku-latest'],
  together: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct', 'deepseek-ai/DeepSeek-V3', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
};

interface ProviderHealth {
  provider: string;
  available: boolean;
  model: string;
  reason?: string;
}

export default function AISettingsPage() {
  const [settings, setSettings] = useState<BrainSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<{ provider: string; available: boolean; model: string; reason?: string } | null>(null);
  const [providers, setProviders] = useState<ProviderHealth[]>([]);
  const [installedModels, setInstalledModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/settings');
      if (!res.ok) throw new Error('Failed to load settings');
      const data = await res.json();
      setSettings(data.settings);
      setStatus(data.provider);
      setProviders(Array.isArray(data.providers) ? data.providers : []);
      setInstalledModels((data.models || []).map((m: { name: string }) => m.name));
    } catch {
      toast.error('Could not load AI settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const update = useCallback(<K extends keyof BrainSettings>(key: K, value: BrainSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/ai/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save settings');
      }
      setSaved(true);
      toast.success('AI settings saved. They apply to your next message.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const exportSettings = useCallback(() => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jk-tech-ai-settings.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast.success('Settings exported.');
  }, [settings]);

  const onImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<BrainSettings>;
      // Merge only known numeric/string/boolean fields; discard the rest.
      const merged = { ...settings };
      for (const key of Object.keys(parsed) as Array<keyof BrainSettings>) {
        const v = parsed[key];
        if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
          (merged as Record<string, unknown>)[key] = v;
        }
      }
      setSettings(merged);
      setSaved(false);
      toast.success('Settings imported — review and Save to apply.');
    } catch {
      toast.error('Invalid settings file.');
    }
  }, [settings]);

  const providerOk = status?.available !== false;

  const slider = useMemo(() => (label: string, value: number, min: number, max: number, step: number, unit: string, onChange: (v: number) => void) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-[var(--text-muted-70)]">{label}</Label>
        <span className="text-xs text-[var(--accent)]">{value}{unit}</span>
      </div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={(v) => onChange(v[0])} />
    </div>
  ), []);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--background)]">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--background)] pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[var(--border-color)] bg-[var(--surface)]/80 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link href="/#agent" className="text-sm text-[var(--text-muted-50)] hover:text-[var(--accent)] transition-colors">
            &larr; Back
          </Link>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent)] text-white shadow-soft">
            <Brain className="h-4 w-4" />
          </div>
          <h1 className="font-['Playfair_Display'] text-lg font-bold text-[var(--text-primary)]">AI Settings</h1>
          <span className="ml-auto">
            {saved && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-500">
                <CheckCircle2 className="h-3.5 w-3.5" /> Saved
              </span>
            )}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 pt-8">
        {/* Provider status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-[var(--accent)]" /> Brain Provider
            </CardTitle>
            <CardDescription>Pick any supported LLM backend — Gemini in the cloud by default, local Ollama for development, or Groq / OpenRouter / OpenAI / Claude / Together.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2.5">
              <span className={`h-2 w-2 rounded-full ${providerOk ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <span className="text-sm text-[var(--text-primary)]">
                {providerOk ? `${status?.model} available` : status?.reason || 'Local AI is currently unavailable.'}
              </span>
              {!providerOk && (
                <Button variant="outline" size="sm" className="ml-auto" onClick={() => void load()}>
                  Retry
                </Button>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="model" className="text-[var(--text-muted-70)]">Model</Label>
                <Input
                  id="model"
                  list="model-presets"
                  value={settings.model}
                  onChange={(e) => update('model', e.target.value)}
                />
                <datalist id="model-presets">
                  {(MODEL_PRESETS[settings.provider] || []).map((m) => <option key={m} value={m} />)}
                  {installedModels
                    .filter((m) => !(MODEL_PRESETS[settings.provider] || []).includes(m))
                    .map((m) => <option key={m} value={m} />)}
                </datalist>
                <p className="text-[11px] text-[var(--text-muted-30)]">
                  Installed locally: {installedModels.length > 0 ? installedModels.join(', ') : 'fetching…'}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="provider" className="text-[var(--text-muted-70)]">Provider</Label>
                <select
                  id="provider"
                  className="flex h-9 w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                  value={settings.provider}
                  onChange={(e) => update('provider', e.target.value as BrainSettings['provider'])}
                >
                  {PROVIDER_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* All providers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-4 w-4 text-[var(--accent)]" /> Available Providers
            </CardTitle>
            <CardDescription>Which backends are configured and reachable. Keys come from your environment (Vercel project settings in production).</CardDescription>
          </CardHeader>
          <CardContent>
            {providers.length === 0 ? (
              <p className="text-xs text-[var(--text-muted-30)]">Loading provider status…</p>
            ) : (
              <ul className="space-y-2">
                {providers.map((p) => {
                  const label = PROVIDER_OPTIONS.find((o) => o.value === p.provider)?.label || p.provider;
                  const active = p.provider === settings.provider;
                  return (
                    <li
                      key={p.provider}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${
                        active ? 'border-[var(--accent)] bg-[var(--surface-accent)]' : 'border-[var(--border-color)] bg-[var(--surface)]'
                      }`}
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${p.available ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <span className="truncate text-[var(--text-primary)]">{label}</span>
                      <span className="ml-auto truncate text-xs text-[var(--text-muted-50)]" title={p.reason || p.model}>
                        {p.available ? p.model : p.reason || 'Unavailable'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Sampling */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[var(--accent)]" /> Generation
            </CardTitle>
            <CardDescription>Control how the model responds.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {slider('Temperature', settings.temperature, 0, 2, 0.1, '', (v) => update('temperature', v))}
            {slider('Top P', settings.topP, 0.05, 1, 0.05, '', (v) => update('topP', v))}
            {slider('Top K', settings.topK, 0, 128, 1, '', (v) => update('topK', v))}
            {slider('Max Tokens', settings.maxTokens, 256, 8192, 256, '', (v) => update('maxTokens', v))}

            <div className="space-y-2">
              <Label className="text-[var(--text-muted-70)]">Response Length</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['short', 'balanced', 'detailed'] as const).map((len) => (
                  <button
                    key={len}
                    type="button"
                    onClick={() => update('responseLength', len)}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium capitalize transition-colors ${
                      settings.responseLength === len
                        ? 'border-[var(--accent)] bg-[var(--surface-accent)] text-[var(--accent)]'
                        : 'border-[var(--border-color)] bg-[var(--surface)] text-[var(--text-muted-70)] hover:border-[var(--accent)]/40'
                    }`}
                  >
                    {len}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[var(--text-muted-70)]">Reasoning Level</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['low', 'medium', 'high'] as const).map((lv) => (
                  <button
                    key={lv}
                    type="button"
                    onClick={() => update('reasoningLevel', lv)}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium capitalize transition-colors ${
                      settings.reasoningLevel === lv
                        ? 'border-[var(--accent)] bg-[var(--surface-accent)] text-[var(--accent)]'
                        : 'border-[var(--border-color)] bg-[var(--surface)] text-[var(--text-muted-70)] hover:border-[var(--accent)]/40'
                    }`}
                  >
                    {lv}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Behavior toggles */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-4 w-4 text-[var(--accent)]" /> Behavior
            </CardTitle>
            <CardDescription>Memory and knowledge keep the Brain helpful across conversations.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[var(--text-primary)]">Memory</p>
                <p className="text-xs text-[var(--text-muted-50)]">Remember preferences, projects, and past exchanges.</p>
              </div>
              <Switch checked={settings.memoryEnabled !== false} onCheckedChange={(v) => update('memoryEnabled', v)} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[var(--text-primary)]">Knowledge & Files</p>
                <p className="text-xs text-[var(--text-muted-50)]">Use uploaded documents and file content as context.</p>
              </div>
              <Switch checked={settings.knowledgeEnabled !== false} onCheckedChange={(v) => update('knowledgeEnabled', v)} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[var(--text-primary)]">Streaming</p>
                <p className="text-xs text-[var(--text-muted-50)]">Stream responses token-by-token with a live cursor.</p>
              </div>
              <Switch checked={settings.streaming !== false} onCheckedChange={(v) => update('streaming', v)} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[var(--text-primary)]">Automatic fallback</p>
                <p className="text-xs text-[var(--text-muted-50)]">If the selected provider fails (rate limit, outage), retry with the next configured provider automatically.</p>
              </div>
              <Switch checked={settings.fallbackEnabled === true} onCheckedChange={(v) => update('fallbackEnabled', v)} />
            </div>

            <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-4">
              <div>
                <p className="text-sm text-[var(--text-primary)]">Manage Memories</p>
                <p className="text-xs text-[var(--text-muted-50)]">Search, edit, or forget what the Brain remembers.</p>
              </div>
              <Link href="/settings/memory" className="rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted-70)] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--accent)]">
                Open
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Voice */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[var(--accent)]" /> Voice
            </CardTitle>
            <CardDescription>Optional personal guidance layered under the default persona.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="systemPrompt" className="text-[var(--text-muted-70)]">System Prompt (overrides)</Label>
              <textarea
                id="systemPrompt"
                rows={4}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                placeholder="Optional extra instructions layered on top of the default Brain persona…"
                value={settings.systemPrompt}
                onChange={(e) => update('systemPrompt', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="personality" className="text-[var(--text-muted-70)]">Personality Notes</Label>
              <textarea
                id="personality"
                rows={3}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                placeholder="e.g. Be concise, friendly, avoid jargon…"
                value={settings.personality}
                onChange={(e) => update('personality', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Export / Import */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Save className="h-4 w-4 text-[var(--accent)]" /> Export / Import
            </CardTitle>
            <CardDescription>Back up your Brain settings as a JSON file, or restore them later.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={exportSettings}>
              <Save className="h-4 w-4" /> Export settings
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text-muted-70)] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--accent)]">
              Import settings
              <input type="file" accept="application/json" className="hidden" onChange={onImportFile} />
            </label>
          </CardContent>
        </Card>

        {/* Save */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => void load()}>Discard</Button>
          <Button onClick={() => void save()} disabled={saving} className="bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Settings
          </Button>
        </div>
      </main>
    </div>
  );
}