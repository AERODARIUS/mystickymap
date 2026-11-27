import { MAX_GROUP_LENGTH, type Note } from '../types';

export { MAX_GROUP_LENGTH };

export const GROUP_FILTER_STORAGE_KEY = 'spotheon_group_filter_v1';

// Disallow ASCII control characters (including newlines, tabs, null bytes)
function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

export interface GroupValidationResult {
  valid: boolean;
  normalized: string | undefined;
  errorKey?: string;
}

export interface GroupFilterPreferences {
  mode: 'unrestricted' | 'custom';
  selectedGroupKeys: string[];
  includeUngrouped: boolean;
  groupLabels?: Record<string, string>;
}

export const DEFAULT_GROUP_FILTER_PREFS: GroupFilterPreferences = {
  mode: 'unrestricted',
  selectedGroupKeys: [],
  includeUngrouped: true,
  groupLabels: {},
};

/**
 * Normalizes an optional group value:
 * - Non-string, null, undefined, empty, or whitespace-only -> undefined (ungrouped)
 * - Otherwise trims leading and trailing whitespace, preserving internal display capitalization.
 */
export function normalizeGroupName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Validates and normalizes a group input against length and character bounds.
 */
export function validateGroupName(value: unknown): GroupValidationResult {
  if (value === null || value === undefined) {
    return { valid: true, normalized: undefined };
  }
  if (typeof value !== 'string') {
    return { valid: false, normalized: undefined, errorKey: 'groups.validation_invalid' };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { valid: true, normalized: undefined };
  }
  if (hasControlCharacters(trimmed)) {
    return { valid: false, normalized: undefined, errorKey: 'groups.validation_invalid_chars' };
  }
  if (trimmed.length > MAX_GROUP_LENGTH) {
    return { valid: false, normalized: undefined, errorKey: 'groups.validation_too_long' };
  }
  return { valid: true, normalized: trimmed };
}

/**
 * Returns the canonical case-insensitive comparison key for a group name,
 * or undefined if the note/value is ungrouped.
 */
export function getGroupKey(value: unknown): string | undefined {
  const normalized = normalizeGroupName(value);
  return normalized ? normalized.toLowerCase() : undefined;
}

/**
 * Extracts distinct, non-empty group names from notes, deduplicating case-insensitively
 * while preserving display capitalization and sorting alphabetically using locale-aware comparison.
 */
export function extractAvailableGroups(
  notes: ReadonlyArray<Pick<Note, 'group'>>,
  locale?: string
): string[] {
  const canonicalByKey = new Map<string, string>();
  for (const note of notes) {
    const normalized = normalizeGroupName(note.group);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (!canonicalByKey.has(key)) {
      canonicalByKey.set(key, normalized);
    }
  }

  return Array.from(canonicalByKey.values()).sort((a, b) =>
    a.localeCompare(b, locale, { sensitivity: 'base' })
  );
}

/**
 * Reuses the existing canonical spelling when an entered group matches an existing group
 * case-insensitively; otherwise returns the trimmed input (or undefined if empty).
 */
export function resolveGroupSpelling(
  input: unknown,
  existingGroups: ReadonlyArray<string>
): string | undefined {
  const normalized = normalizeGroupName(input);
  if (!normalized) return undefined;
  const targetKey = normalized.toLowerCase();
  for (const existing of existingGroups) {
    const existingNorm = normalizeGroupName(existing);
    if (existingNorm && existingNorm.toLowerCase() === targetKey) {
      return existingNorm;
    }
  }
  return normalized;
}

/**
 * Determines whether a note matches the active group filter preferences.
 * - Unrestricted mode includes all current and newly discovered groups as well as ungrouped notes.
 * - Custom mode checks includeUngrouped for ungrouped notes and OR-matches selectedGroupKeys.
 */
export function matchesGroupFilter(
  note: Pick<Note, 'group'>,
  prefs: GroupFilterPreferences,
  selectedKeySet?: ReadonlySet<string>
): boolean {
  if (prefs.mode === 'unrestricted') {
    return true;
  }
  const key = getGroupKey(note.group);
  if (!key) {
    return prefs.includeUngrouped;
  }
  if (selectedKeySet) {
    return selectedKeySet.has(key);
  }
  return prefs.selectedGroupKeys.includes(key);
}

/**
 * Filters a list of notes using the active group filter preferences.
 */
export function filterNotesByGroup<T extends Pick<Note, 'group'>>(
  notes: ReadonlyArray<T>,
  prefs: GroupFilterPreferences
): T[] {
  if (prefs.mode === 'unrestricted') {
    return notes as T[];
  }
  const selectedKeySet = new Set(prefs.selectedGroupKeys);
  return notes.filter((note) => matchesGroupFilter(note, prefs, selectedKeySet));
}

function getSafeStorage(explicitStorage?: Storage | null): Storage | null {
  if (explicitStorage !== undefined) return explicitStorage;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Restricted storage environment
  }
  return null;
}

export function sanitizeGroupFilterPreferences(raw: unknown): GroupFilterPreferences {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_GROUP_FILTER_PREFS, groupLabels: {} };
  }
  const record = raw as Record<string, unknown>;
  const mode = record.mode === 'custom' ? 'custom' : 'unrestricted';
  const includeUngrouped =
    typeof record.includeUngrouped === 'boolean' ? record.includeUngrouped : true;

  const seenKeys = new Set<string>();
  const selectedGroupKeys: string[] = [];
  if (Array.isArray(record.selectedGroupKeys)) {
    for (const item of record.selectedGroupKeys) {
      const key = getGroupKey(item);
      if (key && !seenKeys.has(key)) {
        seenKeys.add(key);
        selectedGroupKeys.push(key);
      }
    }
  }

  const groupLabels: Record<string, string> = {};
  if (record.groupLabels && typeof record.groupLabels === 'object') {
    for (const [k, v] of Object.entries(record.groupLabels as Record<string, unknown>)) {
      const key = getGroupKey(k);
      const label = normalizeGroupName(v);
      if (key && label && seenKeys.has(key)) {
        groupLabels[key] = label;
      }
    }
  }

  if (mode === 'unrestricted') {
    return {
      mode: 'unrestricted',
      selectedGroupKeys: [],
      includeUngrouped: true,
      groupLabels: {},
    };
  }

  return {
    mode: 'custom',
    selectedGroupKeys,
    includeUngrouped,
    groupLabels,
  };
}

export function loadGroupFilterPreferences(
  explicitStorage?: Storage | null
): GroupFilterPreferences {
  const storage = getSafeStorage(explicitStorage);
  if (!storage) {
    return { ...DEFAULT_GROUP_FILTER_PREFS, groupLabels: {} };
  }
  try {
    const raw = storage.getItem(GROUP_FILTER_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_GROUP_FILTER_PREFS, groupLabels: {} };
    }
    return sanitizeGroupFilterPreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_GROUP_FILTER_PREFS, groupLabels: {} };
  }
}

export function saveGroupFilterPreferences(
  prefs: GroupFilterPreferences,
  explicitStorage?: Storage | null
): void {
  const storage = getSafeStorage(explicitStorage);
  if (!storage) return;
  try {
    storage.setItem(GROUP_FILTER_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota/access errors
  }
}
