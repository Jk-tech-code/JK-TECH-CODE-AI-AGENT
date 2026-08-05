import { orchestrator } from './orchestrator';
import { searchAggregator } from './search';
import { securityGuard } from '../security/guard';
import { memoryStore } from '../memory/store';
import { db } from '../db';
import { getSession } from '../auth';
import { logApiCall, createLogger } from '../logging/logger';
import { AppError } from '../error/handler';
import { fireTaskWebhook, resolveZapierEvent } from '@/lib/services/zapier';
import type {
  TaskCategory,
  MemoryEntry,
  MemoryType,
  ScoredSearchResult,
} from './types';

const workflowLogger = createLogger('agent-workflow');

/* ────────────────────────────────────────────
 *  Types
 * ──────────────────────────────────────────── */

export interface WorkflowContext {
  userId?: string;
  sessionId?: string;
  conversationId?: string;
  requestId: string;
  startTime: number;
  /** Zapier event type resolved for this request (e.g. 'inquiry', 'booking'). */
  taskCategory?: TaskCategory;
  zapierEvent?: string;
  zapierService?: string;
}

export interface WorkflowInput {
  messages: Array<{ role: string; content: string }>;
  query?: string;
  conversationId?: string;
  taskCategory?: TaskCategory;
  stream?: boolean;
  thinking?: boolean;
  maxTokens?: number;
  temperature?: number;
  searchEnabled?: boolean;
  memoryEnabled?: boolean;
  persistenceEnabled?: boolean;
  /** Zapier event type override (e.g. 'booking', 'inquiry'). Defaults from taskCategory. */
  zapierEvent?: string;
  /** Service label sent in the Zapier payload. */
  zapierService?: string;
  /** AbortSignal to cancel the request */
  signal?: AbortSignal;
}

export interface WorkflowResult {
  content: string;
  modelUsed: string;
  confidence: number;
  latencyMs: number;
  sources?: ScoredSearchResult[];
  conversationId?: string;
  securityReport?: { isSafe: boolean; threats: Array<{ type: string; severity: string }> };
  thinking?: string;
  error?: string;
  /** Token usage if reported by the model */
  tokensUsed?: { input: number; output: number };
}

/**
 * Structured context returned by prepareStream().
 * The caller is responsible for the actual LLM call + SSE formatting.
 */
export interface StreamPreparation {
  /** Fully assembled messages array (system + history + current + context) */
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  /** The last user query extracted from the input */
  userQuery: string;
  /** Workflow context with request tracking */
  ctx: WorkflowContext;
  /** Search results if search was enabled */
  searchResults: ScoredSearchResult[];
  /** True if security check failed */
  blocked: boolean;
  /** Block message shown to user */
  blockMessage?: string;
}

/* ────────────────────────────────────────────
 *  Tool definitions
 * ──────────────────────────────────────────── */

interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface ToolResult {
  toolName: string;
  result: string;
  success: boolean;
}

const AVAILABLE_TOOLS: ToolDefinition[] = [
  {
    name: 'web_search',
    description: 'Search the web for current information. Use this for any topic that may have changed recently.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        num_results: { type: 'number', description: 'Number of results (1-10)' },
      },
      required: ['query'],
    },
  },
];

/* ────────────────────────────────────────────
 *  AgentWorkflow
 * ──────────────────────────────────────────── */

export class AgentWorkflow {
  private initialized = false;

  /**
   * Initialize all services that the workflow depends on.
   * Safe to call multiple times.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    await orchestrator.init().catch((err: unknown) => {
      workflowLogger.error('Orchestrator init failed', err);
      throw new AppError('Failed to initialize AI engine', 502, 'INIT_FAILED');
    });
    this.initialized = true;
  }

  /* ─── helpers ─── */

  private extractUserQuery(messages: Array<{ role: string; content: string }>): string {
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    return lastUser?.content || '';
  }

  private createContext(): WorkflowContext {
    return {
      requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      startTime: Date.now(),
    };
  }

  /* ─── conversation persistence ─── */

