import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const QUEUE_KEY = 'jk:jobs:queue';
const PROCESSING_KEY = 'jk:jobs:processing';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL || '1000');
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT || '7103');

interface Job {
  id: string;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  maxAttempts: number;
}

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 3) return null;
    return Math.min(times * 200, 2000);
  },
});

const jobHandlers: Record<string, (job: Job) => Promise<void>> = {
  'send-email': async (job) => {
    console.log(`[job-worker] Sending email: ${JSON.stringify(job.data)}`);
    await new Promise(r => setTimeout(r, 500));
  },

  'process-image': async (job) => {
    console.log(`[job-worker] Processing image: ${JSON.stringify(job.data)}`);
    await new Promise(r => setTimeout(r, 1000));
  },

  'generate-report': async (job) => {
    console.log(`[job-worker] Generating report: ${JSON.stringify(job.data)}`);
    await new Promise(r => setTimeout(r, 2000));
  },

  'webhook-delivery': async (job) => {
    const { url, payload } = job.data as { url?: string; payload?: unknown };
    if (!url) throw new Error('Missing webhook URL');
    console.log(`[job-worker] Delivering webhook to ${url}`);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    if (!response.ok) throw new Error(`Webhook delivery failed: ${response.status}`);
  },

  'cleanup': async (job) => {
    console.log(`[job-worker] Running cleanup: ${JSON.stringify(job.data)}`);
  },
};

async function processJob(job: Job): Promise<void> {
  const handler = jobHandlers[job.type];
  if (!handler) {
    console.warn(`[job-worker] No handler for job type: ${job.type}`);
    return;
  }
  await handler(job);
}

async function pollQueue(): Promise<void> {
  try {
    const raw = await redis.brpoplpush(QUEUE_KEY, PROCESSING_KEY, 0);
    if (!raw) return;

    let job: Job;
    try {
      job = JSON.parse(raw);
    } catch {
      await redis.lrem(PROCESSING_KEY, 1, raw);
      return;
    }

    try {
      await processJob(job);
      await redis.lrem(PROCESSING_KEY, 1, raw);
      console.log(`[job-worker] Completed job ${job.id} (${job.type})`);
    } catch (err) {
      job.attempts = (job.attempts || 0) + 1;
      if (job.attempts < (job.maxAttempts || 3)) {
        console.warn(`[job-worker] Retrying job ${job.id} (attempt ${job.attempts})`);
        await redis.lpush(QUEUE_KEY, JSON.stringify(job));
      } else {
        console.error(`[job-worker] Job ${job.id} failed after ${job.attempts} attempts:`, err);
        await redis.lpush('jk:jobs:failed', raw);
      }
      await redis.lrem(PROCESSING_KEY, 1, raw);
    }
  } catch (err) {
    console.error('[job-worker] Queue poll error:', err);
  }
}

Bun.serve({
  port: HEALTH_PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', service: 'job-worker' });
    }
    if (url.pathname === '/stats') {
      return Response.json({
        handlers: Object.keys(jobHandlers),
        pollInterval: POLL_INTERVAL_MS,
      });
    }
    return Response.json({ error: 'Not found' }, { status: 404 });
  },
});

(async () => {
  console.log(`[job-worker] health check on :${HEALTH_PORT}, polling queue...`);
  while (true) {
    await pollQueue();
  }
})();
