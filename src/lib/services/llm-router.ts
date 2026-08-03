import { config } from '@/lib/config';

const LLM_ROUTER_URL = config.services.llmRouter;
const JWT_SECRET = config.jwt.secret;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  thinking?: boolean;
  user_id?: string;
}

interface ChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface RoutingRequest {
  task_category: string;
  estimated_input_tokens?: number;
  requires_thinking?: boolean;
  requires_vision?: boolean;
  requires_tools?: boolean;
  max_budget?: number;
  preferred_provider?: string;
}

interface RoutingDecision {
  model: string;
  provider: string;
  estimated_cost: number;
  capability_match: number;
  priority: number;
  reason: string;
}

async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${LLM_ROUTER_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${JWT_SECRET}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || `LLM Router error: ${res.status}`);
  }

  return res.json();
}

export async function chatCompletion(request: ChatRequest): Promise<ChatResponse> {
  return fetchApi<ChatResponse>('/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function getRoutingDecision(request: RoutingRequest): Promise<RoutingDecision> {
  return fetchApi<RoutingDecision>('/v1/routing/decision', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function listModels(): Promise<{ object: string; data: Array<Record<string, unknown>> }> {
  return fetchApi('/v1/models');
}

export async function checkHealth(): Promise<{ status: string; models_available: number }> {
  return fetchApi('/health');
}
