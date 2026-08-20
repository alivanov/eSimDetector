import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import type { SuggestItem } from '../api/suggest';
import { MAX_SUGGEST_LIMIT, suggestDevices } from '../api/suggest';
import { useDebouncedValue } from '../hooks/use-debounced-value';
import { manualSearchTexts } from '../texts';

import styles from './ManualSearch.module.css';

const SUGGEST_DEBOUNCE_MS = 250;

export interface ManualSearchProps {
  readonly baseUrl: string;
  /** Родитель выполняет `POST /devices/search` и владеет отображением результата/ошибки. */
  readonly onSubmit: (query: string) => void;
  readonly isSubmitting: boolean;
  readonly onBackToAutoDetect: () => void;
}

/**
 * Ручной поиск с подсказками (docs/13-branding.md §13.6 «Ручной поиск», объём этапа 6.2 п.5).
 * Доступное автодополнение — `role="combobox"`, `aria-expanded`, `aria-activedescendant`,
 * навигация стрелками/Enter, закрытие по Escape (образец — WAI-ARIA 1.2 combobox pattern).
 * Подсказки запрашиваются с задержкой ввода и отменой устаревших запросов через
 * `AbortController`; лимит подсказок ограничен `MAX_SUGGEST_LIMIT` (сервер больше не отдаёт).
 */
export function ManualSearch({
  baseUrl,
  onSubmit,
  isSubmitting,
  onBackToAutoDetect,
}: ManualSearchProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<readonly SuggestItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [validationError, setValidationError] = useState<string | undefined>(undefined);
  const [suggestionsFetched, setSuggestionsFetched] = useState(false);

  const debouncedQuery = useDebouncedValue(query, SUGGEST_DEBOUNCE_MS);
  const listboxId = useId();
  const inputId = useId();
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    abortControllerRef.current?.abort();
    if (trimmed.length === 0) {
      setSuggestions([]);
      setIsOpen(false);
      setSuggestionsFetched(false);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    let stale = false;

    void suggestDevices(baseUrl, trimmed, MAX_SUGGEST_LIMIT, controller.signal)
      .then((response) => {
        if (stale) {
          return;
        }
        setSuggestions(response.suggestions);
        setIsOpen(true);
        setActiveIndex(null);
        setSuggestionsFetched(true);
      })
      .catch(() => {
        if (stale) {
          return;
        }
        setSuggestions([]);
        setSuggestionsFetched(false);
      });

    return () => {
      stale = true;
      controller.abort();
    };
  }, [baseUrl, debouncedQuery]);

  function closeSuggestions() {
    setIsOpen(false);
    setActiveIndex(null);
  }

  function submit(value: string) {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      setValidationError(manualSearchTexts.tooShort);
      return;
    }
    setValidationError(undefined);
    closeSuggestions();
    onSubmit(trimmed);
  }

  function chooseSuggestion(item: SuggestItem) {
    setQuery(item.name);
    setValidationError(undefined);
    closeSuggestions();
    onSubmit(item.name);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || suggestions.length === 0) {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit(query);
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((previous) =>
        previous === null ? 0 : Math.min(previous + 1, suggestions.length - 1),
      );
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((previous) =>
        previous === null ? suggestions.length - 1 : Math.max(previous - 1, 0),
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (activeIndex !== null) {
        const active = suggestions[activeIndex];
        if (active !== undefined) {
          chooseSuggestion(active);
          return;
        }
      }
      submit(query);
    } else if (event.key === 'Escape') {
      closeSuggestions();
    }
  }

  const activeOptionId =
    activeIndex !== null && suggestions[activeIndex] !== undefined
      ? `${listboxId}-option-${activeIndex}`
      : undefined;

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        submit(query);
      }}
    >
      <div className={styles.fieldWrapper}>
        <label className={styles.label} htmlFor={inputId}>
          {manualSearchTexts.fieldLabel}
        </label>
        <p className={styles.hint}>{manualSearchTexts.hint}</p>
        <input
          id={inputId}
          className={styles.input}
          type="text"
          role="combobox"
          aria-expanded={isOpen && suggestions.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          placeholder={manualSearchTexts.fieldPlaceholder}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setValidationError(undefined);
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        {isOpen && suggestions.length > 0 ? (
          <ul
            id={listboxId}
            className={styles.listbox}
            role="listbox"
            aria-label={manualSearchTexts.suggestionsLabel}
          >
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.id}
                id={`${listboxId}-option-${String(index)}`}
                role="option"
                aria-selected={index === activeIndex}
                className={
                  index === activeIndex
                    ? `${styles.listboxOption} ${styles.listboxOptionActive}`
                    : styles.listboxOption
                }
                onMouseDown={(event) => {
                  event.preventDefault();
                  chooseSuggestion(suggestion);
                }}
              >
                {suggestion.name} · {suggestion.brand}
              </li>
            ))}
          </ul>
        ) : null}
        {suggestionsFetched && suggestions.length === 0 ? (
          <p className={styles.emptyState}>{manualSearchTexts.noResults}</p>
        ) : null}
        {validationError !== undefined ? <p className={styles.error}>{validationError}</p> : null}
      </div>
      <div className={styles.actions}>
        <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
          {isSubmitting ? manualSearchTexts.loading : manualSearchTexts.submit}
        </button>
        <button type="button" className={styles.backLink} onClick={onBackToAutoDetect}>
          {manualSearchTexts.backToAutoDetect}
        </button>
      </div>
    </form>
  );
}
