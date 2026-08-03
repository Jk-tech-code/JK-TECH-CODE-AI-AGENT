import { env } from '../config/env';
import type { ProviderDefinition, ProviderHealth } from '../providers/types';

// Reuse the existing, production-ready Zapier service. No reimplementation.
export { sendToZapier, fireTaskWebhook, getZapierWebhookUrl } from '@/lib/services/zapier';
export type { ZapierResult, AIWebhookPayload } from '@/lib/services/zapier';

const CATEGORY = 'automation' as const;

export const zapierProvider: ProviderDefinition = {
  name: 'Zapier',
  category: CATEGORY,
  isConfigured: () => env.zapier.webhookUrl.length > 0,
  createClient: () => (env.zapier.webhookUrl ? { webhookUrl: env.zapier.webhookUrl } : null),
  check: async () => {
    if (!env.zapier.webhookUrl) {
      return { name: 'Zapier', category: CATEGORY, status: 'missing', latencyMs: 0 };
    }
    // Never POST to a Zapier catch-hook during a health check — it would
    // trigger a real Zap. A well-formed https hook URL means configured.
    const wellFormed = /^https:\/\/hooks\.zapier\.com\/hooks\/catch\//.test(env.zapier.webhookUrl);
    return {
      name: 'Zapier',
      category: CATEGORY,
      status: wellFormed ? 'connected' : 'failed',
      latencyMs: 0,
      detail: wellFormed ? undefined : 'webhook URL format invalid',
    };
  },
};
