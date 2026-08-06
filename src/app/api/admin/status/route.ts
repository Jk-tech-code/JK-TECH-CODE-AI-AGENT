import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { checkHealth } from '@/lib/integrations/health';
import {
  checkProvider,
  modelInfo,
  getConfiguredModel,
  streamingAvailable,
  providerManager,
} from '@/brain/providers/llm';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logging/logger';

const adminLogger = createLogger('api:admin');

/** Only admins may view aggregate system + usage stats. */
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== 'admin') {
    return new NextResponse(JSON.stringify({ error: 'Forbidden.' }), { status: 403 });
  }

  try {
    const start = Date.now();

    const [providerStatus, streaming, available, health, stats] = await Promise.all([
      checkProvider(),
      streamingAvailable().catch(() => false),
      providerManager.availableProviders().catch(() => []),
      checkHealth().catch(() => null),
      computeUsageStats(),
    ]);

    const engineInfo = await modelInfo().catch(() => null);
    const latencyMs = Date.now() - start;

    return NextResponse.json({
      provider: providerStatus,
      engine: {
        name: 'search',
        configuredModel: getConfiguredModel(),
        streaming,
        availableProviders: available,
      },
      system: {
        uptimeSeconds: Math.round(process.uptime()),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memory: cloneMemoryUsage(process.memoryUsage()),
        env: process.env.NODE_ENV,
      },
      ...(engineInfo ? { llm: { provider: engineInfo.provider, model: engineInfo.model, host: engineInfo.host } } : {}),
      ...(health ? { health } : {}),
      usage: stats,
      latencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    adminLogger.error('Admin status failed', error);
    return new NextResponse(JSON.stringify({ error: 'Failed to load status.' }), { status: 500 });
  }
}

function cloneMemoryUsage(mem: NodeJS.MemoryUsage): Record<string, number> {
  return {
    rssMB: roundMB(mem.rss),
    heapUsedMB: roundMB(mem.heapUsed),
    heapTotalMB: roundMB(mem.heapTotal),
    externalMB: roundMB(mem.external),
    arrayBuffersMB: roundMB(mem.arrayBuffers ?? 0),
  };
}

function roundMB(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

async function computeUsageStats(): Promise<{
  conversations: number;
  conversationMessages: number;
  documents: number;
  documentChunks: number;
  memories: number;
  apiLogs: number;
  avgLatencyMs: number;
  errorCount: number;
  feedbackCount: number;
  recentByModel: Record<string, number>;
}> {
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [conversations, conversationMessages, documents, documentChunks, memories, apiLogs, avgAgg, errors, feedbackCount, recentByModel] =
      await Promise.all([
        db.conversation.count(),
        db.conversationMessage.count(),
        db.document.count(),
        db.documentChunk.count(),
        db.memoryEntry.count(),
        db.apiLog.count({ where: { createdAt: { gte: since } } }),
        db.apiLog.aggregate({ where: { createdAt: { gte: since } }, _avg: { latencyMs: true } }),
        db.apiLog.count({ where: { createdAt: { gte: since }, statusCode: { gte: 500 } } }),
        db.feedback.count(),
        db.$queryRawUnsafe<Array<{ modelUsed: string | null; _count: bigint }>>(
          `SELECT "modelUsed", COUNT(*) AS "_count" FROM "ApiLog" WHERE "createdAt" >= $1 GROUP BY "modelUsed" ORDER BY "_count" DESC LIMIT 5`,
          since.toISOString(),
        ),
      ]);

    const modelMap: Record<string, number> = {};
    for (const row of recentByModel) {
      modelMap[row.modelUsed || 'unknown'] = Number(row._count);
    }

    return {
      conversations,
      conversationMessages,
      documents,
      documentChunks,
      memories,
      apiLogs,
      avgLatencyMs: Math.round(avgAgg._avg.latencyMs ?? 0),
      errorCount: errors,
      feedbackCount,
      recentByModel: modelMap,
    };
  } catch (error) {
    adminLogger.error('Usage stats failed', error);
    return {
      conversations: 0, conversationMessages: 0, documents: 0, documentChunks: 0,
      memories: 0, apiLogs: 0, avgLatencyMs: 0, errorCount: 0, feedbackCount: 0, recentByModel: {},
    };
  }
}