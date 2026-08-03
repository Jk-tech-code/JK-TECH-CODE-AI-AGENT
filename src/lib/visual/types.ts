export type VisualTaskType =
  | 'text-to-image'
  | 'image-to-image'
  | 'image-edit'
  | 'inpainting'
  | 'outpainting'
  | 'background-remove'
  | 'upscale'
  | 'restoration'
  | 'face-preservation'
  | 'style-transfer'
  | 'product-visualization'
  | 'infographic'
  | 'diagram'
  | 'ui-mockup'
  | 'logo-concept'
  | 'banner'
  | 'social-graphic'
  | 'presentation-graphic'
  | 'architectural-render'
  | 'website-asset'
  | 'nonprofit-storytelling'
  | 'before-after'
  | 'image-analysis'
  | 'visual-research'
  | 'ocr'
  | 'multimodal-reasoning'
  | 'typography'
  | 'brand-consistency'
  | 'marketing-asset';

export type VisualModelId =
  | 'gemini-2.5-pro-vision'
  | 'openai-dall-e-3'
  | 'openai-dall-e-2'
  | 'flux-pro'
  | 'flux-dev'
  | 'flux-schnell'
  | 'stable-diffusion-xl'
  | 'stable-diffusion-3'
  | 'ideogram-v2'
  | 'ideogram-v1'
  | 'midjourney-v6'
  | 'midjourney-v7'
  | 'recraft-v3'
  | 'recraft-v2'
  | 'nano-banana-internal';

export type VisualOutputFormat =
  | 'png'
  | 'jpg'
  | 'webp'
  | 'svg'
  | 'gif'
  | 'avif'
  | 'pdf';

export const VISUAL_OUTPUT_SIZES = {
  'social-square': { width: 1080, height: 1080, label: 'Square (1080×1080)' },
  'social-portrait': { width: 1080, height: 1350, label: 'Portrait (1080×1350)' },
  'social-story': { width: 1080, height: 1920, label: 'Story (1080×1920)' },
  'banner': { width: 1200, height: 628, label: 'Banner (1200×628)' },
  'hero': { width: 1920, height: 800, label: 'Hero (1920×800)' },
  'thumbnail': { width: 1280, height: 720, label: 'Thumbnail (1280×720)' },
  'logo': { width: 512, height: 512, label: 'Logo (512×512)' },
  'presentation': { width: 1920, height: 1080, label: 'Presentation (1920×1080)' },
  'document': { width: 1654, height: 2339, label: 'Document (A4)' },
  'icon': { width: 256, height: 256, label: 'Icon (256×256)' },
  'wide': { width: 1920, height: 600, label: 'Wide Banner (1920×600)' },
} as const;

export type VisualOutputSize = keyof typeof VISUAL_OUTPUT_SIZES;

export interface VisualModelCapability {
  modelId: VisualModelId;
  name: string;
  provider: string;
  taskTypes: VisualTaskType[];
  maxResolution: { width: number; height: number };
  supportsEditing: boolean;
  supportsInpainting: boolean;
  supportsOutpainting: boolean;
  supportsStyleTransfer: boolean;
  supportsFacePreservation: boolean;
  supportsText: boolean;
  supportsSvg: boolean;
  quality: number;
  speed: number;
  costPerImage: number;
  enterpriseReady: boolean;
}

export interface VisualGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  taskType: VisualTaskType;
  modelId?: VisualModelId;
  size?: VisualOutputSize;
  width?: number;
  height?: number;
  format?: VisualOutputFormat;
  numImages?: number;
  seed?: number;
  style?: string;
  referenceImage?: string;
  maskImage?: string;
  brandId?: string;
  nonprofitMode?: boolean;
  storytellingContext?: StorytellingContext;
  qualityThreshold?: number;
}

export interface VisualGenerationResponse {
  images: GeneratedImage[];
  modelUsed: VisualModelId;
  promptUsed: string;
  latencyMs: number;
  cost: number;
  qualityScore: number;
  safetyScore: number;
  seo: VisualSeoMetadata;
}

export interface GeneratedImage {
  id: string;
  url: string;
  base64?: string;
  width: number;
  height: number;
  format: VisualOutputFormat;
  size: number;
  altText: string;
  qualityScore: number;
}

export interface StorytellingContext {
  organizationName?: string;
  mission?: string;
  campaignName?: string;
  audience?: string;
  emotionalGoal?: string;
  realStories?: string[];
  region?: string;
  sensitiveContent?: boolean;
}

export interface VisualSeoMetadata {
  filename: string;
  altText: string;
  title: string;
  caption: string;
  description: string;
  ogTags: {
    image: string;
    imageAlt: string;
    imageWidth: number;
    imageHeight: number;
    imageType: string;
  };
  twitterCard: {
    card: string;
    image: string;
    imageAlt: string;
  };
  structuredData: Record<string, unknown>;
  keywords: string[];
}

export interface VisualPipelineStage {
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  score?: number;
  details?: string;
  durationMs?: number;
}

export interface VisualPipelineResult {
  stages: VisualPipelineStage[];
  passed: boolean;
  finalImage: GeneratedImage | null;
  error?: string;
}

export interface VisualBrandProfile {
  id: string;
  name: string;
  logo?: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    palette: string[];
  };
  typography: {
    headingFont: string;
    bodyFont: string;
    fontWeights: Record<string, number>;
  };
  imagery: {
    style: string;
    allowedTypes: string[];
    restrictedTypes: string[];
    mood: string[];
  };
  icons: {
    style: string;
    library: string;
  };
  layout: {
    gridColumns: number;
    spacing: string;
    maxWidth: string;
  };
  logoPlacement: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | 'none';
  voice: {
    tone: string;
    vocabulary: string[];
    avoidWords: string[];
  };
}

export interface VisualQaReport {
  passed: boolean;
  scores: {
    resolution: number;
    sharpness: number;
    realism: number;
    composition: number;
    readability: number;
    accessibility: number;
    visualHierarchy: number;
    typography: number;
    colorHarmony: number;
  };
  issues: VisualQaIssue[];
  overallScore: number;
}

export interface VisualQaIssue {
  severity: 'critical' | 'major' | 'minor' | 'info';
  category: string;
  description: string;
  recommendation: string;
}

export interface VisualSafetyReport {
  passed: boolean;
  checks: {
    copyright: VisualSafetyCheck;
    trademark: VisualSafetyCheck;
    deepfake: VisualSafetyCheck;
    misinformation: VisualSafetyCheck;
    authenticity: VisualSafetyCheck;
    contentPolicy: VisualSafetyCheck;
  };
  overallScore: number;
}

export interface VisualSafetyCheck {
  passed: boolean;
  confidence: number;
  issues: string[];
}

export interface VisualAgentDefinition {
  id: string;
  name: string;
  description: string;
  taskTypes: VisualTaskType[];
  systemPrompt: string;
  capabilities: string[];
}

export interface OptimizedPrompt {
  original: string;
  optimized: string;
  composition: string;
  lighting: string;
  emotionalIntent: string;
  cameraSettings?: string;
  visualHierarchy: string;
  brandRequirements: string[];
  negativePrompt: string;
}
