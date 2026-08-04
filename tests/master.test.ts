import { describe, it, expect } from 'vitest';
import { promptAnalyzer } from '@/lib/master/analyzer';
import { skillRouter } from '@/lib/master/router';
import type { SkillStep } from '@/lib/master/types';

describe('PromptAnalyzer', () => {
  it('detects coding domain and code intent', () => {
    const a = promptAnalyzer.analyze('Write a TypeScript function to fetch data from an API endpoint with error handling.');
    expect(a.primaryDomain).toBe('coding');
    expect(['code', 'write', 'generate']).toContain(a.intent);
    expect(a.needsHumanize).toBe(false);
  });

  it('detects research intent and enables search', () => {
    const a = promptAnalyzer.analyze('Research the latest AI news from this year.');
    expect(a.intent).toBe('research');
    expect(a.needsSearch).toBe(true);
  });

  it('detects writing domain and humanize flag', () => {
    const a = promptAnalyzer.analyze('Rewrite this email to sound more professional and human.');
    expect(a.primaryDomain).toBe('writing');
    expect(a.needsHumanize).toBe(true);
  });

  it('detects table output format', () => {
    const a = promptAnalyzer.analyze('Compare React vs Vue vs Svelte as a table.');
    expect(a.outputFormat).toBe('table');
  });

  it('falls back to general domain for plain prompts', () => {
    const a = promptAnalyzer.analyze('Hello there');
    expect(a.domains).toContain('general');
  });

  it('enhances prompt with capitalization and format directive', () => {
    const a = promptAnalyzer.analyze('list the top 3 benefits as a table');
    expect(a.enhancedPrompt[0]).toBe(a.enhancedPrompt[0].toUpperCase());
    expect(a.enhancedPrompt.toLowerCase()).toContain('table');
  });
});

describe('SkillRouter', () => {
  it('builds a coding chain ending with the coding agent', () => {
    const a = promptAnalyzer.analyze('Build a REST API in Node with input validation');
    const steps = skillRouter.route(a);
    const skills = steps.map((s: SkillStep) => s.skill);
    expect(skills).toContain('coding-agent');
  });

  it('chains research then fact-checker', () => {
    const a = promptAnalyzer.analyze('Research whether electric cars are better for the environment');
    const steps = skillRouter.route(a);
    const skills = steps.map((s: SkillStep) => s.skill);
    expect(skills).toContain('research-agent');
    expect(skills).toContain('fact-checker');
  });

  it('validates chains against the agent registry', () => {
    const a = promptAnalyzer.analyze('Create a marketing campaign for a new app');
    const steps = skillRouter.route(a);
    const { valid, missing } = skillRouter.validate(steps);
    expect(valid).toBe(true);
    expect(missing).toEqual([]);
  });

  it('always produces an executable plan (non-empty)', () => {
    const a = promptAnalyzer.analyze('Hi');
    const steps = skillRouter.route(a);
    expect(steps.length).toBeGreaterThan(0);
  });
});
