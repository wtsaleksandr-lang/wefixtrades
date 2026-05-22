// MobileBottomSheet — Wave BH-3
//
// Mobile-only (≤768px) replacement for the desktop side-panel. On phones the
// wizard config panel becomes a bottom sheet à la Notion / Canva / Builder.io
// / Framer / Figma's mobile editor — the canvas stays visible above, the
// sheet slides up from the bottom and snaps between three heights.
//
// Snap heights:
//   - collapsed: ~56px (just the handle + active-tab label)
//   - half:      60vh
//   - full:      88vh
//
// Features (per BH-3 spec):
//   1. Sliding sheet with drag handle + tap/swipe to expand/collapse.
//   2. Tab strip lives INSIDE the sheet (not at top of screen).
//   3. Search input filters across every section / field-label substring.
//   4. Sticky action footer (Reset / Done) honouring safe-area-inset-bottom.
//   5. Auto-collapse: scrolling inside the sheet shrinks the search+tabs
//      region to icon-only / sticky.
//   6. Canvas above stays interactive and re-renders live (parent owns the
//      live-preview pane).
//   7. (skipped) Long-press tab context menu — deferred, complicates scope.
//   8. (partial) Listens for `qq-wizard:focus-field` so PreviewPane taps
//      can auto-open + switch tab. Section/field scroll is best-effort.
//
// Constraints:
//   - Hidden above 768px via CSS — desktop side-panel stays the path.
//   - GPU-accelerated `transform: translateY()`, 240ms ease-out.
//   - prefers-reduced-motion → no transform animation, snap state changes.
//   - Touch targets >= 44px.
//   - No new deps; Web Animations API + native CSS transitions only.
//   - z-index 9998 (above canvas, below AIBubble).

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef,
  useState, type ReactNode,
} from 'react';
import { RotateCcw, Search, X } from 'lucide-react';
import { platformTheme } from '@/theme/platformTheme';
import { dashboardTheme } from '@/theme/dashboardTheme';
import { EDITOR_TABS, type EditorTab } from './types';

const p = platformTheme;
const d = dashboardTheme;

export type SheetSnap = 'collapsed' | 'half' | 'full';

// ── Search context ─────────────────────────────────────────────────────
//
// Children inside the sheet read `query` via this context so a global DOM
// hook can hide fieldsets/labels that don't match. We keep the filter
// logic in a sidecar effect (querySelector based) so the existing tab
// components don't need to change shape — just RELOCATE them, not
// restructure (per BH-3 hard constraint).

interface SheetSearchCtx {
  query: string;
}
const SheetSearchContext = createContext<SheetSearchCtx>({ query: '' });
export function useSheetSearch() { return useContext(SheetSearchContext); }

// ── Component ─────────────────────────────────────────────────────────

interface Props {
  activeTab: EditorTab;
  onTabChange: (tab: EditorTab) => void;
  onResetTab: () => void;
  onDone: () => void;
  /** Slot containing the tab body components (BuildTab/StyleTab/etc.). */
  children: ReactNode;
  /** When true, the parent indicates Save is busy. */
  isBusy?: boolean;
  /** Optional initial snap state (defaults to 'collapsed'). */
  initialSnap?: SheetSnap;
}

const STORAGE_KEY = 'qq_wizard_sheet_snap';

function readPrefersReduced(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}

function loadSnap(initial: SheetSnap): SheetSnap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'collapsed' || raw === 'half' || raw === 'full') return raw;
  } catch { /* private mode */ }
  return initial;
}

