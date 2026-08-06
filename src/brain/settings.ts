/**
 * Brain Settings store — persists per-user Brain configuration in the
 * `UserPreference` table so settings survive across sessions and can be edited
 * from the Settings page without code changes.
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

/** Env-driven default model label (always the search engine). */
export function envDefaultModel(): string {
  return 'search-engine';
}

/** Whether the env has a search key (the only thing the Brain needs). */
export function envSearchConfigured(): boolean {
  return Boolean(process.env.TAVILY_API_KEY || process.env.SERPAPI_API_KEY);
}

/** Load stored settings for a user (falls back to env-driven defaults). */
export async function loadSettings(userId?: string): Promise<BrainSettings> {
  const defaults: BrainSettings = { ...DEFAULT_SETTINGS };

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