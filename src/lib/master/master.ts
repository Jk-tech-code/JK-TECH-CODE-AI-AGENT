import { promptAnalyzer } from './analyzer';
import { skillRouter } from './router';
import { skillExecutor } from './executor';
import { resultMerger } from './merger';
import { qualityReviewer } from './quality';
import { plannerAgent, type ExecutionPlan } from './planner';
import { intelligentCache, cacheKeys } from './cache';
import { traceStore, type OrchestrationTrace, type OrchestrationStepTrace } from './trace';
import { securityGuard } from '@/lib/security/guard';
import { memoryStore } from '@/lib/memory/store';
import { ragPipeline } from '@/lib/rag/pipeline';
import { createLogger } from '@/lib/logging/logger';
import { executeAgentTask } from '@/lib/agents/registry';
import type { AgentId } from '@/lib/core/types';
import type {
  MasterAnalysis,
  MasterRequest,
  MasterResponse,
  SkillOutput,
  SkillStep,
} from './types';

const masterLogger = createLogger('master-orchestrator');

/** Confidence at/below which the smart (LLM) router is used. */
const SMART_ROUTE_THRESHOLD = 0.55;

/**
 * Master AI Orchestrator — the central brain of the agent.
 *
 * Pipeline (internal, never exposed to users):
 *   1. Analyze  — detect intent, domain(s), format; enhance the prompt. (cached)
 *   2. Route    — fast heuristic or smart LLM routing. (cached)
 *   3. Plan     — build an execution plan with workflow templates. (cached)
 *   4. Execute  — run steps sequentially (parallel siblings when possible),
 *                 optionally grounded in memory + vector knowledge.
 *   5. Merge    — weave all outputs into ONE coherent answer.
 *   6. Review   — internal quality gate (PII, hallucination, emptiness).
 *   7. Return   — the polished final answer only. (trace recorded)
 */
