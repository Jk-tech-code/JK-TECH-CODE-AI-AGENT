/**
 * Autonomy Plugin System (Phase 4).
 *
 * Plugins register a manifest (name, description, capabilities, permissions,
 * I/O schema) plus an optional run function. Plugins can be enabled/disabled
 * per user (persisted via UserPreference) and expose a health status.
 *
 * A plugin's `run` is invoked by the Brain when its capabilities match a task;
 * otherwise it's a declarative capability contract (e.g. for workflows).
 */
import { createLogger } from '@/lib/logging/logger';
import { db } from '@/lib/db';
import { toolManager } from './tool-manager';
import type { InstalledPlugin, PluginHealth, PluginManifest, ToolRunContext } from './types';

const pluginsLogger = createLogger('autonomy:plugins');

const PREFS_PREFIX = 'autonomy:plugins:enabled';

export interface PluginImpl {
  manifest: PluginManifest;
  run?: (input: Record<string, unknown>, ctx: ToolRunContext) => Promise<{ result: string; data?: unknown }>;
  /** Optional health check. Defaults to enabled === true. */
  checkHealth?: (enabled: boolean) => PluginHealth;
}

/* ───────────────────── Built-in plugins ───────────────────── */

const BUILTINS: PluginImpl[] = [
  {
    manifest: {
      id: 'summarize',
      name: 'Text Summarizer',
      version: '1.0.0',
      description: 'Condenses long text into a concise summary.',
      capabilities: ['summarize', 'text'],
      permissions: [],
      enabled: true,
    },
    run: async (input) => {
      const text = String(input.text ?? input.content ?? '');
      const first = text.split(/\n+/).filter((l) => l.trim()).slice(0, 3);
      const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
      const summary = text.length <= 600
        ? text.trim()
        : `${text.trim().slice(0, 300)}… (${wordCount} words total)`;
      return {
        result: `[plugin:summarize] ${wordCount} words. Preview:\n${first.join('\n') || summary}`,
        data: { wordCount, preview: summary },
      };
    },
  },
  {
    manifest: {
      id: 'analyze',
      name: 'Content Analyzer',
      version: '1.0.0',
      description: 'Detects tone, topics and structure in text.',
      capabilities: ['analyze', 'text', 'tone'],
      permissions: [],
      enabled: true,
    },
    run: async (input) => {
      const text = String(input.text ?? input.content ?? '');
      const words = text.trim().split(/\s+/).filter(Boolean);
      const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
      const topics = new Set(
        text.toLowerCase().split(/\s+/).filter((w) => w.length > 4 && /\w/.test(w)).slice(0, 40),
      );
      const top = [...topics].sort((a, b) => a.length - b.length).slice(0, 5);
      const tone = sentences === 0 ? 'n/a' : words.length / sentences < 14 ? 'concise' : 'verbose';
      return {
        result: `[plugin:analyze] ${words.length} words, ~${sentences} sentences, tone: ${tone}. Topics: ${top.join(', ') || 'n/a'}.`,
        data: { words: words.length, sentences, tone, topics: top },
      };
    },
  },
  {
    manifest: {
      id: 'report',
      name: 'Report Builder',
      version: '1.0.0',
      description: 'Structures findings into a markdown report.',
      capabilities: ['report', 'document', 'markdown'],
      permissions: [],
      enabled: true,
    },
    run: async (input) => {
      const text = String(input.text ?? input.content ?? '');
      const title = String(input.title ?? 'Report');
      const body = text.trim() || '(no content provided)';
      return {
        result: `[plugin:report] built "${title}"\n\n# ${title}\n\n${body.slice(0, 2000)}`,
        data: { title, chars: body.length },
      };
    },
  },
];

/* ───────────────────── Registry ───────────────────── */

export class PluginRegistry {
  private impls = new Map<string, PluginImpl>();
  private userOverrides = new Map<string, Record<string, boolean>>();

  constructor() {
    for (const p of BUILTINS) this.impls.set(p.manifest.id, p);
  }

  register(plugin: PluginImpl): void {
    this.impls.set(plugin.manifest.id, plugin);
  }

  get(id: string): PluginImpl | undefined {
    return this.impls.get(id);
  }

  all(): InstalledPlugin[] {
    return [...this.impls.values()].map((p) => ({
      manifest: p.manifest,
      health: this.health(p),
    }));
  }

  private health(plugin: PluginImpl): PluginHealth {
    if (plugin.checkHealth) return plugin.checkHealth(plugin.manifest.enabled);
    return {
      ok: plugin.manifest.enabled,
      detail: plugin.manifest.enabled ? 'enabled' : 'disabled',
      checkedAt: Date.now(),
    };
  }

  /** Effective enabled state = built-in default overridden by user pref. */
  isEnabled(id: string, userId?: string): boolean {
    const impl = this.impls.get(id);
    if (!impl) return false;
    if (userId) {
      const overrides = this.userOverrides.get(userId);
      if (overrides && overrides[id] !== undefined) return overrides[id];
    }
    return impl.manifest.enabled;
  }

  async setEnabled(id: string, enabled: boolean, userId: string): Promise<void> {
    const impl = this.impls.get(id);
    if (!impl) throw new Error(`Unknown plugin: ${id}`);
    const overrides = this.userOverrides.get(userId) ?? {};
    overrides[id] = enabled;
    this.userOverrides.set(userId, overrides);
    impl.manifest.enabled = enabled;

    // Persist so the choice survives restarts.
    try {
      const prefs: Record<string, boolean> = {};
      for (const pid of this.impls.keys()) prefs[pid] = this.isEnabled(pid, userId);
      await db.userPreference.upsert({
        where: { userId_key: { userId, key: PREFS_PREFIX } },
        update: { value: JSON.stringify(prefs) },
        create: { userId, key: PREFS_PREFIX, value: JSON.stringify(prefs) },
      });
    } catch (err) {
      pluginsLogger.warn('Failed to persist plugin toggle', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  /** Load persisted toggles into memory. */
  async loadUser(userId: string): Promise<void> {
    try {
      const row = await db.userPreference.findUnique({
        where: { userId_key: { userId, key: PREFS_PREFIX } },
      });
      if (!row) return;
      const parsed = JSON.parse(row.value) as Record<string, boolean>;
      this.userOverrides.set(userId, parsed);
    } catch (err) {
      pluginsLogger.warn('Failed to load plugin prefs', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  /** Run a plugin's handler if present and enabled. */
  async runPlugin(id: string, input: Record<string, unknown>, ctx: ToolRunContext): Promise<{ ok: boolean; result: string; data?: unknown }> {
    const plugin = this.impls.get(id);
    if (!plugin) return { ok: false, result: `Unknown plugin: ${id}` };
    if (!plugin.manifest.enabled && !ctx.userId) return { ok: false, result: `Plugin "${id}" is disabled.` };
    if (ctx.userId && !this.isEnabled(id, ctx.userId)) return { ok: false, result: `Plugin "${id}" is disabled.` };
    if (!plugin.run) return { ok: true, result: `[plugin:${id}] ${plugin.manifest.description}` };
    try {
      const out = await plugin.run(input, ctx);
      return { ok: true, result: out.result, data: out.data };
    } catch (err) {
      pluginsLogger.error(`Plugin ${id} failed`, err);
      return { ok: false, result: `[plugin:${id}] error: ${err instanceof Error ? err.message : 'failed'}` };
    }
  }

  /** Tools + plugins health combined for observability. */
  overview(): { tools: unknown[]; plugins: InstalledPlugin[] } {
    return { tools: toolManager.health(), plugins: this.all() };
  }
}

export const pluginRegistry = new PluginRegistry();