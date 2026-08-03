// Config
export { env, hasEnv, getEnv, getEnvPresenceReport, KNOWN_ENV_KEYS } from './config/env';

// DI container
export {
  serviceRegistry,
  summarizeStatus,
  formatStartupReport,
  formatStartupLine,
} from './providers/registry';
export type {
  ProviderDefinition,
  ProviderHealth,
  ProviderCategory,
  OverallStatus,
  HealthStatus,
} from './providers/types';

// Registration
export { registerAllIntegrations } from './register';

// Health + startup
export { checkHealth, healthHttpStatus } from './health';
export type { HealthPayload } from './health';
export { runStartupReport } from './startup';

// Reusable clients (lazy singletons)
export { getRedis } from './cache/redis';
export { getQdrant } from './vector/qdrant';

// Zapier (re-export of existing service — no duplication)
export {
  sendToZapier,
  fireTaskWebhook,
  getZapierWebhookUrl,
} from './automation/zapier';
export type { ZapierResult, AIWebhookPayload } from './automation/zapier';
