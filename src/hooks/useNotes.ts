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
        or(where('isPrivate', '==', false), where('authorId', '==', user.uid)),
        orderBy('createdAt', 'desc')
      );
    } else {
      q = query(
        collection(db, 'notes'), 
        where('isPrivate', '==', false),
        orderBy('createdAt', 'desc')
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newNotes = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Note[];
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
