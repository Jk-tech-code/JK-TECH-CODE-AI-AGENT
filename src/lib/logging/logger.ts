import { db } from '@/lib/db';

export interface LogEntry {
  endpoint: string;
  method: string;
  statusCode: number;
  latencyMs: number;
  userId?: string;
  modelUsed?: string;
  tokenCount?: number;
  error?: string;
}

let logQueue: LogEntry[] = [];
let flushing = false;

async function flushLogs(): Promise<void> {
  if (flushing || logQueue.length === 0) return;
  flushing = true;
  const batch = logQueue.splice(0, 50);
  try {
    await db.apiLog.createMany({
      data: batch.map(entry => ({
        endpoint: entry.endpoint,
        method: entry.method,
        statusCode: entry.statusCode,
        latencyMs: entry.latencyMs,
        userId: entry.userId,
        modelUsed: entry.modelUsed,
        tokenCount: entry.tokenCount,
      })),
    });
  } catch (err) {
    console.error('Log flush failed:', err);
  } finally {
    flushing = false;
  }
}

setInterval(flushLogs, 5000);

export function logApiCall(entry: LogEntry): void {
  logQueue.push(entry);
  if (logQueue.length >= 20) {
    flushLogs();
  }
}

export function createLogger(context: string) {
  return {
    info: (message: string, data?: Record<string, unknown>) => {
      console.log(JSON.stringify({ level: 'info', context, message, ...data, timestamp: new Date().toISOString() }));
    },
    warn: (message: string, data?: Record<string, unknown>) => {
      console.warn(JSON.stringify({ level: 'warn', context, message, ...data, timestamp: new Date().toISOString() }));
    },
    error: (message: string, error?: unknown, data?: Record<string, unknown>) => {
      console.error(JSON.stringify({
        level: 'error',
        context,
        message,
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        ...data,
        timestamp: new Date().toISOString(),
      }));
    },
  };
}

export const logger = createLogger('app');
