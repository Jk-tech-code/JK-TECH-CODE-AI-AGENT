import { after } from 'next/server';
import { config } from '@/lib/config';
import { createLogger } from '@/lib/logging/logger';

const zapierLogger = createLogger('zapier');

const MAX_RETRIES = 3;
const TIMEOUT_MS = 10_000;
const RETRY_BACKOFF_MS = 500;
const SOURCE = 'JK-TECH-CODE-AI';

export interface ZapierResult {
  success: boolean;
  response?: unknown;
  error?: string;
}

/** Payload sent for AI task completions (requirement: userId, sessionId, userMessage, aiResponse, service, timestamp, metadata). */
export interface AIWebhookPayload {
  userId?: string;
  sessionId?: string;
  userMessage: string;
  aiResponse: string;
  service: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/** Maps an internal task/service name to a Zapier event type. */
export const ZAPIER_EVENT_MAP: Record<string, string> = {
  chat: 'ai.completion',
  inquiry: 'customer.inquiry',
  booking: 'booking.appointment',
  quotation: 'quote.website',
  document: 'document.generated',
  image: 'image.generated',
  'image-generation': 'image.generated',
  writing: 'document.generated',
  job: 'job.application',
  admission: 'admission.school',
  payment: 'payment.confirmed',
  ticket: 'ticket.support',
  contact: 'contact.form',
  contactForm: 'contact.form',
  plan: 'plan.created',
  research: 'research.completed',
  general: 'ai.completion',
};

export function resolveZapierEvent(eventType: string): string {
  return ZAPIER_EVENT_MAP[eventType] || eventType || 'ai.completion';
}

export function getZapierWebhookUrl(): string | undefined {
  return config.services.zapierWebhook || undefined;
}

/** Maps an internal agent ID to a Zapier event type for agent-task completions. */
export const ZAPIER_AGENT_EVENT_MAP: Record<string, string> = {
  'research-agent': 'research',
  'fact-checker': 'research',
  'planning-agent': 'plan',
  'coding-agent': 'general',
  'seo-agent': 'writing',
  'content-agent': 'writing',
  'analytics-agent': 'general',
  'document-agent': 'document',
  'doc-agent': 'document',
  'pdf-agent': 'document',
  'csv-agent': 'document',
  'markdown-agent': 'document',
  'spreadsheet-agent': 'document',
  'strategy-agent': 'general',
  'data-science-agent': 'general',
  'image-analysis-agent': 'general',
  'system-architect': 'general',
  'presentation-agent': 'document',
};

export function resolveZapierEventForAgent(agentId: string): string {
  return ZAPIER_AGENT_EVENT_MAP[agentId] || 'ai.completion';
}

/** Returns an error message when the payload is invalid, otherwise null. */
export function validateZapierEvent(eventType: string, data: unknown): string | null {
  if (!eventType || typeof eventType !== 'string' || eventType.trim().length === 0) {
    return 'eventType is required and must be a non-empty string.';
  }
  if (data === undefined || data === null || typeof data !== 'object' || Array.isArray(data)) {
    return 'data must be a non-null object.';
  }
  return null;
}

/**
 * Send a POST request to the configured Zapier webhook.
 * - Retries up to MAX_RETRIES times with backoff.
 * - Aborts after TIMEOUT_MS.
 * - Logs every attempt and outcome.
 * - Never throws; returns { success, response } or { success: false, error }.
 */
export async function sendToZapier(eventType: string, data: Record<string, unknown>): Promise<ZapierResult> {
  const validationError = validateZapierEvent(eventType, data);
  if (validationError) {
    zapierLogger.error('Zapier payload validation failed', new Error(validationError));
    return { success: false, error: validationError };
  }

  const webhookUrl = getZapierWebhookUrl();
  if (!webhookUrl) {
    const message = 'ZAPIER_WEBHOOK_URL is not configured.';
    zapierLogger.error('Zapier not configured', new Error(message));
    return { success: false, error: message };
  }

  const payload = {
    event: eventType,
    timestamp: new Date().toISOString(),
    source: SOURCE,
    data,
  };

  let lastError: string | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        lastError = `Zapier responded with status ${response.status}`;
        zapierLogger.warn('Zapier request failed, retrying', { attempt, status: response.status });
      } else {
        const responseBody = await response.json().catch(() => null);
        zapierLogger.info('Zapier webhook delivered', { event: eventType, attempt });
        return { success: true, response: responseBody };
      }
    } catch (err) {
      const message = err instanceof Error && err.name === 'AbortError'
        ? `Zapier request timed out after ${TIMEOUT_MS}ms`
        : err instanceof Error
          ? err.message
          : String(err);
      lastError = message;
      zapierLogger.warn('Zapier request failed, retrying', { attempt, error: message });
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, RETRY_BACKOFF_MS * attempt));
    }
  }

  zapierLogger.error('Zapier webhook failed after retries', new Error(lastError || 'Unknown error'), {
    event: eventType,
  });
  return { success: false, error: lastError || 'Zapier webhook failed.' };
}

/**
 * Fire-and-forget wrapper: never blocks the caller and never throws.
 *
 * Uses Next.js `after()` so the webhook is delivered on serverless platforms
 * (the runtime keeps the work alive after the response is sent instead of
 * terminating pending promises). Falls back to a plain async call when not in
 * a request context (e.g. unit tests).
 */
export function fireTaskWebhook(eventType: string, payload: AIWebhookPayload): void {
  const send = () => {
    void sendToZapier(resolveZapierEvent(eventType), payload as unknown as Record<string, unknown>)
      .catch((err: unknown) => {
        zapierLogger.error('Unhandled Zapier send error', err);
      });
  };

  try {
    after(send);
  } catch {
    send();
  }
}
