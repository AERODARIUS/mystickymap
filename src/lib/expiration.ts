import { Note } from '../types';

export const DEFAULT_EXPIRATION_TIMEZONE = 'America/Montevideo';

export interface CalendarDateParts {
  year: number;
  month: number;
  day: number;
}

export interface ExpirationValidationResult {
  valid: boolean;
  expiresAtDate: Date | null;
  errorKey: 'creator.expiration_required' | 'creator.expiration_invalid' | 'creator.expiration_past' | null;
}

type ExpirationInput =
  | Note['expiresAt']
  | Date
  | string
  | number
  | { seconds: number; nanoseconds?: number }
  | { toDate: () => Date }
  | null
  | undefined;

/**
 * Parses a strict YYYY-MM-DD calendar date string without relying on
 * browser-dependent `new Date("YYYY-MM-DD")` behavior.
 */
export function parseCalendarDate(dateStr: string): CalendarDateParts | null {
  if (typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(check.getTime()) ||
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function getWallClockUtcMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = Number(part.value);
    }
  }

  return Date.UTC(map.year, map.month - 1, map.day, map.hour, map.minute, map.second, 0);
}

/**
 * Converts a YYYY-MM-DD calendar date into the exact UTC instant corresponding
 * to 23:59:59.999 at the end of that day in `timeZone` (default: America/Montevideo).
 */
export function calendarDateToUtcEndOfDay(
  dateStr: string,
  timeZone: string = DEFAULT_EXPIRATION_TIMEZONE
): Date | null {
  const parsed = parseCalendarDate(dateStr);
  if (!parsed) return null;

  const targetWallClockMs = Date.UTC(parsed.year, parsed.month - 1, parsed.day, 23, 59, 59, 0);

  // Iteratively resolve timezone offset (handles DST transitions accurately)
  let guessMs = targetWallClockMs;
  for (let i = 0; i < 2; i++) {
    const offsetMs = getWallClockUtcMs(new Date(guessMs), timeZone) - guessMs;
    guessMs = targetWallClockMs - offsetMs;
  }

  return new Date(guessMs + 999);
}

/**
 * Normalizes any supported expiration timestamp representation into a UTC Date.
 * Returns null for missing/null/invalid values.
 */
export function toExpirationDate(value: ExpirationInput): Date | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'object') {
    if ('toDate' in value && typeof value.toDate === 'function') {
      const converted = value.toDate();
      return converted instanceof Date && !Number.isNaN(converted.getTime()) ? converted : null;
    }
    if ('seconds' in value && typeof value.seconds === 'number') {
      const ms = value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
      const converted = new Date(ms);
      return Number.isNaN(converted.getTime()) ? null : converted;
    }
    return null;
  }

  if (typeof value === 'number' || typeof value === 'string') {
    const converted = new Date(value);
    return Number.isNaN(converted.getTime()) ? null : converted;
  }

  return null;
}

/**
 * Converts a stored UTC expiration timestamp back into its YYYY-MM-DD calendar
 * date in `timeZone` (default: America/Montevideo) for editing.
 */
export function timestampToCalendarDate(
  expiresAt: ExpirationInput,
  timeZone: string = DEFAULT_EXPIRATION_TIMEZONE
): string {
  const date = toExpirationDate(expiresAt);
  if (!date) return '';

  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Returns today's YYYY-MM-DD calendar date in `timeZone`.
 */
export function getTodayCalendarDate(
  now: number | Date = Date.now(),
  timeZone: string = DEFAULT_EXPIRATION_TIMEZONE
): string {
  const refDate = now instanceof Date ? now : new Date(now);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(refDate);
}

/**
 * Validates optional expiration inputs from create/edit forms or imports.
 * Requires the resulting UTC end-of-day instant to be strictly in the future relative to `now`.
 */
export function validateExpirationDateInput(
  enabled: boolean,
  dateStr: string,
  now: number | Date = Date.now(),
  timeZone: string = DEFAULT_EXPIRATION_TIMEZONE
): ExpirationValidationResult {
  if (!enabled) {
    return { valid: true, expiresAtDate: null, errorKey: null };
  }

  if (!dateStr || !dateStr.trim()) {
    return { valid: false, expiresAtDate: null, errorKey: 'creator.expiration_required' };
  }

  const endOfDay = calendarDateToUtcEndOfDay(dateStr, timeZone);
  if (!endOfDay) {
    return { valid: false, expiresAtDate: null, errorKey: 'creator.expiration_invalid' };
  }

  const nowMs = now instanceof Date ? now.getTime() : now;
  if (endOfDay.getTime() <= nowMs) {
    return { valid: false, expiresAtDate: null, errorKey: 'creator.expiration_past' };
  }

  return { valid: true, expiresAtDate: endOfDay, errorKey: null };
}

/**
 * Determines whether a note has expired relative to `now`.
 * Notes without `expiresAt` or with `expiresAt === null` never expire.
 * At the exact expiration boundary (`expiresAt <= now`), the note is treated as expired,
 * matching SQL `expires_at > CURRENT_TIMESTAMP` and Firestore `data.expiresAt > request.time`.
 */
export function isNoteExpired(
  note: { expiresAt?: ExpirationInput } | null | undefined,
  now: number | Date = Date.now()
): boolean {
  if (!note || note.expiresAt === null || note.expiresAt === undefined) {
    return false;
  }

  const expDate = toExpirationDate(note.expiresAt);
  if (!expDate) {
    return false;
  }

  const nowMs = now instanceof Date ? now.getTime() : now;
  return expDate.getTime() <= nowMs;
}

/**
 * Formats an expiration timestamp into a human-readable localized date
 * in `timeZone` (default: America/Montevideo).
 */
export function formatExpirationDate(
  expiresAt: ExpirationInput,
  locale: string = 'es-ES',
  timeZone: string = DEFAULT_EXPIRATION_TIMEZONE
): string | null {
  const date = toExpirationDate(expiresAt);
  if (!date) return null;

  return new Intl.DateTimeFormat(locale || 'es-ES', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}
