import Redis from 'ioredis';
import crypto from 'crypto';

const PORT = parseInt(process.env.PORT || '7104');
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const WEBHOOK_SECRETS: Record<string, string> = {
  stripe: process.env.STRIPE_WEBHOOK_SECRET || '',
  github: process.env.GITHUB_WEBHOOK_SECRET || '',
  slack: process.env.SLACK_WEBHOOK_SECRET || '',
  zapier: process.env.ZAPIER_WEBHOOK_SECRET || '',
};

interface WebhookEvent {
  id: string;
  type: string;
  source: string;
  headers: Record<string, string>;
  body: unknown;
  receivedAt: string;
  signature?: string;
  signatureValid?: boolean;
}

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 3) return null;
    return Math.min(times * 200, 2000);
  },
});

function generateId(): string {
  return crypto.randomUUID();
}

function verifySignature(source: string, body: string, signature: string): boolean {
  const secret = WEBHOOK_SECRETS[source];
  if (!secret) return true;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

async function storeEvent(event: WebhookEvent): Promise<void> {
  const key = `webhook:events:${event.id}`;
  await redis.setex(key, 86400 * 7, JSON.stringify(event));
  await redis.lpush('webhook:events:recent', event.id);
  await redis.ltrim('webhook:events:recent', 0, 999);

  const sourceKey = `webhook:events:${event.source}`;
  await redis.lpush(sourceKey, event.id);
  await redis.ltrim(sourceKey, 0, 99);
}

async function enqueueForProcessing(event: WebhookEvent): Promise<void> {
  const job = {
    id: event.id,
    type: 'webhook-delivery',
    data: {
      eventId: event.id,
      source: event.source,
      type: event.type,
      payload: event.body,
      receivedAt: event.receivedAt,
    },
    createdAt: event.receivedAt,
    attempts: 0,
    maxAttempts: 3,
  };
  await redis.lpush('jk:jobs:queue', JSON.stringify(job));
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname.startsWith('/webhook/') && req.method === 'POST') {
      const source = url.pathname.replace('/webhook/', '');
      if (!source) {
        return Response.json({ error: 'Missing webhook source' }, { status: 400 });
      }

      const bodyText = await req.text();
      const signature = req.headers.get('x-hub-signature-256')
        || req.headers.get('x-signature')
        || req.headers.get('stripe-signature')
        || '';

      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(bodyText);
      } catch {
        parsedBody = bodyText;
      }

      const event: WebhookEvent = {
        id: generateId(),
        type: source,
        source,
        headers: Object.fromEntries(req.headers.entries()),
        body: parsedBody,
        receivedAt: new Date().toISOString(),
        signature,
        signatureValid: signature ? verifySignature(source, bodyText, signature) : undefined,
      };

      await storeEvent(event);

      if (event.signatureValid !== false) {
        await enqueueForProcessing(event);
      }

      return Response.json({
        received: true,
        id: event.id,
        source: event.source,
        signatureValid: event.signatureValid,
      }, { status: 202 });
    }

    if (url.pathname === '/events' && req.method === 'GET') {
      const source = url.searchParams.get('source');
      const limit = parseInt(url.searchParams.get('limit') || '20');

      let ids: string[];
      if (source) {
        const raw = await redis.lrange(`webhook:events:${source}`, 0, limit - 1);
        ids = raw;
      } else {
        const raw = await redis.lrange('webhook:events:recent', 0, limit - 1);
        ids = raw;
      }

      const events: WebhookEvent[] = [];
      for (const id of ids) {
        const raw = await redis.get(`webhook:events:${id}`);
        if (raw) events.push(JSON.parse(raw));
      }

      return Response.json({ events, count: events.length });
    }

    if (url.pathname === '/event' && req.method === 'GET') {
      const id = url.searchParams.get('id');
      if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });

      const raw = await redis.get(`webhook:events:${id}`);
      if (!raw) return Response.json({ error: 'Not found' }, { status: 404 });

      return Response.json(JSON.parse(raw));
    }

    if (url.pathname === '/health') {
      let redisOk = false;
      try {
        await redis.ping();
        redisOk = true;
      } catch {}
      return Response.json({ status: 'ok', service: 'webhook-receiver', redis: redisOk });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  },
});

console.log(`[webhook-receiver] listening on :${PORT}`);
