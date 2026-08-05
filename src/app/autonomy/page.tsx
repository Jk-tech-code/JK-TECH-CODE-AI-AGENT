'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Bot, CheckCircle2, Circle, Loader2, Wrench, Puzzle, FolderOpen, Workflow, Terminal, Search, Clock, KeyRound, XCircle, AlertTriangle,
} from 'lucide-react';

interface TaskStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'blocked' | 'cancelled';
  output?: string;
  error?: string;
}

interface Plan {
  goal: string;
  status: string;
  progress: number;
  steps: TaskStep[];
}

export default function AutonomyPage() {
  const [goal, setGoal] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [running, setRunning] = useState(false);
  const [deliverable, setDeliverable] = useState<string | null>(null);
  const [clarify, setClarify] = useState<string | null>(null);

  const [plugins, setPlugins] = useState<Array<{ manifest: { id: string; name: string; description: string; enabled: boolean }; health: { ok: boolean } }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string; description: string; goals: string[] }>>([]);
  const [workflows, setWorkflows] = useState<Array<{ id: string; name: string; steps: unknown[] }>>([]);
  const [keys, setKeys] = useState<Array<{ id: string; name: string; createdAt: number }>>([]);

  const [sandboxCode, setSandboxCode] = useState('console.log("hello from the sandbox");\nconst x = 21 * 2;\nx;');
  const [sandboxRuntime, setSandboxRuntime] = useState('javascript');
  const [sandboxResult, setSandboxResult] = useState<{ ok: boolean; output?: string; error?: string; executionTimeMs?: number; logs?: string[] } | null>(null);

  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ type: string; title: string; snippet: string; route: string }>>([]);

  const loadLists = useCallback(async () => {
    try {
      const [p, pr, w, k] = await Promise.all([
        fetch('/api/plugins').then((r) => r.json()),
        fetch('/api/projects').then((r) => r.json()),
        fetch('/api/workflows').then((r) => r.json()),
        fetch('/api/keys').then((r) => r.json()),
      ]);
      setPlugins(p.plugins ?? []);
      setProjects(pr.projects ?? []);
      setWorkflows(w.workflows ?? []);
      setKeys(k.keys ?? []);
    } catch {
      /* lists may fail individually */
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void loadLists(), 0);
    return () => clearTimeout(t);
  }, [loadLists]);

  const runPlan = async () => {
    if (!goal.trim()) return;
    setRunning(true);
    setDeliverable(null);
    setClarify(null);
    setPlan({ goal, status: 'running', progress: 0, steps: [] });
    try {
      const res = await fetch('/api/autonomy/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal }),
      });
      const data = await res.json();
      if (data.needsClarification) {
        setClarify(data.question);
        setPlan(data.plan ?? null);
      } else {
        setPlan(data.plan ?? null);
        setDeliverable(data.deliverable ?? '');
      }
    } catch {
      toast.error('Autonomy run failed.');
    } finally {
      setRunning(false);
    }
  };

  const togglePlugin = async (id: string, enabled: boolean) => {
    const res = await fetch('/api/plugins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, enabled }),
    });
    if (res.ok) {
      setPlugins((prev) => prev.map((p) => (p.manifest.id === id ? { ...p, manifest: { ...p.manifest, enabled } } : p)));
      toast.success(`Plugin ${enabled ? 'enabled' : 'disabled'}`);
    }
  };

  const runSandbox = async () => {
    setSandboxResult(null);
    const res = await fetch('/api/sandbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runtime: sandboxRuntime, code: sandboxCode }),
    });
    const data = await res.json();
    setSandboxResult(data);
  };

  const runSearch = async () => {
    if (!searchQ.trim()) return;
    const res = await fetch(`/api/search?q=${encodeURIComponent(searchQ)}`);
    const data = await res.json();
    setSearchResults(data.results ?? []);
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Bot className="h-6 w-6 text-[var(--accent)]" /> Autonomy
        </h1>
        <p className="text-sm text-[var(--text-muted-70)]">
          Plan, execute, tool, plug in, automate. The agent breaks down goals, runs steps, and reports progress.
        </p>
      </div>

      <Tabs defaultValue="agent">
        <TabsList className="mb-4 flex flex-wrap">
          <TabsTrigger value="agent"><Bot className="mr-1 h-4 w-4" />Agent Run</TabsTrigger>
          <TabsTrigger value="tools"><Wrench className="mr-1 h-4 w-4" />Tools</TabsTrigger>
          <TabsTrigger value="plugins"><Puzzle className="mr-1 h-4 w-4" />Plugins</TabsTrigger>
          <TabsTrigger value="projects"><FolderOpen className="mr-1 h-4 w-4" />Projects</TabsTrigger>
          <TabsTrigger value="workflows"><Workflow className="mr-1 h-4 w-4" />Workflows</TabsTrigger>
          <TabsTrigger value="sandbox"><Terminal className="mr-1 h-4 w-4" />Sandbox</TabsTrigger>
          <TabsTrigger value="search"><Search className="mr-1 h-4 w-4" />Search</TabsTrigger>
          <TabsTrigger value="automation"><Clock className="mr-1 h-4 w-4" />Automation</TabsTrigger>
          <TabsTrigger value="keys"><KeyRound className="mr-1 h-4 w-4" />API Keys</TabsTrigger>
        </TabsList>

        {/* Agent run */}
        <TabsContent value="agent">
          <Card>
            <CardHeader>
              <CardTitle>Autonomous Agent Run</CardTitle>
              <CardDescription>Give the agent a complex goal. It plans the steps, executes them, and shows live progress.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="e.g. Build me an ecommerce website with product listings, cart, checkout and admin dashboard."
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                rows={3}
              />
              <Button onClick={runPlan} disabled={running || !goal.trim()}>
                {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
                {running ? 'Executing…' : 'Plan & Execute'}
              </Button>

              {clarify && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
                  <AlertTriangle className="mr-1 inline h-4 w-4" /> {clarify}
                </div>
              )}

              {plan && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{plan.goal}</span>
                    <Badge>{plan.progress}%</Badge>
                  </div>
                  <Progress value={plan.progress} className="h-2" />
                  <div className="space-y-1.5">
                    {plan.steps.map((step) => (
                      <div key={step.id} className="flex items-start gap-2 rounded-lg border border-[var(--border-color)] p-2.5">
                        {step.status === 'completed' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />}
                        {step.status === 'running' && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-sky-500" />}
                        {step.status === 'failed' && <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />}
                        {(step.status === 'pending' || step.status === 'queued') && <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted-50)]" />}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{step.title}</span>
                            <Badge variant="outline" className="text-[10px]">{step.status}</Badge>
                          </div>
                          {step.description && <p className="text-xs text-[var(--text-muted-70)]">{step.description}</p>}
                          {step.error && <p className="text-xs text-red-400">{step.error}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {deliverable && (
                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-accent)] p-4">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted-50)]">Deliverable</div>
                  <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">{deliverable}</pre>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tools */}
        <TabsContent value="tools">
          <Card>
            <CardHeader>
              <CardTitle>Tool Ecosystem</CardTitle>
              <CardDescription>The Brain auto-invokes tools whose detection patterns match the request. Tool output is never shown to you directly — it feeds the answer.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ['calculator', 'Safely evaluates arithmetic expressions'],
                  ['web_search', 'Searches the web when a search provider is configured'],
                  ['file_reader', 'Extracts text from PDF / DOCX / XLSX / TXT'],
                  ['csv_analyzer', 'Parses CSV, computes rows/columns, preview'],
                  ['json_parser', 'Validates and summarizes JSON'],
                  ['markdown_parser', 'Extracts headings and links from Markdown'],
                ].map(([id, desc]) => (
                  <div key={id} className="rounded-lg border border-[var(--border-color)] p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-[var(--accent)]" />
                      <span className="text-sm font-semibold">{id}</span>
                    </div>
                    <p className="text-xs text-[var(--text-muted-70)]">{desc}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Plugins */}
        <TabsContent value="plugins">
          <Card>
            <CardHeader>
              <CardTitle>Plugins</CardTitle>
              <CardDescription>Enable or disable capability plugins. Each registers a manifest and health status.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {plugins.map((p) => (
                <div key={p.manifest.id} className="flex items-center justify-between rounded-lg border border-[var(--border-color)] p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{p.manifest.name}</span>
                      <Badge className={p.manifest.enabled ? '' : 'bg-[var(--text-muted-50)]'}>{p.manifest.enabled ? 'enabled' : 'disabled'}</Badge>
                    </div>
                    <p className="text-xs text-[var(--text-muted-70)]">{p.manifest.description}</p>
                  </div>
                  <Switch checked={p.manifest.enabled} onCheckedChange={(v) => togglePlugin(p.manifest.id, v)} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Projects */}
        <TabsContent value="projects">
          <Card>
            <CardHeader>
              <CardTitle>Projects</CardTitle>
              <CardDescription>Persistent workspaces that remember goals, files, notes and context.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {projects.map((p) => (
                <div key={p.id} className="rounded-lg border border-[var(--border-color)] p-3">
                  <div className="text-sm font-semibold">{p.name}</div>
                  <p className="text-xs text-[var(--text-muted-70)]">{p.description || (p.goals || []).join('; ')}</p>
                </div>
              ))}
              {projects.length === 0 && <p className="text-sm text-[var(--text-muted-50)]">No projects yet. Create one via the Projects API or the agent.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Workflows */}
        <TabsContent value="workflows">
          <Card>
            <CardHeader>
              <CardTitle>Workflows</CardTitle>
              <CardDescription>Saved multi-step workflows composed of tools and plugins.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {workflows.map((w) => (
                <div key={w.id} className="rounded-lg border border-[var(--border-color)] p-3">
                  <div className="text-sm font-semibold">{w.name}</div>
                  <p className="text-xs text-[var(--text-muted-70)]">{w.steps.length} steps</p>
                </div>
              ))}
              {workflows.length === 0 && <p className="text-sm text-[var(--text-muted-50)]">No workflows yet.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sandbox */}
        <TabsContent value="sandbox">
          <Card>
            <CardHeader>
              <CardTitle>Secure Sandbox</CardTitle>
              <CardDescription>Run JavaScript/TypeScript in an isolated context, or validate read-only SQL/shell. No unsafe operations allowed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                {['javascript', 'typescript', 'sql', 'shell'].map((rt) => (
                  <Button key={rt} size="sm" variant={sandboxRuntime === rt ? 'default' : 'outline'} onClick={() => setSandboxRuntime(rt)}>
                    {rt}
                  </Button>
                ))}
              </div>
              <Textarea value={sandboxCode} onChange={(e) => setSandboxCode(e.target.value)} rows={6} className="font-mono text-xs" />
              <Button onClick={runSandbox}><Terminal className="mr-2 h-4 w-4" />Run</Button>
              {sandboxResult && (
                <div className={`rounded-lg border p-3 font-mono text-xs ${sandboxResult.ok ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-red-500/40 bg-red-500/5'}`}>
                  <div className="mb-1 flex items-center gap-2">
                    {sandboxResult.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                    <span>{sandboxResult.ok ? 'OK' : 'Error'}</span>
                    <span className="text-[var(--text-muted-50)]">{(sandboxResult.executionTimeMs ?? 0).toFixed(1)}ms</span>
                  </div>
                  {sandboxResult.logs?.map((l, i) => <div key={i} className="text-sky-300">{l}</div>)}
                  {sandboxResult.output && <pre className="whitespace-pre-wrap">{sandboxResult.output}</pre>}
                  {sandboxResult.error && <div className="text-red-400">{sandboxResult.error}</div>}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Search */}
        <TabsContent value="search">
          <Card>
            <CardHeader>
              <CardTitle>Unified Search</CardTitle>
              <CardDescription>Search across chats, projects, memory, files and notes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Search anything…" onKeyDown={(e) => e.key === 'Enter' && runSearch()} />
                <Button onClick={runSearch}><Search className="mr-2 h-4 w-4" />Search</Button>
              </div>
              {searchResults.map((r, i) => (
                <a key={i} href={r.route} className="block rounded-lg border border-[var(--border-color)] p-3 hover:bg-[var(--surface-accent)]">
                  <div className="flex items-center gap-2">
                    <Badge>{r.type}</Badge>
                    <span className="text-sm font-medium">{r.title}</span>
                  </div>
                  <p className="text-xs text-[var(--text-muted-70)]">{r.snippet}</p>
                </a>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Automation */}
        <TabsContent value="automation">
          <Card>
            <CardHeader>
              <CardTitle>Automation</CardTitle>
              <CardDescription>Scheduled tasks: daily reports, weekly summaries, reminders, syncs. Schedules persist and run via the automations API.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[var(--text-muted-70)]">
                Create schedules with <code className="rounded bg-[var(--surface-accent)] px-1">POST /api/automations</code> and trigger due jobs with{' '}
                <code className="rounded bg-[var(--surface-accent)] px-1">POST /api/automations/run</code>. Connect to Vercel Cron for hands-off execution.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* API keys */}
        <TabsContent value="keys">
          <Card>
            <CardHeader>
              <CardTitle>API Keys</CardTitle>
              <CardDescription>Programmatic access to autonomy endpoints. Keys are stored hashed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {keys.map((k) => (
                <div key={k.id} className="flex items-center justify-between rounded-lg border border-[var(--border-color)] p-3">
                  <span className="text-sm font-medium">{k.name}</span>
                  <span className="font-mono text-xs text-[var(--text-muted-50)]">…{k.id}</span>
                </div>
              ))}
              {keys.length === 0 && <p className="text-sm text-[var(--text-muted-50)]">No API keys. Create via <code>POST /api/keys</code>.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}