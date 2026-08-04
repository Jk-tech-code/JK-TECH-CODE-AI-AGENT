import { executeAgentTask } from '@/lib/agents/registry';
import { orchestrator } from '@/lib/core/orchestrator';
import { searchAggregator } from '@/lib/core/search';
import { humanWritingEngine } from '@/lib/core/humanize';
import { DeepReasoningEngine } from '@/lib/core/reasoning';
import { executeVisualAgent } from '@/lib/visual/index';
import { createLogger } from '@/lib/logging/logger';
import type { AgentId } from '@/lib/core/types';
import type { MasterAnalysis, MasterRequest, SkillOutput, SkillStep } from './types';

const executorLogger = createLogger('master-executor');

const reasoningEngine = new DeepReasoningEngine(orchestrator);

export class SkillExecutor {
  /**
   * Execute an ordered skill chain. Sequential steps build on each other;
   * `parallel` steps run concurrently with sibling steps.
   */
  async run(
    steps: SkillStep[],
    analysis: MasterAnalysis,
    request: MasterRequest,
    signal?: AbortSignal,
  ): Promise<SkillOutput[]> {
    const outputs: SkillOutput[] = [];

    // Group steps into sequential batches; steps marked parallel run together.
    const batches: SkillStep[][] = [];
    for (const step of steps) {
      if (step.parallel && batches.length > 0) {
        batches[batches.length - 1].push(step);
      } else {
        batches.push([step]);
      }
    }

    for (const batch of batches) {
      if (batch.length === 1) {
        const out = await this.executeStep(batch[0], outputs, analysis, request, signal);
        if (out) outputs.push(out);
      } else {
        const results = await Promise.all(
          batch.map(step => this.executeStep(step, outputs, analysis, request, signal)),
        );
        for (const out of results) if (out) outputs.push(out);
      }
    }

    return outputs;
  }

