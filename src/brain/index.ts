/** JK-TECH-CODE Brain — central intelligence layer. */
export { brainComplete, brainStream, buildRequestContext, resolveSettings } from './brain';
export type { BrainRequest, BrainStreamHooks } from './brain';
export { buildSystemPrompt, PERSONA } from './personality';
export { classifyIntent, estimateComplexity } from './intent';
export { buildPlanningDirective } from './planning';
export { buildReasoningDirective } from './reasoning';
export {
  recall,
  remember,
  rememberExchange,
  listMemories,
  updateMemory,
  forgetMemory,
  clearMemories,
  memoryStats,
  scoreMemoryConfidence,
} from './memory';
export type { RetrievedMemory, StoreMemoryInput, MemoryItem } from './memory';
export { buildFileContext, retrieveDocumentGrounding, retrieveKnowledgeForQuery } from './knowledge';
export { buildContextBlock, buildSystemGuidance, buildUserContext } from './context';
export { decideGenerationPlan } from './decision';
export { scoreConfidence, needsReflection } from './confidence';
export { verifyResponse } from './verification';
export { reflect } from './reflection';
export { humanize } from './humanizer';
export { assembleResponse } from './response';
export { brainLearning } from './learning';
export { runCalculator, runWebSearch, runTools } from './tools';
export type { ToolResult, ToolContext } from './tools';
export * from './providers/llm';
export type {
  BrainOutput,
  BrainSettings,
  BrainContextBlock,
  RequestContext,
  Intent,
  Complexity,
  ReasoningLevel,
} from './types';
export { DEFAULT_SETTINGS } from './types';