import type { ReasoningOutput, ReasoningStep, VerificationResult, ConflictReport } from './types';
import { Orchestrator } from './orchestrator';

export class DeepReasoningEngine {
  private orchestrator: Orchestrator;

  constructor(orchestrator: Orchestrator) {
    this.orchestrator = orchestrator;
  }

  async reason(
    query: string,
    context?: string
  ): Promise<ReasoningOutput> {
    const steps: ReasoningStep[] = [];

    // Step 1: Analyze the problem
    const analysis = await this.analyzeProblem(query);
    steps.push(analysis);

    // Step 2: Generate hypotheses
    const hypotheses = await this.generateHypotheses(query, analysis.content);
    steps.push(hypotheses);

    // Step 3: Verify facts
    const verification = await this.verifyClaims(query, context);
    steps.push(verification);

    // Step 4: Synthesize
    const synthesis = await this.synthesizeFindings(query, steps);
    steps.push(synthesis);

    // Step 5: Generate conclusion
    const conclusion = await this.drawConclusion(query, steps);
    steps.push(conclusion);

    const confidenceBreakdown = this.computeConfidenceBreakdown(steps);

    return {
      conclusion: conclusion.content,
      supportingEvidence: this.extractEvidence(steps),
      confidenceAssessment: conclusion.confidence,
      assumptions: this.extractAssumptions(steps),
      alternativeInterpretations: this.extractAlternatives(steps),
      reasoningSteps: steps,
      verifiedFacts: [],
      confidenceBreakdown,
    };
  }

  private async analyzeProblem(query: string): Promise<ReasoningStep> {
    const response = await this.orchestrator.route({
      messages: [
        { role: 'system', content: 'Analyze this problem deeply. Break it down into sub-problems. Identify key variables, constraints, and relationships. Output a structured analysis.' },
        { role: 'user', content: query },
      ],
      taskCategory: 'reasoning',
      thinking: true,
    });

    return {
      step: 1,
      type: 'analysis',
      content: response.content,
      evidence: [],
      confidence: response.confidence,
    };
  }

  private async generateHypotheses(query: string, analysis: string): Promise<ReasoningStep> {
    const response = await this.orchestrator.route({
      messages: [
        { role: 'system', content: 'Based on the analysis, generate 3-5 distinct hypotheses or possible explanations. For each, assess probability and list what evidence would confirm or refute it. Be creative but grounded.' },
        { role: 'assistant', content: analysis },
        { role: 'user', content: query },
      ],
      taskCategory: 'reasoning',
      thinking: true,
    });

    return {
      step: 2,
      type: 'hypothesis',
      content: response.content,
      evidence: [],
      confidence: response.confidence,
    };
  }

  private async verifyClaims(query: string, context?: string): Promise<ReasoningStep> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: 'Verify factual claims in the following. Cross-reference available information. Flag uncertain claims. Distinguish established facts from probabilities.' },
    ];
    if (context) {
      messages.push({ role: 'user' as const, content: `Context: ${context}\n\nQuery: ${query}` });
    } else {
      messages.push({ role: 'user' as const, content: query });
    }

    const response = await this.orchestrator.route({
      messages,
      taskCategory: 'fact-verification',
      thinking: true,
    });

    return {
      step: 3,
      type: 'verification',
      content: response.content,
      evidence: [],
      confidence: response.confidence,
    };
  }

  private async synthesizeFindings(query: string, steps: ReasoningStep[]): Promise<ReasoningStep> {
    const priorSteps = steps.map(s => `[Step ${s.step} - ${s.type}]\n${s.content}`).join('\n\n');

    const response = await this.orchestrator.route({
      messages: [
        { role: 'system', content: 'Synthesize all prior analysis into a coherent picture. Identify which hypotheses are supported, which are refuted, and what remains uncertain. Find patterns across the evidence.' },
        { role: 'user', content: `Original query: ${query}\n\nPrior reasoning:\n${priorSteps}` },
      ],
      taskCategory: 'reasoning',
      thinking: true,
    });

    return {
      step: 4,
      type: 'synthesis',
      content: response.content,
      evidence: [],
      confidence: response.confidence,
    };
  }

  private async drawConclusion(query: string, steps: ReasoningStep[]): Promise<ReasoningStep> {
    const allSteps = steps.map(s => `[Step ${s.step} - ${s.type}]\n${s.content}`).join('\n\n');

    const response = await this.orchestrator.route({
      messages: [
        { role: 'system', content: `Draw a clear conclusion. Include:
1. Final answer to the original question
2. Key evidence supporting the conclusion
3. Confidence assessment (0-1 scale)
4. Important assumptions made
5. Alternative interpretations that remain possible
6. What additional information would increase confidence

Be honest about uncertainty.` },
        { role: 'user', content: `Original query: ${query}\n\nFull reasoning chain:\n${allSteps}` },
      ],
      taskCategory: 'reasoning',
      thinking: true,
    });

    return {
      step: 5,
      type: 'conclusion',
      content: response.content,
      evidence: [],
      confidence: response.confidence,
    };
  }

  async detectConflicts(sources: string[]): Promise<ConflictReport> {
    const response = await this.orchestrator.route({
      messages: [
        { role: 'system', content: 'Compare these sources and identify any factual conflicts, contradictions, or disagreements. For each conflict, note which sources take which position and assess which is more credible.' },
        { role: 'user', content: sources.map((s, i) => `[Source ${i + 1}]\n${s}`).join('\n\n') },
      ],
      taskCategory: 'fact-verification',
    });

    const hasConflict = response.content.toLowerCase().includes('conflict') ||
                        response.content.toLowerCase().includes('contradict') ||
                        response.content.toLowerCase().includes('disagree');

    return {
      hasConflict,
      conflictingClaims: hasConflict ? [{ claim: '', sources: [], confidence: 0 }] : [],
      resolution: response.content,
      recommendedAction: hasConflict ? 'Gather additional sources to resolve conflict' : 'No action needed',
    };
  }

  private computeConfidenceBreakdown(steps: ReasoningStep[]): { logical: number; factual: number; source: number } {
    const avgConfidence = steps.reduce((sum, s) => sum + s.confidence, 0) / steps.length;
    return {
      logical: Math.min(1, avgConfidence * 1.1),
      factual: Math.min(1, avgConfidence * 0.9),
      source: Math.min(1, avgConfidence * 0.85),
    };
  }

  private extractEvidence(steps: ReasoningStep[]): string[] {
    const evidence: string[] = [];
    for (const step of steps) {
      if (step.evidence) evidence.push(...step.evidence);
    }
    return [...new Set(evidence)];
  }

  private extractAssumptions(steps: ReasoningStep[]): string[] {
    const assumptions: string[] = [];
    for (const step of steps) {
      const lines = step.content.split('\n').filter(l =>
        l.toLowerCase().includes('assum') || l.toLowerCase().includes('assuming')
      );
      assumptions.push(...lines);
    }
    return assumptions;
  }

  private extractAlternatives(steps: ReasoningStep[]): string[] {
    const alternatives: string[] = [];
    for (const step of steps) {
      const lines = step.content.split('\n').filter(l =>
        l.toLowerCase().includes('alternativ') || l.toLowerCase().includes('could also')
      );
      alternatives.push(...lines);
    }
    return alternatives;
  }
}
