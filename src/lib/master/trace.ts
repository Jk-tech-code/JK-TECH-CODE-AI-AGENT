/**
 * Orchestration observability (Phase 13). Records a structured trace for every
 * master orchestration run: routing decisions, execution order, latency,
 * confidence, cache hits and failures. Served to an internal dashboard.
 */

export interface OrchestrationStepTrace {
  skill: string;
  purpose: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  latencyMs?: number;
  confidence?: number;
  error?: string;
}

export interface OrchestrationTrace {
  requestId: string;
  inputPreview: string;
  intent: string;
  domains: string[];
  routing: { source: 'fast' | 'smart'; confidence: number };
  complexity: string;
  planPhases: string[];
  steps: OrchestrationStepTrace[];
  cacheHits: string[];
  totalLatencyMs: number;
  startedAt: number;
  completedAt?: number;
  outcome: 'success' | 'failed' | 'blocked';
}

class OrchestrationTraceStore {
  private traces: OrchestrationTrace[] = [];
  private maxTraces = 200;
  private listeners = new Set<(trace: OrchestrationTrace) => void>();

  begin(input: string): OrchestrationTrace {
    const trace: OrchestrationTrace = {
      requestId: `trace_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      inputPreview: input.slice(0, 120),
      intent: 'general',
      domains: ['general'],
      routing: { source: 'fast', confidence: 0 },
      complexity: 'low',
      planPhases: [],
      steps: [],
      cacheHits: [],
      totalLatencyMs: 0,
      startedAt: Date.now(),
      outcome: 'success',
    };
    this.traces.unshift(trace);
    if (this.traces.length > this.maxTraces) this.traces.length = this.maxTraces;
    this.emit(trace);
    return trace;
  }

  update(trace: OrchestrationTrace, patch: Partial<OrchestrationTrace>): void {
    Object.assign(trace, patch);
    this.emit(trace);
  }

  markStep(trace: OrchestrationTrace, index: number, patch: Partial<OrchestrationStepTrace>): void {
    if (!trace.steps[index]) return;
    Object.assign(trace.steps[index], patch);
    this.emit(trace);
  }

  addCacheHit(trace: OrchestrationTrace, key: string): void {
    if (!trace.cacheHits.includes(key)) trace.cacheHits.push(key);
  }

  finish(trace: OrchestrationTrace, outcome: OrchestrationTrace['outcome'], totalLatencyMs: number): void {
    trace.outcome = outcome;
    trace.totalLatencyMs = totalLatencyMs;
    trace.completedAt = Date.now();
    this.emit(trace);
  }

  getAll(): OrchestrationTrace[] {
    return this.traces;
  }

  getRecent(limit = 25): OrchestrationTrace[] {
    return this.traces.slice(0, limit);
  }

  stats(): {
    total: number;
    success: number;
    failed: number;
    blocked: number;
    avgLatencyMs: number;
    cacheHitRate: number;
  } {
    const done = this.traces.filter(t => t.completedAt);
    const success = done.filter(t => t.outcome === 'success').length;
    const failed = done.filter(t => t.outcome === 'failed').length;
    const blocked = done.filter(t => t.outcome === 'blocked').length;
    const totalLatency = done.reduce((acc, t) => acc + t.totalLatencyMs, 0);
    const cacheHits = done.reduce((acc, t) => acc + t.cacheHits.length, 0);
    return {
      total: done.length,
      success,
      failed,
      blocked,
      avgLatencyMs: done.length ? Math.round(totalLatency / done.length) : 0,
      cacheHitRate: done.length ? cacheHits / done.length : 0,
    };
  }

  subscribe(listener: (trace: OrchestrationTrace) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(trace: OrchestrationTrace): void {
    for (const listener of this.listeners) {
      try { listener(trace); } catch { /* ignore listener errors */ }
    }
  }
}

export const traceStore = new OrchestrationTraceStore();
