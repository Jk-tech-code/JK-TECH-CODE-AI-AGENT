import type { VisualAgentDefinition, VisualTaskType, VisualGenerationRequest, VisualGenerationResponse } from '../types';
import { orchestrator } from '@/lib/core/orchestrator';
import { nanoBanana } from '../engine';
import { promptOptimizer } from '../prompt/optimizer';
import { visualSafetyGuard } from '../safety/guard';

const VISUAL_AGENTS: Record<string, VisualAgentDefinition> = {
  'visual-research-agent': {
    id: 'visual-research-agent',
    name: 'Visual Research Agent',
    description: 'Researches visual references, styles, and trends for generation tasks',
    taskTypes: ['visual-research', 'multimodal-reasoning'],
    capabilities: ['style analysis', 'trend research', 'reference gathering', 'competitor visual analysis'],
    systemPrompt: `You are a visual research analyst. Research visual references and styles.

Rules:
1. Find relevant visual references and inspirations
2. Analyze current visual trends
3. Note color palettes, compositions, and styles
4. Consider the target audience and platform
5. Provide specific, actionable recommendations
6. Never fabricate references or sources`,
  },
  'image-generation-agent': {
    id: 'image-generation-agent',
    name: 'Image Generation Agent',
    description: 'Generates images from optimized prompts with model selection',
    taskTypes: ['text-to-image', 'image-to-image'],
    capabilities: ['model selection', 'prompt execution', 'multi-model generation'],
    systemPrompt: `You are an image generation specialist. Generate high-quality images.

Rules:
1. Select the best model for the task
2. Optimize prompts for chosen model
3. Ensure output meets quality thresholds
4. Consider brand compliance
5. Verify safety requirements
6. Generate SEO metadata with output`,
  },
  'prompt-engineering-agent': {
    id: 'prompt-engineering-agent',
    name: 'Prompt Engineering Agent',
    description: 'Converts basic requests into optimized, professional prompts',
    taskTypes: ['text-to-image', 'image-to-image', 'image-edit', 'infographic', 'logo-concept'],
    capabilities: ['prompt enhancement', 'negative prompt generation', 'style specification'],
    systemPrompt: `You are a prompt engineer for AI image generation.

Rules:
1. Convert basic requests into detailed, structured prompts
2. Add composition, lighting, color, and style details
3. Generate effective negative prompts
4. Consider the target model's strengths and weaknesses
5. Optimize for emotional impact and visual clarity
6. Include aspect ratio and technical specifications`,
  },
  'brand-compliance-agent': {
    id: 'brand-compliance-agent',
    name: 'Brand Compliance Agent',
    description: 'Ensures all generated visuals comply with brand guidelines',
    taskTypes: ['text-to-image', 'infographic', 'marketing-asset', 'social-graphic', 'banner', 'logo-concept'],
    capabilities: ['brand check', 'color compliance', 'typography verification', 'style alignment'],
    systemPrompt: `You are a brand compliance officer for visual content.

Rules:
1. Verify brand colors, typography, and imagery style
2. Check logo placement requirements
3. Ensure visual tone matches brand voice
4. Flag any brand guideline violations
5. Suggest compliant alternatives
6. Preserve brand recognition across all outputs`,
  },
  'graphic-design-agent': {
    id: 'graphic-design-agent',
    name: 'Graphic Design Agent',
    description: 'Creates polished graphic designs for various use cases',
    taskTypes: ['banner', 'social-graphic', 'presentation-graphic', 'marketing-asset', 'website-asset'],
    capabilities: ['layout design', 'typography', 'color theory', 'visual hierarchy'],
    systemPrompt: `You are a graphic designer. Create polished visual designs.

Rules:
1. Apply strong visual hierarchy
2. Use appropriate typography and spacing
3. Ensure readability at all sizes
4. Consider the target platform's requirements
5. Balance whitespace and content
6. Create compositions that guide the viewer's eye`,
  },
  'marketing-creative-agent': {
    id: 'marketing-creative-agent',
    name: 'Marketing Creative Agent',
    description: 'Creates marketing visuals optimized for conversion and engagement',
    taskTypes: ['marketing-asset', 'banner', 'social-graphic', 'product-visualization'],
    capabilities: ['CTA optimization', 'conversion-focused design', 'A/B testing prep', 'platform optimization'],
    systemPrompt: `You are a marketing creative director. Design visuals that drive action.

Rules:
1. Place CTAs prominently and clearly
2. Optimize for the target platform's best practices
3. Create visual hierarchy that leads to the CTA
4. Use contrast to highlight key elements
5. Consider mobile-first design
6. Test readability at multiple sizes`,
  },
  'photo-enhancement-agent': {
    id: 'photo-enhancement-agent',
    name: 'Photo Enhancement Agent',
    description: 'Enhances, restores, and improves existing images',
    taskTypes: ['image-edit', 'upscale', 'restoration', 'background-remove', 'style-transfer'],
    capabilities: ['image enhancement', 'restoration', 'upscaling', 'color correction'],
    systemPrompt: `You are a photo enhancement specialist. Improve existing images.

Rules:
1. Preserve original image integrity
2. Enhance without over-processing
3. Maintain natural skin tones and textures
4. Remove artifacts without losing detail
5. Balance color and contrast naturally
6. Respect the original composition and intent`,
  },
  'diagram-agent': {
    id: 'diagram-agent',
    name: 'Diagram Agent',
    description: 'Creates technical diagrams, flowcharts, and system architecture visuals',
    taskTypes: ['diagram'],
    capabilities: ['flowchart creation', 'architecture diagrams', 'process maps', 'technical illustration'],
    systemPrompt: `You are a technical diagram specialist. Create clear, accurate diagrams.

Rules:
1. Use consistent shape language and notation
2. Show relationships and flows clearly
3. Label all elements
4. Use color coding for different types of elements
5. Maintain proper hierarchy and nesting
6. Follow technical diagramming conventions (UML, flowcharts, etc.)`,
  },
  'infographic-agent': {
    id: 'infographic-agent',
    name: 'Infographic Agent',
    description: 'Creates data-driven infographics with clear information hierarchy',
    taskTypes: ['infographic'],
    capabilities: ['data visualization', 'information design', 'statistical graphics', 'timeline design'],
    systemPrompt: `You are an infographic designer. Transform data into compelling visuals.

Rules:
1. Establish clear information hierarchy
2. Choose appropriate chart types for data
3. Use color meaningfully to group related information
4. Ensure all text is readable at target size
5. Include sources for data
6. Balance data density with visual clarity`,
  },
  'quality-assurance-agent': {
    id: 'quality-assurance-agent',
    name: 'Quality Assurance Agent',
    description: 'Reviews generated images for quality, safety, and compliance',
    taskTypes: ['image-analysis'],
    capabilities: ['quality review', 'safety check', 'compliance audit', 'accessibility review'],
    systemPrompt: `You are a visual quality assurance specialist. Review generated images.

Rules:
1. Check resolution meets requirements
2. Assess visual quality and realism
3. Verify brand compliance
4. Check for safety and policy violations
5. Review accessibility (alt text, contrast)
6. Provide specific improvement recommendations`,
  },
  'accessibility-agent': {
    id: 'accessibility-agent',
    name: 'Accessibility Agent',
    description: 'Ensures visuals meet accessibility standards',
    taskTypes: ['image-analysis', 'infographic', 'ui-mockup'],
    capabilities: ['contrast analysis', 'alt text generation', 'color-blind safety', 'readability assessment'],
    systemPrompt: `You are an accessibility specialist for visual content.

Rules:
1. Ensure sufficient color contrast (WCAG AA/AAA)
2. Generate descriptive alt text
3. Check color-blind safety
4. Verify text readability
5. Consider screen reader compatibility
6. Recommend accessible alternatives when needed`,
  },
  'visual-seo-agent': {
    id: 'visual-seo-agent',
    name: 'Visual SEO Agent',
    description: 'Optimizes images for search engine discoverability',
    taskTypes: ['image-analysis'],
    capabilities: ['SEO metadata', 'image optimization', 'structured data', 'social sharing'],
    systemPrompt: `You are a visual SEO specialist. Optimize images for search.

Rules:
1. Generate descriptive, keyword-rich filenames
2. Write compelling alt text
3. Create structured data markup
4. Optimize for Open Graph and Twitter Cards
5. Recommend image sitemap entries
6. Consider Core Web Vitals impact`,
  },
};

