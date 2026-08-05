/**
 * Model catalog — the single source of truth for which models JK-TECH-CODE can
 * route to. Pure data + types only (NO SDK imports), so it is safe to import
 * from both server code and client components without dragging the AI SDK or
 * provider credentials into the browser bundle.
 */
import type { ModelCapability, ModelId, TaskCategory } from './types';

/** Full capability registry (logical model id → capabilities). */
export const MODEL_REGISTRY: Record<ModelId, ModelCapability> = {
  'gpt-5.5': { modelId: 'gpt-5.5', priority: 1, taskCategories: ['reasoning', 'research', 'strategy', 'analysis'], maxTokens: 128000, supportsStreaming: true, supportsThinking: true, supportsVision: true, supportsTools: true, costPer1KInput: 0.01, costPer1KOutput: 0.03, latencyMs: 1500 },
  'gpt-4.1': { modelId: 'gpt-4.1', priority: 2, taskCategories: ['coding', 'general', 'summarization', 'analysis'], maxTokens: 32000, supportsStreaming: true, supportsThinking: false, supportsVision: true, supportsTools: true, costPer1KInput: 0.002, costPer1KOutput: 0.008, latencyMs: 800 },
  'claude-opus': { modelId: 'claude-opus', priority: 1, taskCategories: ['document', 'analysis', 'reasoning', 'writing'], maxTokens: 200000, supportsStreaming: true, supportsThinking: true, supportsVision: true, supportsTools: true, costPer1KInput: 0.015, costPer1KOutput: 0.075, latencyMs: 2000 },
  'claude-sonnet': { modelId: 'claude-sonnet', priority: 2, taskCategories: ['coding', 'writing', 'general', 'creative'], maxTokens: 32000, supportsStreaming: true, supportsThinking: false, supportsVision: true, supportsTools: true, costPer1KInput: 0.003, costPer1KOutput: 0.015, latencyMs: 1000 },
  'gemini-2.5-pro': { modelId: 'gemini-2.5-pro', priority: 1, taskCategories: ['multimodal', 'reasoning', 'research', 'data-analysis'], maxTokens: 1048576, supportsStreaming: true, supportsThinking: true, supportsVision: true, supportsTools: true, costPer1KInput: 0.005, costPer1KOutput: 0.015, latencyMs: 1200 },
  'gemini-2.5-flash': { modelId: 'gemini-2.5-flash', priority: 3, taskCategories: ['general', 'summarization', 'creative'], maxTokens: 32000, supportsStreaming: true, supportsThinking: false, supportsVision: true, supportsTools: false, costPer1KInput: 0.0005, costPer1KOutput: 0.0015, latencyMs: 500 },
  'deepseek-r1': { modelId: 'deepseek-r1', priority: 1, taskCategories: ['reasoning', 'coding', 'analysis'], maxTokens: 64000, supportsStreaming: true, supportsThinking: true, supportsVision: false, supportsTools: false, costPer1KInput: 0.002, costPer1KOutput: 0.008, latencyMs: 2000 },
  'deepseek-v4': { modelId: 'deepseek-v4', priority: 2, taskCategories: ['coding', 'general', 'summarization', 'analysis'], maxTokens: 64000, supportsStreaming: true, supportsThinking: false, supportsVision: false, supportsTools: true, costPer1KInput: 0.001, costPer1KOutput: 0.004, latencyMs: 600 },
  'julius-ai': { modelId: 'julius-ai', priority: 1, taskCategories: ['data-analysis', 'analysis'], maxTokens: 32000, supportsStreaming: true, supportsThinking: false, supportsVision: false, supportsTools: true, costPer1KInput: 0.003, costPer1KOutput: 0.012, latencyMs: 1500 },
  'glm-5.2': { modelId: 'glm-5.2', priority: 2, taskCategories: ['general', 'summarization', 'writing', 'creative'], maxTokens: 32000, supportsStreaming: true, supportsThinking: false, supportsVision: true, supportsTools: true, costPer1KInput: 0.002, costPer1KOutput: 0.008, latencyMs: 800 },
  'z-ai-default': { modelId: 'z-ai-default', priority: 5, taskCategories: ['general', 'summarization', 'writing'], maxTokens: 16000, supportsStreaming: true, supportsThinking: true, supportsVision: false, supportsTools: true, costPer1KInput: 0.001, costPer1KOutput: 0.003, latencyMs: 500 },
  'qwen3:4b': { modelId: 'qwen3:4b', priority: 1, taskCategories: ['general', 'coding', 'reasoning', 'analysis', 'writing'], maxTokens: 32768, supportsStreaming: true, supportsThinking: true, supportsVision: false, supportsTools: true, costPer1KInput: 0, costPer1KOutput: 0, latencyMs: 600 },
  'qwen3:8b': { modelId: 'qwen3:8b', priority: 2, taskCategories: ['general', 'coding', 'reasoning', 'analysis', 'writing'], maxTokens: 32768, supportsStreaming: true, supportsThinking: true, supportsVision: false, supportsTools: true, costPer1KInput: 0, costPer1KOutput: 0, latencyMs: 800 },
  'qwen3:14b': { modelId: 'qwen3:14b', priority: 3, taskCategories: ['general', 'coding', 'reasoning', 'analysis', 'writing'], maxTokens: 32768, supportsStreaming: true, supportsThinking: true, supportsVision: false, supportsTools: true, costPer1KInput: 0, costPer1KOutput: 0, latencyMs: 1100 },
};

