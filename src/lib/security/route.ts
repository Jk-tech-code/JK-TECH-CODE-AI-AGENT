import { NextResponse } from 'next/server';
import { securityGuard } from './guard';
import { createLogger } from '@/lib/logging/logger';

const securityLogger = createLogger('route-security');

export interface SecureRouteOptions {
  requireAuth?: boolean;
  maxBodySize?: number;
}

export async function secureEndpoint(
  request: Request,
  options: SecureRouteOptions = {},
): Promise<{ body: unknown; error: NextResponse | null }> {
  const { maxBodySize = 5 * 1024 * 1024 } = options;

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > maxBodySize) {
      return { body: null, error: NextResponse.json({ error: 'Request too large.' }, { status: 413 }) };
    }
    body = text ? JSON.parse(text) : {};
  } catch {
    return { body: null, error: NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }) };
  }

  if (body && typeof body === 'object') {
    const serialized = JSON.stringify(body);
    const report = securityGuard.analyzePrompt(serialized);
    if (!report.isSafe) {
      securityLogger.warn('Request blocked by security', {
        threats: report.threats.map(t => ({ type: t.type, severity: t.severity })),
      });
      return {
        body: null,
        error: NextResponse.json({ error: 'Request blocked by security filter.' }, { status: 400 }),
      };
    }
  }

  return { body, error: null };
}

export function handleRouteError(error: unknown, context: string) {
  const logger = createLogger(`route:${context}`);
  logger.error('Route error', error);
  return NextResponse.json(
    { error: 'An unexpected error occurred. Please try again.' },
    { status: 500 },
  );
}
