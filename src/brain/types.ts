/** Shared types for the JK-TECH-CODE Brain pipeline. */

export type Intent =
  | 'code'
  | 'research'
  | 'writing'
  | 'analysis'
  | 'planning'
  | 'explain'
  | 'design'
  | 'summary'
  | 'conversation'
  | 'other';

export type Complexity = 'low' | 'medium' | 'high';

export type ReasoningLevel = 'low' | 'medium' | 'high';

export interface BrainSettings {
  /** Engine: 'deepseek' (real LLM) or 'search' (deterministic Search Engine). */
  provider: string;
  /** Engine model label (e.g. 'deepseek-chat' / 'search-engine'). */
  model: string;
  /** Number of search results consulted when building an answer (2–10). */
  numResults: number;
  /** Restrict results to a recency window (days). 0 = any date. */
  recencyDays: number;
  streaming: boolean;
  memoryEnabled: boolean;
  knowledgeEnabled: boolean;
  reasoningLevel: ReasoningLevel;
  responseLength: 'short' | 'balanced' | 'detailed';
  systemPrompt: string;
  personality: string;
}

export const DEFAULT_SETTINGS: BrainSettings = {
  provider: 'search',
  model: 'search-engine',
  numResults: 5,
  recencyDays: 0,
  streaming: true,
  memoryEnabled: true,
  knowledgeEnabled: true,
  reasoningLevel: 'medium',
  responseLength: 'balanced',
  systemPrompt: '',
  personality: '',
};

/** Structured context assembled by the Brain before calling the model. */
export interface RequestContext {
  userQuery: string;
  intent: Intent;
  complexity: Complexity;
  conversationMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  memories: string[];
  knowledge: string;
  files: string;
  planningNote: string;
  reasoningNote: string;
  settings: BrainSettings;
}

/** Injected context block appended to the system or user message. */
export interface BrainContextBlock {
  systemAdditions?: string;
  userAdditions?: string;
}

/** Result of the full Brain pipeline for streaming responses. */
export interface BrainOutput {
  content: string;
  modelUsed: string;
  confidence: number;
  latencyMs: number;
  thinking?: string;
  error?: string;
  retryable?: boolean;
}