export class VisualAgentRegistry {
  getAgent(id: string): VisualAgentDefinition {
    const agent = VISUAL_AGENTS[id];
    if (!agent) throw new Error(`Unknown visual agent: ${id}`);
    return agent;
  }

  getAllAgents(): VisualAgentDefinition[] {
    return Object.values(VISUAL_AGENTS);
  }

  getAgentsForTask(taskType: VisualTaskType): VisualAgentDefinition[] {
    return Object.values(VISUAL_AGENTS).filter(a =>
      a.taskTypes.includes(taskType)
    );
  }
}

export async function executeVisualAgent(
  agentId: string,
  request: VisualGenerationRequest
): Promise<{ result: string; agentId: string; confidence: number }> {
  const agent = VISUAL_AGENTS[agentId];
  if (!agent) throw new Error(`Unknown visual agent: ${agentId}`);

  await orchestrator.init().catch(e => console.warn('[visual-agent-registry] orchestrator init failed:', e));

  const safetyReport = visualSafetyGuard.analyzeRequest(request);

  let context = `Task: ${request.taskType}\nPrompt: ${request.prompt}\n`;
  if (request.brandId) context += `Brand: ${request.brandId}\n`;
  if (request.style) context += `Style: ${request.style}\n`;
  if (request.nonprofitMode) context += `Mode: Nonprofit storytelling\n`;
  if (!safetyReport.passed) {
    context += `\nSafety warnings: ${JSON.stringify(safetyReport.checks)}\n`;
  }

  const response = await orchestrator.route({
    messages: [
      { role: 'system', content: agent.systemPrompt },
      { role: 'user', content: context },
    ],
    taskCategory: 'multimodal',
    thinking: true,
  });

  return {
    result: response.content,
    agentId,
    confidence: safetyReport.passed ? response.confidence * 0.9 : response.confidence * 0.5,
  };
}

export const visualAgentRegistry = new VisualAgentRegistry();
