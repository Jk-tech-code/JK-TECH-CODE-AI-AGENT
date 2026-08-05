/**
 * Autonomy Automation (Phase 10).
 *
 * Users schedule recurring tasks (daily reports, weekly summaries, reminders,
 * backups). Schedules are persisted per user; a `scanDue` helper returns any
 * schedules whose next run is due, and a `markRun` advances them. (Actual
 * cron execution is left to the host; on Vercel this is driven by a scheduled
 * function hitting a runner.)
 */
import { createLogger } from '@/lib/logging/logger';
import { db } from '@/lib/db';

const apiLogger = createLogger('autonomy:automation');
const PREFS_PREFIX = 'autonomy:automation';

export type ScheduleFrequency = 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly';

export interface AutomationJob {
  id: string;
  name: string;
  description?: string;
  frequency: ScheduleFrequency;
  /** Next run due timestamp (ms). */
  nextRunAt: number;
  /** What to do when it fires: a workflow id or a prompt goal. */
  action: string;
  actionType: 'workflow' | 'goal' | 'reminder' | 'backup' | 'sync';
  enabled: boolean;
  createdAt: number;
  lastRunAt?: number;
  lastResult?: string;
}

export interface AutomationRunResult {
  completedAt: number;
  ok: boolean;
  result: string;
}

export class AutomationStore {
  async list(userId: string): Promise<AutomationJob[]> {
    try {
      const rows = await db.userPreference.findMany({
        where: { userId, key: { startsWith: `${PREFS_PREFIX}:` } },
        orderBy: { updatedAt: 'desc' },
      });
      return rows
        .map((r) => safeParse<AutomationJob>(r.value))
        .filter((j): j is AutomationJob => !!j && typeof j.id === 'string');
    } catch (err) {
      apiLogger.warn('Failed to list automations', { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }

  async create(
    userId: string,
    input: { name: string; frequency: ScheduleFrequency; action: string; actionType: AutomationJob['actionType']; description?: string; startInMs?: number },
  ): Promise<AutomationJob> {
    const now = Date.now();
    const job: AutomationJob = {
      id: crypto.randomUUID(),
      name: input.name.slice(0, 120),
      description: input.description,
      frequency: input.frequency,
      nextRunAt: now + (input.startInMs ?? this.intervalMs(input.frequency)),
      action: input.action.slice(0, 2000),
      actionType: input.actionType,
      enabled: true,
      createdAt: now,
    };
    await this.persist(userId, job);
    return job;
  }

  async update(userId: string, id: string, patch: Partial<Pick<AutomationJob, 'enabled' | 'name' | 'frequency' | 'action' | 'actionType'>>): Promise<AutomationJob | null> {
    const current = (await this.list(userId)).find((j) => j.id === id);
    if (!current) return null;
    const updated: AutomationJob = { ...current, ...patch };
    if (patch.frequency) updated.nextRunAt = Date.now() + this.intervalMs(patch.frequency);
    await this.persist(userId, updated);
    return updated;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    try {
      await db.userPreference.deleteMany({ where: { userId, key: `${PREFS_PREFIX}:${id}` } });
      return true;
    } catch {
      return false;
    }
  }

  /** Jobs whose next run is due; called by a scheduler/runner. */
  async due(userId: string): Promise<AutomationJob[]> {
    const now = Date.now();
    const jobs = await this.list(userId);
    return jobs.filter((j) => j.enabled && j.nextRunAt <= now);
  }

  /** Mark a job as having run; schedule its next occurrence. */
  async markRun(userId: string, id: string, result: AutomationRunResult): Promise<void> {
    const current = (await this.list(userId)).find((j) => j.id === id);
    if (!current) return;
    await this.persist(userId, {
      ...current,
      lastRunAt: result.completedAt,
      lastResult: result.result.slice(0, 1000),
      nextRunAt: current.frequency === 'once' ? 0 : Date.now() + this.intervalMs(current.frequency),
      enabled: current.frequency === 'once' ? false : current.enabled,
    });
  }

  private intervalMs(f: ScheduleFrequency): number {
    switch (f) {
      case 'hourly': return 3600_000;
      case 'daily': return 86_400_000;
      case 'weekly': return 604_800_000;
      case 'monthly': return 2_592_000_000;
      default: return 0;
    }
  }

  private async persist(userId: string, job: AutomationJob): Promise<void> {
    try {
      await db.userPreference.upsert({
        where: { userId_key: { userId, key: `${PREFS_PREFIX}:${job.id}` } },
        update: { value: JSON.stringify(job) },
        create: { userId, key: `${PREFS_PREFIX}:${job.id}`, value: JSON.stringify(job) },
      });
    } catch (err) {
      apiLogger.error('Failed to persist automation', err);
    }
  }
}

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const automationStore = new AutomationStore();