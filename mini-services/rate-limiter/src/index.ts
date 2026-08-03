import Redis from 'ioredis';

const PORT = parseInt(process.env.PORT || '7102');
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 3) return null;
    return Math.min(times * 200, 2000);
  },
});

interface RateLimitRule {
  windowMs: number;
  maxRequests: number;
}

const DEFAULT_RULES: Record<string, RateLimitRule> = {
  default: { windowMs: 60 * 1000, maxRequests: 30 },
  api: { windowMs: 60 * 1000, maxRequests: 100 },
  auth: { windowMs: 15 * 60 * 1000, maxRequests: 5 },
};

function getKey(key: string, ruleName: string, windowMs: number): string {
  const slot = Math.floor(Date.now() / windowMs);
  return `ratelimit:${ruleName}:${key}:${slot}`;
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/check' && req.method === 'POST') {
      const body: { key: string; rule?: string } = await req.json();
      if (!body.key) {
        return Response.json({ error: 'Missing key' }, { status: 400 });
      }

      const ruleName = body.rule || 'default';
      const rule = DEFAULT_RULES[ruleName] || DEFAULT_RULES.default;
      const redisKey = getKey(body.key, ruleName, rule.windowMs);

      try {
        const current = await redis.get(redisKey);
        const count = current ? parseInt(current) : 0;
        const allowed = count < rule.maxRequests;
        const remaining = Math.max(0, rule.maxRequests - count);
        const resetIn = rule.windowMs - (Date.now() % rule.windowMs);

        return Response.json({
          allowed,
          current: count,
          limit: rule.maxRequests,
          remaining,
          resetIn,
          rule: ruleName,
        });
      } catch (err) {
        return Response.json({
          allowed: true,
          current: 0,
          limit: rule.maxRequests,
          remaining: rule.maxRequests,
          resetIn: rule.windowMs,
          rule: ruleName,
          fallback: true,
        });
      }
    }

    if (url.pathname === '/increment' && req.method === 'POST') {
      const body: { key: string; rule?: string } = await req.json();
      if (!body.key) {
        return Response.json({ error: 'Missing key' }, { status: 400 });
      }

      const ruleName = body.rule || 'default';
      const rule = DEFAULT_RULES[ruleName] || DEFAULT_RULES.default;
      const redisKey = getKey(body.key, ruleName, rule.windowMs);

      try {
        const count = await redis.incr(redisKey);
        if (count === 1) {
          await redis.pexpire(redisKey, rule.windowMs);
        }
        const allowed = count <= rule.maxRequests;

        return Response.json({ allowed, current: count, limit: rule.maxRequests });
      } catch (err) {
        return Response.json({ allowed: true, current: 0, limit: rule.maxRequests, fallback: true });
      }
    }

    if (url.pathname === '/reset' && req.method === 'POST') {
      const body: { key: string; rule?: string } = await req.json();
      if (!body.key) {
        return Response.json({ error: 'Missing key' }, { status: 400 });
      }

      const ruleName = body.rule || 'default';
      const rule = DEFAULT_RULES[ruleName] || DEFAULT_RULES.default;
      const redisKey = getKey(body.key, ruleName, rule.windowMs);

      try {
        await redis.del(redisKey);
        return Response.json({ reset: true });
      } catch (err) {
        return Response.json({ error: 'Redis error' }, { status: 500 });
      }
    }

    if (url.pathname === '/rules') {
      return Response.json({ rules: DEFAULT_RULES });
    }

    if (url.pathname === '/health') {
      let redisOk = false;
      try {
        await redis.ping();
        redisOk = true;
      } catch {}
      return Response.json({ status: 'ok', service: 'rate-limiter', redis: redisOk });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  },
});

console.log(`[rate-limiter] listening on :${PORT}`);
