import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Timestamp, collection, getFirestore } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import {
  DEFAULT_EXPIRATION_TIMEZONE,
  calendarDateToUtcEndOfDay,
  formatExpirationDate,
  getTodayCalendarDate,
  isNoteExpired,
  parseCalendarDate,
  timestampToCalendarDate,
  validateExpirationDateInput,
} from '../expiration';
import {
  buildOwnerNotesQuery,
  buildPublicActiveNotesQuery,
  canUserAccessNote,
  isNotePubliclyDiscoverable,
  partitionNotesForViewer,
} from '../notesQuery';
import { Note } from '../../types';
import { autoMapHeaders, parseCsv, validateAndPrepareNotes, type ImportDefaults } from '../csv';

const makeNote = (overrides: Partial<Note> = {}): Note => ({
  id: 'note-1',
  type: 'text',
  content: 'Test note',
  contentFormat: 'plain',
  location: { lat: -34.9011, lng: -56.1645 },
  authorId: 'owner-1',
  authorName: 'Owner',
  privacy: 'public',
  createdAt: Timestamp.fromMillis(Date.UTC(2026, 0, 1, 12, 0, 0)),
  moderationState: 'visible',
  ...overrides,
});

describe('Note expiration timezone & date utilities (America/Montevideo)', () => {
  it('converts calendar date to exact 23:59:59.999 UTC instant in America/Montevideo without off-by-one errors', () => {
    const endOfDay = calendarDateToUtcEndOfDay('2026-12-20', DEFAULT_EXPIRATION_TIMEZONE);
    expect(endOfDay).not.toBeNull();
    // America/Montevideo is UTC-3 -> 2026-12-20 23:59:59.999-03:00 === 2026-12-21T02:59:59.999Z
    expect(endOfDay!.toISOString()).toBe('2026-12-21T02:59:59.999Z');

    // Remains visible throughout December 20 in Montevideo (including 23:59:00-03:00 -> 02:59:00Z on Dec 21)
    const note = makeNote({ expiresAt: Timestamp.fromDate(endOfDay!) });
    expect(isNoteExpired(note, Date.parse('2026-12-21T02:59:00.000Z'))).toBe(false);

    // Expires right at 2026-12-21 00:00:00.000-03:00 (2026-12-21T03:00:00.000Z)
    expect(isNoteExpired(note, Date.parse('2026-12-21T03:00:00.000Z'))).toBe(true);

    // Round-trips back to '2026-12-20' calendar date in America/Montevideo
    expect(timestampToCalendarDate(note.expiresAt, DEFAULT_EXPIRATION_TIMEZONE)).toBe('2026-12-20');
  });

  it('rejects invalid calendar dates like Feb 30 or malformed strings', () => {
    expect(parseCalendarDate('2026-02-30')).toBeNull();
    expect(parseCalendarDate('2026-13-01')).toBeNull();
    expect(parseCalendarDate('20/12/2026')).toBeNull();
    expect(calendarDateToUtcEndOfDay('2026-02-30')).toBeNull();
  });

  it('validates future vs past/empty expiration dates consistently', () => {
    // Simulated now: 2026-12-20 15:00 UTC (12:00 Montevideo)
    const now = Date.parse('2026-12-20T15:00:00.000Z');
    expect(getTodayCalendarDate(now, DEFAULT_EXPIRATION_TIMEZONE)).toBe('2026-12-20');

    // Disabled -> valid & null
    expect(validateExpirationDateInput(false, '', now)).toEqual({
      valid: true,
      expiresAtDate: null,
      errorKey: null,
    });

    // Enabled + empty -> invalid
    expect(validateExpirationDateInput(true, '', now)).toEqual({
      valid: false,
      expiresAtDate: null,
      errorKey: 'creator.expiration_required',
    });

    // Enabled + yesterday (2026-12-19) -> past error
    expect(validateExpirationDateInput(true, '2026-12-19', now)).toEqual({
      valid: false,
      expiresAtDate: null,
      errorKey: 'creator.expiration_past',
    });

    // Enabled + today (2026-12-20) -> valid because end-of-day is 23:59:59.999 Montevideo (> 12:00)
    const sameDayResult = validateExpirationDateInput(true, '2026-12-20', now);
    expect(sameDayResult.valid).toBe(true);
    expect(sameDayResult.expiresAtDate?.toISOString()).toBe('2026-12-21T02:59:59.999Z');

    // Enabled + future date -> valid
    const futureResult = validateExpirationDateInput(true, '2026-12-25', now);
    expect(futureResult.valid).toBe(true);
    expect(futureResult.expiresAtDate?.toISOString()).toBe('2026-12-26T02:59:59.999Z');
  });

  it('handles exact expiration boundary and backward-compatible NULL/undefined expiration', () => {
    const boundaryMs = Date.parse('2026-12-21T02:59:59.999Z');
    const expiringNote = makeNote({ expiresAt: Timestamp.fromMillis(boundaryMs) });

    // 1ms before expiration -> visible
    expect(isNoteExpired(expiringNote, boundaryMs - 1)).toBe(false);
    // At exact boundary -> expired (matches expires_at > CURRENT_TIMESTAMP & data.expiresAt > request.time)
    expect(isNoteExpired(expiringNote, boundaryMs)).toBe(true);
    // 1ms after expiration -> expired
    expect(isNoteExpired(expiringNote, boundaryMs + 1)).toBe(true);

    // NULL and missing (legacy) never expire
    expect(isNoteExpired(makeNote({ expiresAt: null }), boundaryMs)).toBe(false);
    expect(isNoteExpired(makeNote({ expiresAt: undefined }), boundaryMs)).toBe(false);

    // Formats localized expiration date
    expect(formatExpirationDate(expiringNote.expiresAt, 'es-ES')).toBeTruthy();
  });
});

