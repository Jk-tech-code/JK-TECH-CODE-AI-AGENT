import { config } from '@/lib/config';

const VISUAL_PROCESSOR_URL = config.services.visualProcessor;
const JWT_SECRET = config.jwt.secret;

interface VisualGenerationRequest {
  prompt: string;
  negative_prompt?: string;
  task_type?: string;
  model_id?: string;
  width?: number;
  height?: number;
  num_images?: number;
  format?: string;
  style?: string;
  brand_id?: string;
  user_id?: string;
}

interface GeneratedImage {
  id: string;
  url: string;
  width: number;
  height: number;
  format: string;
  file_size: number;
  alt_text: string;
  quality_score: number;
}

interface VisualGenerationResponse {
  images: GeneratedImage[];
  model_used: string;
  prompt_used: string;
  latency_ms: number;
  cost: number;
  quality_score: number;
  safety_score: number;
  seo: Record<string, unknown>;
}

interface BrandProfile {
  id: string;
  name: string;
  logo_url?: string;
  colors?: Record<string, unknown>;
  typography?: Record<string, unknown>;
  imagery_style?: string;
  icon_style?: string;
  logo_placement: string;
  brand_voice?: string;
  created_at: string;
}

interface BrandProfileCreate {
  name: string;
  logo_url?: string;
  colors?: Record<string, unknown>;
  typography?: Record<string, unknown>;
  imagery_style?: string;
  icon_style?: string;
  logo_placement?: string;
  brand_voice?: string;
}

interface HealthResponse {
  status: string;
  service: string;
  uptime_seconds: number;
  models_available: number;
  providers_healthy: Record<string, boolean>;
}

async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${VISUAL_PROCESSOR_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || `Visual Processor error: ${res.status}`);
  }

  return res.json();
}

export async function generateImage(request: VisualGenerationRequest): Promise<VisualGenerationResponse> {
  return fetchApi<VisualGenerationResponse>('/v1/images/generations', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function optimizePrompt(request: VisualGenerationRequest): Promise<Record<string, unknown>> {
  return fetchApi('/v1/images/optimize-prompt', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function createBrand(profile: BrandProfileCreate): Promise<BrandProfile> {
  return fetchApi<BrandProfile>('/v1/brands', {
    method: 'POST',
    body: JSON.stringify(profile),
  });
}

export async function listBrands(): Promise<BrandProfile[]> {
  return fetchApi<BrandProfile[]>('/v1/brands');
}

export async function getBrand(brandId: string): Promise<BrandProfile> {
  return fetchApi<BrandProfile>(`/v1/brands/${brandId}`);
}

export async function deleteBrand(brandId: string): Promise<void> {
  await fetchApi(`/v1/brands/${brandId}`, { method: 'DELETE' });
}

export async function listModels(): Promise<{ object: string; data: Array<Record<string, unknown>> }> {
  return fetchApi('/v1/models');
}

export async function checkHealth(): Promise<HealthResponse> {
  return fetchApi<HealthResponse>('/health');
}
