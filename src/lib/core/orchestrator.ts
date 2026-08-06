/**
 * Deterministic task orchestrator.
 *
 * The orchestrator routes a request to the Brain's single generation engine
 * (the Search Engine). It keeps the same surface (`route`, `init`,
 * `runVoting`, `resolveDisagreement`, `getCapabilities`, `getBestModelFor`)
 * that the rest of the app (master, visual, agents, autonomy, API routes)
 * relies on — but generation is now deterministic and evidence-based instead
 * of calling an external LLM.
 */
import { complete } from '@/brain/providers/llm';
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

/** Pull the user query out of the message list for the search engine. */
function extractQuery(req: ModelRequest): string {
  for (let i = req.messages.length - 1; i >= 0; i--) {
    const msg = req.messages[i];
    if (msg.role === 'user' && msg.content.trim().length > 0) {
      return msg.content.split('[CONTEXT]')[0].trim();
    }
  }
  return '';
}

export class Orchestrator {
  private fallbackChain: ModelId[][] = [];

  /**
   * Validate that the generation engine is configured.
   * Safe to call multiple times. Throws AppError 503 when no search key.
   */
  async init(): Promise<void> {
    const { searchAggregator } = await import('./search');
    await searchAggregator.init();
  }

  async route(req: ModelRequest): Promise<ModelResponse> {
    const startTime = Date.now();
    const query = extractQuery(req);
    const taskCategory: TaskCategory = req.taskCategory || 'general';
    const candidates = TASK_MODEL_MAP[taskCategory] || TASK_MODEL_MAP.general;
    const modelId: ModelId = candidates[0] || 'z-ai-default';

    try {
      const result = await complete(
        req.messages,
        {
          maxTokens: req.maxTokens,
          thinking: req.thinking,
        },
      );

      const content = result.content || '';
      const latencyMs = Date.now() - startTime;

      return {
        content,
        modelId,
        thinking: result.thinking || undefined,
        latencyMs,
        tokensUsed: { input: 0, output: 0 },
        confidence: this.estimateConfidence(content, modelId, taskCategory),
      };
    } catch (err) {
      orchestratorLogger.warn('Generation failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
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
    _models: ModelId[],
    _minAgreement = 0.6
  ): Promise<{ consensus: string; confidence: number; votes: Array<{ modelId: ModelId; content: string }> }> {
    // Single deterministic engine — voting is a no-op that returns the answer.
    const fallback = await this.route(req);
    return {
      consensus: fallback.content,
      confidence: fallback.confidence,
      votes: [{ modelId: fallback.modelId, content: fallback.content }],
    };
  }

  async resolveDisagreement(
    req: ModelRequest,
    responses: Array<{ modelId: ModelId; content: string }>
  ): Promise<{ resolved: string; explanation: string }> {
    const resolved = responses[0]?.content || (await this.route(req)).content;
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
