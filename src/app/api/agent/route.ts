import { NextRequest, NextResponse } from 'next/server';
import { executeAgentTask, agentRegistry } from '@/lib/agents/registry';
import { orchestrator } from '@/lib/core/orchestrator';
import { searchAggregator } from '@/lib/core/search';
import { fireTaskWebhook, resolveZapierEventForAgent } from '@/lib/services/zapier';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, input, context } = body;

    if (!agentId || !input) {
      return NextResponse.json({ error: 'Provide agentId and input.' }, { status: 400 });
    }

    await orchestrator.init().catch(e => console.warn('[agent] orchestrator init failed:', e));
    await searchAggregator.init().catch(e => console.warn('[agent] search init failed:', e));

    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const output = await executeAgentTask({
      id: taskId,
      agentId,
      input,
      context,
      priority: 1,
    });

    // Fire-and-forget Zapier notification on agent task completion (non-blocking)
    fireTaskWebhook(resolveZapierEventForAgent(agentId), {
      userMessage: typeof input === 'string' ? input : '',
      aiResponse: output.result,
      service: agentId,
      timestamp: new Date().toISOString(),
      metadata: {
        agentId,
        confidence: output.confidence,
        taskId: output.taskId,
        modelUsed: output.metadata?.modelUsed,
        latencyMs: output.metadata?.latencyMs,
      },
    });

    return NextResponse.json({
      taskId: output.taskId,
      agentId: output.agentId,
      result: output.result,
      confidence: output.confidence,
      metadata: output.metadata,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Agent API error:', error);
    return NextResponse.json({ error: 'Agent execution failed.' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const agents = agentRegistry.getAllAgents();
  return NextResponse.json({
    agents: agents.map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      capabilities: a.capabilities,
    })),
  });
}
