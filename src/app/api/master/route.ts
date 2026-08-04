import { NextRequest, NextResponse } from 'next/server';
import { masterOrchestrator } from '@/lib/master';
import type { AgentId } from '@/lib/core/types';

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const body = await request.json();
    const { input, context, forceSkill, disableEnhancement, debug } = body;

    if (!input || typeof input !== 'string') {
      return NextResponse.json({ error: 'Provide input.' }, { status: 400 });
    }

    const response = await masterOrchestrator.run({
      input,
      context: context ? (context as Record<string, unknown>) : undefined,
      forceSkill: (forceSkill as AgentId) || undefined,
      disableEnhancement: Boolean(disableEnhancement),
      debug: Boolean(debug),
    });

    return NextResponse.json({
      requestId: response.requestId,
      result: response.result,
      confidence: response.confidence,
      intent: response.intent,
      domains: response.domains,
      outputFormat: response.outputFormat,
      latencyMs: response.latencyMs,
      sources: response.sources,
      skillsUsed: response.skillsUsed,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Master API error:', error);
    return NextResponse.json(
      { error: 'Orchestration failed.', latencyMs: Date.now() - start },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    name: 'Master AI Orchestrator',
    description:
      'Central intelligence. Auto-detects intent and domain, chains the right skills, merges and reviews the result.',
    introspection: '/api/master/analyze',
  });
}