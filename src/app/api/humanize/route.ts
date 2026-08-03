import { NextRequest, NextResponse } from 'next/server';
import { humanWritingEngine } from '@/lib/core/humanize';
import { orchestrator } from '@/lib/core/orchestrator';
import { secureEndpoint, handleRouteError } from '@/lib/security/route';

export async function POST(request: NextRequest) {
  try {
    const { body, error } = await secureEndpoint(request);
    if (error) return error;

    const { text } = body as Record<string, unknown>;

    if (!text || typeof text !== 'string' || text.trim().length < 10) {
      return NextResponse.json(
        { error: 'Please provide at least 10 characters of text to humanize.' },
        { status: 400 }
      );
    }

    if (text.length > 10000) {
      return NextResponse.json(
        { error: 'Text is too long. Please keep it under 10,000 characters.' },
        { status: 400 }
      );
    }

    // Validate the AI provider is configured (throws AppError 503 if missing)
    await orchestrator.init();

    const result = await humanWritingEngine.humanize(text);

    return NextResponse.json({
      humanized: result.humanized,
      changes: result.changes,
      patternScore: result.patternScore,
      readabilityScore: result.readabilityScore,
    });
  } catch (error) {
    return handleRouteError(error, 'humanize');
  }
}
