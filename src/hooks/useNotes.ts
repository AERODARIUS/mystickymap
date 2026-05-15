import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { collection, query, or, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Note } from '../types';

export const useNotes = (user: User | null, isAuthReady: boolean) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthReady) return;

    let q;
    if (user) {
      q = query(
        collection(db, 'notes'), 
        or(
          where('privacy', '==', 'public'), 
          where('authorId', '==', user.uid)
        ),
        orderBy('createdAt', 'desc')
      );
    } else {
      q = query(
        collection(db, 'notes'), 
        where('privacy', '==', 'public'),
        orderBy('createdAt', 'desc')
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const seenIds = new Set<string>();
      const newNotes = snapshot.docs
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
          } as Note;
        })
        .filter(note => {
          if (seenIds.has(note.id)) return false;
          seenIds.add(note.id);
          
          // Filter out removed or pending review notes
          // Allow author to see their own notes even if pending
          const isHidden = note.moderationState === 'removed' || (note.moderationState === 'pending_review' && note.authorId !== user?.uid);
          if (isHidden) return false;

          return true;
        });
      setNotes(newNotes);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notes');
      setLoading(false);
    });

    return unsubscribe;
  }, [isAuthReady, user]);

  return { notes, loading };
};
