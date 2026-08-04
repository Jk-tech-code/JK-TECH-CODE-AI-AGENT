import { NextRequest, NextResponse } from 'next/server';
import { masterOrchestrator } from '@/lib/master';
import { skillRouter } from '@/lib/master';

/**
 * GET /api/master/analyze
 *
 * Development/introspection helper: returns the routing decision (intent,
 * domains, chosen skill chain) WITHOUT executing any skill. Useful for tuning
 * the router and for the UI to show users which capability was engaged.
 */
export async function GET(request: NextRequest) {
  const input = request.nextUrl.searchParams.get('q') || '';

  if (!input) {
    return NextResponse.json({ error: 'Provide ?q= prompt.' }, { status: 400 });
  }

  const analysis = masterOrchestrator.analyze({ input });
  const steps = skillRouter.route(analysis);

  return NextResponse.json({
    prompt: analysis.rawPrompt,
    enhancedPrompt: analysis.enhancedPrompt,
    intent: analysis.intent,
    intentConfidence: analysis.intentConfidence,
    domains: analysis.domains,
    primaryDomain: analysis.primaryDomain,
    outputFormat: analysis.outputFormat,
    needsSearch: analysis.needsSearch,
    needsReasoning: analysis.needsReasoning,
    needsHumanize: analysis.needsHumanize,
    isComplex: analysis.isComplex,
    multiDomain: analysis.multiDomain,
    persona: analysis.persona,
    chain: steps.map(s => ({ skill: s.skill, purpose: s.purpose, parallel: Boolean(s.parallel) })),
  });
}