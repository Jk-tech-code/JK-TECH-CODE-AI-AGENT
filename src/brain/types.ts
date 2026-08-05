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
  /** Provider key: 'gemini' | 'ollama' | 'openai' | 'groq' | 'openrouter' | 'anthropic' | 'together'. */
  provider: string;
  /** Model name (e.g. 'gemini-2.5-flash', 'qwen3:4b'). */
  model: string;
  temperature: number;
  topP: number;
  /** Top-K sampling (Ollama). 0 disables. */
  topK: number;
  maxTokens: number;
  streaming: boolean;
  /** Automatic fallback to the next provider on retryable failure. */
  fallbackEnabled: boolean;
  memoryEnabled: boolean;
  knowledgeEnabled: boolean;
  reasoningLevel: ReasoningLevel;
  responseLength: 'short' | 'balanced' | 'detailed';
  systemPrompt: string;
  personality: string;
}

export const DEFAULT_SETTINGS: BrainSettings = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  temperature: 0.7,
  topP: 0.9,
  topK: 0,
  maxTokens: 1024,
  streaming: true,
  fallbackEnabled: false,
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