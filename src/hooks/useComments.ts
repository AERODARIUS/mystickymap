import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Comment } from '../types';

export const useComments = (noteId: string | null, user: User | null) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [prevNoteId, setPrevNoteId] = useState<string | null>(null);

  // Synchronously adjust state when noteId changes to avoid useEffect loading flicker/race conditions
  if (noteId !== prevNoteId) {
    setPrevNoteId(noteId);
    setLoading(!!noteId);
    setComments([]);
  }

  useEffect(() => {
    if (!noteId) return;

    const q = query(
      collection(db, 'notes', noteId, 'comments'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newComments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Comment));
      setComments(newComments);
      setLoading(false);
    }, (error) => {
      console.warn('Comments fetch error:', error);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [noteId]);

  const addComment = async (content: string) => {
    if (!user || !noteId) return;

    try {
      await addDoc(collection(db, 'notes', noteId, 'comments'), {
        content: content.trim(),
        authorId: user.uid,
        authorName: user.displayName || 'Anonymous',
        noteId,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `notes/${noteId}/comments`);
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!noteId) return;
    try {
      await deleteDoc(doc(db, 'notes', noteId, 'comments', commentId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `notes/${noteId}/comments/${commentId}`);
    }
  };

  return { comments, loading, addComment, deleteComment };
};
