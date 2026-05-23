/**
 * StyledSelect — CONFIG-NATIVE-SELECT-1.
 *
 * Drop-in replacement for a native <select> that opens a centered custom
 * popup instead of the OS sheet. Extracted from the AO-8 trade-picker
 * pattern (see SettingsTab.tsx → `TradeSection`) so behaviour is identical
 * on iOS Safari, Android, and desktop.
 *
 * Why this matters
 * ----------------
 * Native <select>s on mobile pop an OS sheet that covers the wizard
 * chrome AND any MobileBottomSheet sitting at z-index 9998. When the
 * sheet dismisses, focus and scroll land somewhere unexpected. AO-8
 * fixed this for the 107-trade picker; this component extracts the
 * pattern so the four remaining selects in StyleTab + InstallTab can
 * share it without further per-select reimplementation.
 *
 * Custom popup at z-index 10000 sits above the mobile sheet, dismisses
 * cleanly (Esc, backdrop click, selection), and supports keyboard
 * navigation + auto-search for long option lists.
 */
import React, {
  useEffect, useId, useRef, useState, useMemo, useCallback,
} from 'react';
import { ChevronDown, X, Search } from 'lucide-react';

export interface StyledSelectOption {
  value: string;
  label: string;
  /** Optional sublabel rendered muted below the label. */
  hint?: string;
  /** Optional Lucide icon node rendered left of the label. */
  icon?: React.ReactNode;
}

interface StyledSelectProps {
  value: string;
  onChange: (next: string) => void;
  options: StyledSelectOption[];
  placeholder?: string;
  /** Header title shown in the open popup. Defaults to the trigger aria-label. */
  title?: string;
  /** Show a search input in the popup. Default: enable when options.length > 8 */
  searchable?: boolean;
  /** className for the trigger button. */
  className?: string;
  /** Data-testid root (option buttons append `-option-${value}`). */
  testId?: string;
  /** ARIA label for the trigger button. */
  ariaLabel?: string;
  /** Disable the trigger. */
  disabled?: boolean;
  /** Force light/dark theme (defaults to 'light' to match the editor scope). */
  theme?: 'light' | 'dark';
  /** z-index for the popup. Default 10000 — matches AO-8 above the mobile sheet. */
  zIndex?: number;
  /**
   * Initial open state. Defaults to false. Exposed for SSR snapshot tests
   * that need to render the popup markup directly (the visible component
   * still toggles via the trigger).
   */
  defaultOpen?: boolean;
}

/**
 * Drop-in replacement for native <select> that opens a centered custom
 * popup instead of the OS sheet.
 *
 * Mirrors the AO-8 trade-picker pattern: trigger looks like a FloatField
 * input, backdrop dims the page, popup is centered and capped at 80vh
 * with internal scroll. Selected option is highlighted with a tinted bg +
 * accent border (Rule 4 — never a bright fill).
 */
