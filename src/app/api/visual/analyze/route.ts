import { NextRequest, NextResponse } from 'next/server';
import { orchestrator } from '@/lib/core/orchestrator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl, imageBase64, analysisType, question } = body;

    if (!imageUrl && !imageBase64) {
      return NextResponse.json({ error: 'Provide an image URL or base64 data.' }, { status: 400 });
    }

    await orchestrator.init().catch(e => console.warn('[visual-analyze] orchestrator init failed:', e));

    const systemPrompt = analysisType === 'ocr' ? `Extract all text from this image. Preserve formatting and layout where possible. Return the extracted text.` :
                         analysisType === 'detailed' ? `Analyze this image in detail:
1. Subject description
2. Composition analysis
3. Color palette extraction
4. Lighting assessment
5. Mood and emotional impact
6. Text and typography present
7. Notable objects or elements
8. Quality assessment (resolution, clarity)
9. Style classification
10. Accessibility considerations (contrast, readability)` :
                         `Describe what you see in this image. Be specific and detailed.`;

    const userContent = question || 'Analyze this image.';
    const imageContent = imageUrl
      ? JSON.stringify({ type: 'image_url', image_url: { url: imageUrl } })
      : imageBase64
        ? JSON.stringify({ type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } })
        : '';

    const response = await orchestrator.route({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `${userContent}\n\n${imageContent}` },
      ],
      taskCategory: 'multimodal',
      thinking: analysisType === 'detailed',
    });

    return NextResponse.json({
      analysis: response.content,
      modelUsed: response.modelId,
      confidence: response.confidence,
      analysisType: analysisType || 'standard',
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Visual analyze API error:', error);
    return NextResponse.json({ error: 'Image analysis failed.' }, { status: 500 });
  }
}
