'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Brain, Cpu, Loader2, RefreshCw, Database, Gauge, Shield, FileText, MessageSquare, Activity, Zap, Wrench, Puzzle,
} from 'lucide-react';

type HealthStatus = 'connected' | 'missing' | 'failed';

interface ProviderHealth {
  name: string;
  category: string;
  status: HealthStatus;
  latencyMs: number;
  detail?: string;
}

interface AdminPayload {
  provider?: { provider: string; available: boolean; model: string; reason?: string };
  ollama?: {
    healthy: boolean;
    host: string;
    configuredModel: string;
    installedModels: string[];
    models?: Array<{ name: string }>;
  };
  system?: {
    uptimeSeconds: number;
    nodeVersion: string;
    platform: string;
    arch: string;
    memory: Record<string, number>;
    env: string;
  };
  health?: { status: 'ready' | 'degraded' | 'error'; providers: ProviderHealth[]; checkedCount: number };
  usage?: {
    conversations: number;
    conversationMessages: number;
    documents: number;
    documentChunks: number;
    memories: number;
    apiLogs: number;
    avgLatencyMs: number;
    errorCount: number;
    feedbackCount: number;
    recentByModel: Record<string, number>;
  };
  latencyMs?: number;
  timestamp?: string;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autonomy, setAutonomy] = useState<{
    tools?: Array<{ id: string; name: string; ok: boolean; calls: number; failures: number }>;
    plugins?: Array<{ manifest: { id: string; name: string; enabled: boolean }; health: { ok: boolean } }>;
    runtime?: Array<{ label: string; ok: boolean; detail: string }>;
  } | null>(null);

  const loadAutonomy = useCallback(async () => {
    try {
      const res = await fetch('/api/autonomy/status');
      if (res.ok) setAutonomy(await res.json());
    } catch {
      /* admin-only endpoint may be unavailable */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/status');
      if (res.status === 403) {
        setError('Forbidden — admin access required.');
      } else if (!res.ok) {
        throw new Error('Failed to load status');
      } else {
        setData(await res.json());
      }
    } catch {
      setError('Could not load status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    const interval = setInterval(() => void load(), 15000);
    const ta = setTimeout(() => void loadAutonomy(), 100);
    return () => { clearTimeout(t); clearInterval(interval); clearTimeout(ta); };
  }, [load, loadAutonomy]);

  const fmtUptime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const statusColor = (s: HealthStatus) =>
    s === 'connected' ? 'text-emerald-500' : s === 'missing' ? 'text-amber-500' : 'text-red-500';

  if (loading && !data) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--background)]">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--background)] pb-24">
      <header className="sticky top-0 z-40 border-b border-[var(--border-color)] bg-[var(--surface)]/80 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Link href="/dashboard" className="text-sm text-[var(--text-muted-50)] hover:text-[var(--accent)] transition-colors">
            &larr; Dashboard
          </Link>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent)] text-white shadow-soft">
            <Gauge className="h-4 w-4" />
          </div>
          <h1 className="font-['Playfair_Display'] text-lg font-bold text-[var(--text-primary)]">System Status</h1>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 pt-8">
        {error ? (
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <Shield className="h-5 w-5 text-red-500" />
              <p className="text-sm text-[var(--text-primary)]">{error}</p>
            </CardContent>
          </Card>
        ) : data ? (
          <>
            {/* Brain + Ollama */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-[var(--accent)]" /> Brain Provider
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${data.provider?.available ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <span className="text-sm font-medium text-[var(--text-primary)] capitalize">{data.provider?.provider || 'unknown'}</span>
                    <span className="ml-auto text-sm text-[var(--text-muted-70)]">{data.provider?.model}</span>
                  </div>
                  {!data.provider?.available && data.provider?.reason && (
                    <p className="mt-2 text-xs text-red-500">{data.provider.reason}</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-[var(--accent)]" /> Ollama
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${data.ollama?.healthy ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <span className="text-sm text-[var(--text-primary)]">{data.ollama?.healthy ? 'Running' : 'Unavailable'}</span>
                    <span className="ml-auto text-xs text-[var(--text-muted-50)]">{data.ollama?.host}</span>
                  </div>
                  <div className="text-xs text-[var(--text-muted-70)]">
                    Configured: <span className="text-[var(--text-primary)]">{data.ollama?.configuredModel}</span>
                  </div>
                  <div className="text-xs text-[var(--text-muted-70)]">
                    Installed: <span className="text-[var(--text-primary)]">{(data.ollama?.installedModels || []).join(', ') || 'none'}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* System */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[var(--accent)]" /> System
                  <span className="ml-auto text-[11px] font-normal text-[var(--text-muted-30)]">polled {new Date(data.timestamp || Date.now()).toLocaleTimeString()}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-lg font-bold text-[var(--text-primary)]">{fmtUptime(data.system?.uptimeSeconds || 0)}</p>
                  <p className="text-xs text-[var(--text-muted-50)]">Uptime</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-[var(--text-primary)]">{data.system?.memory.heapUsedMB ?? 0} MB</p>
                  <p className="text-xs text-[var(--text-muted-50)]">Heap used</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-[var(--text-primary)]">{data.system?.memory.rssMB ?? 0} MB</p>
                  <p className="text-xs text-[var(--text-muted-50)]">RSS</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-[var(--text-primary)]">{data.system?.nodeVersion}</p>
                  <p className="text-xs text-[var(--text-muted-50)]">Node · {data.system?.env}</p>
                </div>
              </CardContent>
            </Card>

            {/* Usage */}
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard icon={<MessageSquare className="h-4 w-4" />} label="Conversations" value={data.usage?.conversations ?? 0} sub={`${data.usage?.conversationMessages ?? 0} messages`} />
              <StatCard icon={<FileText className="h-4 w-4" />} label="Documents" value={data.usage?.documents ?? 0} sub={`${data.usage?.documentChunks ?? 0} chunks`} />
              <StatCard icon={<Database className="h-4 w-4" />} label="Memories" value={data.usage?.memories ?? 0} sub={`${data.usage?.feedbackCount ?? 0} feedback`} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-[var(--accent)]" /> Throughput (last 24h)
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-lg font-bold text-[var(--text-primary)]">{data.usage?.apiLogs ?? 0}</p>
                  <p className="text-xs text-[var(--text-muted-50)]">API calls</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-[var(--text-primary)]">{data.usage?.avgLatencyMs ?? 0} ms</p>
                  <p className="text-xs text-[var(--text-muted-50)]">Avg latency</p>
                </div>
                <div>
                  <p className={`text-lg font-bold ${(data.usage?.errorCount ?? 0) > 0 ? 'text-red-500' : 'text-emerald-500'}`}>{data.usage?.errorCount ?? 0}</p>
                  <p className="text-xs text-[var(--text-muted-50)]">5xx errors</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-[var(--text-primary)]">{String(data.timestamp ? `${data.latencyMs}ms` : '—')}</p>
                  <p className="text-xs text-[var(--text-muted-50)]">Response time</p>
                </div>
              </CardContent>
              {data.usage && Object.keys(data.usage.recentByModel).length > 0 && (
                <CardContent className="border-t border-[var(--border-color)] pt-4">
                  <p className="mb-2 text-xs font-medium text-[var(--text-muted-70)]">Calls by model (24h)</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(data.usage.recentByModel).map(([model, count]) => (
                      <span key={model} className="rounded-full border border-[var(--border-color)] bg-[var(--surface)] px-2.5 py-1 text-[11px] text-[var(--text-muted-70)]">
                        {model} · {count}
                      </span>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Health checks */}
            {data.health && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-[var(--accent)]" /> Integration Health
                    <span className={`ml-auto text-[11px] font-normal capitalize ${data.health.status === 'ready' ? 'text-emerald-500' : data.health.status === 'degraded' ? 'text-amber-500' : 'text-red-500'}`}>
                      {data.health.status}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-[var(--border-color)]">
                    {data.health.providers.map((p) => (
                      <li key={p.name} className="flex items-center gap-2 py-2.5 text-sm">
                        <span className={`h-2 w-2 rounded-full ${p.status === 'connected' ? 'bg-emerald-500' : p.status === 'missing' ? 'bg-amber-500' : 'bg-red-500'}`} />
                        <span className="text-[var(--text-primary)]">{p.name}</span>
                        <span className="ml-auto flex items-center gap-2 text-[11px] text-[var(--text-muted-50)]">
                          {p.detail && <span className="hidden sm:inline">{p.detail}</span>}
                          <span className={statusColor(p.status)}>{p.status}</span>
                          <span>{p.latencyMs}ms</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Autonomy stack — tools + plugins health */}
            {autonomy && (
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-[var(--accent)]" /> Tool Health
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="divide-y divide-[var(--border-color)]">
                      {(autonomy.tools ?? []).map((t) => (
                        <li key={t.id} className="flex items-center gap-2 py-2 text-sm">
                          <span className={`h-2 w-2 rounded-full ${t.ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          <span className="text-[var(--text-primary)]">{t.name}</span>
                          <span className="ml-auto text-[11px] text-[var(--text-muted-50)]">
                            {t.calls} calls · {t.failures} failures
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Puzzle className="h-4 w-4 text-[var(--accent)]" /> Plugin Health
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="divide-y divide-[var(--border-color)]">
                      {(autonomy.plugins ?? []).map((p) => (
                        <li key={p.manifest.id} className="flex items-center gap-2 py-2 text-sm">
                          <span className={`h-2 w-2 rounded-full ${p.health.ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          <span className="text-[var(--text-primary)]">{p.manifest.name}</span>
                          <span className="ml-auto text-[11px] text-[var(--text-muted-50)]">
                            {p.manifest.enabled ? 'enabled' : 'disabled'}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 border-t border-[var(--border-color)] pt-3">
                      <p className="mb-1 text-xs font-medium text-[var(--text-muted-70)]">Autonomy runtime</p>
                      {(autonomy.runtime ?? []).map((r) => (
                        <div key={r.label} className="flex items-center gap-2 py-1 text-xs">
                          <span className={`h-1.5 w-1.5 rounded-full ${r.ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          <span className="text-[var(--text-muted-70)]">{r.label}</span>
                          <span className="ml-auto truncate pl-2 text-[var(--text-muted-50)]">{r.detail}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number; sub: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface-accent)] text-[var(--accent)]">
          {icon}
        </div>
        <div>
          <p className="text-xl font-bold text-[var(--text-primary)]">{value}</p>
          <p className="text-xs text-[var(--text-muted-50)]">{label} · {sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}