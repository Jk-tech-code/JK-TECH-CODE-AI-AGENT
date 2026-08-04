import type { SkillOutput } from './types';
import { orchestrator } from '@/lib/core/orchestrator';
import { createLogger } from '@/lib/logging/logger';

const mergerLogger = createLogger('master-merger');

export class ResultMerger {
  /**
   * Merge one or more skill outputs into a single coherent answer.
   * - 0 outputs: returns a safe empty response.
   * - 1 output: returns it unchanged (single-skill fast path).
   * - 2+ outputs: a single synthesis call weaves them into one polished reply.
   */
  async merge(
    originalPrompt: string,
    outputs: SkillOutput[],
    signal?: AbortSignal,
  ): Promise<{ content: string; modelUsed?: string; confidence: number }> {
    const usable = outputs.filter(o => o.result && o.result.trim().length > 0);

    if (usable.length === 0) {
      return {
        content: '',
        confidence: 0,
      };
    }

    if (usable.length === 1) {
      return {
        content: usable[0].result,
        modelUsed: usable[0].modelUsed,
        confidence: usable[0].confidence,
      };
    }

    const combined = usable
      .map((o, i) => `[Perspective ${i + 1}]\n${o.result}`)
      .join('\n\n---\n\n');

    try {
      const response = await orchestrator.route({
        messages: [
          {
            role: 'system',
            content:
              'You are a senior editor. Multiple expert drafts were produced for the same request. ' +
              'Merge them into ONE coherent, polished, final answer for the user. ' +
              'Keep the strongest points from each, remove duplication and contradictions, ' +
              'and preserve a natural, human tone. Do not mention drafts, perspectives, or any internal process. ' +
              'Output only the final merged answer.',
          },
          {
            role: 'user',
            content: `User request: ${originalPrompt}\n\nExpert drafts:\n${combined}`,
          },
        ],
        taskCategory: 'general',
        thinking: false,
        signal,
      });

      return {
        content: response.content,
        modelUsed: response.modelId,
        confidence: response.confidence,
      };
    } catch (err) {
      mergerLogger.warn('Merge failed — returning best single output', {
        error: err instanceof Error ? err.message : String(err),
      });
      const best = usable.reduce((a, b) => (b.confidence > a.confidence ? b : a));
      return {
        content: best.result,
        modelUsed: best.modelUsed,
        confidence: best.confidence,
      };
    }
  }
}

export const resultMerger = new ResultMerger();