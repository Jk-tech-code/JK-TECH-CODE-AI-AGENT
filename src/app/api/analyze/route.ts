import { NextRequest, NextResponse } from 'next/server';
import { orchestrator } from '@/lib/core/orchestrator';
import { humanWritingEngine } from '@/lib/core/humanize';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, analysisType = 'comprehensive' } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Provide text to analyze.' }, { status: 400 });
    }

    await orchestrator.init().catch(e => console.warn('[analyze] orchestrator init failed:', e));

    const patterns = humanWritingEngine.detectPatterns(text);

    const response = await orchestrator.route({
      messages: [
        { role: 'system', content: `You are an expert text analyst. Analyze the given text and provide:

${analysisType === 'comprehensive' ? `
1. Overall quality assessment (1-10)
2. Readability score
3. Tone analysis (formal, casual, academic, etc.)
4. AI-generation probability assessment
5. Specific patterns that suggest AI generation
6. Sentence variety analysis
7. Vocabulary richness
8. Structural analysis
9. Specific improvement suggestions
10. Estimated audience suitability` : `
1. Key patterns identified
2. Strengths
3. Areas for improvement
4. Specific rewrite suggestions`}

Respond with JSON. Be specific and evidence-based.` },
        { role: 'user', content: text },
      ],
      taskCategory: 'analysis',
      thinking: true,
    });

    return NextResponse.json({
      analysis: response.content,
      patternsDetected: patterns,
      patternScore: patterns.length,
      modelUsed: response.modelId,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Analyze API error:', error);
    return NextResponse.json({ error: 'Analysis failed.' }, { status: 500 });
  }
}
