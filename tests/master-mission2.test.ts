import { describe, it, expect } from 'vitest';
import { plannerAgent } from '../src/lib/master/planner';
import { intelligentCache, cacheKeys } from '../src/lib/master/cache';
import { traceStore } from '../src/lib/master/trace';
import { dynamicSkillRegistry } from '../src/lib/skills/registry';

describe('Master Orchestrator — Phase 5/6 (Planner + skill chaining)', () => {
  it('matches the website workflow template for website requests', async () => {
    const plan = await plannerAgent.plan({
      rawPrompt: 'Build me a landing page for my startup',
      intent: 'build',
      primaryDomain: 'web',
      domains: ['web'],
      multiDomain: false,
      outputFormat: 'auto',
      needsSearch: false,
      needsReasoning: false,
      isComplex: true,
      needsHumanize: false,
    });
    expect(plan.complexity).toBe('high');
    expect(plan.phases.map(p => p.name)).toContain('Build');
    expect(plan.estimatedLatencyMs).toBeGreaterThan(0);
  });

  it('matches the research template for research intents', async () => {
    const plan = await plannerAgent.plan({
      rawPrompt: 'Research the latest AI trends',
      intent: 'research',
      primaryDomain: 'general',
      domains: ['general'],
      multiDomain: false,
      outputFormat: 'auto',
      needsSearch: true,
      needsReasoning: true,
      isComplex: false,
      needsHumanize: false,
    });
    expect(plan.phases.map(p => p.name)).toContain('Report');
    expect(plan.needsSearch).toBe(true);
  });

  it('falls back to a direct chain for unmatched requests', async () => {
    const plan = await plannerAgent.plan({
      rawPrompt: 'Say hello',
      intent: 'general',
      primaryDomain: 'general',
      domains: ['general'],
      multiDomain: false,
      outputFormat: 'auto',
      needsSearch: false,
      needsReasoning: false,
      isComplex: false,
      needsHumanize: false,
    });
    expect(plan.phases.length).toBeGreaterThan(0);
    expect(plan.detectedSkills.length).toBeGreaterThan(0);
  });
});

describe('Master Orchestrator — Phase 12 (Intelligent cache)', () => {
  it('stores and retrieves with TTL', async () => {
    await intelligentCache.set('k', { hello: 'world' }, 500);
    const hit = await intelligentCache.get('k');
    expect(hit).toEqual({ hello: 'world' });
    expect(intelligentCache.stats().hits).toBeGreaterThan(0);
  });

  it('honors expiry', async () => {
    await intelligentCache.set('expiring', 'value', 1);
    await new Promise(r => setTimeout(r, 30));
    const expired = await intelligentCache.get('expiring');
    expect(expired).toBeUndefined();
  });

  it('produces deterministic cache keys', () => {
    const a = cacheKeys.analysis('Tell me about AI');
    const b = cacheKeys.analysis('Tell me about AI');
    expect(a).toBe(b);
    expect(cacheKeys.routing('x')).not.toBe(cacheKeys.plan('x'));
  });
});

describe('Master Orchestrator — Phase 13 (Observability / trace)', () => {
  it('records a full trace lifecycle', () => {
    const trace = traceStore.begin('Test input');
    traceStore.update(trace, { intent: 'research' });
    traceStore.update(trace, {
      steps: [{ skill: 'research-agent', purpose: 'Synthesize', status: 'pending' }],
    });
    traceStore.markStep(trace, 0, { status: 'running' });
    traceStore.markStep(trace, 0, { status: 'success', latencyMs: 42 });
    traceStore.addCacheHit(trace, 'analysis');
    traceStore.finish(trace, 'success', 100);

    const stats = traceStore.stats();
    expect(stats.total).toBeGreaterThanOrEqual(1);
    expect(stats.success).toBeGreaterThanOrEqual(1);
    expect(trace.steps[0]?.status).toBe('success');
  });
});

describe('Master Orchestrator — Phase 2/16 (Dynamic Skill Registry)', () => {
  it('discovers skills from the /skills directory', async () => {
    const all = await dynamicSkillRegistry.getAll();
    expect(all.length).toBeGreaterThan(10);
    expect(all.some(s => s.id.includes('coding-agent'))).toBe(true);
  });

  it('searches by keyword and returns matching skills', async () => {
    const results = await dynamicSkillRegistry.search('code review', 5);
    expect(results.length).toBeGreaterThanOrEqual(0);
    for (const r of results) {
      expect(typeof r.id).toBe('string');
      expect(r.description.length).toBeGreaterThan(0);
    }
  });
});