export function StyledSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  title,
  searchable,
  className,
  testId,
  ariaLabel,
  disabled,
  theme = 'light',
  zIndex = 10000,
  defaultOpen = false,
}: StyledSelectProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState('');
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const reactId = useId();
  const triggerId = `styled-select-trigger-${reactId.replace(/[:]/g, '')}`;
  const popupId = `styled-select-popup-${reactId.replace(/[:]/g, '')}`;

  // Auto-enable search for >8 options unless explicitly overridden.
  const showSearch = searchable ?? options.length > 8;

  const current = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  // Case-insensitive filter on label AND value. Empty query passes
  // everything through.
  const filtered = useMemo(() => {
    if (!showSearch) return options;
    const q = query.trim().toLowerCase();
    if (q === '') return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query, showSearch]);

  const closePopup = useCallback(() => {
    setOpen(false);
    setQuery('');
    setFocusedIdx(-1);
    // Return focus to the trigger so keyboard users don't lose place.
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const selectValue = useCallback(
    (next: string) => {
      onChange(next);
      setOpen(false);
      setQuery('');
      setFocusedIdx(-1);
      requestAnimationFrame(() => triggerRef.current?.focus());
    },
    [onChange],
  );

  // Esc-to-close + simple focus trap + arrow-key navigation while open.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closePopup();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIdx((prev) => {
          const next = prev < filtered.length - 1 ? prev + 1 : 0;
          optionRefs.current[next]?.focus();
          return next;
        });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIdx((prev) => {
          const next = prev > 0 ? prev - 1 : filtered.length - 1;
          optionRefs.current[next]?.focus();
          return next;
        });
        return;
      }
      if (e.key === 'Tab' && popupRef.current) {
        // Standard focus trap inside the popup.
        const focusables = popupRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, filtered.length, closePopup]);

  // Focus management on open: search if shown, else the currently-selected
  // option (or the first one). Reset query on close so a re-open starts
  // clean.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setFocusedIdx(-1);
      return;
    }
    if (showSearch) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    } else {
      const initialIdx = Math.max(0, options.findIndex((o) => o.value === value));
      setFocusedIdx(initialIdx);
      requestAnimationFrame(() => optionRefs.current[initialIdx]?.focus());
    }
  }, [open, showSearch, options, value]);

  const triggerLabel = current ? current.label : placeholder;
  const popupTitle = title ?? ariaLabel ?? 'Select an option';
  const triggerTestId = testId;

  return (
    <>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className={`premium-input qq-styled-select-trigger${className ? ` ${className}` : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        aria-label={ariaLabel}
        data-testid={triggerTestId}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
      >
        <span
          className={`qq-styled-select-trigger-label${current ? '' : ' is-placeholder'}`}
        >
          {current?.icon != null && (
            <span className="qq-styled-select-trigger-icon" aria-hidden="true">
              {current.icon}
            </span>
          )}
          {triggerLabel}
        </span>
        <ChevronDown
          size={16}
          className="qq-styled-select-trigger-caret"
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          data-theme={theme}
          className="qq-styled-select-backdrop"
          data-testid={testId ? `${testId}-backdrop` : undefined}
          onClick={closePopup}
          style={{ zIndex: zIndex - 1 }}
        >
          <div
            ref={popupRef}
            id={popupId}
            role="dialog"
            aria-modal="true"
            aria-label={popupTitle}
            className="qq-styled-select-popup"
            data-testid={testId ? `${testId}-popup` : undefined}
            onClick={(e) => e.stopPropagation()}
            style={{ zIndex }}
          >
            {/* Header — title sits top-LEFT per Rule 5 (help-cue / label
                placement). The close button is right-aligned. */}
            <div className="qq-styled-select-head">
              <div className="qq-styled-select-head-title">{popupTitle}</div>
              <button
                type="button"
                className="qq-styled-select-close"
                aria-label="Close"
                data-testid={testId ? `${testId}-close` : undefined}
                onClick={closePopup}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {showSearch && (
              <div className="qq-styled-select-search-wrap">
                <Search
                  size={14}
                  aria-hidden="true"
                  className="qq-styled-select-search-icon"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  className="premium-input qq-styled-select-search"
                  placeholder="Filter…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  data-testid={testId ? `${testId}-search` : undefined}
                  aria-label="Filter options"
                />
              </div>
            )}

            <div className="qq-styled-select-body" role="listbox">
              {filtered.map((o, idx) => {
                const isCurrent = o.value === value;
                return (
                  <button
                    key={o.value}
                    ref={(el) => { optionRefs.current[idx] = el; }}
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    className="qq-styled-select-row"
                    data-current={isCurrent ? 'true' : 'false'}
                    data-testid={testId ? `${testId}-option-${o.value}` : undefined}
                    onClick={() => selectValue(o.value)}
                    onFocus={() => setFocusedIdx(idx)}
                    tabIndex={idx === focusedIdx ? 0 : -1}
                  >
                    {o.icon != null && (
                      <span className="qq-styled-select-row-icon" aria-hidden="true">
                        {o.icon}
                      </span>
                    )}
                    <span className="qq-styled-select-row-text">
                      <span className="qq-styled-select-row-label">{o.label}</span>
                      {o.hint && (
                        <span className="qq-styled-select-row-hint">{o.hint}</span>
                      )}
                    </span>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <p
                  className="qq-styled-select-empty"
                  data-testid={testId ? `${testId}-empty` : undefined}
                >
                  No matching options.
                </p>
              )}
            </div>
          </div>

          {/* Theme-scoped styles — kept inside the data-theme wrapper so
              the CONTRAST-2 hardcoded-colors guard treats raw whites here
              as theme-aware. The selectors are unique enough to not bleed
              into the rest of the wizard. */}
          <style>{`
            [data-theme="light"] .qq-styled-select-trigger {
              display: flex; align-items: center; justify-content: space-between;
              width: 100%;
              gap: 8px;
              text-align: left;
              cursor: pointer;
              background: #ffffff;
              color: #111827;
            }
            [data-theme="light"] .qq-styled-select-trigger[disabled] {
              opacity: 0.55;
              cursor: not-allowed;
            }
            [data-theme="light"] .qq-styled-select-trigger-label {
              flex: 1 1 auto;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
              display: inline-flex;
              align-items: center;
              gap: 6px;
            }
            [data-theme="light"] .qq-styled-select-trigger-label.is-placeholder {
              color: #9CA3AF;
            }
            [data-theme="light"] .qq-styled-select-trigger-icon {
              display: inline-flex;
              align-items: center;
            }
            [data-theme="light"] .qq-styled-select-trigger-caret {
              flex: 0 0 auto;
              color: #6B7280;
            }
            [data-theme="light"] .qq-styled-select-backdrop {
              position: fixed; inset: 0;
              background: rgba(15, 23, 42, 0.42);
              display: flex; align-items: center; justify-content: center;
              padding: 16px;
            }
            [data-theme="light"] .qq-styled-select-popup {
              position: relative;
              width: 100%; max-width: 440px;
              max-height: min(80vh, calc(100vh - 120px));
              background: #ffffff;
              border: 1px solid #E5E7EB;
              border-radius: 14px;
              box-shadow: 0 18px 48px rgba(15, 23, 42, 0.24);
              display: flex; flex-direction: column;
              overflow: hidden;
            }
            [data-theme="light"] .qq-styled-select-head {
              display: flex; align-items: center; justify-content: space-between;
              gap: 8px;
              padding: 12px 12px 10px;
              border-bottom: 1px solid #E5E7EB;
              background: #ffffff;
            }
            [data-theme="light"] .qq-styled-select-head-title {
              font-size: 13px;
              font-weight: 700;
              color: #111827;
              text-align: left;
            }
            [data-theme="light"] .qq-styled-select-close {
              flex: 0 0 auto;
              width: 32px; height: 32px;
              display: inline-flex; align-items: center; justify-content: center;
              border: 1px solid #E5E7EB;
              background: #ffffff;
              border-radius: 8px;
              cursor: pointer;
              color: #4B5563;
            }
            [data-theme="light"] .qq-styled-select-close:hover {
              background: #F3F4F6;
              color: #111827;
            }
            [data-theme="light"] .qq-styled-select-search-wrap {
              position: relative;
              padding: 8px 12px 4px;
              background: #ffffff;
            }
            [data-theme="light"] .qq-styled-select-search-icon {
              position: absolute;
              left: 22px;
              top: 50%;
              transform: translateY(-30%);
              color: #9CA3AF;
              pointer-events: none;
            }
            [data-theme="light"] .qq-styled-select-search {
              padding-left: 32px;
            }
            [data-theme="light"] .qq-styled-select-body {
              flex: 1 1 auto;
              overflow-y: auto;
              padding: 6px 6px 10px;
              -webkit-overflow-scrolling: touch;
            }
            [data-theme="light"] .qq-styled-select-row {
              display: flex;
              align-items: center;
              width: 100%;
              gap: 10px;
              padding: 10px 12px;
              font-size: 13px;
              color: #111827;
              text-align: left;
              background: transparent;
              border: 1px solid transparent;
              border-radius: 8px;
              cursor: pointer;
              transition: background 0.12s ease, border-color 0.12s ease;
            }
            [data-theme="light"] .qq-styled-select-row:hover {
              background: #F3F4F6;
            }
            [data-theme="light"] .qq-styled-select-row:focus-visible {
              outline: 2px solid #0d3cfc;
              outline-offset: -2px;
            }
            /* Selected = outline + tinted bg, NOT a bright fill (Rule 4). */
            [data-theme="light"] .qq-styled-select-row[data-current="true"] {
              background: rgba(13, 60, 252, 0.06);
              border-color: #0d3cfc;
              color: #0d3cfc;
              font-weight: 600;
            }
            [data-theme="light"] .qq-styled-select-row-icon {
              flex: 0 0 auto;
              display: inline-flex;
              align-items: center;
              color: #6B7280;
            }
            [data-theme="light"] .qq-styled-select-row[data-current="true"] .qq-styled-select-row-icon {
              color: #0d3cfc;
            }
            [data-theme="light"] .qq-styled-select-row-text {
              display: inline-flex;
              flex-direction: column;
              min-width: 0;
            }
            [data-theme="light"] .qq-styled-select-row-label {
              font-size: 13px;
              line-height: 1.3;
            }
            [data-theme="light"] .qq-styled-select-row-hint {
              font-size: 11.5px;
              color: #6B7280;
              line-height: 1.3;
              margin-top: 2px;
            }
            [data-theme="light"] .qq-styled-select-empty {
              padding: 16px 12px;
              font-size: 12px;
              color: #6B7280;
              margin: 0;
              text-align: center;
            }
            @media (max-width: 480px) {
              [data-theme="light"] .qq-styled-select-backdrop {
                align-items: flex-start;
                padding: 80px 12px 12px;
              }
              [data-theme="light"] .qq-styled-select-popup { max-width: 100%; }
            }

            /* Dark theme mirror — kept slim; the editor scope is light-only
               today, but this lets host pages opt in without a refactor. */
            [data-theme="dark"] .qq-styled-select-trigger {
              display: flex; align-items: center; justify-content: space-between;
              width: 100%;
              gap: 8px;
              text-align: left;
              cursor: pointer;
              background: #0f172a;
              color: #F9FAFB;
            }
            [data-theme="dark"] .qq-styled-select-trigger-label.is-placeholder {
              color: #9CA3AF;
            }
            [data-theme="dark"] .qq-styled-select-backdrop {
              position: fixed; inset: 0;
              background: rgba(15, 23, 42, 0.6);
              display: flex; align-items: center; justify-content: center;
              padding: 16px;
            }
            [data-theme="dark"] .qq-styled-select-popup {
              position: relative;
              width: 100%; max-width: 440px;
              max-height: min(80vh, calc(100vh - 120px));
              background: #0f172a;
              border: 1px solid #1f2937;
              border-radius: 14px;
              box-shadow: 0 18px 48px rgba(0, 0, 0, 0.4);
              display: flex; flex-direction: column;
              overflow: hidden;
              color: #F9FAFB;
            }
            [data-theme="dark"] .qq-styled-select-head {
              display: flex; align-items: center; justify-content: space-between;
              gap: 8px;
              padding: 12px 12px 10px;
              border-bottom: 1px solid #1f2937;
              background: #0f172a;
            }
            [data-theme="dark"] .qq-styled-select-head-title {
              font-size: 13px; font-weight: 700;
              color: #F9FAFB;
            }
            [data-theme="dark"] .qq-styled-select-close {
              width: 32px; height: 32px;
              border: 1px solid #1f2937;
              background: #0f172a;
              border-radius: 8px;
              color: #D1D5DB;
            }
            [data-theme="dark"] .qq-styled-select-close:hover {
              background: #1f2937;
              color: #F9FAFB;
            }
            [data-theme="dark"] .qq-styled-select-body {
              flex: 1 1 auto;
              overflow-y: auto;
              padding: 6px 6px 10px;
            }
            [data-theme="dark"] .qq-styled-select-row {
              display: flex; align-items: center;
              width: 100%; gap: 10px;
              padding: 10px 12px;
              font-size: 13px;
              color: #F9FAFB;
              background: transparent;
              border: 1px solid transparent;
              border-radius: 8px;
              cursor: pointer;
            }
            [data-theme="dark"] .qq-styled-select-row:hover { background: #1f2937; }
            [data-theme="dark"] .qq-styled-select-row[data-current="true"] {
              background: rgba(13, 60, 252, 0.18);
              border-color: #0d3cfc;
              color: #93C5FD;
              font-weight: 600;
            }
          `}</style>
        </div>
      )}
    </>
  );
}

export default StyledSelect;
