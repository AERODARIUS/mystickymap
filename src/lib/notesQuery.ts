import {
  and,
  collection,
  DocumentData,
  Firestore,
  or,
  orderBy,
  query,
  Query,
  Timestamp,
  where,
} from 'firebase/firestore';
import { Note } from '../types';
import { isNoteExpired } from './expiration';

/**
 * Shared public query abstraction excluding expired notes at the Firestore data-access layer.
 * Conceptually equivalent to:
 *   WHERE privacy = 'public' AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
 */
export function buildPublicActiveNotesQuery(
  firestore: Firestore,
  now: number | Date = Date.now()
): Query<DocumentData> {
  const nowMs = now instanceof Date ? now.getTime() : now;
  const nowTs = Timestamp.fromMillis(nowMs);

  return query(
    collection(firestore, 'notes'),
    and(
      where('privacy', '==', 'public'),
      or(where('expiresAt', '==', null), where('expiresAt', '>', nowTs))
    ),
    orderBy('createdAt', 'desc')
  );
}

/**
 * Shared owner-management query abstraction returning all notes authored by `ownerUid`,
 * including expired, unlisted, and private notes so the owner can view, edit, and renew them.
 */
export function buildOwnerNotesQuery(
  firestore: Firestore,
  ownerUid: string
): Query<DocumentData> {
  return query(
    collection(firestore, 'notes'),
    where('authorId', '==', ownerUid),
    orderBy('createdAt', 'desc')
  );
}

/**
 * Returns true when a note is eligible for public discovery surfaces (Map, AR, public Nearby).
 */
export function isNotePubliclyDiscoverable(
  note: Note,
  now: number | Date = Date.now()
): boolean {
  if (note.privacy !== 'public') return false;
  if (note.moderationState === 'removed' || note.moderationState === 'pending_review') {
    return false;
  }
  return !isNoteExpired(note, now);
}

/**
 * Access check for direct note retrieval (e.g., ?noteId= URLs and QR scans).
 * Owners and admins retain access to their expired, private, and moderated notes;
 * all other viewers are blocked from private, moderated, or expired notes.
 */
export function canUserAccessNote(
  note: Note,
  viewerUid?: string | null,
  now: number | Date = Date.now(),
  isAdmin: boolean = false
): boolean {
  if (isAdmin) return true;
  if (viewerUid && note.authorId === viewerUid) return true;

  if (note.privacy !== 'public' && note.privacy !== 'unlisted') {
    return false;
  }
  if (note.moderationState === 'removed' || note.moderationState === 'pending_review') {
    return false;
  }
  return !isNoteExpired(note, now);
}

function getCreatedAtMillis(note: Note): number {
  const ts = note.createdAt as unknown;
  if (!ts || typeof ts !== 'object') return 0;
  if ('toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  if ('seconds' in ts && typeof (ts as { seconds: number }).seconds === 'number') {
    return (ts as { seconds: number }).seconds * 1000;
  }
  return 0;
}

/**
 * Merges public active query results and owner management query results into:
 * - `activeNotes`: active discovery notes (public active + owner's non-expired notes), excluding all expired notes
 * - `myNotes`: all notes authored by `viewerUid` (active + expired + private + unlisted) for owner management
 */
export function partitionNotesForViewer(
  publicDocs: Note[],
  ownerDocs: Note[],
  viewerUid?: string | null,
  now: number | Date = Date.now()
): { activeNotes: Note[]; myNotes: Note[] } {
  const activeMap = new Map<string, Note>();
  const myNotesMap = new Map<string, Note>();

  for (const note of publicDocs) {
    if (isNotePubliclyDiscoverable(note, now)) {
      activeMap.set(note.id, note);
    }
  }

  if (viewerUid) {
    for (const note of ownerDocs) {
      if (note.authorId !== viewerUid) continue;
      myNotesMap.set(note.id, note);

      // Owner's non-expired notes stay visible on their own map/nearby views
      // (including private/unlisted), while expired notes are excluded from public views.
      if (!isNoteExpired(note, now)) {
        activeMap.set(note.id, note);
      } else {
        activeMap.delete(note.id);
      }
    }
  }

  const byCreatedDesc = (a: Note, b: Note) => getCreatedAtMillis(b) - getCreatedAtMillis(a);

  return {
    activeNotes: Array.from(activeMap.values()).sort(byCreatedDesc),
    myNotes: Array.from(myNotesMap.values()).sort(byCreatedDesc),
  };
}
