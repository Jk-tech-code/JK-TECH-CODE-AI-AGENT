/**
 * Autonomy Observability (Phase 12).
 *
 * Aggregates Brain status, model health, memory usage, tool/plugin health,
 * sandbox capabilities and runtime metrics into a single report shown on the
 * admin dashboard.
 */
import { checkProvider, modelInfo, getConfiguredModel, activeProvider } from '@/brain/providers/llm';
import { memoryStats } from '@/brain/memory';
import { checkHealth } from '@/lib/integrations/health';
import { toolManager } from './tool-manager';
import { pluginRegistry } from './plugins';
import type { AutonomyReport, RuntimeStat, SearchResult } from './types';

export interface AutonomyReportOptions {
  userId?: string;
}

export async function buildAutonomyReport(opts: AutonomyReportOptions = {}): Promise<AutonomyReport> {
  const provider = await checkProvider();
  const info = await modelInfo();
  const health = await checkHealth().catch(() => ({}));
  const mem = opts.userId ? await memoryStats(opts.userId).catch(() => null) : null;

  const runtime: RuntimeStat[] = [
    { label: 'LLM provider', ok: provider.available, detail: provider.reason ?? (activeProvider()) },
    { label: 'Model', ok: !!getConfiguredModel(), detail: getConfiguredModel() },
    {
      label: 'Installed models',
      ok: (info.models ?? []).length > 0,
      detail: (info.models ?? []).map((m: { name?: string }) => m.name ?? String(m)).join(', ') || 'none found',
    },
    {
      label: 'Integrated services',
      ok: Object.keys(health).length > 0,
      detail: Object.keys(health).length > 0 ? Object.keys(health).join(', ') : 'none',
    },
  ];

  if (mem) {
    runtime.push({
      label: 'Memory',
      ok: true,
      detail: `${mem.total} entries (${Object.entries(mem.byType ?? {}).map(([k, v]) => `${k}: ${v}`).join(', ') || 'none'})`,
      extra: { averageConfidence: mem.averageConfidence },
    });
  }

  return {
    brain: {
      provider: activeProvider(),
      model: getConfiguredModel(),
      healthy: provider.available,
    },
    tools: toolManager.health(),
    plugins: pluginRegistry.all(),
    sandbox: {
      supported: ['typescript', 'sql', 'shell'],
      maxTimeoutMs: 30_000,
    },
    runtime,
    timestamp: Date.now(),
  };
}

export type { AutonomyReport, RuntimeStat, SearchResult };