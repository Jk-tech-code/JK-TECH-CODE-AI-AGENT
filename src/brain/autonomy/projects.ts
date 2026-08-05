/**
 * Autonomy Project Mode (Phase 6).
 *
 * Project workspaces that remember files, goals, tasks, notes and history,
 * persisted as JSON in UserPreference. Switching projects preserves context:
 * each project carries its own files + notes that feed the Brain as grounding.
 */
import { randomUUID } from 'crypto';
import { createLogger } from '@/lib/logging/logger';
import { db } from '@/lib/db';
import type { Project, ProjectFile } from './types';

const projectsLogger = createLogger('autonomy:projects');
const PREFS_PREFIX = 'autonomy:projects';

function keyFor(userId: string, id: string): string {
  return `${PREFS_PREFIX}:${id}`;
}

export class ProjectStore {
  async list(userId: string): Promise<Project[]> {
    try {
      const rows = await db.userPreference.findMany({
        where: { userId, key: { startsWith: `${PREFS_PREFIX}:` } },
        orderBy: { updatedAt: 'desc' },
      });
      return rows
        .map((r) => safeParse<Project>(r.value))
        .filter((p): p is Project => !!p && typeof p.id === 'string')
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (err) {
      projectsLogger.error('Failed to list projects', err);
      return [];
    }
  }

  async get(userId: string, id: string): Promise<Project | null> {
    try {
      const row = await db.userPreference.findUnique({
        where: { userId_key: { userId, key: keyFor(userId, id) } },
      });
      return row ? safeParse<Project>(row.value) : null;
    } catch (err) {
      projectsLogger.error('Failed to load project', err);
      return null;
    }
  }

  async create(userId: string, input: { name: string; description?: string; goals?: string[] }): Promise<Project> {
    const now = Date.now();
    const project: Project = {
      id: randomUUID(),
      name: (input.name || 'Untitled project').slice(0, 120),
      description: input.description ?? '',
      goals: (input.goals ?? []).slice(0, 20),
      files: [],
      notes: [],
      createdAt: now,
      updatedAt: now,
      active: false,
    };
    await this.persist(userId, project);
    return project;
  }

  async update(userId: string, id: string, patch: Partial<Omit<Project, 'id' | 'createdAt'>>): Promise<Project | null> {
    const current = await this.get(userId, id);
    if (!current) return null;
    const updated: Project = { ...current, ...patch, id, createdAt: current.createdAt, updatedAt: Date.now() };
    if (patch.name !== undefined) updated.name = patch.name.slice(0, 120);
    if (patch.goals !== undefined) updated.goals = patch.goals.slice(0, 20);
    await this.persist(userId, updated);
    return updated;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    try {
      await db.userPreference.deleteMany({
        where: { userId, key: keyFor(userId, id) },
      });
      return true;
    } catch (err) {
      projectsLogger.error('Failed to delete project', err);
      return false;
    }
  }

  async saveFile(userId: string, projectId: string, file: { name: string; path?: string; content: string }): Promise<Project | null> {
    const project = await this.get(userId, projectId);
    if (!project) return null;
    const now = Date.now();
    const path = file.path ?? file.name;
    const existing = project.files.find((f) => f.path === path);
    let files: ProjectFile[];
    if (existing) {
      files = project.files.map((f) => (f.path === path ? { ...f, content: file.content, updatedAt: now } : f));
    } else {
      files = [...project.files, { name: file.name.slice(0, 200), path, content: file.content, createdAt: now, updatedAt: now }];
    }
    return this.update(userId, projectId, { files: files.slice(-200) });
  }

  async addNote(userId: string, projectId: string, note: string): Promise<Project | null> {
    const project = await this.get(userId, projectId);
    if (!project) return null;
    const notes = [...project.notes, note.slice(0, 5000)];
    return this.update(userId, projectId, { notes: notes.slice(-500) });
  }

  /** Compact grounding fed to the Brain for a project. */
  projectContext(project: Project, limit = 4000): string {
    const goals = project.goals.length ? `Goals:\n${project.goals.map((g) => `- ${g}`).join('\n')}\n` : '';
    const files = project.files.slice(-10).map((f) => `### ${f.path}\n${f.content.slice(0, 1500)}`).join('\n\n');
    const notes = project.notes.slice(-5).map((n) => `- ${n}`).join('\n');
    const body = `${goals}\n${files}\n${notes}`.slice(0, limit);
    return body ? `[Project context]\n${body}` : '';
  }

  private async persist(userId: string, project: Project): Promise<void> {
    try {
      await db.userPreference.upsert({
        where: { userId_key: { userId, key: keyFor(userId, project.id) } },
        update: { value: JSON.stringify(project) },
        create: { userId, key: keyFor(userId, project.id), value: JSON.stringify(project) },
      });
    } catch (err) {
      projectsLogger.error('Failed to persist project', err);
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

export const projectStore = new ProjectStore();