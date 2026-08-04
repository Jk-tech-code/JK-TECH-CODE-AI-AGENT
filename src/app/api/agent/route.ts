import { NextRequest, NextResponse } from 'next/server';
import { executeAgentTask, agentRegistry } from '@/lib/agents/registry';
import { orchestrator } from '@/lib/core/orchestrator';
import { searchAggregator } from '@/lib/core/search';
import { masterOrchestrator } from '@/lib/master';
import { fireTaskWebhook, resolveZapierEventForAgent } from '@/lib/services/zapier';
import type { AgentId } from '@/lib/core/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, input, context, debug } = body;

    if (!input) {
      return NextResponse.json({ error: 'Provide agentId and input.' }, { status: 400 });
    }

    await orchestrator.init().catch(e => console.warn('[agent] orchestrator init failed:', e));
    await searchAggregator.init().catch(e => console.warn('[agent] search init failed:', e));

    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // When no agentId is supplied, the Master Orchestrator auto-routes:
    // it detects intent + domain, chains the right skills, merges, and reviews.
    if (!agentId) {
      const masterResponse = await masterOrchestrator.run({
        input,
        context,
        debug: Boolean(debug),
      });

      fireTaskWebhook(resolveZapierEventForAgent('ai-agent'), {
        userMessage: typeof input === 'string' ? input : '',
        aiResponse: masterResponse.result,
        service: 'master-orchestrator',
        timestamp: new Date().toISOString(),
        metadata: {
          intent: masterResponse.intent,
          domains: masterResponse.domains,
          latencyMs: masterResponse.latencyMs,
        },
      });

      return NextResponse.json({
        taskId,
        agentId: 'master-orchestrator',
        result: masterResponse.result,
        confidence: masterResponse.confidence,
        metadata: {
          intent: masterResponse.intent,
          domains: masterResponse.domains,
          outputFormat: masterResponse.outputFormat,
          latencyMs: masterResponse.latencyMs,
          sources: masterResponse.sources,
          skillsUsed: masterResponse.skillsUsed,
        },
        timestamp: Date.now(),
      });
    }

    const output = await executeAgentTask({
      id: taskId,
      agentId: agentId as AgentId,
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
