import type {
  Domain,
  Intent,
  MasterAnalysis,
  SkillStep,
} from './types';
import type { AgentId } from '@/lib/core/types';
import { agentRegistry } from '@/lib/agents/registry';
import { orchestrator } from '@/lib/core/orchestrator';
import { createLogger } from '@/lib/logging/logger';

const routerLogger = createLogger('master-router');

/**
 * Domain → skill chain mapping. Each chain is a list of steps executed in
 * order (later steps build on earlier ones). Steps flagged `parallel` can
 * run concurrently with sibling steps.
 */
const DOMAIN_CHAINS: Record<Domain, SkillStep[]> = {
  coding: [
    { skill: 'system-architect', purpose: 'Design the architecture and plan the implementation' },
    { skill: 'coding-agent', purpose: 'Generate production-ready code with error handling' },
  ],
  research: [
    { skill: 'research-agent', purpose: 'Gather current, multi-source evidence' },
    { skill: 'fact-checker', purpose: 'Verify claims and flag contradictions' },
  ],
  writing: [
    { skill: 'content-agent', purpose: 'Draft natural, human-sounding content' },
    { skill: 'markdown-agent', purpose: 'Format the draft with clean structure' },
  ],
  marketing: [
    { skill: 'seo-agent', purpose: 'Shape messaging for search and audience' },
    { skill: 'content-agent', purpose: 'Write the marketing copy' },
  ],
  strategy: [
    { skill: 'strategy-agent', purpose: 'Analyze the situation and options' },
    { skill: 'planning-agent', purpose: 'Turn analysis into an actionable roadmap' },
  ],
  data: [
    { skill: 'data-science-agent', purpose: 'Apply rigorous statistical thinking' },
    { skill: 'analytics-agent', purpose: 'Extract actionable insights' },
  ],
  document: [
    { skill: 'document-agent', purpose: 'Extract and organize document content' },
    { skill: 'markdown-agent', purpose: 'Produce a structured, readable deliverable' },
  ],
  resume: [
    { skill: 'content-agent', purpose: 'Draft compelling career content' },
    { skill: 'markdown-agent', purpose: 'Format for ATS-friendly structure' },
  ],
  presentation: [
    { skill: 'presentation-agent', purpose: 'Design the slide deck and narrative' },
  ],
  spreadsheet: [
    { skill: 'spreadsheet-agent', purpose: 'Design the workbook, dashboard and formulas' },
  ],
  image: [
    { skill: 'image-analysis-agent', purpose: 'Analyze the visual content' },
  ],
  finance: [
    { skill: 'data-science-agent', purpose: 'Model and analyze the numbers' },
    { skill: 'strategy-agent', purpose: 'Frame recommendations and risk' },
  ],
  education: [
    { skill: 'content-agent', purpose: 'Teach the topic with clear examples' },
  ],
  general: [
    { skill: 'llm', purpose: 'Answer directly with the general assistant' },
  ],
};

/** Intent-specific prepend steps (optional) that add rigor to a chain. */
const INTENT_STEPS: Partial<Record<Intent, SkillStep[]>> = {
  research: [
    { skill: 'research-agent', purpose: 'Gather evidence', parallel: true },
  ],
  compare: [
    { skill: 'analytics-agent', purpose: 'Evaluate the options', parallel: true },
  ],
  analyze: [
    { skill: 'analytics-agent', purpose: 'Break down the subject', parallel: true },
  ],
  verify: [
    { skill: 'fact-checker', purpose: 'Verify the claims', parallel: true },
  ],
  plan: [
    { skill: 'planning-agent', purpose: 'Create the plan', parallel: true },
  ],
  write: [
    { skill: 'content-agent', purpose: 'Write the content', parallel: true },
  ],
  code: [
    { skill: 'coding-agent', purpose: 'Write the code', parallel: true },
  ],
};

export class SkillRouter {
  /**
   * Turn an analysis into an ordered, deduplicated skill chain.
   * Returns [] when nothing matched (caller should fall back to 'llm').
   */
  route(analysis: MasterAnalysis): SkillStep[] {
    const steps: SkillStep[] = [];
    const seen = new Set<string>();

    const push = (s: SkillStep) => {
      const key = s.skill;
      if (seen.has(key)) return;
      seen.add(key);
      steps.push(s);
    };

    // Prepend intent-level steps so domain chains keep their natural order.
    const intentSteps = INTENT_STEPS[analysis.intent];
    if (intentSteps) {
      for (const s of intentSteps) push(s);
    }

    for (const domain of analysis.domains) {
      const chain = DOMAIN_CHAINS[domain] || DOMAIN_CHAINS.general;
      for (const s of chain) push(s);
    }

    // Special engines, injected based on analysis flags.
    if (analysis.needsReasoning && !analysis.domains.includes('data')) {
      push({ skill: 'reasoning', purpose: 'Apply deep structured reasoning' });
    }
    if (analysis.needsSearch && !steps.some(s => s.skill === 'research-agent')) {
      push({ skill: 'search', purpose: 'Fetch current web context' });
    }
    if (analysis.needsHumanize) {
      push({ skill: 'humanize', purpose: 'Give the final answer a human tone' });
    }

    return steps;
  }