export default function MobileBottomSheet({
  activeTab, onTabChange, onResetTab, onDone,
  children, isBusy = false, initialSnap = 'collapsed',
}: Props) {
  const [snap, setSnapInner] = useState<SheetSnap>(() => loadSnap(initialSnap));
  const [query, setQuery] = useState('');
  const [chromeCompact, setChromeCompact] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const reduceMotion = useMemo(readPrefersReduced, []);

  const setSnap = useCallback((next: SheetSnap) => {
    setSnapInner(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  }, []);

  // ── Cycle on handle tap: collapsed → half → full → collapsed ──────
  const cycleSnap = useCallback(() => {
    setSnap(snap === 'collapsed' ? 'half' : snap === 'half' ? 'full' : 'collapsed');
  }, [snap, setSnap]);

  // ── Drag-to-resize (touch) ────────────────────────────────────────
  const dragStartYRef = useRef<number | null>(null);
  const dragStartSnapRef = useRef<SheetSnap>('collapsed');
  const sheetRef = useRef<HTMLDivElement>(null);

  const onHandlePointerDown = useCallback((ev: React.PointerEvent) => {
    dragStartYRef.current = ev.clientY;
    dragStartSnapRef.current = snap;
    (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
  }, [snap]);

  const onHandlePointerMove = useCallback((ev: React.PointerEvent) => {
    if (dragStartYRef.current === null) return;
    const delta = ev.clientY - dragStartYRef.current;
    // Threshold-based snap selection. Up = expand, down = collapse.
    if (Math.abs(delta) < 24) return;
    const start = dragStartSnapRef.current;
    if (delta < -48) {
      // Drag UP
      if (start === 'collapsed') setSnap('half');
      else if (start === 'half') setSnap('full');
    } else if (delta > 48) {
      // Drag DOWN
      if (start === 'full') setSnap('half');
      else if (start === 'half') setSnap('collapsed');
    }
  }, [setSnap]);

  const onHandlePointerUp = useCallback((ev: React.PointerEvent) => {
    dragStartYRef.current = null;
    try { (ev.target as HTMLElement).releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
  }, []);

  // ── Auto-collapse chrome on scroll inside content ─────────────────
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const onScroll = () => {
      const shouldCompact = el.scrollTop > 24;
      setChromeCompact((cur) => (cur === shouldCompact ? cur : shouldCompact));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Reset compact mode when snap changes back to collapsed.
  useEffect(() => {
    if (snap === 'collapsed') setChromeCompact(false);
  }, [snap]);

  // ── Search filtering — DOM-side ───────────────────────────────────
  //
  // We walk fieldsets inside the sheet content and toggle a `data-sheet-hidden`
  // attribute. Field rows (label + label-like spans) are matched too. Keeping
  // this DOM-side means the tab body components stay untouched (per BH-3 hard
  // constraint "just RELOCATE them, don't restructure").
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const q = query.trim().toLowerCase();
    const fieldsets = root.querySelectorAll<HTMLFieldSetElement>('fieldset');
    if (q === '') {
      fieldsets.forEach((fs) => {
        fs.removeAttribute('data-sheet-hidden');
        fs.querySelectorAll<HTMLElement>('[data-sheet-row-hidden]').forEach((el) => {
          el.removeAttribute('data-sheet-row-hidden');
        });
      });
      return;
    }
    fieldsets.forEach((fs) => {
      // Match against legend text first (section name).
      const legend = fs.querySelector('legend');
      const legendText = (legend?.textContent ?? '').toLowerCase();
      const legendMatch = legendText.includes(q);

      let anyRowMatch = false;
      // Walk every label / field-label element inside the fieldset.
      const labels = fs.querySelectorAll<HTMLElement>('label, .qq-style-row-label, [data-field-label]');
      labels.forEach((lbl) => {
        const text = (lbl.textContent ?? '').toLowerCase();
        const matches = text.includes(q);
        // Find the nearest "row" wrapper so we hide the whole control, not
        // just the label text.
        const row = (lbl.closest('.qq-style-row, .qq-style-field-row, .qq-style-sub-fields, .qq-field-row, .qq-setting-row')
          ?? lbl.parentElement) as HTMLElement | null;
        if (!row) return;
        // Only the legend-match case shows everything inside; otherwise
        // toggle per-row.
        if (legendMatch || matches) {
          row.removeAttribute('data-sheet-row-hidden');
          if (matches) anyRowMatch = true;
        } else {
          row.setAttribute('data-sheet-row-hidden', 'true');
        }
      });

      if (legendMatch || anyRowMatch) {
        fs.removeAttribute('data-sheet-hidden');
      } else {
        fs.setAttribute('data-sheet-hidden', 'true');
      }
    });
  }, [query, activeTab]);

  // ── BH-3 #8 — `qq-wizard:focus-field` listener ────────────────────
  //
  // PreviewPane can dispatch `new CustomEvent('qq-wizard:focus-field', {
  //   detail: { tabId, sectionId, fieldId } })` and we'll:
  //   - switch active tab
  //   - expand to 'half' snap (if currently collapsed)
  //   - scroll the section / field into view + transient highlight
  useEffect(() => {
    const onFocus = (e: Event) => {
      const ev = e as CustomEvent<{ tabId?: EditorTab; sectionId?: string; fieldId?: string }>;
      const { tabId, sectionId, fieldId } = ev.detail ?? {};
      if (tabId) onTabChange(tabId);
      setSnap(snap === 'collapsed' ? 'half' : snap);
      // Defer scroll until the tab body re-renders.
      requestAnimationFrame(() => {
        const root = contentRef.current;
        if (!root) return;
        const target =
          (sectionId && root.querySelector(`[data-testid="${sectionId}"]`))
          ?? (fieldId && root.querySelector(`[data-testid="${fieldId}"]`))
          ?? null;
        if (target instanceof HTMLElement) {
          target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
          target.setAttribute('data-sheet-highlight', 'true');
          setTimeout(() => target.removeAttribute('data-sheet-highlight'), 1400);
        }
      });
    };
    window.addEventListener('qq-wizard:focus-field', onFocus as EventListener);
    return () => window.removeEventListener('qq-wizard:focus-field', onFocus as EventListener);
  }, [onTabChange, setSnap, snap, reduceMotion]);

  // Reset confirm flow — show inline pill for ~3s; confirming fires onResetTab.
  const onResetClick = useCallback(() => {
    if (showResetConfirm) {
      onResetTab();
      setShowResetConfirm(false);
    } else {
      setShowResetConfirm(true);
      setTimeout(() => setShowResetConfirm(false), 3000);
    }
  }, [onResetTab, showResetConfirm]);

  const activeTabLabel =
    EDITOR_TABS.find((t) => t.id === activeTab)?.label ?? 'Style';

  // Backdrop click — collapses to handle. Only intercepts taps on the
  // backdrop element itself (not on the sheet or canvas above).
  const onBackdropClick = useCallback(() => {
    setSnap('collapsed');
  }, [setSnap]);

  const searchContext = useMemo(() => ({ query }), [query]);

  return (
    <SheetSearchContext.Provider value={searchContext}>
      {/* Backdrop — only paints when sheet is expanded. */}
      {snap !== 'collapsed' && (
        <div
          className="qq-sheet-backdrop"
          data-testid="wizard-sheet-backdrop"
          onClick={onBackdropClick}
          aria-hidden="true"
        />
      )}

      <div
        ref={sheetRef}
        className={`qq-sheet qq-sheet--${snap}${chromeCompact ? ' is-chrome-compact' : ''}${reduceMotion ? ' is-reduced-motion' : ''}`}
        data-testid="wizard-bottom-sheet"
        data-snap={snap}
        role="dialog"
        aria-label="Wizard configuration"
        aria-modal={snap === 'full' ? 'true' : 'false'}
      >
        {/* ── Drag handle ────────────────────────────────────────── */}
        <button
          type="button"
          className="qq-sheet-handle"
          data-testid="wizard-sheet-handle"
          aria-label={
            snap === 'collapsed' ? 'Expand wizard panel'
              : snap === 'half' ? 'Expand wizard panel further'
                : 'Collapse wizard panel'
          }
          aria-expanded={snap !== 'collapsed'}
          onClick={cycleSnap}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
        >
          <span className="qq-sheet-handle-bar" aria-hidden="true" />
          {snap === 'collapsed' && (
            <span className="qq-sheet-handle-label">
              {activeTabLabel}
              <span className="qq-sheet-handle-caret" aria-hidden="true" />
            </span>
          )}
        </button>

        {/* ── Search bar ─────────────────────────────────────────── */}
        <div className="qq-sheet-search" data-testid="wizard-sheet-search">
          <Search size={14} aria-hidden="true" className="qq-sheet-search-icon" />
          <input
            type="search"
            className="qq-sheet-search-input"
            placeholder="Search settings"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            data-testid="wizard-sheet-search-input"
            aria-label="Search settings across every tab"
          />
          {query && (
            <button
              type="button"
              className="qq-sheet-search-clear"
              onClick={() => setQuery('')}
              data-testid="wizard-sheet-search-clear"
              aria-label="Clear search"
            >
              <X size={12} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* ── Tab strip ──────────────────────────────────────────── */}
        <div
          className="qq-sheet-tabstrip"
          role="tablist"
          aria-label="Editor sections"
          data-testid="wizard-sheet-tabs"
        >
          {EDITOR_TABS.map(({ id, label }) => {
            const isActive = id === activeTab;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`qq-sheet-tab${isActive ? ' is-active' : ''}`}
                data-testid={`wizard-sheet-tab-${id}`}
                onClick={() => {
                  onTabChange(id);
                  // If sheet was collapsed and the user tapped a tab,
                  // expand to half so they can see the panel.
                  if (snap === 'collapsed') setSnap('half');
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* ── Scrollable content ─────────────────────────────────── */}
        <div
          ref={contentRef}
          className="qq-sheet-content"
          data-testid="wizard-sheet-content"
        >
          {children}
        </div>

        {/* ── Sticky action footer ───────────────────────────────── */}
        <div className="qq-sheet-footer" data-testid="wizard-sheet-footer">
          <button
            type="button"
            className={`qq-sheet-footer-reset${showResetConfirm ? ' is-confirm' : ''}`}
            onClick={onResetClick}
            data-testid="wizard-sheet-reset"
            aria-label={showResetConfirm ? 'Confirm reset to default' : 'Reset to default'}
            title="Reset this tab to default"
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>{showResetConfirm ? 'Tap to confirm' : 'Reset'}</span>
          </button>
          <button
            type="button"
            className="qq-sheet-footer-done"
            onClick={onDone}
            data-testid="wizard-sheet-done"
            disabled={isBusy}
          >
            {isBusy ? 'Saving…' : 'Done'}
          </button>
        </div>
      </div>

      <style>{`
        /* Mobile-only — desktop continues to use the side-panel pattern. */
        .qq-sheet, .qq-sheet-backdrop { display: none; }

        @media (max-width: 768px) {
          .qq-sheet-backdrop {
            display: block;
            position: fixed; inset: 0;
            z-index: 9997;
            background: rgba(15, 23, 42, 0.35);
            backdrop-filter: blur(2px);
            -webkit-backdrop-filter: blur(2px);
            animation: qq-sheet-backdrop-in 240ms ease-out;
          }
          @keyframes qq-sheet-backdrop-in {
            from { opacity: 0; }
            to   { opacity: 1; }
          }

          .qq-sheet {
            display: flex; flex-direction: column;
            position: fixed; left: 0; right: 0; bottom: 0;
            z-index: 9998;
            background: ${d.colors.panel};
            border-top-left-radius: 18px;
            border-top-right-radius: 18px;
            box-shadow: 0 -10px 40px rgba(15, 23, 42, 0.18);
            border-top: 1px solid ${d.colors.borderLight};
            /* GPU-accelerated transform-based snap transitions. */
            transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
                        height 240ms cubic-bezier(0.22, 1, 0.36, 1);
            will-change: transform, height;
            transform: translate3d(0, 0, 0);
            /* Touch action — let inner content scroll; the handle itself
             * captures vertical pans for drag-resize. */
            touch-action: pan-y;
          }

          /* ── Three snap states ─────────────────────────────────── */
          .qq-sheet--collapsed {
            height: calc(56px + env(safe-area-inset-bottom, 0px));
          }
          .qq-sheet--half {
            height: 62vh;
          }
          .qq-sheet--full {
            height: 88vh;
          }
          /* Hide search / tabs / content / footer in collapsed state —
           * only the handle remains. */
          .qq-sheet--collapsed .qq-sheet-search,
          .qq-sheet--collapsed .qq-sheet-tabstrip,
          .qq-sheet--collapsed .qq-sheet-content,
          .qq-sheet--collapsed .qq-sheet-footer {
            display: none;
          }

          /* ── Drag handle ───────────────────────────────────────── */
          .qq-sheet-handle {
            position: relative;
            display: flex; flex-direction: column; align-items: center;
            justify-content: center;
            width: 100%; min-height: 44px;
            padding: 8px 12px 4px;
            background: transparent; border: none; cursor: grab;
            touch-action: none;
            font: inherit;
          }
          .qq-sheet-handle:active { cursor: grabbing; }
          .qq-sheet-handle:focus-visible {
            outline: 2px solid ${p.colors.accent};
            outline-offset: -4px;
            border-radius: 12px;
          }
          .qq-sheet-handle-bar {
            display: block;
            width: 40px; height: 4px; border-radius: 999px;
            background: ${p.colors.border};
            margin-bottom: 2px;
          }
          .qq-sheet-handle-label {
            font-size: 13px; font-weight: 700;
            color: ${p.colors.heading};
            display: inline-flex; align-items: center; gap: 4px;
          }
          .qq-sheet-handle-caret {
            display: inline-block;
            width: 0; height: 0;
            border-left: 4px solid transparent;
            border-right: 4px solid transparent;
            border-bottom: 5px solid ${p.colors.muted};
            margin-left: 2px;
          }

          /* ── Search bar ────────────────────────────────────────── */
          .qq-sheet-search {
            display: flex; align-items: center; gap: 6px;
            margin: 4px 12px 6px;
            padding: 0 10px;
            background: ${p.colors.surfaceRaised};
            border: 1px solid ${p.colors.borderLight};
            border-radius: 10px;
            min-height: 36px;
            transition: max-height 200ms ease-out, opacity 180ms ease-out,
                        margin 200ms ease-out;
            overflow: hidden;
            max-height: 44px;
          }
          .qq-sheet.is-chrome-compact .qq-sheet-search {
            max-height: 0;
            opacity: 0;
            margin-top: 0;
            margin-bottom: 0;
            border-width: 0;
            pointer-events: none;
          }
          .qq-sheet-search-icon {
            flex-shrink: 0;
            color: ${p.colors.muted};
          }
          .qq-sheet-search-input {
            flex: 1; min-width: 0;
            border: none; background: transparent;
            font: inherit; font-size: 13.5px;
            color: ${p.colors.heading};
            padding: 6px 0;
            outline: none;
          }
          .qq-sheet-search-input::-webkit-search-cancel-button { display: none; }
          .qq-sheet-search-clear {
            background: transparent; border: none; padding: 4px;
            min-width: 28px; min-height: 28px;
            display: inline-flex; align-items: center; justify-content: center;
            color: ${p.colors.muted};
            cursor: pointer;
            border-radius: 999px;
          }
          .qq-sheet-search-clear:hover { color: ${p.colors.heading}; }

          /* ── Tab strip ─────────────────────────────────────────── */
          .qq-sheet-tabstrip {
            display: flex; align-items: center; gap: 4px;
            padding: 0 12px 8px;
            overflow-x: auto;
            scrollbar-width: none;
            transition: padding 200ms ease-out, max-height 200ms ease-out;
            max-height: 56px;
          }
          .qq-sheet-tabstrip::-webkit-scrollbar { display: none; }
          .qq-sheet.is-chrome-compact .qq-sheet-tabstrip {
            padding-top: 0; padding-bottom: 4px;
          }
          .qq-sheet-tab {
            flex: 0 0 auto;
            min-height: 44px;
            padding: 6px 14px;
            border: 1px solid ${p.colors.borderLight};
            background: #fff;
            color: ${p.colors.muted};
            font: inherit; font-size: 13px; font-weight: 600;
            border-radius: 999px;
            cursor: pointer;
            white-space: nowrap;
            transition: background 0.12s ease, color 0.12s ease,
                        border-color 0.12s ease;
          }
          .qq-sheet-tab:hover {
            color: ${p.colors.heading};
            background: ${p.colors.surfaceRaised};
          }
          .qq-sheet-tab.is-active {
            background: ${p.colors.accent};
            color: #fff;
            border-color: ${p.colors.accent};
          }
          .qq-sheet-tab:focus-visible {
            outline: 2px solid ${p.colors.accent};
            outline-offset: 2px;
          }

          /* ── Scrollable content ────────────────────────────────── */
          .qq-sheet-content {
            flex: 1; min-height: 0;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            padding: 4px 12px 8px;
            scroll-behavior: smooth;
          }
          /* Search filter hides matched sections / rows. */
          .qq-sheet-content fieldset[data-sheet-hidden="true"] {
            display: none;
          }
          .qq-sheet-content [data-sheet-row-hidden="true"] {
            display: none;
          }
          /* Section highlight after a focus-field event. */
          .qq-sheet-content [data-sheet-highlight="true"] {
            animation: qq-sheet-highlight 1.4s ease-out;
          }
          @keyframes qq-sheet-highlight {
            0%   { box-shadow: 0 0 0 0 ${p.colors.accent}; }
            50%  { box-shadow: 0 0 0 4px ${p.colors.accentLighter}; }
            100% { box-shadow: 0 0 0 0 ${p.colors.accentLighter}; }
          }

          /* ── Sticky action footer ──────────────────────────────── */
          .qq-sheet-footer {
            position: sticky; bottom: 0;
            display: flex; align-items: center; gap: 8px;
            padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px));
            border-top: 1px solid ${d.colors.borderLight};
            background: ${d.colors.panel};
            flex-shrink: 0;
            z-index: 2;
          }
          .qq-sheet-footer-reset {
            display: inline-flex; align-items: center; gap: 6px;
            min-height: 44px; padding: 0 14px;
            background: #fff;
            border: 1px solid ${p.colors.border};
            border-radius: 10px;
            font: inherit; font-size: 13px; font-weight: 600;
            color: ${p.colors.heading};
            cursor: pointer;
            transition: background 0.12s ease, border-color 0.12s ease,
                        color 0.12s ease;
          }
          .qq-sheet-footer-reset:hover {
            background: ${p.colors.surfaceRaised};
          }
          .qq-sheet-footer-reset.is-confirm {
            background: ${p.colors.accentLighter};
            border-color: ${p.colors.accent};
            color: ${p.colors.accentDark};
          }
          .qq-sheet-footer-done {
            flex: 1; min-height: 44px;
            background: ${p.colors.accent};
            color: #fff;
            border: none;
            border-radius: 10px;
            font: inherit; font-size: 14px; font-weight: 700;
            cursor: pointer;
            box-shadow: ${p.shadows.button};
            transition: box-shadow 0.12s ease, background 0.12s ease;
          }
          .qq-sheet-footer-done:hover:not(:disabled) {
            box-shadow: ${p.shadows.buttonHover};
          }
          .qq-sheet-footer-done:disabled {
            opacity: 0.55; cursor: not-allowed;
          }

          /* Dark editor theme ── flip surfaces. */
          .qq-editor-shell[data-theme="dark"] .qq-sheet {
            background: var(--qq-surface);
            border-top-color: var(--qq-border);
          }
          .qq-editor-shell[data-theme="dark"] .qq-sheet-search {
            background: rgba(255,255,255,0.04);
            border-color: var(--qq-border);
          }
          .qq-editor-shell[data-theme="dark"] .qq-sheet-search-input {
            color: var(--qq-text);
          }
          .qq-editor-shell[data-theme="dark"] .qq-sheet-tab {
            background: var(--qq-surface);
            border-color: var(--qq-border);
            color: var(--qq-muted);
          }
          .qq-editor-shell[data-theme="dark"] .qq-sheet-footer {
            background: var(--qq-surface);
            border-top-color: var(--qq-border);
          }
          .qq-editor-shell[data-theme="dark"] .qq-sheet-footer-reset {
            background: rgba(255,255,255,0.04);
            border-color: var(--qq-border);
            color: var(--qq-text);
          }
        }

        /* prefers-reduced-motion — instant snap, no transitions. */
        @media (prefers-reduced-motion: reduce) {
          .qq-sheet, .qq-sheet-search, .qq-sheet-tabstrip, .qq-sheet-content {
            transition: none !important;
            animation: none !important;
          }
          .qq-sheet-backdrop { animation: none !important; }
          .qq-sheet-content [data-sheet-highlight="true"] {
            animation: none !important;
            outline: 2px solid ${p.colors.accent};
            outline-offset: 2px;
          }
        }
        /* Direct class-driven override (Web Animations API friendly) when
         * the prefers-reduced-motion media query is unreliable. */
        .qq-sheet.is-reduced-motion {
          transition: none !important;
        }
      `}</style>
    </SheetSearchContext.Provider>
  );
}
