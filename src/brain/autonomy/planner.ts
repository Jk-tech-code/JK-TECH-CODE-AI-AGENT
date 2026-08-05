/**
 * Autonomy Task Planner (Phase 1).
 *
 * Decomposes a high-level goal into an ordered, executable task DAG. Uses
 * deterministic templates for common goal patterns (website, app, document,
 * research, analysis, report) with an LLM refinement pass when the provider is
 * available. The plan is shown to the user as progress; execution happens in
 * the executor.
 */
import { randomUUID } from 'crypto';
import { createLogger } from '@/lib/logging/logger';
import { checkProvider } from '@/brain/providers/llm';
import type { Plan, TaskStep, TaskStatus } from './types';

const plannerLogger = createLogger('autonomy:planner');

/* ───────────────────── Deterministic plan templates ───────────────────── */

interface Template {
  match: RegExp;
  steps: Array<{ title: string; description: string; tool?: string; prompt?: string }>;
}

const TEMPLATES: Template[] = [
  {
    match: /\b(website|web app|landing page|ecommerce|store|dashboard|portal)\b/i,
    steps: [
      { title: 'Requirements', description: 'Clarify goal, audience and constraints.' },
      { title: 'Research', description: 'Gather reference patterns and best practices.', tool: 'web_search' },
      { title: 'UI planning', description: 'Define pages, layout and component structure.' },
      { title: 'Database', description: 'Design the data model and relationships.' },
      { title: 'Backend', description: 'Plan APIs, auth and business logic.' },
      { title: 'Frontend', description: 'Define components, state and interactions.' },
      { title: 'Authentication', description: 'Design login, session and permissions.' },
      { title: 'Payments', description: 'Plan checkout and payment integration.' },
      { title: 'Testing', description: 'List test cases and QA steps.' },
      { title: 'Deployment', description: 'Outline hosting and CI/CD pipeline.' },
      { title: 'SEO', description: 'Plan metadata and indexing strategy.' },
      { title: 'Documentation', description: 'Write setup and usage docs.' },
    ],
  },
  {
    match: /\b(code|fix|debug|refactor|bug|program|script)\b/i,
    steps: [
      { title: 'Understand', description: 'Analyze the existing code and inputs.' },
      { title: 'Reproduce', description: 'Reproduce the issue or verify behavior.' },
      { title: 'Fix', description: 'Implement the minimal correct change.' },
      { title: 'Test', description: 'Run tests and edge-case checks.' },
      { title: 'Optimize', description: 'Improve performance and readability.' },
      { title: 'Document', description: 'Summarize the change.' },
    ],
  },
  {
    match: /\b(research|report|investigate|analyze|analysis)\b/i,
    steps: [
      { title: 'Gather', description: 'Collect evidence and sources.', tool: 'web_search' },
      { title: 'Cross-reference', description: 'Compare findings and flag contradictions.' },
      { title: 'Synthesize', description: 'Merge into a structured conclusion.' },
      { title: 'Format', description: 'Produce a clean, readable deliverable.' },
    ],
  },
  {
    match: /\b(pdf|document|file|upload|extract|summarize)\b/i,
    steps: [
      { title: 'Extract', description: 'Read the document content.', tool: 'file_reader' },
      { title: 'Analyze', description: 'Understand structure and key points.' },
      { title: 'Summarize', description: 'Produce a concise summary.' },
      { title: 'Deliver', description: 'Format the final output.' },
    ],
  },
];

const FALLBACK_STEPS = [
  { title: 'Understand', description: 'Restate the goal and constraints.' },
  { title: 'Plan', description: 'Break the work into ordered milestones.' },
  { title: 'Execute', description: 'Complete each milestone.' },
  { title: 'Verify', description: 'Check the result meets the goal.' },
  { title: 'Deliver', description: 'Return the final result.' },
];

/* ───────────────────── Planner ───────────────────── */