export class MasterOrchestrator {
  async run(request: MasterRequest): Promise<MasterResponse> {
    const requestId = `master_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const start = Date.now();
    const log = masterLogger;
    const trace = traceStore.begin(request.input || '');

    // 0. Security gate first.
    const safety = securityGuard.analyzePrompt(request.input || '');
    if (!safety.isSafe) {
      log.warn('Request blocked by security', {
        requestId,
        threats: safety.threats.map(t => ({ type: t.type, severity: t.severity })),
      });
      traceStore.finish(trace, 'blocked', Date.now() - start);
      return {
        requestId,
        result: "I can't process that request. It appears to contain potentially unsafe content.",
        confidence: 0,
        intent: 'general',
        domains: ['general'],
        outputFormat: 'auto',
        latencyMs: Date.now() - start,
        error: 'BLOCKED_BY_SECURITY',
      };
    }

    // 1. Analyze (cached).
    const analysisKey = cacheKeys.analysis(request.input || '');
    let analysis: MasterAnalysis | undefined = await intelligentCache.get<MasterAnalysis>(analysisKey);
    let analysisFromCache = false;
    if (analysis) {
      analysisFromCache = true;
      traceStore.addCacheHit(trace, 'analysis');
    } else {
      analysis = promptAnalyzer.analyze(request.input);
      await intelligentCache.set(analysisKey, analysis);
    }

    traceStore.update(trace, {
      intent: analysis.intent,
      domains: analysis.domains,
    });

    // 2. Route (cached) — fast heuristic or smart LLM.
    const routeKey = cacheKeys.routing(request.input || '');
    let routeResult: { steps: SkillStep[]; source: 'fast' | 'smart'; confidence: number } | undefined;
    let steps: SkillStep[];
    let routeSource: 'fast' | 'smart' = 'fast';

    if (request.forceSkill) {
      steps = [{ skill: request.forceSkill as AgentId, purpose: 'Forced skill' }];
    } else {
      routeResult = await intelligentCache.get<typeof routeResult>(routeKey);
      if (routeResult) {
        steps = routeResult.steps;
        routeSource = routeResult.source;
        traceStore.addCacheHit(trace, 'routing');
      } else {
        routeResult = await skillRouter.smartRoute(analysis, { threshold: SMART_ROUTE_THRESHOLD });
        steps = routeResult.steps;
        routeSource = routeResult.source;
        if (routeSource === 'smart') {
          await intelligentCache.set(routeKey, routeResult, 5 * 60 * 1000);
        }
      }
    }

    // Always guarantee an executable fallback.
    if (steps.length === 0) {
      steps = [{ skill: 'llm', purpose: 'Direct assistant answer' }];
    }

    const validation = skillRouter.validate(steps);
    if (!validation.valid) {
      log.warn('Skill chain contains unknown skills — falling back to llm', {
        requestId,
        missing: validation.missing,
      });
      steps = [{ skill: 'llm', purpose: 'Direct assistant answer' }];
    }

    traceStore.update(trace, {
      routing: { source: routeSource, confidence: routeResult?.confidence ?? 0.5 },
      planPhases: steps.map(s => s.purpose),
      steps: steps.map(s => ({ skill: s.skill, purpose: s.purpose, status: 'pending' })),
    });

    // 3. Build execution plan (cached for repeat prompts).
    const planKey = cacheKeys.plan(request.input || '');
    let plan: ExecutionPlan | undefined = await intelligentCache.get<ExecutionPlan>(planKey);
    let planFromCache = false;
    if (plan) {
      planFromCache = true;
      traceStore.addCacheHit(trace, 'plan');
    } else {
      plan = await plannerAgent.plan(analysis);
      await intelligentCache.set(planKey, plan);
    }
    traceStore.update(trace, { complexity: plan.complexity });

    // 4. Execute with optional memory + vector grounding.
    const grounding = await this.buildGrounding(request, analysis);

    const outputs: SkillOutput[] = await this.trackedExecute(
      trace, steps, analysis, request, grounding,
    );

    // 5. Merge.
    const merged = await resultMerger.merge(analysis.rawPrompt, outputs, request.signal);

    if (!merged.content) {
      log.error('Orchestrator produced empty output', { requestId, steps: steps.map(s => s.skill) });
      traceStore.finish(trace, 'failed', Date.now() - start);
      return {
        requestId,
        result: 'I could not generate an answer for that request. Please try again.',
        confidence: 0,
        intent: analysis.intent,
        domains: analysis.domains,
        outputFormat: analysis.outputFormat,
        latencyMs: Date.now() - start,
        error: 'EMPTY_OUTPUT',
      };
    }

    // 6. Review (internal quality gate).
    const report = await qualityReviewer.review(merged.content, {
      humanize: analysis.needsHumanize,
    });
    let finalContent = merged.content;
    if (report.fatal) {
      finalContent = "I couldn't verify a safe answer for that request. Please rephrase.";
    }

    // 7. Persist a lightweight memory entry for personalization (Phase 8).
    for (const domain of analysis.domains) {
      await memoryStore.store({
        type: 'conversation',
        content: `${analysis.intent} request about ${domain}: ${analysis.rawPrompt.slice(0, 120)}`,
        tags: [`conv:${request.conversationId || 'default'}`, `skill:${domain}`],
      }).catch(() => undefined);
    }

    const sources = outputs.flatMap(o => o.sources || []).slice(0, 5);
    traceStore.finish(trace, 'success', Date.now() - start);

    return {
      requestId,
      result: finalContent,
      confidence: merged.confidence * report.score,
      intent: analysis.intent,
      domains: analysis.domains,
      outputFormat: analysis.outputFormat,
      latencyMs: Date.now() - start,
      sources: sources.length > 0 ? sources : undefined,
      skillsUsed: request.debug ? steps.map(s => ({ skill: s.skill, purpose: s.purpose })) : undefined,
    };
  }

  /** Analyze-only mode: returns the routing decision without executing. */
  analyze(request: MasterRequest): MasterAnalysis {
    return promptAnalyzer.analyze(request.input || '');
  }

  /** Run a single registry agent directly (compatibility with /api/agent). */
  async runAgent(agentId: AgentId, input: string, context?: Record<string, unknown>) {
    return executeAgentTask({
      id: `master_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      agentId,
      input,
      context,
      priority: 1,
    });
  }

  /* ─── internal helpers ─── */

  /**
   * Build grounding context from memory (Phase 8) and vector knowledge (Phase 9).
   * Returns a string appended to the user message before execution.
   */
  private async buildGrounding(
    request: MasterRequest,
    analysis: MasterAnalysis,
  ): Promise<string> {
    const parts: string[] = [];

    // Memory recall (user preferences, projects, past conversations).
    try {
      const memories = await memoryStore.recall(request.input || '', { limit: 5, minRelevance: 0.05 });
      if (memories.length > 0) {
        parts.push(
          'Relevant past context:\n' +
          memories.map(m => `- ${m.content}`).join('\n'),
        );
      }

      // Vector grounding: embed recalled memory and retrieve top chunks.
      // Uses a deterministic fallback provider when no embedding API key is set,
      // so this is always safe to run.
      const chunks = await ragPipeline.chunkDocument(
        memories.map(m => m.content).join('\n\n'),
        'memory',
        'documentation' as const,
      );
      if (chunks.length > 0) {
        const withEmbeddings = await Promise.all(
          chunks.map(async c => ({ ...c, embedding: await ragPipeline.computeEmbedding(c) })),
        );
        const result = await ragPipeline.retrieve(
          { query: request.input || '', topK: 2, minScore: 0 },
          withEmbeddings,
        );
        const context = ragPipeline.formatContext(result.chunks, 1500);
        if (context) parts.push(`Vector knowledge:\n${context}`);
      }
    } catch (err) {
      masterLogger.warn('Memory recall failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return parts.join('\n\n');
  }

  /** Execute steps while recording per-step latency/status to the trace. */
  private async trackedExecute(
    trace: OrchestrationTrace,
    steps: SkillStep[],
    analysis: MasterAnalysis,
    request: MasterRequest,
    grounding: string,
  ): Promise<SkillOutput[]> {
    const groundedRequest: MasterRequest = {
      ...request,
      input: `${request.input || ''}\n\n${grounding}`.trim(),
    };

    const allOutputs: SkillOutput[] = [];
    for (let i = 0; i < steps.length; i++) {
      const stepTrace: OrchestrationStepTrace = { skill: steps[i].skill, purpose: steps[i].purpose, status: 'running' };
      trace.steps[i] = stepTrace;
      traceStore.markStep(trace, i, { status: 'running' });

      const before = Date.now();
      try {
        const outputs = await skillExecutor.run([steps[i]], analysis, groundedRequest, request.signal);
        const out = outputs[0];
        if (out) {
          allOutputs.push(out);
          traceStore.markStep(trace, i, {
            status: 'success',
            latencyMs: Date.now() - before,
            confidence: out.confidence,
          });
        } else {
          traceStore.markStep(trace, i, { status: 'skipped', latencyMs: Date.now() - before });
        }
      } catch (err) {
        traceStore.markStep(trace, i, {
          status: 'failed',
          latencyMs: Date.now() - before,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return allOutputs;
  }
}

export const masterOrchestrator = new MasterOrchestrator();