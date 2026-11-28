import { useState, useEffect, useCallback, useRef } from 'react';
import { User } from 'firebase/auth';
import { onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Note } from '../types';
import {
  buildOwnerNotesQuery,
  buildPublicActiveNotesQuery,
  partitionNotesForViewer,
} from '../lib/notesQuery';

const QUERY_CLOCK_SKEW_BUFFER_MS = 30_000;
const SKEW_FALLBACK_STEPS_MS = [120_000, 900_000, 3_600_000, 86_400_000] as const;
const HEALTH_ENDPOINT = '/api/health';

function isPermissionDeniedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  if (code === 'permission-denied') return true;
  const message = (error as { message?: unknown }).message;
  return (
    typeof message === 'string' &&
    (message.includes('permission-denied') || message.includes('Missing or insufficient permissions'))
  );
}

async function fetchServerTimeMs(): Promise<number | null> {
  if (typeof fetch !== 'function') return null;
  try {
    const response = await fetch(HEALTH_ENDPOINT, { cache: 'no-store' });
    try {
      const data = (await response.json()) as { serverTimeMs?: unknown };
      if (typeof data?.serverTimeMs === 'number' && Number.isFinite(data.serverTimeMs)) {
        return data.serverTimeMs;
      }
    } catch {
      // Fallback to HTTP Date header when JSON is absent or unparseable
    }

    const dateHeader = response.headers?.get?.('date');
    if (dateHeader) {
      const parsed = Date.parse(dateHeader);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function reportFirestoreListError(error: unknown) {
  try {
    handleFirestoreError(error, OperationType.LIST, 'notes');
  } catch {
    // handleFirestoreError already logs to logger/console and throws;
    // catch here so async Firestore onSnapshot callbacks never trigger an Unhandled Promise Rejection.
  }
}

interface SkewRetryState {
  userId: string | null;
  serverSynced: boolean;
  attempt: number;
  minAnchorMs: number;
}

export const useNotes = (user: User | null, isAuthReady: boolean) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [myNotes, setMyNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [queryCycle, setQueryCycle] = useState(0);

  const userId = user?.uid ?? null;
  const publicDocsRef = useRef<Note[]>([]);
  const ownerDocsRef = useRef<Note[]>([]);
  const clockOffsetMsRef = useRef(0);
  const skewStateRef = useRef<SkewRetryState>({
    userId: null,
    serverSynced: false,
    attempt: 0,
    minAnchorMs: 0,
  });

  const getAlignedNowMs = useCallback(() => Date.now() + clockOffsetMsRef.current, []);

  const syncServerClock = useCallback(async () => {
    const serverTimeMs = await fetchServerTimeMs();
    if (serverTimeMs !== null) {
      clockOffsetMsRef.current = serverTimeMs - Date.now();
    }
    return serverTimeMs;
  }, []);

  const recomputePartition = useCallback(
    (evalMs: number = getAlignedNowMs()) => {
      const { activeNotes, myNotes: nextMyNotes } = partitionNotesForViewer(
        publicDocsRef.current,
        ownerDocsRef.current,
        userId,
        evalMs
      );
      setNotes(activeNotes);
      setMyNotes(nextMyNotes);
    },
    [userId, getAlignedNowMs]
  );

  const refresh = useCallback(() => {
    skewStateRef.current = {
      userId,
      serverSynced: false,
      attempt: 0,
      minAnchorMs: 0,
    };
    recomputePartition(getAlignedNowMs());
    setQueryCycle((c) => c + 1);
    void syncServerClock();
  }, [userId, recomputePartition, getAlignedNowMs, syncServerClock]);

  // Pre-align clock offset with authoritative server UTC time on mount
  useEffect(() => {
    void syncServerClock();
  }, [syncServerClock]);

  // Re-evaluate expiration and refresh backend query when user returns to an open tab
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refresh]);

  useEffect(() => {
    if (!isAuthReady) return;

    let isActive = true;
    let retryingPublic = false;
    let publicLoaded = false;
    let ownerLoaded = !userId;

    if (skewStateRef.current.userId !== userId) {
      skewStateRef.current = {
        userId,
        serverSynced: false,
        attempt: 0,
        minAnchorMs: 0,
      };
    }

    const finishIfReady = () => {
      if (isActive && publicLoaded && ownerLoaded) {
        setLoading(false);
      }
    };

    const anchorMs = Math.max(
      skewStateRef.current.minAnchorMs,
      getAlignedNowMs() + QUERY_CLOCK_SKEW_BUFFER_MS
    );

    const handlePublicError = async (error: unknown) => {
      try {
        if (!isActive) return;

        if (isPermissionDeniedError(error) && !retryingPublic) {
          const skewState = skewStateRef.current;

          if (!skewState.serverSynced) {
            retryingPublic = true;
            skewState.serverSynced = true;
            const serverTimeMs = await syncServerClock();
            if (!isActive) return;

            if (serverTimeMs !== null) {
              skewState.minAnchorMs = Math.max(
                anchorMs + 1,
                serverTimeMs + QUERY_CLOCK_SKEW_BUFFER_MS
              );
              setQueryCycle((c) => c + 1);
              return;
            }
          }

          if (skewState.attempt < SKEW_FALLBACK_STEPS_MS.length) {
            retryingPublic = true;
            const stepMs = SKEW_FALLBACK_STEPS_MS[skewState.attempt];
            skewState.attempt += 1;
            skewState.minAnchorMs = Math.max(
              anchorMs + 1,
              skewState.minAnchorMs + 1,
              getAlignedNowMs() + stepMs,
              Date.now() + stepMs
            );
            setQueryCycle((c) => c + 1);
            return;
          }
        }

        reportFirestoreListError(error);
        publicLoaded = true;
        finishIfReady();
      } catch (unexpected) {
        reportFirestoreListError(unexpected);
        publicLoaded = true;
        finishIfReady();
      }
    };

    const publicQuery = buildPublicActiveNotesQuery(db, anchorMs);
    const unsubscribePublic = onSnapshot(
      publicQuery,
      (snapshot) => {
        if (!isActive) return;
        skewStateRef.current.attempt = 0;
        skewStateRef.current.serverSynced = false;
        skewStateRef.current.minAnchorMs = 0;

        publicDocsRef.current = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as Note[];
        publicLoaded = true;
        recomputePartition(getAlignedNowMs());
        finishIfReady();
      },
      (error) => {
        void handlePublicError(error);
      }
    );

    let unsubscribeOwner: (() => void) | undefined;
    if (userId) {
      const ownerQuery = buildOwnerNotesQuery(db, userId);
      unsubscribeOwner = onSnapshot(
        ownerQuery,
        (snapshot) => {
          if (!isActive) return;
          ownerDocsRef.current = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          })) as Note[];
          ownerLoaded = true;
          recomputePartition(getAlignedNowMs());
          finishIfReady();
        },
        (error) => {
          if (!isActive) return;
          reportFirestoreListError(error);
          ownerLoaded = true;
          finishIfReady();
        }
      );
    } else {
      ownerDocsRef.current = [];
      recomputePartition(getAlignedNowMs());
      finishIfReady();
    }

    return () => {
      isActive = false;
      unsubscribePublic();
      if (unsubscribeOwner) unsubscribeOwner();
    };
  }, [isAuthReady, userId, queryCycle, recomputePartition, getAlignedNowMs, syncServerClock]);

  return { notes, myNotes, loading, refresh };
};