  private async loadConversation(
    conversationId: string,
    logger: ReturnType<typeof createLogger>,
    requestId: string,
  ): Promise<{ title: string | null; messages: Array<{ role: string; content: string }> } | null> {
    try {
      const conv = await db.conversation.findUnique({
        where: { id: conversationId },
        include: { messages: { orderBy: { createdAt: 'asc' }, take: 50 } },
      });
      if (!conv) return null;
      return {
        title: conv.title,
        messages: conv.messages.map(m => ({ role: m.role, content: m.content })),
      };
    } catch (err) {
      logger.error('Failed to load conversation', err, { requestId, conversationId });
      return null;
    }
  }

  private async ensureConversation(
    userId: string | undefined,
    conversationId: string | undefined,
    logger: ReturnType<typeof createLogger>,
    requestId: string,
  ): Promise<string | undefined> {
    if (!userId || !conversationId) return undefined;
    try {
      const existing = await db.conversation.findUnique({ where: { id: conversationId } });
      if (existing) return conversationId;
      await db.conversation.create({
        data: {
          id: conversationId,
          userId,
          title: 'New conversation',
        },
      });
      logger.info('Created new conversation', { requestId, conversationId });
      return conversationId;
    } catch (err) {
      logger.error('Failed to ensure conversation', err, { requestId, conversationId });
      return conversationId;
    }
  }

  private async persistMessages(
    ctx: WorkflowContext,
    userQuery: string,
    responseContent: string,
    modelId: string,
    latencyMs: number,
    tokenCount: number | undefined,
    logger: ReturnType<typeof createLogger>,
  ): Promise<void> {
    if (!ctx.userId || !ctx.conversationId) return;
    try {
      await db.conversationMessage.create({
        data: {
          conversationId: ctx.conversationId,
          role: 'user',
          content: userQuery,
          metadata: JSON.stringify({ requestId: ctx.requestId }),
        },
      });
      await db.conversationMessage.create({
        data: {
          conversationId: ctx.conversationId,
          role: 'assistant',
          content: responseContent,
          metadata: JSON.stringify({ modelUsed: modelId, latencyMs, requestId: ctx.requestId }),
          tokenCount: tokenCount ?? undefined,
        },
      });
      logger.info('Messages persisted', { requestId: ctx.requestId, conversationId: ctx.conversationId });
    } catch (err) {
      logger.error('Failed to persist messages', err, { requestId: ctx.requestId, conversationId: ctx.conversationId });
    }
  }

  /* ─── memory ─── */

  private async loadMemoryContext(
    userQuery: string,
    options: { enabled: boolean; conversationId?: string; userId?: string },
    logger: ReturnType<typeof createLogger>,
    requestId: string,
  ): Promise<string> {
    if (!options.enabled || !userQuery) return '';
    try {
      const memories = await memoryStore.recall(userQuery, { limit: 5, minRelevance: 0.1 });
      if (memories.length === 0) return '';
      return (
        '\n\nRelevant context from previous interactions:\n' +
        memories.map((m: MemoryEntry) => `- ${m.content}`).join('\n')
      );
    } catch (err) {
      logger.error('Memory recall failed', err, { requestId });
      return '';
    }
  }

  private async storeMemory(
    userQuery: string,
    responseContent: string,
    modelId: string,
    options: { enabled: boolean; conversationId?: string; userId?: string },
    logger: ReturnType<typeof createLogger>,
    requestId: string,
  ): Promise<void> {
    if (!options.enabled || !userQuery) return;
    try {
      await memoryStore.store({
        type: 'conversation' as MemoryType,
        content: userQuery,
        tags: [`conv:${options.conversationId || 'default'}`, `user:${options.userId || 'anonymous'}`],
      });
      await memoryStore.store({
        type: 'conversation' as MemoryType,
        content: responseContent,
        tags: [`conv:${options.conversationId || 'default'}`, `model:${modelId}`],
      });
    } catch (err) {
      logger.error('Memory store failed', err, { requestId });
    }
  }

  /* ─── search ─── */

  private async executeSearch(
    query: string,
    enabled: boolean,
    logger: ReturnType<typeof createLogger>,
    requestId: string,
  ): Promise<ScoredSearchResult[]> {
    if (!enabled || !query) return [];
    try {
      await searchAggregator.init().catch((err: unknown) => {
        logger.error('Search init failed', err, { requestId });
        throw new AppError('Search engine unavailable', 502, 'SEARCH_UNAVAILABLE');
      });
      const results = await searchAggregator.search({ query, numResults: 5, recencyDays: 30 });
      logger.info('Search completed', { requestId, resultCount: results.length });
      return results;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error('Search failed', err, { requestId });
      return [];
    }
  }

