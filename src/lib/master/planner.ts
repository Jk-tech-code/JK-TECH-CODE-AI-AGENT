import type { MasterAnalysis, SkillStep } from './types';
import { skillRouter } from './router';
import { dynamicSkillRegistry } from '@/lib/skills/registry';
import { createLogger } from '@/lib/logging/logger';

const plannerLogger = createLogger('master-planner');

export interface PlanPhase {
  name: string;
  description: string;
  steps: SkillStep[];
}

export interface ExecutionPlan {
  complexity: 'low' | 'medium' | 'high';
  phases: PlanPhase[];
  parallelGroups: number;
  estimatedLatencyMs: number;
  needsSearch: boolean;
  needsReasoning: boolean;
  detectedSkills: string[];
}

/**
 * Workflow templates (Phase 6 — Skill Chaining). Each is an ordered set of
 * phases; steps flagged `parallel` inside a phase can run concurrently.
 */
const WORKFLOW_TEMPLATES: Record<string, PlanPhase[]> = {
  website: [
    {
      name: 'Research',
      description: 'Understand requirements and gather context',
      steps: [{ skill: 'research-agent', purpose: 'Gather requirements and current best practices' }],
    },
    {
      name: 'Design',
      description: 'Architecture and interface planning',
      steps: [
        { skill: 'system-architect', purpose: 'Design the architecture', parallel: true },
        { skill: 'strategy-agent', purpose: 'Define the product approach', parallel: true },
      ],
    },
    {
      name: 'Build',
      description: 'Implementation',
      steps: [{ skill: 'coding-agent', purpose: 'Implement the website' }],
    },
    {
      name: 'Review',
      description: 'Testing and deployment guidance',
      steps: [{ skill: 'content-agent', purpose: 'Write test and deployment guide' }],
    },
  ],
  research: [
    {
      name: 'Search',
      description: 'Gather sources',
      steps: [{ skill: 'search', purpose: 'Fetch current web results', parallel: true }],
    },
    {
      name: 'Analyze',
      description: 'Deep-dive into the topic',
      steps: [{ skill: 'research-agent', purpose: 'Synthesize the evidence' }],
    },
    {
      name: 'Verify',
      description: 'Fact-check the findings',
      steps: [{ skill: 'fact-checker', purpose: 'Cross-check claims' }],
    },
    {
      name: 'Report',
      description: 'Deliver the findings',
      steps: [{ skill: 'markdown-agent', purpose: 'Structure the final report' }],
    },
  ],
  poster: [
    {
      name: 'Strategy',
      description: 'Content and message',
      steps: [{ skill: 'content-agent', purpose: 'Draft the message and hook' }],
    },
    {
      name: 'Design',
      description: 'Visual direction',
      steps: [
        { skill: 'image-analysis-agent', purpose: 'Define visual composition', parallel: true },
        { skill: 'content-agent', purpose: 'Finalize copy', parallel: true },
      ],
    },
    {
      name: 'Generate',
      description: 'Produce the visual',
      steps: [{ skill: 'image-generation' as SkillStep['skill'], purpose: 'Generate the poster image' }],
    },
    {
      name: 'Review',
      description: 'Quality check',
      steps: [{ skill: 'quality-review' as SkillStep['skill'], purpose: 'Assess output quality' }],
    },
  ],
};

export class PlannerAgent {
  /**
   * Build an execution plan for an analysis. Uses workflow templates when the
   * intent clearly matches one, otherwise falls back to the router chain.
   */
  async plan(analysis: MasterAnalysis): Promise<ExecutionPlan> {
    const template = this.matchTemplate(analysis);

    let phases: PlanPhase[];
    if (template) {
      phases = template;
      plannerLogger.info('Workflow template matched', { template });
    } else {
      const steps = skillRouter.route(analysis);
      phases = steps.length > 0
        ? [{ name: 'Execute', description: 'Run the selected skill chain', steps }]
        : [{ name: 'Execute', description: 'Direct assistant answer', steps: [{ skill: 'llm', purpose: 'Answer' }] }];
    }

    // Augment phases with dynamically discovered skills when relevant.
    const detected = await this.augmentWithRegistry(analysis);
    if (detected.length > 0 && phases.length === 1) {
      phases[0].steps = [...detected, ...phases[0].steps];
    }

    const complexity = this.estimateComplexity(analysis, phases);
    const parallelGroups = phases.reduce(
      (acc, p) => acc + (p.steps.some(s => s.parallel) ? 1 : 0),
      0,
    );

    return {
      complexity,
      phases,
      parallelGroups,
      estimatedLatencyMs: this.estimateLatency(phases, complexity),
      needsSearch: analysis.needsSearch,
      needsReasoning: analysis.needsReasoning,
      detectedSkills: phases.flatMap(p => p.steps.map(s => s.skill)),
    };
  }

  private matchTemplate(analysis: MasterAnalysis): PlanPhase[] | null {
    const text = analysis.rawPrompt.toLowerCase();
    if (/\b(website|web app|full.?stack|landing page|ecommerce site)\b/.test(text)) return WORKFLOW_TEMPLATES.website;
    if (/\b(poster|flyer|banner|infographic)\b/.test(text) && analysis.primaryDomain === 'image') return WORKFLOW_TEMPLATES.poster;
    if (analysis.intent === 'research' || /\b(research|investigate|find out|market report)\b/.test(text)) return WORKFLOW_TEMPLATES.research;
    return null;
  }

  private async augmentWithRegistry(analysis: MasterAnalysis): Promise<SkillStep[]> {
    try {
      const results = await dynamicSkillRegistry.search(analysis.rawPrompt, 3);
      return results
        .filter(r => r.executable)
        .map(r => ({ skill: r.id as SkillStep['skill'], purpose: r.description.slice(0, 80), parallel: true }));
    } catch (err) {
      plannerLogger.warn('Registry augmentation skipped', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  private estimateComplexity(analysis: MasterAnalysis, phases: PlanPhase[]): 'low' | 'medium' | 'high' {
    const stepCount = phases.reduce((acc, p) => acc + p.steps.length, 0);
    if (analysis.isComplex || stepCount >= 4) return 'high';
    if (stepCount >= 2 || analysis.multiDomain) return 'medium';
    return 'low';
  }

  private estimateLatency(phases: PlanPhase[], complexity: string): number {
    const steps = phases.reduce((acc, p) => acc + p.steps.length, 0);
    const base = complexity === 'high' ? 8000 : complexity === 'medium' ? 5000 : 2500;
    return base + steps * 600;
  }
}

export const plannerAgent = new PlannerAgent();