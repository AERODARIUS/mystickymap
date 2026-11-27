import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Note } from '../types';
import {
  DEFAULT_GROUP_FILTER_PREFS,
  GroupFilterPreferences,
  extractAvailableGroups,
  filterNotesByGroup,
  getGroupKey,
  loadGroupFilterPreferences,
  normalizeGroupName,
  saveGroupFilterPreferences,
} from '../lib/groups';

export interface GroupFilterEntry {
  key: string;
  label: string;
  count: number;
  isAvailable: boolean;
}

export interface GroupFilterContextValue {
  availableGroups: string[];
  filterEntries: GroupFilterEntry[];
  preferences: GroupFilterPreferences;
  isFilterActive: boolean;
  isUnrestricted: boolean;
  includeUngrouped: boolean;
  selectedGroupKeys: ReadonlySet<string>;
  isGroupSelected: (groupNameOrKey: string) => boolean;
  toggleGroup: (groupNameOrKey: string, labelHint?: string) => void;
  toggleUngrouped: () => void;
  selectAll: () => void;
  clearAll: () => void;
  resetFilters: () => void;
  filterNotes: <T extends Pick<Note, 'group'>>(items: ReadonlyArray<T>) => T[];
  ungroupedCount: number;
}

const fallbackContextValue: GroupFilterContextValue = {
  availableGroups: [],
  filterEntries: [],
  preferences: DEFAULT_GROUP_FILTER_PREFS,
  isFilterActive: false,
  isUnrestricted: true,
  includeUngrouped: true,
  selectedGroupKeys: new Set<string>(),
  isGroupSelected: () => true,
  toggleGroup: () => {},
  toggleUngrouped: () => {},
  selectAll: () => {},
  clearAll: () => {},
  resetFilters: () => {},
  filterNotes: <T extends Pick<Note, 'group'>>(items: ReadonlyArray<T>) => items as T[],
  ungroupedCount: 0,
};

const GroupFilterContext = createContext<GroupFilterContextValue>(fallbackContextValue);

interface GroupFilterProviderProps {
  notes: Note[];
  myNotes?: Note[];
  children: React.ReactNode;
}

