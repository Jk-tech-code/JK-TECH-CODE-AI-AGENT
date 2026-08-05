/**
 * OpenAI-compatible fallback provider for the Brain.
 *
 * Delegates to the existing AI SDK provider (`@/lib/ai/provider`) so the Brain
 * can keep working when `LLM_PROVIDER=openai` or Ollama is intentionally
 * bypassed. This preserves all pre-existing cloud capabilities.
 */
import { getModel, resolveModelAlias, DEFAULT_MODEL_ID } from '@/lib/ai/provider';
import { generateText, streamText } from 'ai';
import type { LLMCompleteResult, LLMStreamChunk, LLMOptions } from './llm';

export default async function getOpenAIResult(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: LLMOptions,
): Promise<LLMCompleteResult> {
  const start = Date.now();
  const modelId = resolveModelAlias(DEFAULT_MODEL_ID);
  const result = await generateText({
    model: getModel(modelId),
    messages,
    temperature: options.temperature ?? 0.7,
    maxOutputTokens: options.maxTokens,
  });
  return {
    content: result.text || '',
    thinking: result.reasoningText || '',
    modelUsed: modelId,
    latencyMs: Date.now() - start,
  };
}

export async function* getOpenAIStream(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: LLMOptions,
): AsyncGenerator<LLMStreamChunk> {
  const modelId = resolveModelAlias(DEFAULT_MODEL_ID);
  const system = messages.find((m) => m.role === 'system')?.content;
  const chat = messages.filter((m) => m.role !== 'system');

  const result = streamText({
    model: getModel(modelId),
    ...(system ? { system } : {}),
    messages: chat,
    temperature: options.temperature ?? 0.7,
  });

  for await (const delta of result.textStream) {
    if (delta) yield { content: delta };
  }
}