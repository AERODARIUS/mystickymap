import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { User } from 'firebase/auth';
import { useNotes } from '../useNotes';
import { Note } from '../../types';

const mockOnSnapshot = vi.fn();
const mockBuildPublicActiveNotesQuery = vi.fn();
const mockBuildOwnerNotesQuery = vi.fn();
const mockHandleFirestoreError = vi.fn();

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
  };
});

vi.mock('../../firebase', () => ({
  db: { __mockDb: true },
  OperationType: {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',
    GET: 'get',
    WRITE: 'write',
  },
  handleFirestoreError: (...args: unknown[]) => mockHandleFirestoreError(...args),
}));

vi.mock('../../lib/notesQuery', async () => {
  const actual = await vi.importActual<typeof import('../../lib/notesQuery')>('../../lib/notesQuery');
  return {
    ...actual,
    buildPublicActiveNotesQuery: (...args: unknown[]) => mockBuildPublicActiveNotesQuery(...args),
    buildOwnerNotesQuery: (...args: unknown[]) => mockBuildOwnerNotesQuery(...args),
  };
});

interface RegisteredListener {
  kind: 'public' | 'owner';
  anchorMs?: number;
  uid?: string;
  onNext: (snapshot: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => void;
  onError: (error: unknown) => void;
  unsubscribed: boolean;
}

function makeNoteDoc(id: string, overrides: Partial<Note> = {}) {
  return {
    id,
    data: () => ({
      content: `Note ${id}`,
      lat: 40.7,
      lng: -74.0,
      type: 'text',
      privacy: 'public',
      color: '#FEF3C7',
      authorId: 'author-1',
      authorName: 'Author',
      moderationState: 'visible',
      expiresAt: null,
      createdAt: { toMillis: () => 1_700_000_000_000 },
      ...overrides,
    }),
  };
}

describe('useNotes', () => {
  let listeners: RegisteredListener[];
  let unhandledRejections: unknown[];
  const rejectionListener = (reason: unknown) => {
    unhandledRejections.push(reason);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    listeners = [];
    unhandledRejections = [];
    process.on('unhandledRejection', rejectionListener);

    mockBuildPublicActiveNotesQuery.mockImplementation((_db: unknown, nowMs: number) => ({
      kind: 'public' as const,
      anchorMs: nowMs,
    }));

    mockBuildOwnerNotesQuery.mockImplementation((_db: unknown, uid: string) => ({
      kind: 'owner' as const,
      uid,
    }));

    mockOnSnapshot.mockImplementation(
      (
        q: { kind: 'public' | 'owner'; anchorMs?: number; uid?: string },
        onNext: RegisteredListener['onNext'],
        onError: RegisteredListener['onError']
      ) => {
        const entry: RegisteredListener = {
          kind: q.kind,
          anchorMs: q.anchorMs,
          uid: q.uid,
          onNext,
          onError,
          unsubscribed: false,
        };
        listeners.push(entry);
        return () => {
          entry.unsubscribed = true;
        };
      }
    );

    // Mirror production handleFirestoreError behavior (logs and throws)
    mockHandleFirestoreError.mockImplementation((error: unknown, operationType: string, path: string | null) => {
      throw new Error(JSON.stringify({ error: String(error), operationType, path }));
    });
  });

  afterEach(() => {
    process.off('unhandledRejection', rejectionListener);
    vi.restoreAllMocks();
    cleanup();
  });

  it('syncs with /api/health serverTimeMs on permission-denied and recovers without unhandled rejections', async () => {
    const clientNowMs = 1_700_000_000_000;
    const serverNowMs = clientNowMs + 3_600_000; // Client clock is 1 hour behind server
    vi.spyOn(Date, 'now').mockReturnValue(clientNowMs);

    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('boot race')).mockResolvedValue({
      json: async () => ({ status: 'ok', serverTimeMs: serverNowMs }),
      headers: { get: () => null },
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useNotes(null, true));

    expect(listeners).toHaveLength(1);
    expect(listeners[0].anchorMs).toBe(clientNowMs + 30_000);

    // Simulate Firestore rejecting due to client clock lagging behind request.time
    await act(async () => {
      listeners[0].onError({ code: 'permission-denied', message: 'Missing or insufficient permissions.' });
    });

    await waitFor(() => {
      expect(listeners).toHaveLength(2);
    });

    expect(listeners[0].unsubscribed).toBe(true);
    expect(listeners[1].anchorMs).toBeGreaterThanOrEqual(serverNowMs + 30_000);
    expect(mockHandleFirestoreError).not.toHaveBeenCalled();

    // Retry succeeds with synchronized server timestamp
    act(() => {
      listeners[1].onNext({ docs: [makeNoteDoc('n1')] });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.notes.map((n) => n.id)).toEqual(['n1']);
    expect(unhandledRejections).toHaveLength(0);
  });

  it('escalates skew buffer when /api/health is unavailable and resets retry state after snapshot success', async () => {
    const clientNowMs = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(clientNowMs);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const { result } = renderHook(() => useNotes(null, true));

    expect(listeners).toHaveLength(1);

    // First failure -> falls back to first escalation step (+120s)
    await act(async () => {
      listeners[0].onError({ code: 'permission-denied', message: 'Missing or insufficient permissions.' });
    });

    await waitFor(() => {
      expect(listeners).toHaveLength(2);
    });
    expect(listeners[1].anchorMs).toBe(clientNowMs + 120_000);

    // Second failure -> escalates to +900s
    await act(async () => {
      listeners[1].onError({ code: 'permission-denied', message: 'Missing or insufficient permissions.' });
    });

    await waitFor(() => {
      expect(listeners).toHaveLength(3);
    });
    expect(listeners[2].anchorMs).toBe(clientNowMs + 900_000);

    // Snapshot succeeds -> resets retry budget
    act(() => {
      listeners[2].onNext({ docs: [makeNoteDoc('n2')] });
    });

    expect(result.current.notes.map((n) => n.id)).toEqual(['n2']);

    // Manual refresh starts with clean baseline buffer again
    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(listeners).toHaveLength(4);
    });
    expect(listeners[3].anchorMs).toBe(clientNowMs + 30_000);
    expect(unhandledRejections).toHaveLength(0);
  });

