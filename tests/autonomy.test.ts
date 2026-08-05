import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logging/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/lib/db', () => ({
  db: {
    userPreference: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    conversation: { findMany: vi.fn() },
    document: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/memory/store', () => ({
  memoryStore: { recall: vi.fn().mockResolvedValue([]), store: vi.fn() },
}));

vi.mock('@/brain/providers/llm', () => ({
  checkProvider: vi.fn().mockResolvedValue({ available: false }),
  complete: vi.fn().mockResolvedValue({ content: 'ok', model: 'mock' }),
  getConfiguredModel: vi.fn().mockReturnValue('mock'),
  activeProvider: vi.fn().mockReturnValue('mock'),
  modelInfo: vi.fn().mockResolvedValue({ models: [] }),
}));

vi.mock('@/brain/brain', () => ({
  brainComplete: vi.fn().mockResolvedValue({ content: 'synthesis', modelUsed: 'mock', confidence: 1, latencyMs: 1 }),
}));

vi.mock('@/lib/security/guard', () => ({
  securityGuard: { analyzePrompt: () => ({ isSafe: true }), analyzeRagSource: () => ({ isSafe: true }) },
}));

import { taskPlanner } from '../src/brain/autonomy/planner';
import { taskExecutor } from '../src/brain/autonomy/executor';
import { toolManager } from '../src/brain/autonomy/tool-manager';
import { codeSandbox } from '../src/brain/autonomy/sandbox';
import { qualityGate } from '../src/brain/autonomy/quality';

describe('Autonomy Planner', () => {
  it('creates a plan for a website goal', async () => {
    const plan = await taskPlanner.createPlan('Build me an ecommerce website');
    expect(plan.steps.length).toBeGreaterThan(1);
    expect(plan.steps[0]).toHaveProperty('id');
    expect(plan.steps[0]).toHaveProperty('title');
    expect(plan.steps[0]).toHaveProperty('status');
  });

  it('produces a sequential dependency chain', async () => {
    const plan = await taskPlanner.createPlan('Research the AI market');
    for (let i = 1; i < plan.steps.length; i++) {
      expect(plan.steps[i].dependsOn).toContain(plan.steps[i - 1].id);
    }
  });

  it('caps the number of steps', async () => {
    const plan = await taskPlanner.createPlan('Build me an ecommerce website', { maxSteps: 4 });
    expect(plan.steps.length).toBeLessThanOrEqual(4);
  });

  it('progress starts at 0', async () => {
    const plan = await taskPlanner.createPlan('Write a report');
    expect(plan.progress).toBe(0);
  });
});

describe('Autonomy Executor', () => {
  it('executes all steps even without an LLM (fallback)', async () => {
    const plan = await taskPlanner.createPlan('Fix the login bug');
    const result = await taskExecutor.executePlan(plan, {});
    expect(result.plan.status).toBe('completed');
    expect(result.succeeded).toBe(true);
    expect(result.plan.progress).toBe(100);
  });

  it('marks steps completed with outputs', async () => {
    const plan = await taskPlanner.createPlan('Write a report on AI');
    const result = await taskExecutor.executePlan(plan, {});
    const completed = result.plan.steps.filter((s) => s.status === 'completed');
    expect(completed.length).toBe(plan.steps.length);
  });
});

describe('Autonomy Tool Manager', () => {
  it('registers the built-in tools', () => {
    expect(toolManager.has('calculator')).toBe(true);
    expect(toolManager.has('csv_analyzer')).toBe(true);
    expect(toolManager.has('json_parser')).toBe(true);
    expect(toolManager.has('markdown_parser')).toBe(true);
    expect(toolManager.has('web_search')).toBe(true);
  });

  it('invokes the calculator tool', async () => {
    const out = await toolManager.invoke('calculator', { expression: '12 + 5' });
    expect(out.used).toBe(true);
    expect(out.content).toContain('17');
  });

  it('parses CSV via the analyzer', async () => {
    const out = await toolManager.invoke('csv_analyzer', { csv: 'name,age\nAlice,30\nBob,25' });
    expect(out.used).toBe(true);
    expect(out.content).toContain('3 rows');
  });

  it('rejects unknown tools gracefully', async () => {
    const out = await toolManager.invoke('does_not_exist', {});
    expect(out.used).toBe(false);
    expect(out.content).toContain('Unknown tool');
  });
});

describe('Autonomy Sandbox', () => {
  it('runs JavaScript and captures output', async () => {
    const r = await codeSandbox.run({ runtime: 'javascript', code: 'const x = 21 * 2;\nx;' });
    expect(r.ok).toBe(true);
    expect(r.output).toContain('42');
  });

  it('blocks unsafe globals', async () => {
    const r = await codeSandbox.run({ runtime: 'javascript', code: 'require("fs")' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Blocked');
  });

  it('blocks eval', async () => {
    const r = await codeSandbox.run({ runtime: 'javascript', code: 'eval("1+1")' });
    expect(r.ok).toBe(false);
  });

  it('rejects write SQL', async () => {
    const r = await codeSandbox.run({ runtime: 'sql', code: 'DELETE FROM users;' });
    expect(r.ok).toBe(false);
  });

  it('accepts read-only SQL', async () => {
    const r = await codeSandbox.run({ runtime: 'sql', code: 'SELECT * FROM users LIMIT 5;' });
    expect(r.ok).toBe(true);
  });

  it('blocks dangerous shell commands', async () => {
    const r = await codeSandbox.run({ runtime: 'shell', code: 'rm -rf /' });
    expect(r.ok).toBe(false);
  });

  it('allows read-only shell commands', async () => {
    const r = await codeSandbox.run({ runtime: 'shell', code: 'ls -la' });
    expect(r.ok).toBe(true);
  });

  it('applies a timeout to runaway code', async () => {
    const r = await codeSandbox.run({ runtime: 'javascript', code: 'while(true){}', timeoutMs: 300 });
    expect(r.ok).toBe(false);
  });
});

describe('Autonomy Quality Gate', () => {
  it('passes a complete, specific response', () => {
    const v = qualityGate('We recommend the Pro plan for teams needing unlimited analyses and API access.', {
      goal: 'recommend a plan for teams',
    });
    expect(v.passed).toBe(true);
  });

  it('flags low-coverage responses', () => {
    const v = qualityGate('That is an interesting question.', { goal: 'build an ecommerce website architecture' });
    expect(v.passed).toBe(false);
  });

  it('asks for clarification when confident enough not to guess', () => {
    const v = qualityGate('I do not know the answer without more details.', { goal: 'estimate project cost' });
    expect(v.clarifyingQuestion).toBeTruthy();
  });

  it('sanitizes response content', () => {
    const v = qualityGate('ok\u0000\u0001', { goal: 'say ok' });
    expect(v.sanitized).not.toMatch(/\u0000/);
  });
});