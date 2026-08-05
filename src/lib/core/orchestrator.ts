import { generateText } from 'ai';
import { getModel, resolveModelAlias } from '@/lib/ai/provider';
import { MODEL_REGISTRY, TASK_MODEL_MAP } from './model-catalog';
import { createLogger } from '@/lib/logging/logger';
import type {
  ModelId,
  ModelCapability,
  ModelRequest,
  ModelResponse,
  TaskCategory,
} from './types';

const orchestratorLogger = createLogger('orchestrator');

export class Orchestrator {
  private fallbackChain: ModelId[][] = [];

  /**
   * Validate that the AI provider is configured.
   * Safe to call multiple times. Throws AppError 503 when no API key.
   */
  async init(): Promise<void> {
    // getModel triggers provider configuration validation (throws AppError 503 on missing key)
    getModel(resolveModelAlias('z-ai-default'));
  }

  async route(req: ModelRequest): Promise<ModelResponse> {
    const candidates = TASK_MODEL_MAP[req.taskCategory] || TASK_MODEL_MAP.general;
    const startTime = Date.now();

    for (const modelId of candidates) {
      try {
        return await this.tryModel(modelId, req, startTime);
      } catch (err) {
        orchestratorLogger.warn(`Model ${modelId} failed`, {
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
    }

    return this.tryModel('z-ai-default', req, startTime);
  }

  private async tryModel(modelId: ModelId, req: ModelRequest, startTime: number): Promise<ModelResponse> {
    const result = await generateText({
      model: getModel(resolveModelAlias(modelId)),
      messages: req.messages,
      temperature: req.temperature ?? 0.7,
      maxOutputTokens: req.maxTokens,
      abortSignal: req.signal,
    });

    const content = result.text || '';
    const thinking = result.reasoningText || undefined;
    const latencyMs = Date.now() - startTime;
    const inputTokens = result.usage?.inputTokens ?? 0;
    const outputTokens = result.usage?.outputTokens ?? 0;

    return {
      content,
      modelId,
      thinking,
      latencyMs,
      tokensUsed: { input: inputTokens, output: outputTokens },
      confidence: this.estimateConfidence(content, modelId, req.taskCategory),
    };
  }

  private estimateConfidence(content: string, modelId: ModelId, task: TaskCategory): number {
    let base = 0.85;
    if (task === 'reasoning' && (modelId === 'deepseek-r1' || modelId === 'gpt-5.5')) base += 0.1;
    if (task === 'coding' && (modelId === 'deepseek-v4' || modelId === 'gpt-4.1')) base += 0.1;
    if (content.length < 20) base -= 0.1;
    if (content.includes("I don't know") || content.includes("I'm not sure")) base -= 0.1;
    return Math.max(0, Math.min(1, base));
  }

  async runVoting(
    req: ModelRequest,
    models: ModelId[],
    minAgreement = 0.6
  ): Promise<{ consensus: string; confidence: number; votes: Array<{ modelId: ModelId; content: string }> }> {
    const results = await Promise.allSettled(
      models.map(m => this.tryModel(m, req, Date.now()))
    );

    const votes: Array<{ modelId: ModelId; content: string }> = [];
    for (const r of results) {
      if (r.status === 'fulfilled') {
        votes.push({ modelId: r.value.modelId, content: r.value.content });
      }
    }

    if (votes.length === 0) {
      const fallback = await this.tryModel('z-ai-default', req, Date.now());
      return { consensus: fallback.content, confidence: 0.3, votes: [{ modelId: 'z-ai-default', content: fallback.content }] };
    }

    if (votes.length === 1) {
      return { consensus: votes[0].content, confidence: 0.5, votes };
    }

    const agreementRatio = votes.length / models.length;

    return {
      consensus: votes[0].content,
      confidence: Math.min(1, agreementRatio),
      votes,
    };
  }

  async resolveDisagreement(
    req: ModelRequest,
    responses: Array<{ modelId: ModelId; content: string }>
  ): Promise<{ resolved: string; explanation: string }> {
    const analysisMessages = [
      { role: 'system' as const, content: 'You are a disagreement resolver. Multiple AI models gave different answers. Analyze each, identify which is most accurate, and explain your reasoning. Be specific about factual errors.' },
      { role: 'user' as const, content: responses.map((r, i) => `[Model ${i + 1}: ${r.modelId}]\n${r.content}`).join('\n\n---\n\n') },
    ];

    const result = await generateText({
      model: getModel(resolveModelAlias(req.taskCategory === 'general' ? 'z-ai-default' : 'z-ai-default')),
      messages: analysisMessages,
    });
    const resolved = result.text || responses[0]?.content || '';

    return { resolved, explanation: resolved };
  }

  getCapabilities(modelId: ModelId): ModelCapability | undefined {
    return MODEL_REGISTRY[modelId];
  }

  getBestModelFor(task: TaskCategory, requireThinking?: boolean): ModelId {
    const candidates = TASK_MODEL_MAP[task] || TASK_MODEL_MAP.general;
    for (const id of candidates) {
      const cap = MODEL_REGISTRY[id];
      if (requireThinking && !cap.supportsThinking) continue;
      return id;
    }
    return 'z-ai-default';
  }
}

export const orchestrator = new Orchestrator();
