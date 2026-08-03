import { createLogger } from '@/lib/logging/logger';
import { serviceRegistry } from '../providers/registry';
import { registerAllIntegrations } from '../register';
import { summarizeStatus } from '../providers/types';
import type { ProviderCategory, ProviderHealth, OverallStatus } from '../providers/types';

const healthLogger = createLogger('health');

export interface HealthPayload {
  status: OverallStatus;
  timestamp: string;
  providers: ProviderHealth[];
  checkedCount: number;
}

/**
 * Run health checks for all (or a single category of) providers.
 * Returns a serializable payload for the /health endpoints.
 */
export async function checkHealth(category?: ProviderCategory): Promise<HealthPayload> {
  registerAllIntegrations();
  const providers = await serviceRegistry.checkAll(category);
  const status = summarizeStatus(providers);

  healthLogger.info('Health check completed', {
    category: category || 'all',
    status,
    connected: providers.filter(p => p.status === 'connected').length,
    missing: providers.filter(p => p.status === 'missing').length,
    failed: providers.filter(p => p.status === 'failed').length,
  });

  return {
    status,
    timestamp: new Date().toISOString(),
    providers,
    checkedCount: providers.length,
  };
}

/** HTTP status code for a health payload: 200 unless something failed. */
export function healthHttpStatus(payload: HealthPayload): number {
  return payload.status === 'error' ? 503 : 200;
}