describe('Public query filtering, access control, and owner partitioning', () => {
  const now = Date.UTC(2026, 5, 15, 12, 0, 0);
  const futureTs = Timestamp.fromMillis(now + 86_400_000);
  const pastTs = Timestamp.fromMillis(now - 86_400_000);
  const exactBoundaryTs = Timestamp.fromMillis(now);

  it('builds real Firestore queries enforcing public expiration filtering and separate owner access', () => {
    const app = getApps()[0] || initializeApp({ projectId: 'demo-spotheon' });
    const db = getFirestore(app);
    expect(collection(db, 'notes').path).toBe('notes');

    const publicQuery = buildPublicActiveNotesQuery(db, now);
    const ownerQuery = buildOwnerNotesQuery(db, 'owner-1');

    // Verify query objects target notes collection and embed composite filter + ordering
    expect(publicQuery.type).toBe('query');
    expect(ownerQuery.type).toBe('query');
    const serializedPublic = JSON.stringify(publicQuery);
    expect(serializedPublic).toContain('expiresAt');
    expect(serializedPublic).toContain('privacy');
    const serializedOwner = JSON.stringify(ownerQuery);
    expect(serializedOwner).toContain('authorId');
    expect(serializedOwner).not.toContain('expiresAt');
  });

  it('excludes expired notes from public discovery while preserving NULL, future, and legacy notes', () => {
    const nullNote = makeNote({ id: 'n-null', expiresAt: null });
    const legacyNote = makeNote({ id: 'n-legacy', expiresAt: undefined });
    const futureNote = makeNote({ id: 'n-future', expiresAt: futureTs });
    const expiredNote = makeNote({ id: 'n-expired', expiresAt: pastTs });
    const boundaryNote = makeNote({ id: 'n-boundary', expiresAt: exactBoundaryTs });
    const privateNote = makeNote({ id: 'n-private', authorId: 'other-user', privacy: 'private', expiresAt: null });
    const unlistedNote = makeNote({ id: 'n-unlisted', authorId: 'other-user', privacy: 'unlisted', expiresAt: futureTs });
    const removedNote = makeNote({ id: 'n-removed', moderationState: 'removed', expiresAt: futureTs });
    const pendingNote = makeNote({ id: 'n-pending', moderationState: 'pending_review', expiresAt: null });

    expect(isNotePubliclyDiscoverable(nullNote, now)).toBe(true);
    expect(isNotePubliclyDiscoverable(legacyNote, now)).toBe(true);
    expect(isNotePubliclyDiscoverable(futureNote, now)).toBe(true);
    expect(isNotePubliclyDiscoverable(expiredNote, now)).toBe(false);
    expect(isNotePubliclyDiscoverable(boundaryNote, now)).toBe(false);
    expect(isNotePubliclyDiscoverable(privateNote, now)).toBe(false);
    expect(isNotePubliclyDiscoverable(unlistedNote, now)).toBe(false);
    expect(isNotePubliclyDiscoverable(removedNote, now)).toBe(false);
    expect(isNotePubliclyDiscoverable(pendingNote, now)).toBe(false);
  });

  it('enforces direct URL / QR access control while keeping owner access to expired notes', () => {
    const expiredPublic = makeNote({ id: 'exp-pub', authorId: 'owner-1', privacy: 'public', expiresAt: pastTs });
    const expiredUnlisted = makeNote({ id: 'exp-unl', authorId: 'owner-1', privacy: 'unlisted', expiresAt: pastTs });
    const activeUnlisted = makeNote({ id: 'act-unl', authorId: 'owner-1', privacy: 'unlisted', expiresAt: futureTs });
    const activePrivate = makeNote({ id: 'act-prv', authorId: 'owner-1', privacy: 'private', expiresAt: futureTs });
    const removedActive = makeNote({ id: 'rem-act', authorId: 'owner-1', privacy: 'public', moderationState: 'removed', expiresAt: futureTs });

    // Non-owner / anonymous blocked from expired, private, and moderated notes
    expect(canUserAccessNote(expiredPublic, null, now)).toBe(false);
    expect(canUserAccessNote(expiredPublic, 'viewer-2', now)).toBe(false);
    expect(canUserAccessNote(expiredUnlisted, 'viewer-2', now)).toBe(false);
    expect(canUserAccessNote(activePrivate, 'viewer-2', now)).toBe(false);
    expect(canUserAccessNote(removedActive, 'viewer-2', now)).toBe(false);

    // Non-owner CAN access active unlisted/public notes via direct link/QR
    expect(canUserAccessNote(activeUnlisted, 'viewer-2', now)).toBe(true);

    // Owner CAN access their own expired, private, unlisted, and moderated notes
    expect(canUserAccessNote(expiredPublic, 'owner-1', now)).toBe(true);
    expect(canUserAccessNote(expiredUnlisted, 'owner-1', now)).toBe(true);
    expect(canUserAccessNote(activePrivate, 'owner-1', now)).toBe(true);

    // Admin CAN access
    expect(canUserAccessNote(expiredPublic, 'admin-1', now, true)).toBe(true);
  });

  it('partitions notes so expired notes leave public map/nearby views while remaining in myNotes', () => {
    const publicActive = makeNote({ id: 'p-1', authorId: 'other', expiresAt: futureTs });
    const publicExpired = makeNote({ id: 'p-exp', authorId: 'other', expiresAt: pastTs });
    const ownerActivePrivate = makeNote({ id: 'o-priv', authorId: 'owner-1', privacy: 'private', expiresAt: null });
    const ownerExpiredPublic = makeNote({ id: 'o-exp', authorId: 'owner-1', privacy: 'public', expiresAt: pastTs });

    const { activeNotes, myNotes } = partitionNotesForViewer(
      [publicActive, publicExpired, ownerExpiredPublic],
      [ownerActivePrivate, ownerExpiredPublic],
      'owner-1',
      now
    );

    expect(activeNotes.map((n) => n.id)).toEqual(expect.arrayContaining(['p-1', 'o-priv']));
    expect(activeNotes.map((n) => n.id)).not.toContain('p-exp');
    expect(activeNotes.map((n) => n.id)).not.toContain('o-exp');

    expect(myNotes.map((n) => n.id)).toEqual(expect.arrayContaining(['o-priv', 'o-exp']));
    expect(myNotes.map((n) => n.id)).not.toContain('p-1');
  });

  it('supports optional expiresAt column in CSV import and defaults omitted expiration to null', () => {
    const defaults: ImportDefaults = {
      contentFormat: 'plain',
      type: 'text',
      privacy: 'public',
      color: '#0d9488',
      emoji: '📍',
      language: 'es-ES',
      authorName: 'Admin',
      maxContentLength: 2000,
      skipDuplicates: false,
      batchSize: 20,
    };

    const csv = [
      'id,content,lat,lng,visible_hasta',
      'exp_future,"Evento futuro",-34.90,-56.16,2099-12-20',
      'exp_past,"Evento pasado",-34.91,-56.17,2020-01-01',
      'exp_none,"Nota permanente",-34.92,-56.18,',
    ].join('\n');

    const parsed = parseCsv(csv);
    const mapping = autoMapHeaders(parsed.headers);
    expect(mapping.expiresAt).toBe('visible_hasta');

    const result = validateAndPrepareNotes(
      parsed.rows,
      parsed.headers,
      mapping,
      defaults,
      [],
      'admin-uid'
    );

    expect(result.rows[0].status).toBe('valid');
    expect(result.rows[0].payload?.expiresAt?.toDate().toISOString()).toBe('2099-12-21T02:59:59.999Z');
    expect(result.rows[1].status).toBe('error');
    expect(result.rows[1].errors[0]).toContain('debe ser una fecha futura');
    expect(result.rows[2].status).toBe('valid');
    expect(result.rows[2].payload?.expiresAt).toBeNull();
  });

  it('verifies Firestore security rules enforce server-side expiration checks on read, create, update, and comments', () => {
    const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    expect(rules).toContain('function isNotExpired(data)');
    expect(rules).toContain("!('expiresAt' in data) || data.expiresAt == null || data.expiresAt > request.time");
    expect(rules).toContain("!('expiresAt' in incoming()) || incoming().expiresAt == null || incoming().expiresAt > request.time");
    expect(rules).toContain('isNotExpired(existing())');
    expect(rules).toContain('isNotExpired(resource.data)');
    expect(rules).toContain('isNotExpired(note)');
  });
});
