/**
 * Autonomy Collaboration (Phase 7).
 *
 * Enables sharing a project with other users, each with a role
 * ('owner' | 'editor' | 'viewer' | 'commenter'). Membership and role are
 * persisted in UserPreference keyed to the project. Comments and assignment
 * are tracked on the project record itself (comments array + task assignment).
 *
 * Sharing requires the collaborator's user id — the owner invites them via
 * email/username lookup at the route layer.
 */
import { createLogger } from '@/lib/logging/logger';
import { db } from '@/lib/db';

const apiLogger = createLogger('autonomy:collab');

const MEMBER_PREFIX = 'autonomy:collab:member';
const INVITE_PREFIX = 'autonomy:collab:invite';

export type ProjectRole = 'owner' | 'editor' | 'viewer' | 'commenter';

export interface ProjectMember {
  userId: string;
  role: ProjectRole;
  addedAt: number;
}

export interface ProjectComment {
  id: string;
  projectId: string;
  authorId: string;
  text: string;
  createdAt: number;
}

export class CollaborationStore {
  /* ── Membership ── */

  async memberKey(userId: string, projectId: string): Promise<string> {
    return `${MEMBER_PREFIX}:${projectId}:${userId}`;
  }

  /** Add a collaborator to a project (owner grants). */
  async share(userId: string, projectId: string, collaboratorId: string, role: ProjectRole = 'viewer'): Promise<ProjectMember | null> {
    // Owner must exist on the project.
    const ownerRow = await db.userPreference.findUnique({
      where: { userId_key: { userId, key: `${MEMBER_PREFIX}:${projectId}:${userId}` } },
    });
    if (!ownerRow) {
      // If the sharer isn't already a member, they become owner.
      const owner: ProjectMember = { userId, role: 'owner', addedAt: Date.now() };
      await this.persistMember(userId, projectId, owner);
    }
    const member: ProjectMember = { userId: collaboratorId, role, addedAt: Date.now() };
    await this.persistMember(userId, projectId, member);
    return member;
  }

  /** Remove a collaborator (owner only). */
  async unshare(ownerId: string, projectId: string, collaboratorId: string): Promise<boolean> {
    const owner = await this.getMember(ownerId, projectId);
    if (owner?.role !== 'owner') return false;
    try {
      await db.userPreference.deleteMany({
        where: { userId: collaboratorId, key: `${MEMBER_PREFIX}:${projectId}:${collaboratorId}` },
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Effective role of a user on a project. */
  async getMember(userId: string, projectId: string): Promise<ProjectMember | null> {
    try {
      const row = await db.userPreference.findUnique({
        where: { userId_key: { userId, key: `${MEMBER_PREFIX}:${projectId}:${userId}` } },
      });
      return row ? (JSON.parse(row.value) as ProjectMember) : null;
    } catch {
      return null;
    }
  }

  async members(projectId: string): Promise<ProjectMember[]> {
    try {
      const rows = await db.userPreference.findMany({
        where: { key: { startsWith: `${MEMBER_PREFIX}:${projectId}:` } },
      });
      return rows.map((r) => {
        try {
          return JSON.parse(r.value) as ProjectMember;
        } catch {
          return null;
        }
      }).filter((m): m is ProjectMember => !!m);
    } catch {
      return [];
    }
  }

  /** Require at least the given role. Returns boolean. */
  async can(actorId: string, projectId: string, minRole: ProjectRole): Promise<boolean> {
    const member = await this.getMember(actorId, projectId);
    if (!member) return false;
    const rank: Record<ProjectRole, number> = { viewer: 1, commenter: 1, editor: 2, owner: 3 };
    return rank[member.role] >= rank[minRole];
  }

  /* ── Invites (by email) ── */

  async createInvite(ownerId: string, projectId: string, email: string, role: ProjectRole): Promise<boolean> {
    try {
      await db.userPreference.upsert({
        where: { userId_key: { userId: ownerId, key: `${INVITE_PREFIX}:${projectId}:${email.toLowerCase()}` } },
        update: { value: JSON.stringify({ projectId, email: email.toLowerCase(), role, invitedBy: ownerId, createdAt: Date.now() }) },
        create: { userId: ownerId, key: `${INVITE_PREFIX}:${projectId}:${email.toLowerCase()}`, value: JSON.stringify({ projectId, email: email.toLowerCase(), role, invitedBy: ownerId, createdAt: Date.now() }) },
      });
      return true;
    } catch {
      return false;
    }
  }

  /* ── Comments ── */

  async addComment(projectId: string, authorId: string, text: string): Promise<ProjectComment> {
    const comment: ProjectComment = {
      id: crypto.randomUUID(),
      projectId,
      authorId,
      text: text.slice(0, 2000),
      createdAt: Date.now(),
    };
    try {
      await db.userPreference.upsert({
        where: { userId_key: { userId: authorId, key: `${INVITE_PREFIX}:comment:${projectId}:${comment.id}` } },
        update: { value: JSON.stringify(comment) },
        create: { userId: authorId, key: `${INVITE_PREFIX}:comment:${projectId}:${comment.id}`, value: JSON.stringify(comment) },
      });
    } catch (err) {
      apiLogger.warn('Failed to persist comment', { error: err instanceof Error ? err.message : String(err) });
    }
    return comment;
  }

  async comments(projectId: string): Promise<ProjectComment[]> {
    try {
      const rows = await db.userPreference.findMany({
        where: { key: { startsWith: `${INVITE_PREFIX}:comment:${projectId}:` } },
        orderBy: { updatedAt: 'asc' },
      });
      return rows.map((r) => {
        try {
          return JSON.parse(r.value) as ProjectComment;
        } catch {
          return null;
        }
      }).filter((c): c is ProjectComment => !!c);
    } catch {
      return [];
    }
  }

  /* ── helpers ── */

  private async persistMember(userId: string, projectId: string, member: ProjectMember): Promise<void> {
    try {
      await db.userPreference.upsert({
        where: { userId_key: { userId, key: `${MEMBER_PREFIX}:${projectId}:${userId}` } },
        update: { value: JSON.stringify(member) },
        create: { userId, key: `${MEMBER_PREFIX}:${projectId}:${userId}`, value: JSON.stringify(member) },
      });
    } catch (err) {
      apiLogger.error('Failed to persist member', err);
    }
  }
}

export const collaborationStore = new CollaborationStore();