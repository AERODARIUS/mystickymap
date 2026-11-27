import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { MAX_GROUP_LENGTH, type Note } from '../../types';
import {
  DEFAULT_GROUP_FILTER_PREFS,
  GROUP_FILTER_STORAGE_KEY,
  extractAvailableGroups,
  filterNotesByGroup,
  getGroupKey,
  loadGroupFilterPreferences,
  matchesGroupFilter,
  normalizeGroupName,
  resolveGroupSpelling,
  sanitizeGroupFilterPreferences,
  saveGroupFilterPreferences,
  validateGroupName,
  type GroupFilterPreferences,
} from '../groups';

function makeNote(id: string, group?: string): Note {
  return {
    id,
    type: 'text',
    content: `Note ${id}`,
    contentFormat: 'plain',
    location: { lat: -34.9011, lng: -56.1645 },
    authorId: 'u1',
    authorName: 'Tester',
    privacy: 'public',
    createdAt: Timestamp.fromMillis(1_700_000_000_000),
    ...(group !== undefined ? { group } : {}),
  };
}

describe('groups domain utilities', () => {
  it('normalizes missing, null, empty, and whitespace-only values to undefined while trimming valid names', () => {
    expect(normalizeGroupName(undefined)).toBeUndefined();
    expect(normalizeGroupName(null)).toBeUndefined();
    expect(normalizeGroupName('')).toBeUndefined();
    expect(normalizeGroupName('   \t  ')).toBeUndefined();
    expect(normalizeGroupName('  Restaurants & Cafes  ')).toBe('Restaurants & Cafes');
    expect(getGroupKey('  Restaurants & Cafes  ')).toBe('restaurants & cafes');
    expect(getGroupKey('   ')).toBeUndefined();
  });

  it('validates group max length and disallows control characters', () => {
    expect(validateGroupName('')).toEqual({ valid: true, normalized: undefined });
    expect(validateGroupName('  Events  ')).toEqual({ valid: true, normalized: 'Events' });
    expect(validateGroupName('a'.repeat(MAX_GROUP_LENGTH))).toEqual({
      valid: true,
      normalized: 'a'.repeat(MAX_GROUP_LENGTH),
    });

    const tooLong = validateGroupName('a'.repeat(MAX_GROUP_LENGTH + 1));
    expect(tooLong.valid).toBe(false);
    expect(tooLong.errorKey).toBe('groups.validation_too_long');

    const withNewline = validateGroupName('Line1\nLine2');
    expect(withNewline.valid).toBe(false);
    expect(withNewline.errorKey).toBe('groups.validation_invalid_chars');

    const withNullByte = validateGroupName('Bad\u0000Group');
    expect(withNullByte.valid).toBe(false);
    expect(withNullByte.errorKey).toBe('groups.validation_invalid_chars');
  });

  it('extracts distinct non-empty groups deduplicated case-insensitively and sorted locale-aware', () => {
    const notes: Note[] = [
      makeNote('1', '  Tourism  '),
      makeNote('2', 'restaurants'),
      makeNote('3', 'TOURISM'),
      makeNote('4', ''),
      makeNote('5', '   '),
      makeNote('6'),
      makeNote('7', 'Accessible places'),
      makeNote('8', 'Árboles'),
    ];

    const groups = extractAvailableGroups(notes, 'es-ES');
    expect(groups).toHaveLength(4);
    expect(groups).toContain('Accessible places');
    expect(groups).toContain('Árboles');
    expect(groups).toContain('restaurants');
    expect(groups).toContain('Tourism');
    expect(groups).not.toContain('TOURISM');
    // Locale-aware ordering places Accessible places -> Árboles -> restaurants -> Tourism
    expect(groups[0]).toBe('Accessible places');
    expect(groups[1]).toBe('Árboles');
  });

  it('reuses existing canonical spelling when input matches case-insensitively', () => {
    const existing = ['Accessible places', 'Job opportunities', 'Restaurants'];
    expect(resolveGroupSpelling('  restaurants  ', existing)).toBe('Restaurants');
    expect(resolveGroupSpelling('JOB OPPORTUNITIES', existing)).toBe('Job opportunities');
    expect(resolveGroupSpelling('  Community Gardens ', existing)).toBe('Community Gardens');
    expect(resolveGroupSpelling('   ', existing)).toBeUndefined();
  });

  it('filters notes with unrestricted, multi-select OR, ungrouped-only, and empty semantics', () => {
    const notes: Note[] = [
      makeNote('g1', 'Events'),
      makeNote('g2', 'events'),
      makeNote('g3', 'Restaurants'),
      makeNote('u1'),
      makeNote('u2', '   '),
      makeNote('u3', ''),
    ];

    // Default unrestricted matches all including new/ungrouped
    expect(filterNotesByGroup(notes, DEFAULT_GROUP_FILTER_PREFS).map((n) => n.id)).toEqual([
      'g1',
      'g2',
      'g3',
      'u1',
      'u2',
      'u3',
    ]);

    // Multi-select OR across selected groups excluding ungrouped
    const eventsAndRestaurants: GroupFilterPreferences = {
      mode: 'custom',
      selectedGroupKeys: ['events', 'restaurants'],
      includeUngrouped: false,
    };
    expect(filterNotesByGroup(notes, eventsAndRestaurants).map((n) => n.id)).toEqual([
      'g1',
      'g2',
      'g3',
    ]);

    // Case-insensitive single group + ungrouped included
    const eventsPlusUngrouped: GroupFilterPreferences = {
      mode: 'custom',
      selectedGroupKeys: ['events'],
      includeUngrouped: true,
    };
    expect(filterNotesByGroup(notes, eventsPlusUngrouped).map((n) => n.id)).toEqual([
      'g1',
      'g2',
      'u1',
      'u2',
      'u3',
    ]);

    // Ungrouped-only
    const ungroupedOnly: GroupFilterPreferences = {
      mode: 'custom',
      selectedGroupKeys: [],
      includeUngrouped: true,
    };
    expect(filterNotesByGroup(notes, ungroupedOnly).map((n) => n.id)).toEqual([
      'u1',
      'u2',
      'u3',
    ]);

    // Empty selection (no groups & ungrouped excluded) -> zero notes
    const emptyPrefs: GroupFilterPreferences = {
      mode: 'custom',
      selectedGroupKeys: [],
      includeUngrouped: false,
    };
    expect(filterNotesByGroup(notes, emptyPrefs)).toEqual([]);
    expect(matchesGroupFilter(notes[0], emptyPrefs)).toBe(false);
  });

  it('persists and sanitizes group filter preferences safely in Storage', () => {
    const store = new Map<string, string>();
    const memoryStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    } as unknown as Storage;

    expect(loadGroupFilterPreferences(memoryStorage)).toEqual(DEFAULT_GROUP_FILTER_PREFS);

    const customPrefs: GroupFilterPreferences = {
      mode: 'custom',
      selectedGroupKeys: ['events', 'tourism'],
      includeUngrouped: false,
      groupLabels: { events: 'Events', tourism: 'Tourism' },
    };
    saveGroupFilterPreferences(customPrefs, memoryStorage);
    expect(loadGroupFilterPreferences(memoryStorage)).toEqual(customPrefs);

    // Corrupt JSON falls back cleanly to default unrestricted
    store.set(GROUP_FILTER_STORAGE_KEY, '{broken-json');
    expect(loadGroupFilterPreferences(memoryStorage)).toEqual(DEFAULT_GROUP_FILTER_PREFS);

    // Sanitizer deduplicates keys case-insensitively
    expect(
      sanitizeGroupFilterPreferences({
        mode: 'custom',
        selectedGroupKeys: ['Events', 'events', '  ', 123],
        includeUngrouped: false,
        groupLabels: { EVENTS: 'Events', orphan: 'Ignored' },
      })
    ).toEqual({
      mode: 'custom',
      selectedGroupKeys: ['events'],
      includeUngrouped: false,
      groupLabels: { events: 'Events' },
    });
  });

  it('enforces group field schema and update allowlist in firestore.rules', () => {
    const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    expect(rules).toContain('data.keys().size() <= 16');
    expect(rules).toContain("'group'");
    expect(rules).toContain('data.group is string && data.group.size() >= 1 && data.group.size() <= 60');
  });
});
