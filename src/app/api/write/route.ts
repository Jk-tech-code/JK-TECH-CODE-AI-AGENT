import { NextRequest, NextResponse } from 'next/server';
import { humanWritingEngine } from '@/lib/core/humanize';
import { orchestrator } from '@/lib/core/orchestrator';
import { searchAggregator } from '@/lib/core/search';
import { fireTaskWebhook } from '@/lib/services/zapier';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, topic, tone, style, length, research } = body;

    if (!prompt && !topic) {
      return NextResponse.json({ error: 'Provide a prompt or topic.' }, { status: 400 });
    }

    await orchestrator.init().catch(e => console.warn('[write] orchestrator init failed:', e));
    await searchAggregator.init().catch(e => console.warn('[write] search init failed:', e));

    let researchContext = '';
    if (research !== false) {
      try {
        const results = await searchAggregator.search({
          query: topic || prompt,
          numResults: 5,
        });
        if (results.length > 0) {
          researchContext = '\n\nResearch context:\n' +
            results.map(r => `[${r.title}](${r.url}): ${r.snippet}`).join('\n');
        }
      } catch (e) { console.warn('[write] research search failed:', e); }
    }

    const response = await orchestrator.route({
      messages: [
        { role: 'system', content: `You are a professional writer. Write content that sounds genuinely human.

Requirements:
${tone ? `- Tone: ${tone}` : '- Tone: natural and conversational'}
${style ? `- Style: ${style}` : '- Style: clear and direct'}
${length ? `- Length: ${length}` : ''}

Rules:
- Vary sentence length
- Use specific details and observations
- Avoid AI buzzwords: leverage, optimize, streamline, facilitate, foster, navigate, delve, unlock, harness, elevate, pivotal, landscape, ecosystem, paradigm, robust, seamless, transformative, cutting-edge, game-changing, actionable, scalable, holistic, nuanced, intricate, compelling, impactful, innovative
- Avoid stiff transitions: Furthermore, Moreover, Additionally, Nevertheless, Consequently, Therefore, Thus
- Use contractions
- Start sentences with "But" or "And" when natural
- Sound like a knowledgeable person, not a corporate document
- Never hedge with unnecessary qualifiers` },
        { role: 'user', content: `${topic ? `Topic: ${topic}` : prompt}${researchContext}` },
      ],
      taskCategory: 'writing',
    });

    const patterns = humanWritingEngine.detectPatterns(response.content);

    fireTaskWebhook('writing', {
      userMessage: topic || prompt || '',
      aiResponse: response.content,
      service: 'writing',
      timestamp: new Date().toISOString(),
      metadata: { modelUsed: response.modelId, latencyMs: response.latencyMs },
    });

    return NextResponse.json({
      content: response.content,
      patternsDetected: patterns.length,
      modelUsed: response.modelId,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Write API error:', error);
    return NextResponse.json({ error: 'Writing failed.' }, { status: 500 });
  }
}
