import { NextRequest, NextResponse } from 'next/server';
import { nanoBanana } from '@/lib/visual/engine';
import { promptOptimizer } from '@/lib/visual/prompt/optimizer';
import { visualSafetyGuard } from '@/lib/visual/safety/guard';
import { brandMemory } from '@/lib/visual/brand/store';
import { qaAssessor } from '@/lib/visual/quality/assessor';
import { visualSeo } from '@/lib/visual/seo/optimizer';
import { orchestrator } from '@/lib/core/orchestrator';
import * as visualProcessor from '@/lib/services/visual-processor';
import { fireTaskWebhook } from '@/lib/services/zapier';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, taskType, style, size, brandId, nonprofitMode, storytellingContext, numImages } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Provide a visual prompt.' }, { status: 400 });
    }

    const safetyReport = visualSafetyGuard.analyzeRequest({
      prompt,
      taskType: taskType || 'text-to-image',
    });

    if (!safetyReport.passed) {
      return NextResponse.json({
        error: 'Safety check failed',
        safetyReport,
        message: 'Your request was flagged by safety checks. Please revise and try again.',
      }, { status: 400 });
    }

    try {
      const vpResponse = await visualProcessor.generateImage({
        prompt,
        task_type: taskType || 'text-to-image',
        num_images: numImages || 1,
        brand_id: brandId,
      });

      fireTaskWebhook('image', {
        userMessage: prompt,
        aiResponse: typeof vpResponse.seo?.description === 'string'
          ? vpResponse.seo.description
          : vpResponse.prompt_used || '',
        service: 'image-generation',
        timestamp: new Date().toISOString(),
        metadata: { modelUsed: vpResponse.model_used, taskType: taskType || 'text-to-image', source: 'visual-processor' },
      });

      return NextResponse.json({
        success: true,
        images: vpResponse.images.map(img => ({
          id: img.id,
          url: img.url,
          width: img.width,
          height: img.height,
          format: img.format,
          altText: img.alt_text,
          qualityScore: img.quality_score,
        })),
        modelUsed: vpResponse.model_used,
        promptUsed: vpResponse.prompt_used,
        latencyMs: vpResponse.latency_ms,
        cost: vpResponse.cost,
        quality: { overallScore: vpResponse.quality_score, passed: vpResponse.quality_score >= 0.6 },
        seo: vpResponse.seo,
        safety: { passed: vpResponse.safety_score >= 0.7, overallScore: vpResponse.safety_score },
        source: 'visual-processor',
        timestamp: Date.now(),
      });
    } catch (vpError) {
      console.log('Visual Processor unavailable, falling back to local engine.');
    }

    await orchestrator.init().catch(e => console.warn('[visual-generate] orchestrator init failed:', e));

    const optimizedPrompt = await promptOptimizer.enhanceBasicPrompt(prompt);

    let brandCompliance: any = null;
    if (brandId) {
      const brandCheck = await brandMemory.applyBrandConsistency(brandId, optimizedPrompt);
      brandCompliance = brandCheck;
    }

    const result = await nanoBanana.generate({
      prompt: optimizedPrompt,
      taskType: taskType || 'text-to-image',
      style,
      size,
      brandId,
      nonprofitMode,
      storytellingContext,
      numImages: numImages || 1,
    });

    const qualityReport = result.images[0] ? await qaAssessor.assess(result.images[0], prompt) : null;

    const seo = result.images[0] ? visualSeo.generate({
      prompt,
      image: result.images[0],
    }) : null;

    fireTaskWebhook('image', {
      userMessage: prompt,
      aiResponse: seo?.description || result.images[0]?.altText || '',
      service: 'image-generation',
      timestamp: new Date().toISOString(),
      metadata: { modelUsed: result.modelUsed, taskType: taskType || 'text-to-image', source: 'local-engine' },
    });

    return NextResponse.json({
      success: true,
      images: result.images.map(img => ({
        id: img.id,
        url: img.url,
        width: img.width,
        height: img.height,
        format: img.format,
        altText: img.altText,
        qualityScore: img.qualityScore,
      })),
      modelUsed: result.modelUsed,
      promptUsed: result.promptUsed,
      latencyMs: result.latencyMs,
      cost: result.cost,
      quality: qualityReport ? {
        overallScore: qualityReport.overallScore,
        scores: qualityReport.scores,
        passed: qualityReport.passed,
      } : null,
      seo: seo ? {
        filename: seo.filename,
        altText: seo.altText,
        title: seo.title,
        description: seo.description,
        ogTags: seo.ogTags,
        keywords: seo.keywords,
      } : null,
      safety: {
        passed: safetyReport.passed,
        overallScore: safetyReport.overallScore,
      },
      brandCompliance,
      source: 'local-engine',
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Visual generate API error:', error);
    return NextResponse.json({ error: 'Image generation failed.' }, { status: 500 });
  }
}
