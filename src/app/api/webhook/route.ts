import { NextRequest, NextResponse } from 'next/server';
import { sendToZapier, validateZapierEvent, getZapierWebhookUrl } from '@/lib/services/zapier';
import { config } from '@/lib/config';

/**
 * POST /api/webhook
 *
 * Forwards an event payload to the configured Zapier webhook.
 * Body: { event: string, data: Record<string, unknown> }
 *
 * Security: if ZAPIER_WEBHOOK_SECRET is set on the server, callers must send
 * it in the `x-webhook-secret` header. The Zapier URL itself is never exposed
 * to clients. The global middleware rate limiter also applies (30 req/min/IP).
 */
export async function POST(request: NextRequest) {
  try {
    // Optional shared-secret auth to prevent anonymous spam against Zapier quota.
    const secret = config.services.zapierWebhookSecret;
    if (secret) {
      const provided = request.headers.get('x-webhook-secret');
      if (!provided || provided !== secret) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
      }
    }

    const body = await request.json();
    const { event, data } = body as { event?: unknown; data?: unknown };

    if (!getZapierWebhookUrl()) {
      return NextResponse.json(
        { error: 'Zapier webhook is not configured on the server.' },
        { status: 503 },
      );
    }

    const validationError = validateZapierEvent(typeof event === 'string' ? event : '', data);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const result = await sendToZapier(event as string, data as Record<string, unknown>);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Webhook delivery failed.' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      event,
      response: result.response ?? null,
    });
  } catch (error) {
    console.error('Webhook API error:', error);
    return NextResponse.json({ error: 'Webhook failed.' }, { status: 500 });
  }
}