/** Task → ordered fallback chain (kept with the catalog for one source of truth). */
export const TASK_MODEL_MAP: Record<TaskCategory, ModelId[]> = {
  coding: ['deepseek-v4', 'deepseek-r1', 'gpt-4.1', 'claude-sonnet', 'z-ai-default'],
  reasoning: ['deepseek-r1', 'gpt-5.5', 'claude-opus', 'gemini-2.5-pro', 'z-ai-default'],
  research: ['gpt-5.5', 'gemini-2.5-pro', 'claude-opus', 'deepseek-r1', 'z-ai-default'],
  analysis: ['gpt-5.5', 'claude-opus', 'julius-ai', 'deepseek-r1', 'z-ai-default'],
  writing: ['claude-sonnet', 'claude-opus', 'gpt-4.1', 'glm-5.2', 'z-ai-default'],
  planning: ['gpt-5.5', 'claude-opus', 'deepseek-r1', 'gemini-2.5-pro', 'z-ai-default'],
  multimodal: ['gemini-2.5-pro', 'gpt-5.5', 'claude-opus', 'gpt-4.1'],
  'data-analysis': ['julius-ai', 'gemini-2.5-pro', 'gpt-5.5', 'deepseek-r1'],
  document: ['claude-opus', 'claude-sonnet', 'gpt-5.5', 'gemini-2.5-pro'],
  creative: ['claude-sonnet', 'glm-5.2', 'gemini-2.5-flash', 'gpt-4.1'],
  summarization: ['gemini-2.5-flash', 'gpt-4.1', 'glm-5.2', 'deepseek-v4', 'z-ai-default'],
  'fact-verification': ['gpt-5.5', 'deepseek-r1', 'claude-opus', 'gemini-2.5-pro'],
  strategy: ['gpt-5.5', 'claude-opus', 'deepseek-r1', 'gemini-2.5-pro'],
  presentation: ['claude-sonnet', 'gpt-5.5', 'claude-opus', 'gemini-2.5-pro'],
  spreadsheet: ['gpt-4.1', 'claude-sonnet', 'gpt-5.5', 'deepseek-v4'],
  general: ['z-ai-default', 'gemini-2.5-flash', 'gpt-4.1', 'claude-sonnet', 'deepseek-v4'],
};

/** Human-readable name + provider for each model (used by the model picker UI). */
const MODEL_DISPLAY: Record<ModelId, { label: string; provider: string }> = {
  'gpt-5.5': { label: 'GPT-5.5', provider: 'OpenAI' },
  'gpt-4.1': { label: 'GPT-4.1', provider: 'OpenAI' },
  'claude-opus': { label: 'Claude Opus', provider: 'Anthropic' },
  'claude-sonnet': { label: 'Claude Sonnet', provider: 'Anthropic' },
  'gemini-2.5-pro': { label: 'Gemini 2.5 Pro', provider: 'Google' },
  'gemini-2.5-flash': { label: 'Gemini 2.5 Flash', provider: 'Google' },
  'deepseek-r1': { label: 'DeepSeek R1', provider: 'DeepSeek' },
  'deepseek-v4': { label: 'DeepSeek V4', provider: 'DeepSeek' },
  'julius-ai': { label: 'Julius AI', provider: 'Julius' },
  'glm-5.2': { label: 'GLM 5.2', provider: 'Zhipu' },
  'z-ai-default': { label: 'Auto (recommended)', provider: 'Automatic' },
  'qwen3:4b': { label: 'Qwen3 4B', provider: 'Ollama' },
  'qwen3:8b': { label: 'Qwen3 8B', provider: 'Ollama' },
  'qwen3:14b': { label: 'Qwen3 14B', provider: 'Ollama' },
};

export interface ModelOption {
  modelId: ModelId;
  label: string;
  provider: string;
  supportsThinking: boolean;
  supportsVision: boolean;
  maxTokens: number;
}

/** Stable list of selectable models — shared by the client picker and the server. */
export const MODEL_OPTIONS: ModelOption[] = (Object.keys(MODEL_REGISTRY) as ModelId[]).map(id => {
  const cap = MODEL_REGISTRY[id];
  const display = MODEL_DISPLAY[id] ?? { label: id, provider: 'Other' };
  return {
    modelId: id,
    label: display.label,
    provider: display.provider,
    supportsThinking: cap.supportsThinking,
    supportsVision: cap.supportsVision,
    maxTokens: cap.maxTokens,
  };
});

/** The picker's default: automatic model selection. */
export const DEFAULT_MODEL_OPTION = MODEL_OPTIONS.find(o => o.modelId === 'z-ai-default') ?? MODEL_OPTIONS[0];

/** Type guard — true only for ids present in the catalog. */
export function isValidModelId(id: unknown): id is ModelId {
  return typeof id === 'string' && id in MODEL_REGISTRY;
}

/** Human-readable label for a model id (falls back to the raw id). */
export function modelLabel(modelId: string): string {
  return MODEL_OPTIONS.find(o => o.modelId === modelId)?.label ?? modelId;
}