export const GroupFilterProvider: React.FC<GroupFilterProviderProps> = ({
  notes,
  myNotes = [],
  children,
}) => {
  const { i18n } = useTranslation();
  const [preferences, setPreferences] = useState<GroupFilterPreferences>(() =>
    loadGroupFilterPreferences()
  );

  // Persist preference changes
  useEffect(() => {
    saveGroupFilterPreferences(preferences);
  }, [preferences]);

  // Combine active discovery notes + viewer's own notes (deduped by id) BEFORE applying group filters
  const discoverySourceNotes = useMemo(() => {
    if (myNotes.length === 0) return notes;
    const byId = new Map<string, Note>();
    for (const n of notes) byId.set(n.id, n);
    for (const n of myNotes) {
      if (!byId.has(n.id)) byId.set(n.id, n);
    }
    return Array.from(byId.values());
  }, [notes, myNotes]);

  const availableGroups = useMemo(
    () => extractAvailableGroups(discoverySourceNotes, i18n?.language),
    [discoverySourceNotes, i18n?.language]
  );

  const { countsByKey, displayByKey, ungroupedCount } = useMemo(() => {
    const counts = new Map<string, number>();
    const display = new Map<string, string>();
    let ungrouped = 0;

    for (const note of discoverySourceNotes) {
      const normalized = normalizeGroupName(note.group);
      if (!normalized) {
        ungrouped += 1;
        continue;
      }
      const key = normalized.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (!display.has(key)) {
        display.set(key, normalized);
      }
    }

    return {
      countsByKey: counts,
      displayByKey: display,
      ungroupedCount: ungrouped,
    };
  }, [discoverySourceNotes]);

  // Build full entries list including temporarily unavailable saved selections
  const filterEntries = useMemo<GroupFilterEntry[]>(() => {
    const entriesByKey = new Map<string, GroupFilterEntry>();

    for (const groupName of availableGroups) {
      const key = groupName.toLowerCase();
      entriesByKey.set(key, {
        key,
        label: groupName,
        count: countsByKey.get(key) ?? 0,
        isAvailable: true,
      });
    }

    if (preferences.mode === 'custom') {
      for (const savedKey of preferences.selectedGroupKeys) {
        if (!entriesByKey.has(savedKey)) {
          const fallbackLabel = preferences.groupLabels?.[savedKey] || savedKey;
          entriesByKey.set(savedKey, {
            key: savedKey,
            label: fallbackLabel,
            count: 0,
            isAvailable: false,
          });
        }
      }
    }

    return Array.from(entriesByKey.values()).sort((a, b) =>
      a.label.localeCompare(b.label, i18n?.language, { sensitivity: 'base' })
    );
  }, [availableGroups, countsByKey, i18n?.language, preferences.groupLabels, preferences.mode, preferences.selectedGroupKeys]);

  const selectedGroupKeys = useMemo(
    () => new Set(preferences.selectedGroupKeys),
    [preferences.selectedGroupKeys]
  );

  const isUnrestricted = preferences.mode === 'unrestricted';
  const isFilterActive = preferences.mode === 'custom';

  const isGroupSelected = useCallback(
    (groupNameOrKey: string): boolean => {
      if (preferences.mode === 'unrestricted') return true;
      const key = getGroupKey(groupNameOrKey);
      return key ? selectedGroupKeys.has(key) : false;
    },
    [preferences.mode, selectedGroupKeys]
  );

  const toggleGroup = useCallback(
    (groupNameOrKey: string, labelHint?: string) => {
      const key = getGroupKey(groupNameOrKey);
      if (!key) return;

      setPreferences((prev) => {
        const nextLabels: Record<string, string> = { ...(prev.groupLabels || {}) };
        for (const [k, label] of displayByKey.entries()) {
          nextLabels[k] = label;
        }
        if (labelHint && !nextLabels[key]) {
          nextLabels[key] = normalizeGroupName(labelHint) || key;
        }

        if (prev.mode === 'unrestricted') {
          // Selecting/deselecting an individual group from unrestricted transitions to custom
          // with all other currently available groups selected.
          const allOtherKeys = availableGroups
            .map((g) => g.toLowerCase())
            .filter((k) => k !== key);
          return {
            mode: 'custom',
            selectedGroupKeys: allOtherKeys,
            includeUngrouped: true,
            groupLabels: nextLabels,
          };
        }

        const exists = prev.selectedGroupKeys.includes(key);
        const nextKeys = exists
          ? prev.selectedGroupKeys.filter((k) => k !== key)
          : [...prev.selectedGroupKeys, key];

        return {
          mode: 'custom',
          selectedGroupKeys: nextKeys,
          includeUngrouped: prev.includeUngrouped,
          groupLabels: nextLabels,
        };
      });
    },
    [availableGroups, displayByKey]
  );

  const toggleUngrouped = useCallback(() => {
    setPreferences((prev) => {
      if (prev.mode === 'unrestricted') {
        const nextLabels: Record<string, string> = {};
        const allKeys = availableGroups.map((g) => {
          const k = g.toLowerCase();
          nextLabels[k] = g;
          return k;
        });
        return {
          mode: 'custom',
          selectedGroupKeys: allKeys,
          includeUngrouped: false,
          groupLabels: nextLabels,
        };
      }

      return {
        ...prev,
        includeUngrouped: !prev.includeUngrouped,
      };
    });
  }, [availableGroups]);

  const selectAll = useCallback(() => {
    setPreferences((prev) => {
      const nextLabels: Record<string, string> = { ...(prev.groupLabels || {}) };
      const keys = new Set<string>(
        prev.mode === 'custom' ? prev.selectedGroupKeys : []
      );
      for (const g of availableGroups) {
        const k = g.toLowerCase();
        keys.add(k);
        nextLabels[k] = g;
      }
      return {
        mode: 'custom',
        selectedGroupKeys: Array.from(keys),
        includeUngrouped: prev.mode === 'unrestricted' ? true : prev.includeUngrouped,
        groupLabels: nextLabels,
      };
    });
  }, [availableGroups]);

  const clearAll = useCallback(() => {
    setPreferences({
      mode: 'custom',
      selectedGroupKeys: [],
      includeUngrouped: false,
      groupLabels: {},
    });
  }, []);

  const resetFilters = useCallback(() => {
    setPreferences({
      mode: 'unrestricted',
      selectedGroupKeys: [],
      includeUngrouped: true,
      groupLabels: {},
    });
  }, []);

  const filterNotes = useCallback(
    <T extends Pick<Note, 'group'>>(items: ReadonlyArray<T>): T[] =>
      filterNotesByGroup(items, preferences),
    [preferences]
  );

  const value = useMemo<GroupFilterContextValue>(
    () => ({
      availableGroups,
      filterEntries,
      preferences,
      isFilterActive,
      isUnrestricted,
      includeUngrouped: preferences.includeUngrouped,
      selectedGroupKeys,
      isGroupSelected,
      toggleGroup,
      toggleUngrouped,
      selectAll,
      clearAll,
      resetFilters,
      filterNotes,
      ungroupedCount,
    }),
    [
      availableGroups,
      filterEntries,
      preferences,
      isFilterActive,
      isUnrestricted,
      selectedGroupKeys,
      isGroupSelected,
      toggleGroup,
      toggleUngrouped,
      selectAll,
      clearAll,
      resetFilters,
      filterNotes,
      ungroupedCount,
    ]
  );

  return (
    <GroupFilterContext.Provider value={value}>
      {children}
    </GroupFilterContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export function useGroupFilter(): GroupFilterContextValue {
  return useContext(GroupFilterContext);
}
