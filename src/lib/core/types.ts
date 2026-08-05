export type ModelId =
  | 'gpt-5.5'
  | 'gpt-4.1'
  | 'claude-opus'
  | 'claude-sonnet'
  | 'gemini-2.5-pro'
  | 'gemini-2.5-flash'
  | 'deepseek-r1'
  | 'deepseek-v4'
  | 'julius-ai'
  | 'glm-5.2'
  | 'z-ai-default'
  | 'qwen3:4b'
  | 'qwen3:8b'
  | 'qwen3:14b';

export type TaskCategory =
  | 'coding'
  | 'reasoning'
  | 'research'
  | 'analysis'
  | 'writing'
  | 'planning'
  | 'multimodal'
  | 'data-analysis'
  | 'document'
  | 'creative'
  | 'summarization'
  | 'fact-verification'
  | 'strategy'
  | 'general'
  | 'presentation'
  | 'spreadsheet';

export type AgentId =
  | 'research-agent'
  | 'fact-checker'
  | 'planning-agent'
  | 'coding-agent'
  | 'seo-agent'
  | 'content-agent'
  | 'analytics-agent'
  | 'document-agent'
  | 'strategy-agent'
  | 'data-science-agent'
  | 'image-analysis-agent'
  | 'system-architect'
  | 'presentation-agent'
  | 'spreadsheet-agent'
  | 'pdf-agent'
  | 'doc-agent'
  | 'csv-agent'
  | 'markdown-agent';

export interface ModelCapability {
  modelId: ModelId;
  priority: number;
  taskCategories: TaskCategory[];
  maxTokens: number;
  supportsStreaming: boolean;
  supportsThinking: boolean;
  supportsVision: boolean;
  supportsTools: boolean;
  costPer1KInput: number;
  costPer1KOutput: number;
  latencyMs: number;
}

export interface ModelRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  taskCategory: TaskCategory;
  stream?: boolean;
  thinking?: boolean;
  maxTokens?: number;
  temperature?: number;
  /** AbortSignal to cancel the request in flight */
  signal?: AbortSignal;
}

export interface ModelResponse {
  content: string;
  modelId: ModelId;
  thinking?: string;
  latencyMs: number;
  tokensUsed: { input: number; output: number };
  confidence: number;
}

export interface SearchQuery {
  query: string;
  numResults?: number;
  recencyDays?: number;
  engines?: SearchEngine[];
}

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  engine: SearchEngine;
  publishedDate?: string;
  domain?: string;
}

export interface ScoredSearchResult extends SearchResult {
  credibilityScore: number;
  freshnessScore: number;
  sourceTrustScore: number;
  overallScore: number;
}

export type SearchEngine = 'tavily' | 'brave' | 'serpapi' | 'bing' | 'searxng';

export interface CredibilityAssessment {
  score: number;
  factors: {
    domainTrust: number;
    freshnessDays: number;
    sourceType: SourceType;
    citationCount: number;
    factualConsistency: number;
  };
}

export type SourceType =
  | 'academic'
  | 'government'
  | 'official'
  | 'news'
  | 'blog'
  | 'social'
  | 'documentation'
  | 'forum'
  | 'unknown';

export interface ReasoningStep {
  step: number;
  type: 'analysis' | 'hypothesis' | 'verification' | 'synthesis' | 'conclusion';
  content: string;
  evidence: string[];
  confidence: number;
}

export interface ReasoningOutput {
  conclusion: string;
  supportingEvidence: string[];
  confidenceAssessment: number;
  assumptions: string[];
  alternativeInterpretations: string[];
  reasoningSteps: ReasoningStep[];
  verifiedFacts: Array<{ claim: string; verified: boolean; source: string }>;
  confidenceBreakdown: { logical: number; factual: number; source: number };
}

export interface RagChunk {
  id: string;
  content: string;
  metadata: RagMetadata;
  embedding?: number[];
  score?: number;
}

export interface RagMetadata {
  source: string;
  sourceType: SourceType;
  title?: string;
  author?: string;
  date?: string;
  pageNumber?: number;
  chunkIndex: number;
  totalChunks: number;
  hash: string;
}

export interface RagQuery {
  query: string;
  topK: number;
  minScore: number;
  filters?: Record<string, unknown>;
}

export interface RagResult {
  chunks: RagChunk[];
  totalFound: number;
  queryTimeMs: number;
}

export interface AgentTask {
  id: string;
  agentId: AgentId;
  input: string;
  context?: Record<string, unknown>;
  priority: number;
  parentTaskId?: string;
}

export interface AgentOutput {
  taskId: string;
  agentId: AgentId;
  result: string;
  confidence: number;
  evidence: string[];
  metadata: Record<string, unknown>;
}

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  content: string;
  tags: string[];
  timestamp: number;
  lastAccessed: number;
  accessCount: number;
  ttl?: number;
}

export type MemoryType =
  | 'conversation'
  | 'project'
  | 'knowledge'
  | 'preference'
  | 'fact'
  | 'session';

export interface ConflictReport {
  hasConflict: boolean;
  conflictingClaims: Array<{
    claim: string;
    sources: string[];
    confidence: number;
  }>;
  resolution: string;
  recommendedAction: string;
}

export interface VerificationResult {
  claim: string;
  verified: boolean;
  confidence: number;
  sources: string[];
  contradictions: string[];
  lastVerified: number;
}

export interface HumanizationResult {
  humanized: string;
  changes: HumanizationChange[];
  patternScore: number;
  readabilityScore: number;
}

export interface HumanizationChange {
  original: string;
  replacement: string;
  reason: string;
  category: HumanizationCategory;
}

export type HumanizationCategory =
  | 'buzzword'
  | 'transition'
  | 'balanced-structure'
  | 'generic-opening'
  | 'vague-qualifier'
  | 'padding'
  | 'overly-formal'
  | 'repetitive-pattern';

export interface SecurityReport {
  isSafe: boolean;
  threats: SecurityThreat[];
  score: number;
}

export interface SecurityThreat {
  type: 'prompt-injection' | 'rag-poisoning' | 'malicious-url' | 'pii-leak' | 'hallucination-risk';
  severity: 'low' | 'medium' | 'high' | 'critical';
  detail: string;
  location?: string;
}
