import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Folder, Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MAX_GROUP_LENGTH } from '../types';
import { getGroupKey, validateGroupName } from '../lib/groups';

export interface GroupComboboxProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (nextValue: string) => void;
  suggestions: string[];
  placeholder?: string;
  helperText?: string;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
}

type ComboboxOption =
  | { kind: 'existing'; label: string; idSuffix: string }
  | { kind: 'create'; label: string; rawName: string; idSuffix: string };

export const GroupCombobox: React.FC<GroupComboboxProps> = ({
  id: explicitId,
  label,
  value,
  onChange,
  suggestions,
  placeholder,
  helperText,
  disabled = false,
  className = '',
  compact = false,
}) => {
  const { t } = useTranslation();
  const generatedId = useId();
  const inputId = explicitId || `group-combobox-${generatedId}`;
  const listboxId = `${inputId}-listbox`;
  const errorId = `${inputId}-error`;
  const helperId = `${inputId}-helper`;

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [hasInteracted, setHasInteracted] = useState(false);

  const validation = useMemo(() => validateGroupName(value), [value]);
  const showError = !validation.valid && (hasInteracted || value.length > 0);

  const trimmedQuery = value.trim();
  const queryKey = getGroupKey(trimmedQuery);

  const filteredSuggestions = useMemo(() => {
    if (!trimmedQuery) return suggestions;
    const lowerQuery = trimmedQuery.toLowerCase();
    return suggestions.filter((s) => s.toLowerCase().includes(lowerQuery));
  }, [suggestions, trimmedQuery]);

  const hasExactCaseInsensitiveMatch = useMemo(() => {
    if (!queryKey) return false;
    return suggestions.some((s) => getGroupKey(s) === queryKey);
  }, [suggestions, queryKey]);

  const options = useMemo<ComboboxOption[]>(() => {
    const items: ComboboxOption[] = filteredSuggestions.map((item, idx) => ({
      kind: 'existing',
      label: item,
      idSuffix: `opt-${idx}`,
    }));

    if (trimmedQuery.length > 0 && !hasExactCaseInsensitiveMatch && validation.valid) {
      items.push({
        kind: 'create',
        label: t('groups.create_option', {
          name: trimmedQuery,
          defaultValue: `Create group "${trimmedQuery}"`,
        }),
        rawName: trimmedQuery,
        idSuffix: 'opt-create',
      });
    }

    return items;
  }, [filteredSuggestions, trimmedQuery, hasExactCaseInsensitiveMatch, validation.valid, t]);

  // Close on outside mousedown
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const selectOption = (option: ComboboxOption) => {
    const nextValue = option.kind === 'create' ? option.rawName : option.label;
    onChange(nextValue);
    setHasInteracted(true);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleClear = () => {
    onChange('');
    setHasInteracted(false);
    setActiveIndex(-1);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setActiveIndex(options.length > 0 ? 0 : -1);
      } else if (options.length > 0) {
        setActiveIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setActiveIndex(options.length > 0 ? options.length - 1 : -1);
      } else if (options.length > 0) {
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
      }
      return;
    }

    if (e.key === 'Home' && isOpen && options.length > 0) {
      e.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (e.key === 'End' && isOpen && options.length > 0) {
      e.preventDefault();
      setActiveIndex(options.length - 1);
      return;
    }

    if (e.key === 'Enter') {
      if (isOpen && activeIndex >= 0 && activeIndex < options.length) {
        e.preventDefault();
        selectOption(options[activeIndex]);
      } else if (isOpen) {
        setIsOpen(false);
      }
      return;
    }

    if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
        setActiveIndex(-1);
      }
      return;
    }

    if (e.key === 'Tab') {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  const activeDescendantId =
    isOpen && activeIndex >= 0 && activeIndex < options.length
      ? `${inputId}-${options[activeIndex].idSuffix}`
      : undefined;

  const describedBy = [
    helperText ? helperId : null,
    showError ? errorId : null,
  ]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-bold text-stone-600 mb-1.5"
        >
          {label}
        </label>
      )}

      <div className="relative flex items-center">
        <Folder
          className={`absolute left-3 w-3.5 h-3.5 pointer-events-none ${
            showError ? 'text-red-500' : 'text-stone-400'
          }`}
          aria-hidden="true"
        />

        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen && options.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={activeDescendantId}
          aria-invalid={showError}
          aria-describedby={describedBy}
          disabled={disabled}
          value={value}
          onFocus={() => {
            if (!disabled) {
              setIsOpen(true);
            }
          }}
          onChange={(e) => {
            onChange(e.target.value);
            setHasInteracted(true);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? t('groups.placeholder', 'Select or type a group...')}
          autoComplete="off"
          className={`w-full pl-8 pr-14 ${
            compact ? 'py-2 text-xs rounded-lg' : 'py-2.5 text-xs rounded-xl'
          } border bg-stone-50 text-stone-800 placeholder:text-stone-400 outline-none transition-all focus:bg-white focus:ring-2 ${
            showError
              ? 'border-red-300 focus:ring-red-500/20'
              : 'border-stone-200 focus:ring-[#0d9488]/25 focus:border-[#0d9488]'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        />

        <div className="absolute right-2 flex items-center gap-1">
          {value.length > 0 && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              aria-label={t('groups.clear', 'Clear group')}
              title={t('groups.clear', 'Clear group')}
              className="p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-200/70 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0d9488]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            aria-label={t('groups.toggle_suggestions', 'Toggle group suggestions')}
            onMouseDown={(e) => {
              e.preventDefault();
              if (disabled) return;
              setIsOpen((prev) => !prev);
              inputRef.current?.focus();
            }}
            className="p-1 text-stone-400 hover:text-stone-600 rounded transition-colors disabled:opacity-50"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      {isOpen && options.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={label || t('groups.label', 'Group (optional)')}
          className="absolute left-0 right-0 mt-1.5 bg-white border border-stone-200 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto py-1 scrollbar-thin"
        >
          {options.map((option, idx) => {
            const optionId = `${inputId}-${option.idSuffix}`;
            const isHighlighted = idx === activeIndex;
            const isSelected =
              option.kind === 'existing' &&
              queryKey !== undefined &&
              getGroupKey(option.label) === queryKey;

            return (
              <li
                key={option.idSuffix}
                id={optionId}
                role="option"
                aria-selected={isSelected || isHighlighted}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectOption(option);
                }}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`px-3 py-2 text-xs cursor-pointer flex items-center gap-2 transition-colors ${
                  isHighlighted
                    ? 'bg-teal-50 text-[#081e2b] font-bold'
                    : isSelected
                      ? 'bg-stone-50 text-[#0d9488] font-bold'
                      : 'text-stone-700 hover:bg-stone-50'
                }`}
              >
                {option.kind === 'create' ? (
                  <>
                    <Plus className="w-3.5 h-3.5 text-[#0d9488] shrink-0" aria-hidden="true" />
                    <span className="truncate font-semibold text-[#0d9488]">{option.label}</span>
                  </>
                ) : (
                  <>
                    <Folder className="w-3.5 h-3.5 text-stone-400 shrink-0" aria-hidden="true" />
                    <span className="truncate">{option.label}</span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {helperText && (
        <p id={helperId} className="mt-1 text-[11px] text-stone-400">
          {helperText}
        </p>
      )}

      {showError && validation.errorKey && (
        <p id={errorId} role="alert" className="mt-1 text-xs font-semibold text-red-600">
          {t(validation.errorKey, {
            max: MAX_GROUP_LENGTH,
            defaultValue: `Group name must be ${MAX_GROUP_LENGTH} characters or fewer.`,
          })}
        </p>
      )}
    </div>
  );
};
