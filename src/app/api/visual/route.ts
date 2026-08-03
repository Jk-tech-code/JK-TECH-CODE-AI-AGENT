import { NextRequest, NextResponse } from 'next/server';
import { nanoBanana } from '@/lib/visual/engine';
import { visualAgentRegistry } from '@/lib/visual/agents/registry';

export async function GET(request: NextRequest) {
  const models = nanoBanana.getAllModels().map(m => ({
    id: m.modelId,
    name: m.name,
    provider: m.provider,
    taskTypes: m.taskTypes,
    quality: m.quality,
    speed: m.speed,
    costPerImage: m.costPerImage,
    enterpriseReady: m.enterpriseReady,
  }));

  const agents = visualAgentRegistry.getAllAgents().map(a => ({
    id: a.id,
    name: a.name,
    description: a.description,
    taskTypes: a.taskTypes,
    capabilities: a.capabilities,
  }));

  return NextResponse.json({
    engine: 'Nano Banana Pro',
    version: '1.0.0',
    models,
    agents,
    endpoints: [
      { path: '/api/visual/generate', method: 'POST', description: 'Generate images from prompts' },
      { path: '/api/visual/analyze', method: 'POST', description: 'Analyze images (OCR, detail, QA)' },
      { path: '/api/visual/agent', method: 'POST', description: 'Execute visual agent tasks' },
    ],
  });
}
