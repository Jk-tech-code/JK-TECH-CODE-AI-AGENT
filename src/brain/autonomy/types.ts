/**
 * Autonomy shared types — the JK-TECH-CODE autonomous agent framework.
 *
 * Layers on top of the Brain without replacing it: the Brain remains the
 * central intelligence; autonomy adds planning, multi-step execution, a tool
 * ecosystem, plugins, projects, workflows and a secure sandbox.
 */

/* ─────────────────────────── Tasks & Plans ─────────────────────────── */

export type TaskStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'cancelled';

export interface TaskStep {
  /** Stable identifier within a plan. */
  id: string;
  title: string;
  description: string;
  /** Which tool should back this step, if any. */
  tool?: string;
  /** Suggested input for the tool / LLM prompt for this step. */
  prompt?: string;
  /** Dependencies: ids of steps that must finish first. */
  dependsOn?: string[];
  /** Steps that can be auto-executed in parallel (share no deps). */
  parallelGroup?: number;
  status: TaskStatus;
  output?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  latencyMs?: number;
  confidence?: number;
  modelUsed?: string;
}

export interface Plan {
  id: string;
  goal: string;
  summary: string;
  steps: TaskStep[];
  createdAt: number;
  status: TaskStatus;
  /** Progress 0..100 derived from completed steps. */
  progress: number;
}

export interface PlanExecutionResult {
  plan: Plan;
  startedAt: number;
  finishedAt: number;
  totalLatencyMs: number;
  succeeded: boolean;
}

/* ─────────────────────────── Tools ─────────────────────────── */

export interface ToolSchema {
  type: 'object';
  properties?: Record<string, { type: string; description?: string }>;
  required?: string[];
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  /** Deterministic detection patterns — the Brain decides when to invoke. */
  triggerPatterns?: RegExp[];
  inputSchema?: ToolSchema;
  outputSchema?: ToolSchema;
  /** True when the tool can also be called directly (not just by the Brain). */
  userInvokable: boolean;
  run: (input: Record<string, unknown>, ctx: ToolRunContext) => Promise<ToolOutput>;
}

export interface ToolRunContext {
  userId?: string;
  projectId?: string;
}

export interface ToolOutput {
  content: string;
  /** Structured result for tooling/%"—optional, not shown to the user. */
  data?: unknown;
  used: boolean;
  latencyMs: number;
  toolId: string;
}

/* ─────────────────────────── Plugins ─────────────────────────── */

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  capabilities: string[];
  /** Permissions the plugin requests (e.g. 'read:memory', 'exec:js'). */
  permissions: string[];
  inputSchema?: ToolSchema;
  outputSchema?: ToolSchema;
  enabled: boolean;
}

export interface PluginHealth {
  ok: boolean;
  detail: string;
  checkedAt: number;
}

export interface InstalledPlugin {
  manifest: PluginManifest;
  health: PluginHealth;
}

/* ─────────────────────────── Projects ─────────────────────────── */

export interface ProjectFile {
  name: string;
  path: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  goals: string[];
  files: ProjectFile[];
  notes: string[];
  createdAt: number;
  updatedAt: number;
  active: boolean;
}

/* ─────────────────────────── Workflows ─────────────────────────── */

export interface WorkflowStepDef {
  id: string;
  stepId: string;
  /** A plugin id provider+action, e.g. 'summarize' or a tool id. */
  action: string;
  title: string;
  prompt?: string;
  inputRef?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStepDef[];
  createdAt: number;
  updatedAt: number;
}

/* ─────────────────────────── Sandbox ─────────────────────────── */

export type SandboxRuntime = 'javascript' | 'typescript' | 'sql' | 'shell';

export interface SandboxRequest {
  runtime: SandboxRuntime;
  code: string;
  timeoutMs?: number;
  args?: unknown[];
}

export interface SandboxResult {
  runtime: SandboxRuntime;
  ok: boolean;
  output: string;
  logs: string[];
  error?: string;
  executionTimeMs: number;
  exitCode: number;
}

/* ─────────────────────────── Search ─────────────────────────── */

export interface SearchResult {
  type: 'conversation' | 'project' | 'memory' | 'file' | 'note';
  title: string;
  snippet: string;
  route: string;
  score: number;
}

/* ───────────────────────── Observability ───────────────────────── */

export interface RuntimeStat {
  label: string;
  ok: boolean;
  detail: string;
  extra?: Record<string, unknown>;
}

export interface AutonomyReport {
  brain: { provider: string; model: string; healthy: boolean };
  tools: Array<{ id: string; name: string; ok: boolean; calls: number; failures: number }>;
  plugins: InstalledPlugin[];
  sandbox: { supported: SandboxRuntime[]; maxTimeoutMs: number };
  runtime: Array<RuntimeStat>;
  timestamp: number;
}