import type { AgentId } from '@/lib/core/types';

/**
 * Master Orchestrator types.
 *
 * The orchestrator sits above the existing agent registry and core engines.
 * It analyzes a prompt, routes to the best skill chain, executes, merges,
 * and quality-checks — then returns a single polished answer.
 */

export type Domain =
  | 'coding'
  | 'research'
  | 'writing'
  | 'marketing'
  | 'strategy'
  | 'data'
  | 'document'
  | 'resume'
  | 'presentation'
  | 'spreadsheet'
  | 'image'
  | 'finance'
  | 'education'
  | 'general';

export type Intent =
  | 'explain'
  | 'summarize'
  | 'generate'
  | 'write'
  | 'analyze'
  | 'compare'
  | 'research'
  | 'code'
  | 'plan'
  | 'verify'
  | 'rewrite'
  | 'brainstorm'
  | 'translate'
  | 'format'
  | 'general';

export type OutputFormat =
  | 'markdown'
  | 'table'
  | 'list'
  | 'json'
  | 'code'
  | 'email'
  | 'report'
  | 'essay'
  | 'checklist'
  | 'summary'
  | 'auto';

/** A single step in a skill execution plan. */
export interface SkillStep {
  /** Agent id from the registry, or a special engine step. */
  skill: AgentId | 'llm' | 'humanize' | 'reasoning' | 'search';
  /** Why this step runs (used for routing, not shown to users). */
  purpose: string;
  /** When true, this step can run concurrently with sibling steps. */
  parallel?: boolean;
}

export interface MasterAnalysis {
  rawPrompt: string;
  /** Grammar/format-enhanced prompt used downstream (never shown to users). */
  enhancedPrompt: string;
  intent: Intent;
  intentConfidence: number;
  /** Detected domains, ordered by confidence. */
  domains: Domain[];
  domainConfidence: Record<Domain, number>;
  primaryDomain: Domain;
  outputFormat: OutputFormat;
  needsSearch: boolean;
  needsReasoning: boolean;
  needsHumanize: boolean;
  isComplex: boolean;
  multiDomain: boolean;
  detectedKeywords: string[];
  /** Expert persona label chosen for this request. */
  persona: string;
}

export interface MasterRequest {
  input: string;
  context?: Record<string, unknown>;
  conversationId?: string;
  userId?: string;
  signal?: AbortSignal;
  /** Force a single agent (bypasses routing). */
  forceSkill?: AgentId;
  /** Disable prompt enhancement (still cleans whitespace). */
  disableEnhancement?: boolean;
  /** Debug flag — when true, skill routing metadata is returned. */
  debug?: boolean;
}

export interface SkillOutput {
  stepIndex: number;
  skill: string;
  purpose: string;
  result: string;
  confidence: number;
  modelUsed?: string;
  latencyMs?: number;
  sources?: Array<{ title: string; url: string }>;
}

export interface MasterResponse {
  requestId: string;
  result: string;
  confidence: number;
  intent: Intent;
  domains: Domain[];
  outputFormat: OutputFormat;
  latencyMs: number;
  sources?: Array<{ title: string; url: string }>;
  /** Only populated when request.debug is true. */
  skillsUsed?: Array<{ skill: string; purpose: string }>;
  error?: string;
}