  it('reports error safely without unhandled promise rejection when retries are exhausted', async () => {
    const clientNowMs = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(clientNowMs);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ status: 'ok', serverTimeMs: clientNowMs }),
        headers: { get: () => null },
      })
    );

    const { result } = renderHook(() => useNotes(null, true));

    // Exhaust 1 server sync + 4 skew fallback steps (total 5 retries -> 6th listener fails permanently)
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        listeners[i].onError({
          code: 'permission-denied',
          message: 'Missing or insufficient permissions.',
        });
      });
      if (i < 5) {
        await waitFor(() => {
          expect(listeners).toHaveLength(i + 2);
        });
      }
    }

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockHandleFirestoreError).toHaveBeenCalledTimes(1);
    expect(unhandledRejections).toHaveLength(0);
  });

  it('handles non-permission errors and owner listener errors without unhandled promise rejections', async () => {
    const clientNowMs = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(clientNowMs);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ status: 'ok', serverTimeMs: clientNowMs }),
        headers: { get: () => null },
      })
    );

    const fakeUser = { uid: 'user-123' } as User;
    const { result } = renderHook(() => useNotes(fakeUser, true));

    const publicListener = listeners.find((l) => l.kind === 'public')!;
    const ownerListener = listeners.find((l) => l.kind === 'owner')!;

    await act(async () => {
      publicListener.onError({ code: 'unavailable', message: 'Service temporarily unavailable' });
      ownerListener.onError({ code: 'permission-denied', message: 'Missing or insufficient permissions.' });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockHandleFirestoreError).toHaveBeenCalledTimes(2);
    expect(unhandledRejections).toHaveLength(0);
  });

  it('refreshes the public query anchor across auth state transitions even after time elapses', async () => {
    let nowMs = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const { rerender } = renderHook(
      ({ user, isAuthReady }: { user: User | null; isAuthReady: boolean }) => useNotes(user, isAuthReady),
      { initialProps: { user: null as User | null, isAuthReady: false } }
    );

    // No query started while auth is not ready
    expect(listeners).toHaveLength(0);

    // 45 seconds later auth resolves as signed out
    nowMs += 45_000;
    rerender({ user: null, isAuthReady: true });

    expect(listeners).toHaveLength(1);
    expect(listeners[0].anchorMs).toBe(nowMs + 30_000);

    // 2 minutes later user signs in
    nowMs += 120_000;
    rerender({ user: { uid: 'user-abc' } as User, isAuthReady: true });

    const latestPublic = [...listeners].reverse().find((l) => l.kind === 'public');
    expect(latestPublic?.anchorMs).toBe(nowMs + 30_000);
    expect(unhandledRejections).toHaveLength(0);
  });
});