export interface PlannerOptions {
  maxSteps?: number;
}

export class TaskPlanner {
  /** Build a plan for a goal. Deterministic base, optional LLM refinement. */
  async createPlan(goal: string, opts: PlannerOptions = {}): Promise<Plan> {
    const maxSteps = opts.maxSteps ?? 16;
    const base = this.templateSteps(goal);
    const status = await checkProvider();
    let steps = base;

    // Refinement pass only when the model is actually reachable — never block
    // planning on an unavailable provider.
    if (status.available) {
      try {
        const refined = await this.llmRefine(goal);
        if (refined && refined.length > 0) steps = refined;
      } catch (err) {
        plannerLogger.warn('LLM plan refinement skipped', { error: err instanceof Error ? err.message : String(err) });
      }
    }

    const trimmed = steps.slice(0, maxSteps);
    const planSteps: TaskStep[] = trimmed.map((s, i) => ({
      id: randomUUID(),
      title: s.title,
      description: s.description,
      tool: s.tool,
      prompt: s.prompt,
      dependsOn: i > 0 ? [/* resolved below */] : [],
      status: 'pending',
    }));

    // Link each step to the previous one (sequential execution).
    for (let i = 1; i < planSteps.length; i++) {
      planSteps[i].dependsOn = [planSteps[i - 1].id];
    }

    const plan: Plan = {
      id: randomUUID(),
      goal: goal.slice(0, 2000),
      summary: this.summarizeGoal(goal),
      steps: planSteps,
      createdAt: Date.now(),
      status: 'pending',
      progress: 0,
    };
    plan.status = 'queued';
    return plan;
  }

  private templateSteps(goal: string): Template['steps'] {
    for (const t of TEMPLATES) {
      if (t.match.test(goal)) return t.steps;
    }
    return FALLBACK_STEPS;
  }

  private summarizeGoal(goal: string): string {
    const clean = goal.replace(/\s+/g, ' ').trim();
    return clean.length > 160 ? `${clean.slice(0, 157)}…` : clean;
  }

  /** LLM refinement pass — asks the model to break the goal into steps. */
  private async llmRefine(goal: string): Promise<Template['steps'] | null> {
    const { complete } = await import('@/brain/providers/llm');
    const prompt = [
      { role: 'system' as const, content: 'You are a senior project planner. Break the goal into 4–10 concise, ordered execution steps. Respond ONLY as JSON: [{"title":"...","description":"...","tool":"calculator|web_search|file_reader|csv_analyzer|json_parser|markdown_parser|none"}]' },
      { role: 'user' as const, content: goal.slice(0, 1500) },
    ];
    const res = await complete(prompt, { temperature: 0.3, maxTokens: 800, thinking: false });
    const parsed = this.parseStepsJson(res.content);
    return parsed;
  }

  private parseStepsJson(raw: string): Template['steps'] | null {
    try {
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) return null;
      const arr = JSON.parse(match[0]) as Array<Record<string, unknown>>;
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr
        .filter((s) => s && typeof s.title === 'string' && s.title.trim())
        .map((s) => ({
          title: String(s.title).slice(0, 120),
          description: String(s.description ?? '').slice(0, 240),
          tool: typeof s.tool === 'string' && s.tool !== 'none' ? s.tool : undefined,
          prompt: typeof s.prompt === 'string' ? s.prompt : undefined,
        }));
    } catch {
      return null;
    }
  }
}

export const taskPlanner = new TaskPlanner();

/** Progress 0..100 from a list of steps. */
export function planProgress(steps: TaskStep[]): number {
  if (steps.length === 0) return 0;
  const weight = { completed: 1, failed: 1, running: 0.5, queued: 0, pending: 0, blocked: 0, cancelled: 0 } as Record<TaskStatus, number>;
  const sum = steps.reduce((acc, s) => acc + weight[s.status], 0);
  return Math.round((sum / steps.length) * 100);
}