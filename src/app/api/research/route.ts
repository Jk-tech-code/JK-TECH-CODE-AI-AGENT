import { NextRequest, NextResponse } from 'next/server';
import { orchestrator } from '@/lib/core/orchestrator';
import { searchAggregator } from '@/lib/core/search';
import { DeepReasoningEngine } from '@/lib/core/reasoning';
import { fireTaskWebhook } from '@/lib/services/zapier';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, depth = 'standard' } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Provide a research query.' }, { status: 400 });
    }

    await orchestrator.init().catch(e => console.warn('[research] orchestrator init failed:', e));
    await searchAggregator.init().catch(e => console.warn('[research] search init failed:', e));

    const searchResults = await searchAggregator.search({
      query,
      numResults: depth === 'deep' ? 15 : 8,
      recencyDays: depth === 'deep' ? 365 : 90,
    });

    const searchContext = searchResults
      .map(r => `[${r.title}](${r.url})\n${r.snippet}\n[Credibility: ${(r.credibilityScore * 100).toFixed(0)}%]`)
      .join('\n\n');

    let reasoning;
    if (depth === 'deep') {
      const engine = new DeepReasoningEngine(orchestrator);
      reasoning = await engine.reason(query, searchContext);
    }

    const response = await orchestrator.route({
      messages: [
        { role: 'system', content: `You are a research analyst. Synthesize search results and analysis into a comprehensive research report.

Structure your response:
1. Executive Summary
2. Key Findings (with source citations)
3. Evidence Analysis
4. Contradictions & Uncertainties
5. Confidence Assessment
6. Further Research Needed

Rules:
- Cite specific sources for claims
- Note confidence levels
- Flag contradictions between sources
- Distinguish facts from interpretations
- Never fabricate information` },
        { role: 'user', content: `Research query: ${query}\n\nSearch results:\n${searchContext}` },
      ],
      taskCategory: 'research',
      thinking: true,
    });

    // Fire-and-forget Zapier notification on research completion (non-blocking)
    fireTaskWebhook('research', {
      userMessage: query,
      aiResponse: response.content,
      service: 'research',
      timestamp: new Date().toISOString(),
      metadata: {
        depth,
        confidence: response.confidence,
        sourceCount: searchResults.length,
        modelUsed: response.modelId,
      },
    });

    return NextResponse.json({
      content: response.content,
      modelUsed: response.modelId,
      confidence: response.confidence,
      sources: searchResults.map(r => ({
        title: r.title,
        url: r.url,
        credibilityScore: r.credibilityScore,
      })),
      reasoning: reasoning || undefined,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Research API error:', error);
    return NextResponse.json({ error: 'Research failed. Please try again.' }, { status: 500 });
  }
}
