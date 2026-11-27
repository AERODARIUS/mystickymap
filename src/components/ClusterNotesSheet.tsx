import React, { useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { useTranslation } from 'react-i18next';
import { ChevronRight, FileText, Folder, Layers, Link, Lock, Search, X } from 'lucide-react';
import { Note } from '../types';
import { normalizeGroupName } from '../lib/groups';
import { getPlainTextExcerpt, markdownToPlainText } from '../lib/richText';

interface ClusterNotesSheetProps {
  isOpen: boolean;
  notes: Note[];
  user: User | null;
  onSelectNote: (note: Note) => void;
  onClose: () => void;
  returnFocusElement?: HTMLElement | null;
}

const PAGE_SIZE = 80;

export const ClusterNotesSheet: React.FC<ClusterNotesSheetProps> = ({
  isOpen,
  notes,
  user,
  onSelectNote,
  onClose,
  returnFocusElement,
}) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const listContainerRef = useRef<HTMLUListElement>(null);
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  const showSearch = notes.length >= 6;

  // Reset pagination/search and manage focus lifecycle
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      previousActiveRef.current =
        returnFocusElement ??
        (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      setSearchTerm('');
      setVisibleCount(PAGE_SIZE);

      const timer = setTimeout(() => {
        if (notes.length >= 6 && searchInputRef.current) {
          searchInputRef.current.focus();
        } else if (closeButtonRef.current) {
          closeButtonRef.current.focus();
        }
      }, 0);

      wasOpenRef.current = true;
      return () => clearTimeout(timer);
    }

    if (!isOpen && wasOpenRef.current) {
      wasOpenRef.current = false;
      const target = returnFocusElement ?? previousActiveRef.current;
      previousActiveRef.current = null;
      if (target && typeof target.focus === 'function' && document.contains(target)) {
        target.focus();
      }
    }
  }, [isOpen, notes.length, returnFocusElement]);

  // Escape key dismissal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const indexedNotes = useMemo(() => {
    return notes.map((note) => {
      const plain = markdownToPlainText(note.content || '', note.contentFormat);
      const excerpt =
        note.type === 'audio' && !plain
          ? t('cluster.audio_note', 'Audio note')
          : getPlainTextExcerpt(note.content || '', note.contentFormat, 130) ||
            t('cluster.empty_note', 'Untitled note');
      return {
        note,
        plainLower: plain.toLowerCase(),
        authorLower: (note.authorName || '').toLowerCase(),
        excerpt,
      };
    });
  }, [notes, t]);

  const filteredItems = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return indexedNotes;
    return indexedNotes.filter(
      (item) => item.plainLower.includes(query) || item.authorLower.includes(query)
    );
  }, [indexedNotes, searchTerm]);

  const visibleItems = useMemo(
    () => filteredItems.slice(0, visibleCount),
    [filteredItems, visibleCount]
  );

  const remainingCount = Math.max(0, filteredItems.length - visibleItems.length);

  const handleListKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (!listContainerRef.current) return;
    const buttons = Array.from(
      listContainerRef.current.querySelectorAll<HTMLButtonElement>('button[data-cluster-note-item="true"]')
    );
    if (buttons.length === 0) return;

    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = currentIndex < buttons.length - 1 ? currentIndex + 1 : 0;
      buttons[nextIndex]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : buttons.length - 1;
      buttons[prevIndex]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      buttons[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      buttons[buttons.length - 1]?.focus();
    }
  };

  if (!isOpen || notes.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center pointer-events-none"
      data-testid="cluster-notes-sheet-container"
    >
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-stone-900/50 backdrop-blur-[2px] pointer-events-auto"
      />

      {/* Dialog Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cluster-sheet-title"
        aria-describedby="cluster-sheet-subtitle"
        className="relative w-full sm:max-w-md bg-white rounded-t-[28px] sm:rounded-3xl shadow-2xl border border-stone-200 pointer-events-auto flex flex-col max-h-[78dvh] sm:max-h-[74dvh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-stone-100 bg-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#081e2b] text-white flex items-center justify-center shrink-0 shadow-sm border border-[#0d9488]/40">
              <Layers className="w-5 h-5 text-[#00a88f]" />
            </div>
            <div className="min-w-0">
              <h2
                id="cluster-sheet-title"
                className="text-base font-black text-stone-900 leading-tight truncate"
              >
                {t('cluster.title', {
                  count: notes.length,
                  defaultValue: `${notes.length} notes at this location`,
                })}
              </h2>
              <p
                id="cluster-sheet-subtitle"
                className="text-xs text-stone-500 mt-0.5"
              >
                {t('cluster.subtitle', 'Select a note to view its full details')}
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={t('cluster.close', 'Close group list')}
            className="p-2 rounded-full text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d9488]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search bar for larger groups */}
        {showSearch && (
          <div className="px-5 py-3 bg-stone-50/80 border-b border-stone-100 shrink-0 space-y-1.5">
            <div className="relative">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="search"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setVisibleCount(PAGE_SIZE);
                }}
                placeholder={t('cluster.search_placeholder', 'Filter notes in this group...')}
                aria-label={t('cluster.search_placeholder', 'Filter notes in this group...')}
                className="w-full pl-9 pr-8 py-2 bg-white border border-stone-200 rounded-xl text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#0d9488] focus:border-transparent"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setVisibleCount(PAGE_SIZE);
                  }}
                  aria-label={t('creator.clear_text', 'Clear text')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-0.5 rounded"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className="text-[11px] font-semibold text-stone-500" aria-live="polite">
              {t('cluster.results_count', {
                shown: visibleItems.length,
                total: filteredItems.length,
                defaultValue: `Showing ${visibleItems.length} of ${filteredItems.length}`,
              })}
            </p>
          </div>
        )}

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
          {visibleItems.length > 0 ? (
            <ul
              ref={listContainerRef}
              onKeyDown={handleListKeyDown}
              aria-label={t('cluster.list_aria', 'Notes in this location')}
              className="space-y-1.5"
            >
              {visibleItems.map(({ note, excerpt }) => {
                const isOwn = Boolean(user && note.authorId === user.uid);
                const authorLabel = isOwn
                  ? t('qr.view.you', 'You')
                  : note.authorName || 'Explorer';
                const dateLabel =
                  note.createdAt && typeof note.createdAt.toDate === 'function'
                    ? note.createdAt.toDate().toLocaleDateString()
                    : null;
                const noteGroup = normalizeGroupName(note.group);

                return (
                  <li key={note.id}>
                    <button
                      type="button"
                      data-cluster-note-item="true"
                      onClick={() => onSelectNote(note)}
                      className="w-full text-left p-3 rounded-2xl border border-stone-100 bg-white hover:bg-teal-50/40 hover:border-teal-200 active:scale-[0.99] transition-all flex items-start gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d9488]"
                    >
                      <div
                        className="w-10 h-10 rounded-full border-2 border-white shadow-md flex items-center justify-center shrink-0 mt-0.5"
                        style={{ backgroundColor: note.color || '#10b981' }}
                        aria-hidden="true"
                      >
                        {note.emoji ? (
                          <span className="text-lg leading-none">{note.emoji}</span>
                        ) : (
                          <FileText className="w-4 h-4 text-white" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-xs font-bold text-stone-900 truncate">
                            {authorLabel}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {note.privacy === 'private' && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 text-[9px] font-bold">
                                <Lock className="w-2.5 h-2.5" />
                                {t('creator.private', 'PRIVATE')}
                              </span>
                            )}
                            {note.privacy === 'unlisted' && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[9px] font-bold">
                                <Link className="w-2.5 h-2.5" />
                                UNLISTED
                              </span>
                            )}
                            {dateLabel && (
                              <span className="text-[10px] text-stone-400 font-medium">
                                {dateLabel}
                              </span>
                            )}
                          </div>
                        </div>

                        {noteGroup && (
                          <div className="mb-1">
                            <span
                              data-testid={`cluster-note-group-${note.id}`}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-teal-50 text-[#0d9488] text-[10px] font-bold max-w-full truncate"
                            >
                              <Folder className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                              <span className="truncate">{noteGroup}</span>
                            </span>
                          </div>
                        )}

                        <p className="text-sm text-stone-700 leading-snug line-clamp-2 break-words">
                          {excerpt}
                        </p>
                      </div>

                      <ChevronRight
                        className="w-4 h-4 text-stone-300 group-hover:text-[#0d9488] shrink-0 self-center transition-colors"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="py-10 text-center text-sm text-stone-400 font-medium">
              {t('cluster.no_results', 'No matching notes in this group.')}
            </div>
          )}

          {remainingCount > 0 && (
            <div className="pt-2 pb-1 px-1">
              <button
                type="button"
                onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                className="w-full py-2.5 px-4 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d9488]"
              >
                {t('cluster.show_more', {
                  count: Math.min(PAGE_SIZE, remainingCount),
                  remaining: remainingCount,
                  defaultValue: `Show ${Math.min(PAGE_SIZE, remainingCount)} more (${remainingCount} remaining)`,
                })}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
