import { createLogger } from '@/lib/logging/logger';
import { serviceRegistry, formatStartupReport } from './providers/registry';
import { registerAllIntegrations } from './register';
import { summarizeStatus } from './providers/types';
import type { ProviderHealth } from './providers/types';

const startupLogger = createLogger('startup');

/**
 * Run the full startup verification:
 * 1. Ensure all providers are registered.
 * 2. Eagerly initialize singletons for configured providers (lazy for the rest).
 * 3. Run real health checks in parallel.
 * 4. Return the ASCII startup report (also logged).
 */
export async function runStartupReport(): Promise<{ report: string; status: string; checks: ProviderHealth[] }> {
  registerAllIntegrations();

  // Optimize startup: only create clients for providers that are configured.
  for (const definition of serviceRegistry.list()) {
    if (definition.isConfigured()) {
      serviceRegistry.init(definition.name);
    }
  }

  const checks = await serviceRegistry.checkAll();
  const report = formatStartupReport(checks);
  const status = summarizeStatus(checks);

  startupLogger.info(`Startup report — Overall Status: ${status}`, {
    status,
    connected: checks.filter(c => c.status === 'connected').length,
    missing: checks.filter(c => c.status === 'missing').length,
    failed: checks.filter(c => c.status === 'failed').length,
  });

  return { report, status, checks };
}