  /** Validate that every skill in a chain is executable. */
  validate(steps: SkillStep[]): { valid: boolean; missing: string[] } {
    const missing: string[] = [];
    for (const s of steps) {
      if (s.skill === 'llm' || s.skill === 'humanize' || s.skill === 'reasoning' || s.skill === 'search') continue;
      try {
        agentRegistry.getAgent(s.skill as AgentId);
      } catch {
        missing.push(s.skill);
      }
    }
    return { valid: missing.length === 0, missing };
  }

  /**
   * Score the confidence that the heuristic domain detection is correct.
   * Used to decide between the fast (heuristic) router and the smart router.
   */
  confidence(analysis: MasterAnalysis): { score: number; reason: string } {
    const top = analysis.domainConfidence[analysis.primaryDomain] || 0;
    const second = this.secondHighest(analysis.domainConfidence);
    const gap = top - second;

    // Strong single-domain signal, high intent confidence, not ambiguous.
    if (top >= 6 && gap >= 3 && analysis.intentConfidence >= 0.7) {
      return { score: 0.95, reason: 'clear domain signal' };
    }
    if (top >= 4 && gap >= 2) {
      return { score: 0.8, reason: 'moderate domain signal' };
    }
    if (gap <= 1) {
      return { score: 0.35, reason: 'domains are ambiguous' };
    }
    return { score: 0.55, reason: 'weak domain signal' };
  }

  /**
   * Smart router: when heuristic confidence is below `threshold`, ask a fast
   * reasoning model to pick the best skill combination. Falls back to the
   * heuristic chain on any error so routing never fails.
   */
  async smartRoute(
    analysis: MasterAnalysis,
    opts?: { threshold?: number },
  ): Promise<{ steps: SkillStep[]; source: 'fast' | 'smart'; confidence: number }> {
    const threshold = opts?.threshold ?? 0.55;
    const heuristic = this.confidence(analysis);

    if (heuristic.score >= threshold) {
      return { steps: this.route(analysis), source: 'fast', confidence: heuristic.score };
    }

    routerLogger.info('Smart routing triggered below confidence threshold', {
      score: heuristic.score,
      threshold,
      reason: heuristic.reason,
    });

    const skillNames = Object.keys(DOMAIN_CHAINS).map(d => `'${d}'`).join(', ');
    try {
      const resp = await orchestrator.route({
        messages: [
          {
            role: 'system',
            content:
              'You are a routing engine. The user gave an ambiguous request. ' +
              'Select the best skill combination from this list as a JSON array of object literals ' +
              `like [{"skill":"<agent id>","purpose":"<why>"}]. Available: ${skillNames}. ` +
              'Return ONLY the JSON array. Choose the 1-3 most useful skills.',
          },
          { role: 'user', content: analysis.rawPrompt },
        ],
        taskCategory: 'reasoning',
        thinking: false,
      });

      const parsed = this.tryParseSmartResponse(resp.content);
      if (parsed && parsed.length > 0) {
        const valid = parsed.filter(s => this.isKnownSkill(s.skill));
        if (valid.length > 0) {
          if (analysis.needsHumanize) valid.push({ skill: 'humanize', purpose: 'Human tone' } as SkillStep);
          return { steps: valid, source: 'smart', confidence: 0.75 };
        }
      }
    } catch (err) {
      routerLogger.warn('Smart routing failed — using heuristic fallback', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return { steps: this.route(analysis), source: 'fast', confidence: heuristic.score };
  }

  private tryParseSmartResponse(text: string): SkillStep[] | null {
    try {
      const cleaned = text.replace(/```(json)?/g, '').trim();
      const start = cleaned.indexOf('[');
      const end = cleaned.lastIndexOf(']');
      if (start === -1 || end === -1) return null;
      const json = JSON.parse(cleaned.slice(start, end + 1));
      if (!Array.isArray(json)) return null;
      return json
        .filter((o): o is { skill: string; purpose?: string } => o && typeof o.skill === 'string')
        .map(o => ({ skill: o.skill as SkillStep['skill'], purpose: o.purpose || 'Skill step', parallel: true }));
    } catch {
      return null;
    }
  }

  private isKnownSkill(skill: string): boolean {
    if (['llm', 'humanize', 'reasoning', 'search'].includes(skill)) return true;
    try {
      agentRegistry.getAgent(skill as AgentId);
      return true;
    } catch {
      return false;
    }
  }

  private secondHighest(scores: Record<string, number>): number {
    const values = Object.values(scores).sort((a, b) => b - a);
    return values.length > 1 ? values[1] : 0;
  }
}

export const skillRouter = new SkillRouter();