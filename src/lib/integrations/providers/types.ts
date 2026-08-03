/** Provider grouping used by the health endpoints. */
export type ProviderCategory = 'ai' | 'database' | 'search' | 'vector' | 'cache' | 'automation';

/** Health outcome for a single provider. */
export type HealthStatus = 'connected' | 'missing' | 'failed';

export interface ProviderHealth {
  name: string;
  category: ProviderCategory;
  status: HealthStatus;
  latencyMs: number;
  /** Optional detail (e.g. "HTTP 401"). Never contains secrets. */
  detail?: string;
}

export interface ProviderDefinition<TClient = unknown> {
  name: string;
  category: ProviderCategory;
  /** True when required env vars are present. */
  isConfigured(): boolean;
  /**
   * Real connection check. Must never throw and must never log secrets.
   * Returns the provider health result.
   */
  check(): Promise<ProviderHealth>;
  /** Lazily-created singleton client. Return null when not configured. */
  createClient?(): TClient | null;
}

export type OverallStatus = 'ready' | 'degraded' | 'error';

export function summarizeStatus(checks: ProviderHealth[]): OverallStatus {
  if (checks.length === 0) return 'degraded';
  if (checks.some(c => c.status === 'failed')) return 'error';
  if (checks.some(c => c.status === 'missing')) return 'degraded';
  return 'ready';
}

export function formatStartupLine(check: ProviderHealth, width = 18): string {
  const label = check.name.padEnd(width, '.');
  const marker =
    check.status === 'connected' ? '✅ Connected' :
    check.status === 'missing' ? '⚠️ Missing configuration' :
    '❌ Connection failed';
  const latency = check.status === 'connected' ? ` (${check.latencyMs}ms)` : '';
  return `${label} ${marker}${latency}`;
}

export function formatStartupReport(checks: ProviderHealth[]): string {
  const lines = checks.map(c => formatStartupLine(c));
  const status = summarizeStatus(checks);
  const overall = status === 'ready' ? 'READY' : status === 'degraded' ? 'DEGRADED' : 'ERROR';
  return [...lines, '', `Overall Status: ${overall}`].join('\n');
}
