import type { StorytellingContext, VisualGenerationRequest } from '../types';
import { orchestrator } from '@/lib/core/orchestrator';

export class NonprofitStoryteller {
  async buildRequest(input: {
    organizationName: string;
    mission: string;
    campaignName?: string;
    audience?: string;
    emotionalGoal?: string;
    realStories?: string[];
    region?: string;
  }): Promise<VisualGenerationRequest> {
    const response = await orchestrator.route({
      messages: [
        { role: 'system', content: `You are a nonprofit storytelling specialist. Your job is to translate nonprofit needs into ethical, emotionally resonant visual briefs.

Principles:
1. Prioritize dignity - subjects must be portrayed with respect
2. Truthful representation - never exaggerate or fabricate
3. Emotional authenticity - real impact, not manipulation
4. Cultural sensitivity - respect local contexts and traditions
5. Mission alignment - every visual must serve the organization's mission
6. Avoid stereotypes - show diversity and complexity
7. Focus on solutions and hope, not just problems
8. Consent-aware - never generate identifiable individuals without context

Output a JSON visual brief: { "prompt": "...", "emotionalIntent": "...", "composition": "...", "sensitiveContent": boolean, "culturalNotes": "..." }` },
        { role: 'user', content: JSON.stringify({
          organization: input.organizationName,
          mission: input.mission,
          campaign: input.campaignName || 'General awareness',
          audience: input.audience || 'General public',
          emotionalGoal: input.emotionalGoal || 'Inspire action',
          stories: input.realStories || [],
          region: input.region || 'Global',
        }) },
      ],
      taskCategory: 'writing',
      thinking: true,
    });

    let brief: { prompt?: string; emotionalIntent?: string; composition?: string; sensitiveContent?: boolean; culturalNotes?: string } = {};
    try {
      const cleaned = response.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      brief = JSON.parse(cleaned);
    } catch {
      brief = { prompt: response.content };
    }

    return {
      prompt: brief.prompt || input.mission,
      taskType: 'nonprofit-storytelling',
      nonprofitMode: true,
      storytellingContext: {
        organizationName: input.organizationName,
        mission: input.mission,
        campaignName: input.campaignName,
        audience: input.audience,
        emotionalGoal: input.emotionalGoal,
        realStories: input.realStories,
        region: input.region,
        sensitiveContent: brief.sensitiveContent,
      },
    };
  }

  async generateImpactStory(params: {
    organizationName: string;
    mission: string;
    beneficiaryType: string;
    transformation: string;
    metric?: string;
    region?: string;
  }): Promise<VisualGenerationRequest> {
    const context: StorytellingContext = {
      organizationName: params.organizationName,
      mission: params.mission,
      emotionalGoal: 'Inspire hope and demonstrate impact',
    };

    const prompt = `Before-and-after visual showing the impact of ${params.organizationName}'s work with ${params.beneficiaryType} in ${params.region || 'communities in need'}. ${params.transformation}${params.metric ? ` Result: ${params.metric}.` : ''} Style: Documentary photography, warm natural lighting, authentic and dignified portrayal. Emotional tone: Hopeful, realistic, respectful. No exaggeration. No stereotypes.`;

    return {
      prompt,
      taskType: 'before-after',
      nonprofitMode: true,
      storytellingContext: context,
    };
  }

  async generateDonationCampaign(params: {
    organizationName: string;
    campaignName: string;
    goal: string;
    urgency: string;
    audience: string;
  }): Promise<VisualGenerationRequest> {
    const prompt = `Donation campaign visual for ${params.organizationName}. Campaign: ${params.campaignName}. Goal: ${params.goal}. ${params.urgency}. Target audience: ${params.audience}. Style: Warm, inviting, authentic. Composition: Focus on human connection and dignity. Emotional tone: Urgent but hopeful. Include space for text overlay (donate button, headline). Photorealistic documentary style.`;

    return {
      prompt,
      taskType: 'marketing-asset',
      nonprofitMode: true,
      storytellingContext: {
        organizationName: params.organizationName,
        campaignName: params.campaignName,
        emotionalGoal: 'Urgent but hopeful',
        audience: params.audience,
      },
    };
  }
}

export const nonprofitStoryteller = new NonprofitStoryteller();