  private formatSearchContext(results: ScoredSearchResult[]): string {
    if (results.length === 0) return '';
    return (
      '\n\nRecent web search results:\n\n' +
      results
        .map(
          (r, i) =>
            `[${i + 1}] ${r.title}\n${r.snippet}\nSource: ${r.url}\nCredibility: ${(r.credibilityScore * 100).toFixed(0)}%`,
        )
        .join('\n\n') +
      '\n\nSynthesize these sources in your own words. Do not repeat them verbatim.'
    );
  }

  /* ─── tool execution ─── */

  /**
   * Execute tools from the available tool definitions.
   * Currently supports: no tools are executed directly.
   * Web search is handled separately via executeSearch() for deduplication.
   * Future: add tool definitions and LLM function-calling here.
   */
  private async executeTools(): Promise<ToolResult[]> {
    // Web search is handled by executeSearch() — no duplicate execution needed.
    // Future tools (calculator, code interpreter, etc.) should be added here.
    return [];
  }

  private formatToolResults(results: ToolResult[]): string {
    if (results.length === 0) return '';
    return (
      '\n\nTool execution results:\n' +
      results
        .filter(r => r.success)
        .map(r => `[${r.toolName}]\n${r.result}`)
        .join('\n\n')
    );
  }

  /* ─── Zapier notifications ─── */

  /**
   * Fire-and-forget Zapier webhook on AI task completion.
   * Never blocks the response and never throws.
   */
  private notifyZapier(
    input: Pick<WorkflowInput, 'zapierEvent' | 'taskCategory' | 'zapierService'>,
    ctx: WorkflowContext,
    userQuery: string,
    content: string,
    extra: { modelUsed: string; latencyMs: number },
  ): void {
    try {
      const eventType = input.zapierEvent || resolveZapierEvent(input.taskCategory || 'general');
      fireTaskWebhook(eventType, {
        userId: ctx.userId,
        sessionId: ctx.sessionId || ctx.conversationId,
        userMessage: userQuery || '',
        aiResponse: content || '',
        service: input.zapierService || input.taskCategory || 'ai-agent',
        timestamp: new Date().toISOString(),
        metadata: {
          modelUsed: extra.modelUsed,
          latencyMs: extra.latencyMs,
          conversationId: ctx.conversationId,
          requestId: ctx.requestId,
        },
      });
    } catch (err) {
      workflowLogger.error('Zapier notification failed', err, { requestId: ctx.requestId });
    }
  }

  /* ─── system prompt ─── */

  private buildSystemPrompt(taskCategory?: TaskCategory): string {
    const basePrompt = `You are JK-TECH-CODE AI Agent — an enterprise-grade multi-model AI system. You help with ANY question.

REASONING & INTELLIGENCE:
1. Think deeply before responding. Use chain-of-thought reasoning. Break complex problems into sub-problems.
2. Compare pros/cons, evaluate trade-offs, give specific numbers when possible.
3. For coding, write production-quality code with error handling and edge cases.
4. For research, cross-reference information. Note contradictions. Distinguish facts from opinions.
5. Adapt depth to the question.

HUMAN WRITING STYLE (critical):
6. Write like an experienced human expert: short sentences mixed with longer ones. Use contractions (don't, can't, it's, you're). Be direct. Use specific examples. Be conversational. Have opinions.
7. Never hedge with unnecessary qualifiers.
8. When you don't know something, say so honestly.

NEVER USE THESE AI PHRASES OR BUZZWORDS (or close variations):
- "Certainly.", "Of course!", "I understand your request.", "As an AI...", "I'm sorry, but I can't...", "Great question!", "Absolutely, here is...", "Let me help you with that.", "That's a great way to put it."
- leverage, optimize, streamline, facilitate, foster, navigate, delve, unlock, harness, elevate, pivotal, landscape, ecosystem, paradigm, robust, seamless, transformative, cutting-edge, game-changing, forward-thinking, actionable, scalable, holistic, multifaceted, nuanced, intricate, compelling, impactful, innovative
- stiff transitions: Furthermore, Moreover, Additionally, Nevertheless, Consequently

PREFERRED OPENINGS (use these instead):
- "Here's a better approach."
- "This will give you the best result."
- "Based on what you've shared..."
- "One thing worth considering..."
- "The short version is..."
- Just start with the substance — no throat-clearing.

WRITING GUIDANCE:
- If code is requested, explain your approach naturally in 1-3 sentences BEFORE the code, then provide it.
- If design is requested, explain the design decisions naturally.
- If research is requested, summarize findings naturally and note what's uncertain.
- Vary sentence length. Start sentences with "But" or "And" when it reads naturally. Add one specific detail or concrete example where it helps.

TOOLS AVAILABLE:
The system has automatically executed a web search to gather current information. Synthesize search results naturally into your response. Do not mention tool names directly.`;

    if (taskCategory === 'coding') {
      return basePrompt + `\n\nFocus on production-quality code. Include error handling and edge cases. Explain architectural decisions before and after the code.`;
    }
    if (taskCategory === 'research') {
      return basePrompt + `\n\nFocus on thorough research. Cross-reference multiple sources. Flag contradictions. Cite evidence naturally.`;
    }
    if (taskCategory === 'writing') {
      return basePrompt + `\n\nFocus on natural, human-sounding writing. Vary sentence length. Use specific details and observations. Never list robotic bullet after bullet without connecting prose.`;
    }
    return basePrompt;
  }

