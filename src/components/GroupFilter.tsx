import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Filter, RotateCcw, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGroupFilter } from '../context/GroupFilterContext';

interface GroupFilterProps {
  variant?: 'map' | 'inline';
  className?: string;
}

export const GroupFilter: React.FC<GroupFilterProps> = ({
  variant = 'map',
  className = '',
}) => {
  const { t } = useTranslation();
  const {
    filterEntries,
    preferences,
    isFilterActive,
    isUnrestricted,
    includeUngrouped,
    selectedGroupKeys,
    isGroupSelected,
    toggleGroup,
    toggleUngrouped,
    selectAll,
    clearAll,
    resetFilters,
    ungroupedCount,
  } = useGroupFilter();

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(false);
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filterEntries;
    return filterEntries.filter((entry) => entry.label.toLowerCase().includes(q));
  }, [filterEntries, searchQuery]);

  const isEmptySelection =
    !isUnrestricted && selectedGroupKeys.size === 0 && !includeUngrouped;

  const activeBadgeText = useMemo(() => {
    if (isUnrestricted) return null;
    if (isEmptySelection) return '0';
    const count = selectedGroupKeys.size + (includeUngrouped ? 1 : 0);
    return String(count);
  }, [isUnrestricted, isEmptySelection, selectedGroupKeys.size, includeUngrouped]);

  const inlineSummary = useMemo(() => {
    if (isUnrestricted) return t('groups.all_active', 'All');
    if (isEmptySelection) return t('groups.none_selected', 'None');
    if (selectedGroupKeys.size === 0 && includeUngrouped) {
      return t('groups.ungrouped', 'Ungrouped');
    }
    const count = selectedGroupKeys.size + (includeUngrouped ? 1 : 0);
    return t('groups.selected_count', {
      count,
      defaultValue: `${count} active`,
    });
  }, [isUnrestricted, isEmptySelection, selectedGroupKeys.size, includeUngrouped, t]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {variant === 'map' ? (
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-controls={panelId}
          aria-label={t('groups.filter_title', 'Filter by group')}
          title={t('groups.filter_title', 'Filter by group')}
          data-testid="map-group-filter-button"
          className={`relative p-3 rounded-2xl shadow-lg border transition-all font-bold flex items-center gap-1.5 ${
            isFilterActive
              ? 'bg-[#081e2b] text-white border-[#0d9488]/60 hover:bg-[#0e2a38]'
              : 'bg-white text-stone-600 border-stone-100 hover:bg-stone-50'
          }`}
        >
          <Filter className={`w-5 h-5 ${isFilterActive ? 'text-[#00a88f]' : ''}`} aria-hidden="true" />
          {activeBadgeText !== null && (
            <span
              data-testid="group-filter-active-badge"
              className="px-1.5 py-0.5 rounded-full bg-[#0d9488] text-white text-[10px] font-black leading-none tabular-nums"
            >
              {activeBadgeText}
            </span>
          )}
        </button>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            aria-expanded={isOpen}
            aria-controls={panelId}
            data-testid="nearby-group-filter-button"
            className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 transition-colors ${
              isFilterActive
                ? 'bg-[#081e2b] text-white border-[#0d9488]/50 hover:bg-[#0e2a38]'
                : 'bg-stone-100 text-stone-700 border-stone-200 hover:bg-stone-200/70'
            }`}
          >
            <Filter className={`w-3.5 h-3.5 ${isFilterActive ? 'text-[#00a88f]' : 'text-stone-500'}`} aria-hidden="true" />
            <span>{t('groups.filter_button', 'Groups')}:</span>
            <span className={isFilterActive ? 'text-[#00a88f]' : 'text-stone-900'}>
              {inlineSummary}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>

          {isFilterActive && (
            <button
              type="button"
              onClick={resetFilters}
              className="px-2.5 py-2 rounded-xl text-xs font-semibold text-[#0d9488] hover:bg-teal-50 transition-colors flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('groups.reset', 'Reset')}</span>
            </button>
          )}
        </div>
      )}

      {isOpen && (
        <div
          id={panelId}
          role="dialog"
          aria-label={t('groups.filter_title', 'Filter by group')}
          data-testid="group-filter-popover"
          className={`absolute ${
            variant === 'map' ? 'left-0 mt-2' : 'left-0 mt-2'
          } w-72 sm:w-80 bg-white rounded-2xl shadow-2xl border border-stone-200 z-[75] overflow-hidden flex flex-col max-h-[70dvh]`}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between gap-2 bg-stone-50/70">
            <div className="min-w-0">
              <h3 className="text-xs font-black text-stone-900 uppercase tracking-wider">
                {t('groups.filter_title', 'Filter by group')}
              </h3>
            </div>
            <div className="flex items-center gap-1">
              {isFilterActive && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="px-2 py-1 rounded-lg text-[11px] font-bold text-[#0d9488] hover:bg-teal-50 transition-colors flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  <span>{t('groups.reset', 'Reset')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label={t('cluster.close', 'Close')}
                className="p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search & Bulk Actions */}
          <div className="p-3 border-b border-stone-100 space-y-2.5 shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('groups.filter_search_placeholder', 'Search groups...')}
                aria-label={t('groups.filter_search_placeholder', 'Search groups...')}
                className="w-full pl-8 pr-7 py-1.5 bg-stone-100 rounded-xl text-xs text-stone-800 placeholder:text-stone-400 outline-none focus:ring-2 focus:ring-[#0d9488]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label={t('creator.clear_text', 'Clear text')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between gap-1.5 text-[11px] font-bold">
              <button
                type="button"
                onClick={selectAll}
                className="flex-1 py-1.5 px-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors text-center"
              >
                {t('groups.select_all', 'Select all')}
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="flex-1 py-1.5 px-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors text-center"
              >
                {t('groups.clear_all', 'Clear all')}
              </button>
              <button
                type="button"
                onClick={resetFilters}
                disabled={!isFilterActive && preferences.mode === 'unrestricted'}
                className="flex-1 py-1.5 px-2 rounded-lg bg-teal-50 hover:bg-teal-100 text-[#0d9488] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-center"
              >
                {t('groups.reset', 'Reset')}
              </button>
            </div>
          </div>

          {/* Options List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
            {/* Special Ungrouped Filter Option (not a persisted group) */}
            <label className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl hover:bg-stone-50 cursor-pointer border-b border-stone-100 pb-2.5 mb-1">
              <span className="flex items-center gap-2.5 min-w-0">
                <input
                  type="checkbox"
                  checked={includeUngrouped}
                  onChange={toggleUngrouped}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`w-4 h-4 rounded flex items-center justify-center border transition-colors shrink-0 ${
                    includeUngrouped
                      ? 'bg-[#0d9488] border-[#0d9488] text-white'
                      : 'bg-white border-stone-300'
                  }`}
                >
                  {includeUngrouped && <Check className="w-3 h-3 stroke-[3]" />}
                </span>
                <span className="text-xs font-bold text-stone-700 italic truncate">
                  {t('groups.ungrouped', 'Ungrouped')}
                </span>
              </span>
              <span className="text-[11px] font-mono text-stone-400 tabular-nums shrink-0">
                {ungroupedCount}
              </span>
            </label>

            {filteredEntries.length > 0 ? (
              filteredEntries.map((entry) => {
                const checked = isGroupSelected(entry.key);
                return (
                  <label
                    key={entry.key}
                    className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl hover:bg-stone-50 cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleGroup(entry.key, entry.label)}
                        className="sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className={`w-4 h-4 rounded flex items-center justify-center border transition-colors shrink-0 ${
                          checked
                            ? 'bg-[#0d9488] border-[#0d9488] text-white'
                            : 'bg-white border-stone-300'
                        }`}
                      >
                        {checked && <Check className="w-3 h-3 stroke-[3]" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-stone-800 truncate">
                          {entry.label}
                        </span>
                        {!entry.isAvailable && (
                          <span className="block text-[10px] text-stone-400">
                            {t('groups.temporarily_unavailable', 'Not in current view')}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="text-[11px] font-mono text-stone-400 tabular-nums shrink-0">
                      {entry.count}
                    </span>
                  </label>
                );
              })
            ) : (
              <p className="py-4 px-2 text-center text-xs text-stone-400">
                {searchQuery.trim()
                  ? t('groups.no_matching_groups', {
                      query: searchQuery.trim(),
                      defaultValue: `No groups match "${searchQuery.trim()}".`,
                    })
                  : t('groups.no_groups_yet', 'No groups available yet.')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
