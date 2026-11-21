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

const QUERY_CLOCK_SKEW_BUFFER_MS = 5_000;
const QUERY_FALLBACK_SKEW_BUFFER_MS = 120_000;

export const useNotes = (user: User | null, isAuthReady: boolean) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [myNotes, setMyNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [queryAnchorMs, setQueryAnchorMs] = useState(() => Date.now() + QUERY_CLOCK_SKEW_BUFFER_MS);

  const publicDocsRef = useRef<Note[]>([]);
  const ownerDocsRef = useRef<Note[]>([]);
  const clockSkewRetryRef = useRef(false);

  const recomputePartition = useCallback(
    (evalMs: number = Date.now()) => {
      const { activeNotes, myNotes: nextMyNotes } = partitionNotesForViewer(
        publicDocsRef.current,
        ownerDocsRef.current,
        user?.uid,
        evalMs
      );
      setNotes(activeNotes);
      setMyNotes(nextMyNotes);
    },
    [user?.uid]
  );

  const refresh = useCallback(() => {
    const nowMs = Date.now();
    clockSkewRetryRef.current = false;
    recomputePartition(nowMs);
    setQueryAnchorMs(nowMs + QUERY_CLOCK_SKEW_BUFFER_MS);
  }, [recomputePartition]);

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

    let publicLoaded = false;
    let ownerLoaded = !user;

    const finishIfReady = () => {
      if (publicLoaded && ownerLoaded) {
        setLoading(false);
      }
    };

    const publicQuery = buildPublicActiveNotesQuery(db, queryAnchorMs);
    const unsubscribePublic = onSnapshot(
      publicQuery,
      (snapshot) => {
        publicDocsRef.current = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as Note[];
        publicLoaded = true;
        recomputePartition(Date.now());
        finishIfReady();
      },
      (error) => {
        // If the device clock is slightly behind Firestore's request.time, retry once aligned with a small forward skew
        const code = (error as { code?: string })?.code;
        if (code === 'permission-denied' && !clockSkewRetryRef.current) {
          clockSkewRetryRef.current = true;
          setQueryAnchorMs(Date.now() + QUERY_FALLBACK_SKEW_BUFFER_MS);
          return;
        }
        handleFirestoreError(error, OperationType.LIST, 'notes');
        publicLoaded = true;
        finishIfReady();
      }
    );

    let unsubscribeOwner: (() => void) | undefined;
    if (user) {
      const ownerQuery = buildOwnerNotesQuery(db, user.uid);
      unsubscribeOwner = onSnapshot(
        ownerQuery,
        (snapshot) => {
          ownerDocsRef.current = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          })) as Note[];
          ownerLoaded = true;
          recomputePartition(Date.now());
          finishIfReady();
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, 'notes');
          ownerLoaded = true;
          finishIfReady();
        }
      );
    } else {
      ownerDocsRef.current = [];
      recomputePartition(Date.now());
      finishIfReady();
    }

    return () => {
      unsubscribePublic();
      if (unsubscribeOwner) unsubscribeOwner();
    };
  }, [isAuthReady, user, queryAnchorMs, recomputePartition]);

  return { notes, myNotes, loading, refresh };
};
