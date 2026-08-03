import { serviceRegistry } from './providers/registry';
import { aiProviders } from './ai/providers';
import { postgresProvider } from './database/postgres';
import { supabaseProvider } from './database/supabase';
import { redisProvider } from './cache/redis';
import { qdrantProvider } from './vector/qdrant';
import { searchProviders } from './search';
import { zapierProvider } from './automation/zapier';

let registered = false;

/**
 * Register all providers exactly once. Safe to call multiple times —
 * subsequent calls are no-ops (registry also refuses to overwrite).
 */
export function registerAllIntegrations(): void {
  if (registered) return;
  registered = true;

  for (const provider of aiProviders) serviceRegistry.register(provider);
  serviceRegistry.register(postgresProvider);
  serviceRegistry.register(supabaseProvider);
  serviceRegistry.register(redisProvider);
  serviceRegistry.register(qdrantProvider);
  for (const provider of searchProviders) serviceRegistry.register(provider);
  serviceRegistry.register(zapierProvider);
}
