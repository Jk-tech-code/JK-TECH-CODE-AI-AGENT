import { NextRequest, NextResponse } from 'next/server';
import { executeVisualAgent, visualAgentRegistry } from '@/lib/visual/agents/registry';
import { orchestrator } from '@/lib/core/orchestrator';
import { fireTaskWebhook } from '@/lib/services/zapier';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, prompt, taskType, style, brandId, nonprofitMode } = body;

    if (!agentId || !prompt) {
      return NextResponse.json({ error: 'Provide agentId and prompt.' }, { status: 400 });
    }

    const agent = visualAgentRegistry.getAgent(agentId);
    if (!agent) {
      return NextResponse.json({ error: `Unknown agent: ${agentId}` }, { status: 400 });
    }

    await orchestrator.init().catch(e => console.warn('[visual-agent] orchestrator init failed:', e));

    const output = await executeVisualAgent(agentId, {
      prompt,
      taskType: taskType || agent.taskTypes[0] || 'text-to-image',
      style,
      brandId,
      nonprofitMode,
    });

    // Fire-and-forget Zapier notification on visual agent completion (non-blocking)
    fireTaskWebhook('image', {
      userMessage: prompt,
      aiResponse: output.result,
      service: 'image-generation',
      timestamp: new Date().toISOString(),
      metadata: {
        agentId,
        taskType: taskType || 'text-to-image',
        brandId,
        confidence: output.confidence,
        source: 'visual-agent',
      },
    });

    return NextResponse.json({
      agentId: output.agentId,
      result: output.result,
      confidence: output.confidence,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Visual agent API error:', error);
    return NextResponse.json({ error: 'Visual agent execution failed.' }, { status: 500 });
  }
}

export async function GET() {
  const agents = visualAgentRegistry.getAllAgents();
  return NextResponse.json({
    agents: agents.map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      taskTypes: a.taskTypes,
      capabilities: a.capabilities,
    })),
  });
}
