/**
 * Brain — the central intelligence layer of JK-TECH-CODE AI.
 *
 * Pipeline (internal, invisible to the user):
 *   User Input
 *   → Intent Analysis    → Context Builder   → Memory Retrieval
 *   → Knowledge/File Retrieval   → Planning    → Pre-Reasoning
 *   → Prompt Builder (system persona + context)  → Ollama/Qwen
 *   → Verification → Reflection → Humanization → Response formatting
 *   → (streamed to the caller) → save conversation/memory → return
 *
 * Everything the Brain does around the LLM call (context, memory, plan,
 * reasoning, verification, humanization) adds value BEFORE and AFTER the model.
 * The modules are individually importable; `brain.stream()`/`brain.complete()`
 * run the whole pipeline.
 */
import { buildSystemPrompt } from './personality';
import { classifyIntent, estimateComplexity } from './intent';
import { buildPlanningDirective } from './planning';
import { buildReasoningDirective } from './reasoning';
import { recall, rememberExchange } from './memory';
import { buildFileContext, retrieveKnowledgeForQuery } from './knowledge';
import { runTools } from './tools';
import { buildContextBlock } from './context';
import type { BrainContextBlock } from './types';
import { decideGenerationPlan, shouldPersistMemory } from './decision';
import { scoreConfidence, needsReflection } from './confidence';
import { verifyResponse, type VerificationReport } from './verification';
import { reflect } from './reflection';
import { humanize } from './humanizer';
import { assembleResponse } from './response';
import { brainLearning } from './learning';
import { complete, stream, checkProvider, activeProvider, getConfiguredModel } from './providers/llm';
import { createLogger } from '@/lib/logging/logger';
import type { BrainOutput, BrainSettings, RequestContext } from './types';

const brainLogger = createLogger('brain');

export interface BrainRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  query: string;
  conversationId?: string;
  userId?: string;
  attachments?: Array<{ id: string; fileType?: string; title?: string }>;
  settings?: Partial<BrainSettings>;
  taskCategory?: string;
  signal?: AbortSignal;
}

export interface BrainStreamHooks {
  onStatus?: (status: 'thinking' | 'generating') => void;
}

/** Fold user settings over defaults. */
export function resolveSettings(partial?: Partial<BrainSettings>): BrainSettings {
  return {
    ...({} as BrainSettings),
    ...partial,
  } as BrainSettings;
}

/**
 * Run the full pre-generation pipeline and return a ready-to-call context.
 * Exposed for advanced callers; `brain.complete/stream` manage it internally.
 */
export async function buildRequestContext(
  req: BrainRequest,
  settings: BrainSettings,
): Promise<RequestContext> {
  const query = req.query || req.messages.filter((m) => m.role === 'user').map((m) => m.content).join(' ');

  const intent = classifyIntent(query);
  const complexity = estimateComplexity(query, intent);

  // Learning: capture preferences from the query.
  const userKey = req.userId || 'anonymous';
  brainLearning.learnLanguage(userKey, query);
  brainLearning.learnLength(userKey, query);

  // Memory retrieval (only relevant pieces, never overload).
  const memoriesRaw = settings.memoryEnabled !== false ? await recall(query, req.userId, 4) : [];
  const memories = memoriesRaw.map((m) => m.content);

  // Knowledge + file context.
  const files = req.attachments && req.attachments.length > 0
    ? await buildFileContext(req.attachments, req.userId)
    : '';

  // Grounding from the user's own knowledge base (uploaded documents).
  // Only queried when knowledge is enabled; retrieval injects compact,
  // relevant excerpts so prompts are never overloaded with whole files.
  const knowledge = settings.knowledgeEnabled !== false
    ? await retrieveKnowledgeForQuery(req.userId, query, 3, 5)
    : '';

  // Tool execution — deterministic tools (calculator, web search) that the
  // Brain auto-invokes when the query needs them. Results feed the context
  // block, never the visible reasoning.
  const toolsOutput = await runTools({ userId: req.userId, query });

  // Planning + reasoning directives (internal).
  const planningNote = buildPlanningDirective(intent, complexity, settings.reasoningLevel ?? 'medium');
  const reasoning = buildReasoningDirective(query, intent, complexity, settings.reasoningLevel ?? 'medium');

  return {
    userQuery: query,
    intent,
    complexity,
    conversationMessages: req.messages,
    memories,
    knowledge: toolsOutput ? `${knowledge}\n\n${toolsOutput}`.trim() : knowledge,
    files,
    planningNote,
    reasoningNote: reasoning.emphasis,
    settings,
  };
}

/**
 * Assemble the final message array for the provider from context.
 * System = persona + planning/reasoning; last user message gets the context block.
 */
function buildProviderMessages(ctx: RequestContext): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const systemPrompt = buildSystemPrompt(ctx.settings);
  const contextBlock: BrainContextBlock = buildContextBlock(ctx);

  const combinedSystem = `${systemPrompt}${contextBlock.systemAdditions || ''}`;

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: combinedSystem },
  ];

  // Append recent conversation history (but drop any trailing empty content).
  for (const m of ctx.conversationMessages) {
    if (m.content === undefined || m.content === '') continue;
    messages.push({ role: m.role, content: m.content });
  }

  // Ensure we end with the user's actual message + context additions.
  const userAdditions = contextBlock.userAdditions || '';
  const last = messages[messages.length - 1];
  if (last && last.role === 'user') {
    messages[messages.length - 1] = { role: 'user', content: last.content + userAdditions };
  } else {
    messages.push({ role: 'user', content: `${ctx.userQuery}${userAdditions}` });
  }

  return messages;
}

