/**
 * JK-TECH-CODE Autonomy — the autonomous agent framework.
 *
 * Layers on the Brain: planning, multi-step execution, tool ecosystem,
 * plugins, projects, workflows, sandbox, quality, search and observability.
 */
export { TaskPlanner, taskPlanner, planProgress } from './planner';
export type { PlannerOptions } from './planner';
export { TaskExecutor, taskExecutor, runAutonomy } from './executor';
export type { ExecutorOptions, ExecutionHooks } from './executor';
export { ToolManager, toolManager } from './tool-manager';
export { PluginRegistry, pluginRegistry } from './plugins';
export type { PluginImpl } from './plugins';
export { ProjectStore, projectStore } from './projects';
export { WorkflowStore, workflowStore } from './workflows';
export type { WorkflowRunResult } from './workflows';
export { CodeSandbox, codeSandbox } from './sandbox';
export { qualityGate } from './quality';
export type { QualityVerdict } from './quality';
export { UnifiedSearch, unifiedSearch } from './search';
export type { SearchOptions } from './search';
export { buildAutonomyReport } from './observability';
export { ApiKeyStore, apiKeyStore, rateLimitApiKey } from './api-platform';
export type { IssuedKey } from './api-platform';
export { AutomationStore, automationStore } from './automation';
export type { AutomationJob, ScheduleFrequency, AutomationRunResult } from './automation';
export { CollaborationStore, collaborationStore } from './collaboration';
export type { ProjectMember, ProjectComment, ProjectRole } from './collaboration';
export type {
  Plan,
  TaskStep,
  TaskStatus,
  PlanExecutionResult,
  ToolDefinition,
  ToolSchema,
  ToolOutput,
  ToolRunContext,
  PluginManifest,
  PluginHealth,
  InstalledPlugin,
  Project,
  ProjectFile,
  Workflow,
  WorkflowStepDef,
  SandboxRequest,
  SandboxResult,
  SandboxRuntime,
  SearchResult,
  AutonomyReport,
  RuntimeStat,
} from './types';