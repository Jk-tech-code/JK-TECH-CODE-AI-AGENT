import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logging/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/lib/db', () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { syncUser } from '../src/lib/auth/sync';
import { db } from '@/lib/db';

describe('auth/sync', () => {
  const mockUser = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: 'test@example.com',
    user_metadata: { name: 'Test User' },
  };

  it('creates a new user profile if not existing', async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue(null);
    vi.mocked(db.user.create).mockResolvedValue({
      id: mockUser.id,
      email: mockUser.email!,
      name: 'Test User',
      avatarUrl: null,
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await syncUser(mockUser as any);
    expect(result.email).toBe('test@example.com');
    expect(db.user.create).toHaveBeenCalledWith({
      data: {
        id: mockUser.id,
        email: 'test@example.com',
        name: 'Test User',
        avatarUrl: null,
      },
    });
  });

  it('updates existing user profile', async () => {
    const existing = {
      id: mockUser.id,
      email: 'old@example.com',
      name: 'Old Name',
      avatarUrl: null,
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(db.user.findUnique).mockResolvedValue(existing);
    vi.mocked(db.user.update).mockResolvedValue({
      ...existing,
      email: 'test@example.com',
      name: 'Test User',
    });

    const result = await syncUser(mockUser as any);
    expect(result.email).toBe('test@example.com');
    expect(db.user.update).toHaveBeenCalled();
  });

  it('handles missing email gracefully', async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue(null);
    vi.mocked(db.user.create).mockResolvedValue({
      id: mockUser.id,
      email: 'unknown@email.com',
      name: null,
      avatarUrl: null,
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await syncUser({ id: mockUser.id, email: null, user_metadata: {} } as any);
    expect(result.email).toBe('unknown@email.com');
  });
});
