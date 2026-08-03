import { generateText } from 'ai';
import { getModel, resolveModelAlias } from '@/lib/ai/provider';
import { createLogger } from '@/lib/logging/logger';
import type {
  ModelId,
  ModelCapability,
  ModelRequest,
  ModelResponse,
  TaskCategory,
} from './types';

const orchestratorLogger = createLogger('orchestrator');

const MODEL_REGISTRY: Record<ModelId, ModelCapability> = {
  'gpt-5.5': { modelId: 'gpt-5.5', priority: 1, taskCategories: ['reasoning', 'research', 'strategy', 'analysis'], maxTokens: 128000, supportsStreaming: true, supportsThinking: true, supportsVision: true, supportsTools: true, costPer1KInput: 0.01, costPer1KOutput: 0.03, latencyMs: 1500 },
  'gpt-4.1': { modelId: 'gpt-4.1', priority: 2, taskCategories: ['coding', 'general', 'summarization', 'analysis'], maxTokens: 32000, supportsStreaming: true, supportsThinking: false, supportsVision: true, supportsTools: true, costPer1KInput: 0.002, costPer1KOutput: 0.008, latencyMs: 800 },
  'claude-opus': { modelId: 'claude-opus', priority: 1, taskCategories: ['document', 'analysis', 'reasoning', 'writing'], maxTokens: 200000, supportsStreaming: true, supportsThinking: true, supportsVision: true, supportsTools: true, costPer1KInput: 0.015, costPer1KOutput: 0.075, latencyMs: 2000 },
  'claude-sonnet': { modelId: 'claude-sonnet', priority: 2, taskCategories: ['coding', 'writing', 'general', 'creative'], maxTokens: 32000, supportsStreaming: true, supportsThinking: false, supportsVision: true, supportsTools: true, costPer1KInput: 0.003, costPer1KOutput: 0.015, latencyMs: 1000 },
  'gemini-2.5-pro': { modelId: 'gemini-2.5-pro', priority: 1, taskCategories: ['multimodal', 'reasoning', 'research', 'data-analysis'], maxTokens: 1048576, supportsStreaming: true, supportsThinking: true, supportsVision: true, supportsTools: true, costPer1KInput: 0.005, costPer1KOutput: 0.015, latencyMs: 1200 },
  'gemini-2.5-flash': { modelId: 'gemini-2.5-flash', priority: 3, taskCategories: ['general', 'summarization', 'creative'], maxTokens: 32000, supportsStreaming: true, supportsThinking: false, supportsVision: true, supportsTools: false, costPer1KInput: 0.0005, costPer1KOutput: 0.0015, latencyMs: 500 },
  'deepseek-r1': { modelId: 'deepseek-r1', priority: 1, taskCategories: ['reasoning', 'coding', 'analysis'], maxTokens: 64000, supportsStreaming: true, supportsThinking: true, supportsVision: false, supportsTools: false, costPer1KInput: 0.002, costPer1KOutput: 0.008, latencyMs: 2000 },
  'deepseek-v4': { modelId: 'deepseek-v4', priority: 2, taskCategories: ['coding', 'general', 'summarization', 'analysis'], maxTokens: 64000, supportsStreaming: true, supportsThinking: false, supportsVision: false, supportsTools: true, costPer1KInput: 0.001, costPer1KOutput: 0.004, latencyMs: 600 },
  'julius-ai': { modelId: 'julius-ai', priority: 1, taskCategories: ['data-analysis', 'analysis'], maxTokens: 32000, supportsStreaming: true, supportsThinking: false, supportsVision: false, supportsTools: true, costPer1KInput: 0.003, costPer1KOutput: 0.012, latencyMs: 1500 },
  'glm-5.2': { modelId: 'glm-5.2', priority: 2, taskCategories: ['general', 'summarization', 'writing', 'creative'], maxTokens: 32000, supportsStreaming: true, supportsThinking: false, supportsVision: true, supportsTools: true, costPer1KInput: 0.002, costPer1KOutput: 0.008, latencyMs: 800 },
  'z-ai-default': { modelId: 'z-ai-default', priority: 5, taskCategories: ['general', 'summarization', 'writing'], maxTokens: 16000, supportsStreaming: true, supportsThinking: true, supportsVision: false, supportsTools: true, costPer1KInput: 0.001, costPer1KOutput: 0.003, latencyMs: 500 },
};

const TASK_MODEL_MAP: Record<TaskCategory, ModelId[]> = {
  coding: ['deepseek-v4', 'deepseek-r1', 'gpt-4.1', 'claude-sonnet', 'z-ai-default'],
  reasoning: ['deepseek-r1', 'gpt-5.5', 'claude-opus', 'gemini-2.5-pro', 'z-ai-default'],
  research: ['gpt-5.5', 'gemini-2.5-pro', 'claude-opus', 'deepseek-r1', 'z-ai-default'],
  analysis: ['gpt-5.5', 'claude-opus', 'julius-ai', 'deepseek-r1', 'z-ai-default'],
  writing: ['claude-sonnet', 'claude-opus', 'gpt-4.1', 'glm-5.2', 'z-ai-default'],
  planning: ['gpt-5.5', 'claude-opus', 'deepseek-r1', 'gemini-2.5-pro', 'z-ai-default'],
  multimodal: ['gemini-2.5-pro', 'gpt-5.5', 'claude-opus', 'gpt-4.1'],
  'data-analysis': ['julius-ai', 'gemini-2.5-pro', 'gpt-5.5', 'deepseek-r1'],
  document: ['claude-opus', 'claude-sonnet', 'gpt-5.5', 'gemini-2.5-pro'],
  creative: ['claude-sonnet', 'glm-5.2', 'gemini-2.5-flash', 'gpt-4.1'],
  summarization: ['gemini-2.5-flash', 'gpt-4.1', 'glm-5.2', 'deepseek-v4', 'z-ai-default'],
  'fact-verification': ['gpt-5.5', 'deepseek-r1', 'claude-opus', 'gemini-2.5-pro'],
  strategy: ['gpt-5.5', 'claude-opus', 'deepseek-r1', 'gemini-2.5-pro'],
  presentation: ['claude-sonnet', 'gpt-5.5', 'claude-opus', 'gemini-2.5-pro'],
  spreadsheet: ['gpt-4.1', 'claude-sonnet', 'gpt-5.5', 'deepseek-v4'],
  general: ['z-ai-default', 'gemini-2.5-flash', 'gpt-4.1', 'claude-sonnet', 'deepseek-v4'],
};

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
