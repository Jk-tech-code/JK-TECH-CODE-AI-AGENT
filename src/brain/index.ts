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

// ─── Autonomy — the autonomous agent framework layered on the Brain ───
export { taskPlanner, planProgress } from './autonomy/planner';
export { taskExecutor, runAutonomy } from './autonomy/executor';
export { toolManager, ToolManager } from './autonomy/tool-manager';
export { pluginRegistry, PluginRegistry } from './autonomy/plugins';
export { projectStore, ProjectStore } from './autonomy/projects';
export { workflowStore, WorkflowStore } from './autonomy/workflows';
export { codeSandbox, CodeSandbox } from './autonomy/sandbox';
export { qualityGate } from './autonomy/quality';
export { unifiedSearch, UnifiedSearch } from './autonomy/search';
export { buildAutonomyReport } from './autonomy/observability';
export { apiKeyStore, rateLimitApiKey } from './autonomy/api-platform';
export { automationStore } from './autonomy/automation';
export { collaborationStore } from './autonomy/collaboration';
export * from './autonomy/types';