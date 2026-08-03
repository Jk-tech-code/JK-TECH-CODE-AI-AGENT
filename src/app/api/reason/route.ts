import { NextRequest, NextResponse } from 'next/server';
import { orchestrator } from '@/lib/core/orchestrator';
import { DeepReasoningEngine } from '@/lib/core/reasoning';
import type { ModelId } from '@/lib/core/types';
import { fireTaskWebhook } from '@/lib/services/zapier';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, context, mode = 'deep' } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Provide a query.' }, { status: 400 });
    }

    await orchestrator.init().catch(e => console.warn('[reason] orchestrator init failed:', e));

    if (mode === 'deep') {
      const engine = new DeepReasoningEngine(orchestrator);
      const result = await engine.reason(query, context);

      // Fire-and-forget Zapier notification on reasoning completion (non-blocking)
      fireTaskWebhook('general', {
        userMessage: query,
        aiResponse: result.conclusion,
        service: 'reasoning',
        timestamp: new Date().toISOString(),
        metadata: {
          mode,
          confidence: result.confidenceAssessment,
          modelUsed: 'deep-reasoning-engine',
        },
      });

      return NextResponse.json({
        conclusion: result.conclusion,
        supportingEvidence: result.supportingEvidence,
        confidenceAssessment: result.confidenceAssessment,
        assumptions: result.assumptions,
        alternativeInterpretations: result.alternativeInterpretations,
        reasoningSteps: result.reasoningSteps,
        confidenceBreakdown: result.confidenceBreakdown,
        modelUsed: 'deep-reasoning-engine',
        timestamp: Date.now(),
      });
    }

    const votingModels = (['deepseek-r1', 'gpt-5.5', 'claude-opus'] as ModelId[]).filter(m => orchestrator.getCapabilities(m));
    const voting = await orchestrator.runVoting(
      {
        messages: [
          { role: 'system', content: 'Analyze this question thoroughly. Show your reasoning step by step, then give a clear conclusion with confidence level.' },
          { role: 'user', content: context ? `${query}\n\nContext: ${context}` : query },
        ],
        taskCategory: 'reasoning',
        thinking: true,
      },
      votingModels as any,
      0.6
    );

    return NextResponse.json({
      consensus: voting.consensus,
      confidence: voting.confidence,
      modelVotes: voting.votes.map(v => ({ modelId: v.modelId })),
      mode: 'voting',
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Reason API error:', error);
    return NextResponse.json({ error: 'Reasoning failed. Please try again.' }, { status: 500 });
  }
}
