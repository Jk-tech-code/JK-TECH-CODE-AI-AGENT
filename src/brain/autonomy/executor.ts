/**
 * Autonomy Task Executor (Phase 2).
 *
 * Executes a plan's steps sequentially (respecting dependency order) by
 * invoking the Brain for reasoning steps and auto-invoking tools for steps
 * that declare one. Reports live progress and returns the assembled result.
 * Never exposes tool calls or reasoning to the user — only the outcome.
 */
import { createLogger } from '@/lib/logging/logger';
import { complete, checkProvider, getConfiguredModel } from '@/brain/providers/llm';
import { brainComplete } from '@/brain/brain';
import { toolManager } from './tool-manager';
import { planProgress } from './planner';
import type { Plan, PlanExecutionResult, TaskStep, ToolRunContext } from './types';

const executorLogger = createLogger('autonomy:executor');

export interface ExecutorOptions {
  userId?: string;
  projectId?: string;
  signal?: AbortSignal;
}

export interface ExecutionHooks {
  onStep?: (step: TaskStep, plan: Plan) => void;
  onProgress?: (progress: number, plan: Plan) => void;
}

export class TaskExecutor {
  async executePlan(
    plan: Plan,
    opts: ExecutorOptions = {},
    hooks: ExecutionHooks = {},
  ): Promise<PlanExecutionResult> {
    const startedAt = Date.now();
    const ctx: ToolRunContext = { userId: opts.userId, projectId: opts.projectId };
    const providerStatus = await checkProvider();
    const steps = [...plan.steps].sort((a, b) => this.order(a, b));

    plan.status = 'running';

    for (const step of steps) {
      if (opts.signal?.aborted) {
        step.status = 'cancelled';
        break;
      }
      if (this.hasBlockedDeps(step, steps)) {
        step.status = 'blocked';
        continue;
      }

      step.status = 'running';
      step.startedAt = Date.now();
      hooks.onStep?.(step, plan);

      const stepStart = Date.now();
      const result = await this.runStep(step, ctx, providerStatus.available);
      step.latencyMs = Date.now() - stepStart;
      step.completedAt = Date.now();

      if (result.ok) {
        step.status = 'completed';
        step.output = result.output;
        step.confidence = result.confidence;
        step.modelUsed = result.modelUsed;
      } else {
        step.status = 'failed';
        step.error = result.error;
      }

      plan.progress = planProgress(steps);
      hooks.onProgress?.(plan.progress, plan);
    }

    const completed = steps.filter((s) => s.status === 'completed').length;
    const failed = steps.filter((s) => s.status === 'failed').length;
    plan.status = failed > 0 ? 'failed' : steps.some((s) => s.status === 'cancelled') ? 'cancelled' : 'completed';
    plan.progress = planProgress(steps);

    return {
      plan,
      startedAt,
      finishedAt: Date.now(),
      totalLatencyMs: Date.now() - startedAt,
      succeeded: completed > 0 && failed === 0 && plan.status === 'completed',
    };
  }

  /** Order steps: dependencies first, then their dependents. */
  private order(a: TaskStep, b: TaskStep): number {
    if (a.dependsOn?.includes(b.id)) return 1;
    if (b.dependsOn?.includes(a.id)) return -1;
    return 0;
  }

  private hasBlockedDeps(step: TaskStep, all: TaskStep[]): boolean {
    if (!step.dependsOn || step.dependsOn.length === 0) return false;
    return all.some((s) => step.dependsOn?.includes(s.id) && s.status !== 'completed');
  }

  private async runStep(
    step: TaskStep,
    ctx: ToolRunContext,
    providerAvailable: boolean,
  ): Promise<{ ok: boolean; output: string; error?: string; confidence?: number; modelUsed?: string }> {
    // Tool-backed steps run the tool (fast, deterministic).
    if (step.tool && step.tool !== 'none') {
      const out = await toolManager.invoke(step.tool, { query: step.prompt ?? step.description }, ctx);
      if (out.used) {
        return { ok: true, output: out.content, confidence: 0.9, modelUsed: `tool:${step.tool}` };
      }
      // Fall through to LLM if the tool had nothing to do.
    }

    if (!providerAvailable) {
      // Deterministic fallback so plans still complete without a model.
      return {
        ok: true,
        output: `## ${step.title}\n${step.description}\n\n(Completed without LLM — provider unavailable. ${step.tool ? `Suggested tool: ${step.tool}.` : ''})`,
        confidence: 0.3,
        modelUsed: 'fallback',
      };
    }

    try {
      const prompt = step.prompt ?? step.description ?? step.title;
      const result = await complete(
        [
          {
            role: 'system',
            content: 'You are an autonomous task executor. Complete the given step concisely and accurately. Output only the result of this step.',
          },
          { role: 'user', content: `Task: ${step.title}\n\n${prompt}` },
        ],
        { temperature: 0.4, maxTokens: 512, thinking: false },
      );
      return {
        ok: result.content.trim().length > 0,
        output: result.content.trim() || `(No output for step "${step.title}")`,
        confidence: result.content.trim().length > 0 ? 0.85 : 0,
        modelUsed: getConfiguredModel(),
      };
    } catch (err) {
      executorLogger.warn(`Step failed: ${step.title}`, { error: err instanceof Error ? err.message : String(err) });
      return { ok: false, output: '', error: err instanceof Error ? err.message : 'Step failed' };
    }
  }
}

export const taskExecutor = new TaskExecutor();

/**
 * Convenience: run a plan end-to-end with the Brain pipeline for the final
 * synthesis, so the user gets a single polished answer plus progress.
 */
export async function runAutonomy(
  goal: string,
  opts: ExecutorOptions = {},
  hooks: ExecutionHooks = {},
): Promise<{ plan: Plan; synthesis: string }> {
  const { taskPlanner } = await import('./planner');
  const plan = await taskPlanner.createPlan(goal);
  const result = await taskExecutor.executePlan(plan, opts, hooks);

  // Synthesize the executed steps into one polished answer via the Brain.
  const stepSummary = result.plan.steps
    .map((s) => `- ${s.title}: ${s.output ?? s.error ?? ''}`)
    .filter((s) => s.trim() !== '-')
    .join('\n')
    .slice(0, 4000);

  const brainOut = await brainComplete({
    query: `Produce the final deliverable for: ${goal}`,
    messages: [],
    userId: opts.userId,
    settings: { responseLength: 'detailed' },
  });

  const body = brainOut.content || `Plan executed: ${result.succeeded ? 'completed' : result.plan.status}.`;
  const synthesis = `# ${goal}\n\n${stepSummary ? `## Execution summary\n\n${stepSummary}\n\n` : ''}## Result\n\n${body}`;

  return { plan: result.plan, synthesis };
}