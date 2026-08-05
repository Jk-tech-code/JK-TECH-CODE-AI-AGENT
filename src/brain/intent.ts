/**
 * Intent + complexity analysis.
 *
 * Fast, deterministic heuristics that classify the user's request BEFORE the
 * model is called. These hints shape planning, reasoning depth, and which
 * context the Brain emphasises. The result is internal only — never shown.
 */
import type { Complexity, Intent } from './types';

const CODE_HINTS = [
  'code', 'function', 'bug', 'debug', 'syntax', 'api', 'endpoint', 'react', 'next',
  'typescript', 'python', 'javascript', 'node', 'express', 'database', 'sql', 'prisma',
  'component', 'npm', 'package', 'framework', 'algorithm', 'refactor', 'types', 'compile',
];

const RESEARCH_HINTS = [
  'research', 'find', 'what is', 'who is', 'why', 'compare', 'when', 'where',
  'looking into', 'latest', 'news', 'trend', 'facts', 'sources', 'study', 'report on',
  'investigate', 'history of', 'statistics', 'how does', 'analyze the market',
];

const WRITING_HINTS = [
  'write', 'email', 'blog', 'post', 'essay', 'proposal', 'letter', 'copy',
  'content', 'rewrite', 'paraphrase', 'tone', 'humanize', 'edit', 'draft',
  'summary of this', 'headline', 'intro', 'bio', 'story', 'slogan', 'caption',
];

const ANALYSIS_HINTS = [
  'analyze', 'analysis', 'evaluate', 'compare', 'interpret', 'breakdown',
  'review', 'assess', 'metrics', 'insights', 'forecast', 'risk', 'trade-off',
];

const PLANNING_HINTS = [
  'plan', 'roadmap', 'strategy', 'step-by-step', 'architecture', 'timeline',
  'how should i', 'implement', 'build ', 'design a', 'workflow', 'approach for',
  'outline', 'proposal for', 'project plan', 'milestones',
];

const EXPLAIN_HINTS = [
  'explain', 'what does', 'how does', 'what is', 'meaning of', 'define',
  'concepts', 'tutorial', 'understand', 'teach me', 'walk me through', 'dummy',
];

const DESIGN_HINTS = [
  'design', 'ui', 'ux', 'landing page', 'wireframe', 'color', 'typography',
  'layout', 'brand', 'logo', 'interface', 'dashboard design', 'mockup', 'prototype',
];

const SUMMARY_HINTS = [
  'summarize', 'summary', 'tl;dr', 'short version', 'in short', 'condense',
  'quick summary', 'recap', 'key points',
];

function matchHints(text: string, hints: string[]): number {
  const lower = ` ${text.toLowerCase()} `;
  return hints.reduce((count, hint) => (lower.includes(` ${hint} `) || lower.includes(` ${hint}:`) ? count + 1 : count), 0);
}

export function classifyIntent(query: string): Intent {
  const text = query.trim();
  if (!text) return 'conversation';

  const scores: Record<Intent, number> = {
    code: matchHints(text, CODE_HINTS) * 1.6,
    research: matchHints(text, RESEARCH_HINTS) * 1.4,
    writing: matchHints(text, WRITING_HINTS) * 1.5,
    analysis: matchHints(text, ANALYSIS_HINTS) * 1.3,
    planning: matchHints(text, PLANNING_HINTS) * 1.3,
    explain: matchHints(text, EXPLAIN_HINTS) * 1.2,
    design: matchHints(text, DESIGN_HINTS) * 1.2,
    summary: matchHints(text, SUMMARY_HINTS) * 1.2,
    conversation: 0,
    other: text.length > 80 ? 0.5 : 0,
  };

  // Short / casual / non-command queries are plain conversation.
  if (text.length < 3) return 'conversation';
  if (/^(hi|hello|hey|thanks|thank you|who are you|what can you do)\b/i.test(text)) {
    return 'conversation';
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] <= 0) return 'other';
  return best[0] as Intent;
}

export function estimateComplexity(query: string, intent: Intent): Complexity {
  const text = query.trim();
  const words = text.split(/\s+/).filter(Boolean).length;

  if (intent === 'planning' || intent === 'analysis' || intent === 'code') {
    if (words > 100 || text.length > 600) return 'high';
    if (words > 40) return 'medium';
    return 'low';
  }
  if (intent === 'research') {
    if (words > 120) return 'high';
    return 'medium';
  }
  if (words > 150) return 'high';
  if (words > 60) return 'medium';
  return 'low';
}