  private async executeStep(
    step: SkillStep,
    prior: SkillOutput[],
    analysis: MasterAnalysis,
    request: MasterRequest,
    signal?: AbortSignal,
  ): Promise<SkillOutput | null> {
    const start = Date.now();
    // Feed prior step outputs forward so later skills build on earlier ones.
    const contextPrefix =
      prior.length > 0
        ? '\n\nContext from earlier steps:\n' +
          prior.map(o => `[${o.purpose}]\n${o.result.slice(0, 3000)}`).join('\n---\n')
        : '';

    const taskInput = `${analysis.enhancedPrompt}${contextPrefix}`;

    try {
      switch (step.skill) {
        case 'llm': {
          const resp = await orchestrator.route({
            messages: [
              {
                role: 'system',
                content:
                  'You are JK-TECH-CODE AI Agent — an enterprise-grade multi-model assistant. ' +
                  'Answer the user\'s request accurately and helpfully in a natural, human tone.',
              },
              { role: 'user', content: taskInput },
            ],
            taskCategory: 'general',
            thinking: true,
            signal,
          });
          return {
            stepIndex: 0,
            skill: 'llm',
            purpose: step.purpose,
            result: resp.content,
            confidence: resp.confidence,
            modelUsed: resp.modelId,
            latencyMs: Date.now() - start,
          };
        }

        case 'search': {
          try {
            await searchAggregator.init();
            const results = await searchAggregator.search({
              query: analysis.rawPrompt,
              numResults: 5,
              recencyDays: 30,
            });
            if (results.length === 0) return null;
            return {
              stepIndex: 0,
              skill: 'search',
              purpose: step.purpose,
              result:
                'Recent web search results:\n' +
                results
                  .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\nSource: ${r.url}`)
                  .join('\n\n'),
              confidence: 0.7,
              sources: results.map(r => ({ title: r.title, url: r.url })),
              latencyMs: Date.now() - start,
            };
          } catch (err) {
            executorLogger.warn('Search step failed', {
              error: err instanceof Error ? err.message : String(err),
            });
            return null;
          }
        }

        case 'reasoning': {
          const result = await reasoningEngine.reason(analysis.rawPrompt);
          return {
            stepIndex: 0,
            skill: 'reasoning',
            purpose: step.purpose,
            result:
              result.conclusion +
              (result.supportingEvidence.length > 0
                ? '\n\nEvidence:\n' + result.supportingEvidence.join('\n')
                : ''),
            confidence: result.confidenceAssessment,
            latencyMs: Date.now() - start,
          };
        }

        case 'humanize': {
          const latest = prior.find(o => o.skill !== 'humanize')?.result || taskInput;
          const humanized = await humanWritingEngine.humanize(latest);
          return {
            stepIndex: 0,
            skill: 'humanize',
            purpose: step.purpose,
            result: humanized.humanized,
            confidence: humanized.patternScore > 0.2 ? 0.8 : 0.6,
            latencyMs: Date.now() - start,
          };
        }

        default: {
          // Map generic skill names to executable registry agents.
          const agentId = this.resolveAgentId(step.skill);

          if (agentId.startsWith('visual:')) {
            // Route to the visual agent registry (image generation, etc).
            const visualAgentId = agentId.replace('visual:', '');
            const visual = await executeVisualAgent(visualAgentId, {
              prompt: taskInput,
              taskType: 'text-to-image',
            });
            return {
              stepIndex: 0,
              skill: step.skill,
              purpose: step.purpose,
              result: visual.result,
              confidence: visual.confidence,
              latencyMs: Date.now() - start,
            };
          }

          const output = await executeAgentTask({
            id: `master_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            agentId: agentId as AgentId,
            input: taskInput,
            context: request.context,
            priority: 1,
          });
          return {
            stepIndex: 0,
            skill: step.skill,
            purpose: step.purpose,
            result: output.result,
            confidence: output.confidence,
            modelUsed: output.metadata?.modelUsed as string | undefined,
            latencyMs: Date.now() - start,
            sources: Array.isArray(output.evidence) && output.evidence.length > 0
              ? output.evidence.map((e: string) => ({ title: 'Evidence', url: e })).slice(0, 3)
              : undefined,
          };
        }
      }
    } catch (err) {
      executorLogger.warn(`Skill step failed: ${step.skill}`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Resolve a generic skill name to an executable agent id.
   * Returns 'visual:<id>' for visual agents so the caller can dispatch.
   */
  private resolveAgentId(skill: string): string {
    const genericToVisual: Record<string, string> = {
      'image-generation': 'image-generation-agent',
      'image-edit': 'photo-enhancement-agent',
      'image-understand': 'quality-assurance-agent',
      'image-search': 'visual-research-agent',
    };
    const visualAgent = genericToVisual[skill];
    if (visualAgent) return `visual:${visualAgent}`;

    // Skill folder names that map 1:1 to registry agents.
    const folderToAgent: Record<string, string> = {
      'coding-agent': 'coding-agent',
      'research-agent': 'research-agent',
      'content-agent': 'content-agent',
      'fact-checker': 'fact-checker',
      'planning-agent': 'planning-agent',
      'strategy-agent': 'strategy-agent',
      'analytics-agent': 'analytics-agent',
      'data-science-agent': 'data-science-agent',
      'seo-agent': 'seo-agent',
      'document-agent': 'document-agent',
      'image-analysis-agent': 'image-analysis-agent',
      'system-architect': 'system-architect',
      'presentation-agent': 'presentation-agent',
      'spreadsheet-agent': 'spreadsheet-agent',
      'pdf-agent': 'pdf-agent',
      'doc-agent': 'doc-agent',
      'csv-agent': 'csv-agent',
      'markdown-agent': 'markdown-agent',
    };
    if (folderToAgent[skill]) return folderToAgent[skill];

    // Pass through known agent ids unchanged; unknown skills fail validation upstream.
    return skill;
  }
}

export const skillExecutor = new SkillExecutor();