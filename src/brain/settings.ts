/**
 * Brain Settings store — persists per-user AI configuration in the
 * `UserPreference` table so settings survive across sessions and can be edited
 * from the AI Settings page without code changes.
 */
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logging/logger';
import type { BrainSettings } from './types';
import { DEFAULT_SETTINGS } from './types';

const settingsLogger = createLogger('brain:settings');
const SETTINGS_KEY = 'brain:settings';

function safeParse(raw: string): Partial<BrainSettings> {
  try {
    return JSON.parse(raw) as Partial<BrainSettings>;
  } catch {
    return {};
  }
}

import { isLLMProviderName, type LLMProviderName } from './providers/interface';

/** Resolve the env-driven provider key (gemini default; unknown → gemini). */
export function envProviderName(): LLMProviderName {
  const raw = (process.env.LLM_PROVIDER || 'gemini').trim().toLowerCase();
  return isLLMProviderName(raw) ? raw : 'gemini';
}

/** Resolve the env-driven default model for the active provider. */
export function envDefaultModel(provider: LLMProviderName): string {
  switch (provider) {
    case 'gemini': return process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    case 'groq': return process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    case 'openrouter': return process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';
    case 'openai': return process.env.OPENAI_MODEL || 'gpt-4.1';
    case 'anthropic': return process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
    case 'together': return process.env.TOGETHER_MODEL || 'meta-llama/Llama-3.3-70B-Instruct-Turbo';
    case 'ollama': return process.env.OLLAMA_MODEL || process.env.LLM_MODEL || 'qwen3:4b';
    default: return process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  }
}

/** Whether automatic fallback is enabled by the environment. */
function envFallbackEnabled(): boolean {
  const raw = (process.env.LLM_FALLBACK_ENABLED || '').trim().toLowerCase();
  return raw === 'true' || raw === '1';
}

/** Load stored settings for a user (falls back to env-driven defaults). */
export async function loadSettings(userId?: string): Promise<BrainSettings> {
  // Start from env-driven model defaults so a fresh install works out of the box.
  const provider = envProviderName();
  const envModel = envDefaultModel(provider);
  const defaults: BrainSettings = {
    ...DEFAULT_SETTINGS,
    model: envModel,
    provider,
    fallbackEnabled: envFallbackEnabled(),
  };

  if (!userId) return defaults;

  try {
    const row = await db.userPreference.findUnique({
      where: { userId_key: { userId, key: SETTINGS_KEY } },
    });
    if (!row) return defaults;
    return { ...defaults, ...safeParse(row.value) };
  } catch (err) {
    settingsLogger.error('Failed to load brain settings', err);
    return defaults;
  }
}

/** Persist settings for a user. Returns the merged stored settings. */
export async function saveSettings(
  userId: string,
  partial: Partial<BrainSettings>,
): Promise<BrainSettings> {
  const current = await loadSettings(userId);
  const merged: BrainSettings = { ...current, ...partial };

  try {
    await db.userPreference.upsert({
      where: { userId_key: { userId, key: SETTINGS_KEY } },
      update: { value: JSON.stringify(merged) },
      create: { userId, key: SETTINGS_KEY, value: JSON.stringify(merged) },
    });
  } catch (err) {
    settingsLogger.error('Failed to save brain settings', err);
  }
  return merged;
}

/** Build the settings payload for a signed-out / anonymous user. */
export async function anonSettings(): Promise<BrainSettings> {
  return loadSettings(undefined);
}

export { SETTINGS_KEY, DEFAULT_SETTINGS };