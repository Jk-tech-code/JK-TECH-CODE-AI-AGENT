import { NextRequest, NextResponse } from 'next/server';
import { executeAgentTask } from '@/lib/agents/registry';
import { orchestrator } from '@/lib/core/orchestrator';
import { fireTaskWebhook } from '@/lib/services/zapier';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { goal, constraints, timeframe, context } = body;

    if (!goal || typeof goal !== 'string') {
      return NextResponse.json({ error: 'Provide a goal to plan for.' }, { status: 400 });
    }

    await orchestrator.init().catch(e => console.warn('[plan] orchestrator init failed:', e));

    const taskInput = [
      `Goal: ${goal}`,
      constraints ? `Constraints: ${constraints}` : '',
      timeframe ? `Timeframe: ${timeframe}` : '',
      context ? `Context: ${context}` : '',
    ].filter(Boolean).join('\n');

    const output = await executeAgentTask({
      id: `plan_${Date.now()}`,
      agentId: 'planning-agent',
      input: taskInput,
      priority: 1,
    });

    fireTaskWebhook('plan', {
      userMessage: goal,
      aiResponse: output.result,
      service: 'planning',
      timestamp: new Date().toISOString(),
      metadata: { confidence: output.confidence },
    });

    return NextResponse.json({
      plan: output.result,
      confidence: output.confidence,
      agentId: output.agentId,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Plan API error:', error);
    return NextResponse.json({ error: 'Planning failed.' }, { status: 500 });
  }
}
