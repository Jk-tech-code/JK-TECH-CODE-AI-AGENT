/**
 * Autonomy Workflows (Phase 5).
 *
 * Users (or the Brain) compose multi-step workflows from tools and plugins,
 * save them, and run them. Each step references a tool or plugin; running a
 * workflow feeds each step's output into the next via an input reference.
 */
import { randomUUID } from 'crypto';
import { createLogger } from '@/lib/logging/logger';
import { db } from '@/lib/db';
import { complete, checkProvider, getConfiguredModel } from '@/brain/providers/llm';
import { toolManager } from './tool-manager';
import { pluginRegistry } from './plugins';
import type { Workflow, WorkflowStepDef, ToolRunContext } from './types';

const workflowsLogger = createLogger('autonomy:workflows');
const PREFS_PREFIX = 'autonomy:workflows';

function keyFor(userId: string, id: string): string {
  return `${PREFS_PREFIX}:${id}`;
}

export interface WorkflowRunResult {
  workflowId: string;
  steps: Array<{ id: string; title: string; ok: boolean; output: string; latencyMs: number }>;
  succeeded: boolean;
  totalLatencyMs: number;
}

export class WorkflowStore {
  async list(userId: string): Promise<Workflow[]> {
    try {
      const rows = await db.userPreference.findMany({
        where: { userId, key: { startsWith: `${PREFS_PREFIX}:` } },
        orderBy: { updatedAt: 'desc' },
      });
      return rows
        .map((r) => safeParse<Workflow>(r.value))
        .filter((w): w is Workflow => !!w && typeof w.id === 'string')
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (err) {
      workflowsLogger.error('Failed to list workflows', err);
      return [];
    }
  }

  async get(userId: string, id: string): Promise<Workflow | null> {
    try {
      const row = await db.userPreference.findUnique({
        where: { userId_key: { userId, key: keyFor(userId, id) } },
      });
      return row ? safeParse<Workflow>(row.value) : null;
    } catch {
      return null;
    }
  }

  async create(userId: string, input: { name: string; description?: string; steps: WorkflowStepDef[] }): Promise<Workflow> {
    const now = Date.now();
    const workflow: Workflow = {
      id: randomUUID(),
      name: (input.name || 'Untitled workflow').slice(0, 120),
      description: input.description ?? '',
      steps: (input.steps ?? []).slice(0, 30),
      createdAt: now,
      updatedAt: now,
    };
    await this.persist(userId, workflow);
    return workflow;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    try {
      await db.userPreference.deleteMany({ where: { userId, key: keyFor(userId, id) } });
      return true;
    } catch {
      return false;
    }
  }

  /** Run a workflow end-to-end, threading output between steps. */
  async run(userId: string, workflowId: string, input: Record<string, unknown> = {}): Promise<WorkflowRunResult> {
    const workflow = await this.get(userId, workflowId);
    if (!workflow) {
      return { workflowId, steps: [], succeeded: false, totalLatencyMs: 0 };
    }
    const started = Date.now();
    const ctx: ToolRunContext = { userId };
    const providerAvailable = (await checkProvider()).available;
    const results: WorkflowRunResult['steps'] = [];

    let lastOutput = String(input.initial ?? '');
    const env = new Map<string, string>(Object.entries(input).map(([k, v]) => [k, String(v)]));

    for (const step of workflow.steps) {
      const stepStart = Date.now();
      const prompt = step.prompt ?? '';
      // Resolve {ref} placeholders from the shared environment.
      const resolved = prompt.replace(/\{(\w+)\}/g, (_, k: string) => env.get(k) ?? `{${k}}`);

      try {
        // 1) Tool-backed step.
        if (toolManager.has(step.action)) {
          const out = await toolManager.invoke(step.action, { query: resolved, content: lastOutput || resolved }, ctx);
          const output = out.used ? out.content : `[no tool output] ${resolved}`;
          env.set(step.id, output);
          lastOutput = output;
          results.push({ id: step.id, title: step.title, ok: true, output, latencyMs: Date.now() - stepStart });
          continue;
        }

        // 2) Plugin-backed step.
        if (pluginRegistry.get(step.action)) {
          const out = await pluginRegistry.runPlugin(step.action, { text: lastOutput || resolved, content: lastOutput, ...input }, ctx);
          const output = out.result;
          env.set(step.id, output);
          lastOutput = output;
          results.push({ id: step.id, title: step.title, ok: out.ok, output, latencyMs: Date.now() - stepStart });
          continue;
        }

        // 3) LLM step.
        if (providerAvailable) {
          const res = await complete(
            [
              { role: 'system', content: 'You are a workflow step executor. Produce only the step output.' },
              { role: 'user', content: resolved || lastOutput || 'no input' },
            ],
            { temperature: 0.4, maxTokens: 600 },
          );
          const output = res.content.trim();
          env.set(step.id, output);
          lastOutput = output;
          results.push({ id: step.id, title: step.title, ok: true, output, latencyMs: Date.now() - stepStart });
          continue;
        }

        const output = `[fallback] ${step.title}`;
        env.set(step.id, output);
        lastOutput = output;
        results.push({ id: step.id, title: step.title, ok: true, output, latencyMs: Date.now() - stepStart });
      } catch (err) {
        const output = `[error] ${err instanceof Error ? err.message : 'step failed'}`;
        results.push({ id: step.id, title: step.title, ok: false, output, latencyMs: Date.now() - stepStart });
        break;
      }
    }

    return {
      workflowId,
      steps: results,
      succeeded: results.every((r) => r.ok),
      totalLatencyMs: Date.now() - started,
    };
  }

  private async persist(userId: string, workflow: Workflow): Promise<void> {
    try {
      await db.userPreference.upsert({
        where: { userId_key: { userId, key: keyFor(userId, workflow.id) } },
        update: { value: JSON.stringify(workflow) },
        create: { userId, key: keyFor(userId, workflow.id), value: JSON.stringify(workflow) },
      });
    } catch (err) {
      workflowsLogger.error('Failed to persist workflow', err);
    }
  }
}

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const workflowStore = new WorkflowStore();

export { getConfiguredModel };