  /* ────────────────────────────────────────────
   *  Prepared stream context (shared by streaming route)
   * ──────────────────────────────────────────── */

  /**
   * Prepare a streaming request by running all the shared setup logic
   * (auth, security, search, memory, conversation loading, message building)
   * without making the LLM call. The caller handles the actual streaming.
   *
   * When the stream completes, call finishStream() to persist + log.
   */
  async prepareStream(input: WorkflowInput): Promise<StreamPreparation> {
    const ctx = this.createContext();
    const log = workflowLogger;

    ctx.taskCategory = input.taskCategory;
    ctx.zapierEvent = input.zapierEvent;
    ctx.zapierService = input.zapierService;

    await this.init();

    const session = await getSession().catch((err: unknown) => {
      log.error('Auth check failed', err, { requestId: ctx.requestId });
      return null;
    });
    ctx.userId = session?.user?.id;

    ctx.conversationId = input.conversationId;
    if (ctx.userId && ctx.conversationId) {
      await this.ensureConversation(ctx.userId, ctx.conversationId, log, ctx.requestId);
    }

    const userQuery = input.query || this.extractUserQuery(input.messages);

    const securityReport = securityGuard.analyzePrompt(userQuery);
    if (!securityReport.isSafe) {
      log.warn('Stream request blocked by security', {
        requestId: ctx.requestId,
        threats: securityReport.threats.map(t => ({ type: t.type, severity: t.severity })),
      });
      return {
        messages: [],
        userQuery,
        ctx,
        searchResults: [],
        blocked: true,
        blockMessage: 'Request blocked by safety check.',
      };
    }

    let conversationHistory: Array<{ role: string; content: string }> | null = null;
    if (ctx.conversationId) {
      const conv = await this.loadConversation(ctx.conversationId, log, ctx.requestId);
      if (conv) conversationHistory = conv.messages;
    }

    const memoryEnabled = input.memoryEnabled !== false;
    const memoryContext = await this.loadMemoryContext(
      userQuery,
      { enabled: memoryEnabled, conversationId: ctx.conversationId, userId: ctx.userId },
      log,
      ctx.requestId,
    );

    const systemPrompt = this.buildSystemPrompt(input.taskCategory);
    const apiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          apiMessages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
        }
      }
    }

    const historyContentSet = new Set(
      (conversationHistory || []).map(m => `${m.role}:${m.content.slice(0, 100)}`),
    );
    for (const msg of input.messages) {
      const key = `${msg.role}:${msg.content.slice(0, 100)}`;
      if (!historyContentSet.has(key)) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          apiMessages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
        }
      }
    }

    let searchResults: ScoredSearchResult[] = [];
    if (input.searchEnabled !== false) {
      searchResults = await this.executeSearch(userQuery, true, log, ctx.requestId);
    }
    const searchContext = this.formatSearchContext(searchResults);

    const combinedContext = [memoryContext, searchContext].filter(Boolean).join('\n');
    if (combinedContext && apiMessages.length > 0) {
      const lastIdx = apiMessages.length - 1;
      if (apiMessages[lastIdx]?.role === 'user') {
        apiMessages[lastIdx] = {
          role: 'user',
          content: apiMessages[lastIdx].content + combinedContext,
        };
      }
    }

    return {
      messages: apiMessages,
      userQuery,
      ctx,
      searchResults,
      blocked: false,
    };
  }

  /**
   * After a stream completes, call this to persist messages, store memory,
   * and log the API call.
   */
  async finishStream(
    ctx: WorkflowContext,
    userQuery: string,
    fullContent: string,
    modelUsed: string,
    latencyMs: number,
    persistenceEnabled: boolean,
    memoryEnabled: boolean,
  ): Promise<void> {
    const log = workflowLogger;

    if (memoryEnabled && userQuery) {
      await this.storeMemory(
        userQuery,
        fullContent,
        modelUsed,
        { enabled: true, conversationId: ctx.conversationId, userId: ctx.userId },
        log,
        ctx.requestId,
      ).catch((err: unknown) => log.error('finishStream memory store failed', err, { requestId: ctx.requestId }));
    }

    if (persistenceEnabled && ctx.userId && ctx.conversationId && userQuery) {
      try {
        await db.conversationMessage.create({
          data: {
            conversationId: ctx.conversationId,
            role: 'user',
            content: userQuery,
            metadata: JSON.stringify({ requestId: ctx.requestId }),
          },
        });
        await db.conversationMessage.create({
          data: {
            conversationId: ctx.conversationId,
            role: 'assistant',
            content: fullContent,
            metadata: JSON.stringify({ modelUsed, latencyMs, requestId: ctx.requestId }),
          },
        });
      } catch (err) {
        log.error('finishStream persist failed', err, { requestId: ctx.requestId, conversationId: ctx.conversationId });
      }
    }

    // Fire-and-forget Zapier notification on stream completion (non-blocking)
    this.notifyZapier(
      {
        taskCategory: ctx.taskCategory || 'general',
        zapierEvent: ctx.zapierEvent,
        zapierService: ctx.zapierService || 'chat',
      },
      ctx,
      userQuery,
      fullContent,
      { modelUsed, latencyMs },
    );

    logApiCall({
      endpoint: '/api/chat/stream',
      method: 'POST',
      statusCode: 200,
      latencyMs,
      userId: ctx.userId,
      modelUsed,
    });
  }

  /* ─── public execute ─── */

  async execute(input: WorkflowInput): Promise<WorkflowResult> {
    const ctx = this.createContext();
    const { startTime } = ctx;
    let modelUsed = 'z-ai-default';
    let statusCode = 200;
    let tokenCount: number | undefined;

    const log = workflowLogger;

    try {
      // 1. Initialize
      await this.init();

      // 2. Authenticate
      const session = await getSession().catch((err: unknown) => {
        log.error('Auth check failed', err, { requestId: ctx.requestId });
        return null;
      });
      ctx.userId = session?.user?.id;

      // 3. Resolve conversation
      ctx.conversationId = input.conversationId;
      if (ctx.userId && ctx.conversationId) {
        await this.ensureConversation(ctx.userId, ctx.conversationId, log, ctx.requestId);
      }

      // 4. Extract user query
      const userQuery = input.query || this.extractUserQuery(input.messages);

      // 5. Security check
      const securityReport = securityGuard.analyzePrompt(userQuery);
      if (!securityReport.isSafe) {
        log.warn('Request blocked by security', {
          requestId: ctx.requestId,
          threats: securityReport.threats.map(t => ({ type: t.type, severity: t.severity })),
        });
        return {
          content: "I can't process that request. It appears to contain potentially unsafe content.",
          modelUsed: 'security-guard',
          confidence: 0,
          latencyMs: Date.now() - startTime,
          securityReport: {
            isSafe: false,
            threats: securityReport.threats.map(t => ({ type: t.type, severity: t.severity })),
          },
        };
      }

      // 6. Load conversation history from DB
      let conversationHistory: Array<{ role: string; content: string }> | null = null;
      if (ctx.conversationId) {
        const conv = await this.loadConversation(ctx.conversationId, log, ctx.requestId);
        if (conv) {
          conversationHistory = conv.messages;
        }
      }

      // 7. Execute tools (future: calculator, code interpreter, etc.)
      const toolResults = await this.executeTools();

      // 8. Load memory context
      const memoryEnabled = input.memoryEnabled !== false;
      const memoryContext = await this.loadMemoryContext(
        userQuery,
        { enabled: memoryEnabled, conversationId: ctx.conversationId, userId: ctx.userId },
        log,
        ctx.requestId,
      );

      // 9. Build messages array
      const systemPrompt = this.buildSystemPrompt(input.taskCategory);
      const apiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
      ];

      // Insert conversation history from DB (if any)
      if (conversationHistory && conversationHistory.length > 0) {
        for (const msg of conversationHistory) {
          if (msg.role === 'user' || msg.role === 'assistant') {
            apiMessages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
          }
        }
      }

      // Append current messages (avoid duplicates if already from history)
      const historyContentSet = new Set(
        (conversationHistory || []).map(m => `${m.role}:${m.content.slice(0, 100)}`),
      );
      for (const msg of input.messages) {
        const key = `${msg.role}:${msg.content.slice(0, 100)}`;
        if (!historyContentSet.has(key)) {
          if (msg.role === 'user' || msg.role === 'assistant') {
            apiMessages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
          }
        }
      }

      // 10. Inject context (memory + tool results + search)
      const toolContext = this.formatToolResults(toolResults);

      let searchResults: ScoredSearchResult[] = [];
      if (input.searchEnabled !== false) {
        searchResults = await this.executeSearch(userQuery, true, log, ctx.requestId);
      }
      const searchContext = this.formatSearchContext(searchResults);

      const combinedContext = [memoryContext, searchContext, toolContext]
        .filter(Boolean)
        .join('\n');

      if (combinedContext && apiMessages.length > 0) {
        const lastIdx = apiMessages.length - 1;
        if (apiMessages[lastIdx]?.role === 'user') {
          apiMessages[lastIdx] = {
            role: 'user',
            content: apiMessages[lastIdx].content + combinedContext,
          };
        }
      }

      // 11. Call LLM
      const response = await orchestrator.route({
        messages: apiMessages,
        taskCategory: input.taskCategory || 'general',
        thinking: input.thinking ?? true,
        maxTokens: input.maxTokens,
        temperature: input.temperature ?? 0.7,
        signal: input.signal,
      });

      modelUsed = response.modelId;
      tokenCount = response.tokensUsed?.output || response.tokensUsed?.input || undefined;

      if (!response.content) {
        throw new AppError('No response generated from any model.', 502, 'EMPTY_RESPONSE');
      }

      // 12. Store memory
      if (memoryEnabled && userQuery) {
        await this.storeMemory(
          userQuery,
          response.content,
          response.modelId,
          { enabled: true, conversationId: ctx.conversationId, userId: ctx.userId },
          log,
          ctx.requestId,
        );
      }

      // 13. Persist to DB
      if (input.persistenceEnabled !== false && userQuery) {
        await this.persistMessages(
          ctx,
          userQuery,
          response.content,
          response.modelId,
          response.latencyMs,
          tokenCount,
          log,
        );
      }

      // 14. Notify Zapier (non-blocking) on task completion
      this.notifyZapier(input, ctx, userQuery, response.content, {
        modelUsed: response.modelId,
        latencyMs: response.latencyMs,
      });

      // 15. Return result
      return {
        content: response.content,
        modelUsed: response.modelId,
        confidence: response.confidence,
        latencyMs: Date.now() - startTime,
        sources: searchResults.length > 0 ? searchResults : undefined,
        conversationId: ctx.conversationId,
        thinking: response.thinking,
        tokensUsed: tokenCount ? { input: 0, output: tokenCount } : undefined,
      };
    } catch (error) {
      statusCode = error instanceof AppError ? error.statusCode : 500;
      log.error('Workflow execution failed', error, {
        requestId: ctx.requestId,
        conversationId: ctx.conversationId,
      });
      throw error;
    } finally {
      logApiCall({
        endpoint: '/api/chat',
        method: 'POST',
        statusCode,
        latencyMs: Date.now() - startTime,
        userId: ctx.userId,
        modelUsed,
        tokenCount,
      });
    }
  }
}

export const agentWorkflow = new AgentWorkflow();