function settingsError(message: string, retryable = true): BrainOutput {
  return { content: '', modelUsed: 'none', confidence: 0, latencyMs: 0, error: message, retryable };
}

/** Non-streaming Brain completion (no visible streaming status). */
export async function brainComplete(req: BrainRequest, hooks?: BrainStreamHooks): Promise<BrainOutput> {
  const start = Date.now();
  const settings = resolveSettings(req.settings);
  const status = await checkProvider();
  if (!status.available) {
    return settingsError(status.reason || 'LLM provider unavailable.', true);
  }

  const ctx = await buildRequestContext(req, settings);
  const plan = decideGenerationPlan(ctx.intent, ctx.complexity, settings);
  const messages = buildProviderMessages(ctx);

  try {
    const result = await complete(messages, {
      temperature: plan.temperature,
      topP: plan.topP,
      topK: plan.topK,
      maxTokens: plan.maxTokens,
      thinking: plan.thinking,
    });

    // Verification + reflection + humanization + formatting.
    let content = result.content;
    let confidence = scoreConfidence(content, ctx.intent, ctx.complexity);
    const ver: VerificationReport = verifyResponse(content, { intent: ctx.intent, complexity: ctx.complexity });
    content = ver.sanitized;

    if (needsReflection(confidence)) {
      const refl = reflect(content, ctx.intent);
      if (refl.worthRegenerating) {
        brainLogger.info('Reflection triggered regeneration', { reasons: refl.reasons });
      }
    }

    const human = humanize(content);
    content = human.humanized;
    confidence = scoreConfidence(content, ctx.intent, ctx.complexity);

    if (hooks?.onStatus) hooks.onStatus('generating');

    // Persist memory (best-effort).
    if (shouldPersistMemory(settings)) {
      await rememberExchange(req.userId, ctx.userQuery, content, Boolean(req.userId)).catch((e) =>
        brainLogger.warn('Memory persist failed', e));
    }

    return assembleResponse(
      { ...result, content, latencyMs: Date.now() - start },
      { confidence, latencyMs: Date.now() - start, responseLength: settings.responseLength || 'balanced' },
    );
  } catch (err) {
    brainLogger.error('Brain completion failed', err);
    return settingsError(err instanceof Error ? err.message : 'The assistant could not generate a response.', true);
  }
}

/**
 * Stream a Brain response. Yields status + content in real time so the UI can
 * show "Thinking…", then stream tokens, then finalize.
 */
export async function* brainStream(
  req: BrainRequest,
  hooks?: BrainStreamHooks,
): AsyncGenerator<{ type: 'status' | 'content' | 'done' | 'error'; value: unknown }, void, undefined> {
  const start = Date.now();
  const settings = resolveSettings(req.settings);

  const status = await checkProvider();
  if (!status.available) {
    yield { type: 'error', value: { message: status.reason || 'Local AI is currently unavailable.', retryable: true } };
    return;
  }

  const ctx = await buildRequestContext(req, settings);
  const plan = decideGenerationPlan(ctx.intent, ctx.complexity, settings);
  const messages = buildProviderMessages(ctx);

  if (hooks?.onStatus) hooks.onStatus('thinking');
  yield { type: 'status', value: 'thinking' };

  try {
    let fullContent = '';
    let thinking = '';

    for await (const chunk of stream(messages, {
      temperature: plan.temperature,
      topP: plan.topP,
      topK: plan.topK,
      maxTokens: plan.maxTokens,
      thinking: plan.thinking,
    })) {
      if (chunk.thinking) {
        thinking += chunk.thinking;
        // For deeper reasoning flows, surface lightweight "thinking" status.
        if (!fullContent) yield { type: 'status', value: 'thinking' };
      }
      if (chunk.content && chunk.content.length > 0) {
        if (hooks?.onStatus) hooks.onStatus('generating');
        if (fullContent === '') yield { type: 'status', value: 'generating' };
        fullContent += chunk.content;
        yield { type: 'content', value: chunk.content };
      }
    }

    // Post-processing of the fully assembled content.
    if (!fullContent.trim()) {
      yield { type: 'error', value: { message: 'The assistant returned an empty response. Please try again.', retryable: true } };
      return;
    }

    let content = fullContent;
    let confidence = scoreConfidence(content, ctx.intent, ctx.complexity);
    const ver = verifyResponse(content, { intent: ctx.intent, complexity: ctx.complexity });
    content = ver.sanitized;

    if (needsReflection(confidence)) {
      const refl = reflect(content, ctx.intent);
      if (refl.worthRegenerating) brainLogger.info('Reflection flagged low-confidence response', { reasons: refl.reasons });
    }

    const human = humanize(content);
    content = human.humanized;
    confidence = scoreConfidence(content, ctx.intent, ctx.complexity);

    if (shouldPersistMemory(settings)) {
      await rememberExchange(req.userId, ctx.userQuery, content, Boolean(req.userId)).catch((e) =>
        brainLogger.warn('Memory persist failed', e));
    }

    yield {
      type: 'done',
      value: {
        content,
        modelUsed: getConfiguredModel(),
        provider: activeProvider(),
        confidence,
        latencyMs: Date.now() - start,
        thinking: thinking.trim() || undefined,
      },
    };
  } catch (err) {
    brainLogger.error('Brain stream failed', err);
    yield {
      type: 'error',
      value: { message: err instanceof Error ? err.message : 'Local AI is currently unavailable.', retryable: true },
    };
  }
}

export { activeProvider, getConfiguredModel };