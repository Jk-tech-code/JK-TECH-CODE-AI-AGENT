import { createLogger } from '@/lib/logging/logger';
import type { ProviderCategory, ProviderDefinition, ProviderHealth } from './types';

const registryLogger = createLogger('integration-registry');

/**
 * Minimal dependency-injection container.
 *
 * - register(): adds a provider definition. If a provider with the same name
 *   already exists, it is left unchanged (never overwrites existing work).
 * - get(): returns the lazily-created singleton client for a provider.
 * - checkAll(): runs every registered provider's health check in parallel.
 */
class ServiceRegistry {
  private definitions = new Map<string, ProviderDefinition>();
  private singletons = new Map<string, unknown>();

  register<T>(definition: ProviderDefinition<T>): void {
    if (this.definitions.has(definition.name)) {
      registryLogger.warn('Provider already registered, skipping', { name: definition.name });
      return;
    }
    this.definitions.set(definition.name, definition);
    registryLogger.info('Provider registered', { name: definition.name, category: definition.category });
  }

  has(name: string): boolean {
    return this.definitions.has(name);
  }

  get<T>(name: string): T | undefined {
    const definition = this.definitions.get(name);
    if (!definition) return undefined;

    // Lazy singleton: create the client once, on first use.
    if (definition.createClient && !this.singletons.has(name)) {
      try {
        const client = definition.createClient();
        if (client !== null && client !== undefined) {
          this.singletons.set(name, client);
        }
      } catch (err) {
        registryLogger.error('Provider client creation failed', err, { name });
      }
    }
    return this.singletons.get(name) as T | undefined;
  }

  /** Eagerly create the singleton for a provider (used at startup when needed). */
  init(name: string): void {
    this.get(name);
  }

  list(): Array<ProviderDefinition> {
    return [...this.definitions.values()];
  }

  listByCategory(category: ProviderCategory): Array<ProviderDefinition> {
    return this.list().filter(d => d.category === category);
  }

  async check(name: string): Promise<ProviderHealth | null> {
    const definition = this.definitions.get(name);
    if (!definition) return null;
    try {
      return await definition.check();
    } catch (err) {
      registryLogger.error('Health check threw', err, { name });
      return { name, category: definition.category, status: 'failed', latencyMs: 0, detail: 'check threw an error' };
    }
  }

  async checkAll(category?: ProviderCategory): Promise<ProviderHealth[]> {
    const targets = category ? this.listByCategory(category) : this.list();
    if (targets.length === 0) return [];
    const results = await Promise.all(targets.map(d => this.check(d.name)));
    // check() returns null only for unknown names, which cannot occur here.
    return results.filter((r): r is ProviderHealth => r !== null);
  }
}

export const serviceRegistry = new ServiceRegistry();

export type { ProviderDefinition, ProviderHealth, ProviderCategory, OverallStatus, HealthStatus } from './types';
export { summarizeStatus, formatStartupReport, formatStartupLine } from './types';
