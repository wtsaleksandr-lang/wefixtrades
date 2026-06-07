// MobileBottomSheet — Elfsight-clone mobile editor panel sheet (2026-06-05
// rebuild; supersedes the BH-3 3-snap collapsible sheet).
//
// Faithful structural replica of Elfsight's mobile editor: the default mobile
// state is a FULL-SCREEN live preview with a persistent dark bottom tab bar
// (BottomTabBar) and NO panel open. Tapping a panel tab (Build/Style/Settings/
// Install) opens THAT tab's panel as a bottom SHEET overlaying the preview. The
// bottom tab bar stays visible above-the-fold so the user can switch tabs; a
// close chevron (and tapping the active tab again, handled by the parent)
// dismisses the sheet back to the full preview.
//
// This REPLACES the previous model (3-snap collapsible pill + the separate
// qq-mobile-actionbar with Save/Reset). The Save capability is NOT lost — it
// is relocated into this sheet's sticky footer ("Save draft"); autosave also
// runs in the parent. Reset-to-default and Help are also reachable from the
// footer.
//
// Constraints / parity:
//   - Mobile-only (≤768px); desktop continues to use the side-panel.
//   - The sheet sits ABOVE the persistent dark bottom tab bar (~60px + safe
//     area), so its body never hides behind it.
//   - GPU-accelerated translateY slide; 240ms ease-out; reduced-motion safe.
//   - Touch targets ≥ 44px.
//   - z-index 9998 (above canvas + backdrop, below the bottom tab bar at 9999
//     so tabs stay tappable while the sheet is open).
//   - Listens for `qq-wizard:focus-field` so a PreviewPane tap auto-opens the
//     sheet, switches tab, and scrolls the field into view.

import {
  useCallback, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, HelpCircle, RotateCcw } from 'lucide-react';
import { platformTheme } from '@/theme/platformTheme';
import { AE } from './appleEditor';
import { useLayoutGuard } from '@/lib/layoutGuard';
import { EDITOR_TABS, type EditorTab } from './types';

const p = platformTheme;

// Height of the persistent dark bottom tab bar (icon+label cell). The sheet's
// footer + body clear this so nothing hides behind it.
const BOTTOM_BAR_PX = 60;

// Height of the clean mobile top bar (✕ · name · autosave · Publish). The
// backdrop is inset to BELOW this so the top bar stays tappable while the
// sheet is open (see backdrop CSS note below).
const TOPBAR_PX = 64;

// ── Component ─────────────────────────────────────────────────────────

interface Props {
  /** Whether the panel sheet is open over the preview. When false the sheet
   *  slides off-screen and the preview is fully visible (default state). */
  open: boolean;
  /** Dismiss the sheet back to the full preview. */
  onClose: () => void;
  activeTab: EditorTab;
  /** Switch tab + (re)open. Used by the focus-field listener. */
  onTabChange: (tab: EditorTab) => void;
  onResetTab: () => void;
  /** Save draft (relocated here from the removed action bar). */
  onSave: () => void;
  /** Opens the editor help overlay. */
  onHelp?: () => void;
  /** The active tab's body component. */
  children: ReactNode;
  /** When true, Save is busy. */
  isBusy?: boolean;
}

function readPrefersReduced(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}

export default function MobileBottomSheet({
  open, onClose, activeTab, onTabChange, onResetTab, onSave, onHelp,
  children, isBusy = false,
}: Props) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const reduceMotion = useMemo(readPrefersReduced, []);

  // Scroll container ref so `qq-wizard:focus-field` can scroll into view.
  const contentRef = useRef<HTMLDivElement>(null);
  useLayoutGuard(contentRef, { maxGapPx: 24, label: 'wizard-sheet-content' });

  // ── `qq-wizard:focus-field` listener ──────────────────────────────
  // A PreviewPane tap dispatches this to: switch active tab, OPEN the sheet,
  // and scroll the section/field into view + transient highlight.
  useEffect(() => {
    const onFocus = (e: Event) => {
      const ev = e as CustomEvent<{ tabId?: EditorTab; sectionId?: string; fieldId?: string }>;
      const { tabId, sectionId, fieldId } = ev.detail ?? {};
      if (tabId) onTabChange(tabId);
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
  }, [onTabChange, reduceMotion]);

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
    EDITOR_TABS.find((t) => t.id === activeTab)?.label ?? 'Build';

  // Portal to document.body so the fixed-position sheet anchors to the
  // VIEWPORT, not to any transformed/filtered/backdrop-filtered editor
  // ancestor (those establish a containing block for position:fixed and
  // were pinning the open sheet off-screen below the scrolled frame).
  return createPortal(
    <>
      {/* Backdrop — only paints when the sheet is open. Tapping it closes
          the sheet (back to full preview). */}
      {open && (
        <div
          className="qq-sheet-backdrop"
          data-testid="wizard-sheet-backdrop"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <div
        data-theme="light"
        className={`qq-sheet${open ? ' is-open' : ''}${reduceMotion ? ' is-reduced-motion' : ''}`}
        data-testid="wizard-bottom-sheet"
        data-open={open ? 'true' : 'false'}
        role="dialog"
        aria-label={`${activeTabLabel} settings`}
        aria-modal="true"
        aria-hidden={open ? undefined : true}
      >
        {/* ── Sheet header — title + close chevron ──────────────────── */}
        <div className="qq-sheet-header">
          <span className="qq-sheet-title" data-testid="wizard-sheet-title">
            {activeTabLabel}
          </span>
          <button
            type="button"
            className="qq-sheet-close"
            data-testid="wizard-sheet-close"
            onClick={onClose}
            aria-label="Close panel"
            title="Close panel"
          >
            <ChevronDown size={24} aria-hidden="true" />
          </button>
        </div>

        {/* ── Scrollable content (active tab's panel only) ───────────── */}
        <div
          ref={contentRef}
          className="qq-sheet-content"
          data-testid="wizard-sheet-content"
        >
          {children}
        </div>

        {/* ── Sticky action footer (Help · Reset · Save) ───────────── */}
        <div className="qq-sheet-footer" data-testid="wizard-sheet-footer">
          <button
            type="button"
            className="qq-sheet-footer-help"
            onClick={() => onHelp?.()}
            data-testid="wizard-sheet-help"
            aria-label="Editor help"
            title="Editor help"
          >
            <HelpCircle size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`qq-sheet-footer-reset${showResetConfirm ? ' is-confirm' : ''}`}
            onClick={onResetClick}
            data-testid="wizard-sheet-reset"
            aria-label={showResetConfirm ? 'Confirm reset to default' : 'Reset to default'}
            title="Reset this tab to default"
          >
            <RotateCcw size={16} aria-hidden="true" />
            <span>{showResetConfirm ? 'Tap to confirm' : 'Reset'}</span>
          </button>
          <button
            type="button"
            className="qq-sheet-footer-done"
            onClick={onSave}
            data-testid="wizard-sheet-done"
            disabled={isBusy}
          >
            {isBusy ? 'Saving…' : 'Save draft'}
          </button>
        </div>
      </div>

      <style>{`
        /* Mobile-only — desktop continues to use the side-panel pattern. */
        .qq-sheet, .qq-sheet-backdrop { display: none; }

        @media (max-width: 768px) {
          .qq-sheet-backdrop {
            display: block;
            /* Constrained to the PREVIEW zone only — below the top bar and
               above the bottom tab bar — NOT inset:0. The backdrop is portaled
               to <body>, so a full-viewport overlay sits in a higher stacking
               context than the editor chrome (top bar / bottom tab bar live
               inside the shell) and swallowed their taps no matter their
               z-index, AND a backdrop tap on the chrome did nothing. Inset to
               the preview area so the chrome stays physically uncovered +
               tappable while the sheet is open, and a tap on the dimmed
               preview still closes the sheet (onClick={onClose}). */
            position: fixed;
            top: ${TOPBAR_PX}px; left: 0; right: 0;
            bottom: calc(${BOTTOM_BAR_PX}px + env(safe-area-inset-bottom, 0px));
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
            position: fixed; left: 0; right: 0;
            /* Sit ABOVE the persistent dark bottom tab bar so the bar's tabs
               stay tappable while a panel is open. */
            bottom: calc(${BOTTOM_BAR_PX}px + env(safe-area-inset-bottom, 0px));
            height: 70vh; max-height: 70vh;
            /* z-index 9998 — above canvas + backdrop (9997), below the bottom
               tab bar (9999). */
            z-index: 9998;
            background: ${AE.color.bg};
            font-family: ${AE.font.family};
            color: ${AE.color.text};
            border-top-left-radius: ${AE.radius.lg};
            border-top-right-radius: ${AE.radius.lg};
            box-shadow: ${AE.shadow.pop};
            border-top: 1px solid ${AE.color.hairline};
            /* Default = slid FULLY off-screen (closed). Because the sheet is
               anchored bottom: BOTTOM_BAR_PX + safe-area (so the open sheet
               clears the dark tab bar), a plain translateY(100%) would leave a
               ~60px header peeking over the bar. Translate by its full height
               PLUS that bottom offset so it clears the screen entirely. */
            transform: translateY(calc(100% + ${BOTTOM_BAR_PX}px + env(safe-area-inset-bottom, 0px)));
            transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
            will-change: transform;
            touch-action: pan-y;
            pointer-events: none;
          }
          .qq-sheet.is-open {
            transform: translateY(0);
            pointer-events: auto;
          }

          /* ── Sheet header ──────────────────────────────────────── */
          .qq-sheet-header {
            flex-shrink: 0;
            display: flex; align-items: center; justify-content: space-between;
            gap: 8px;
            padding: 12px 12px 8px 18px;
            border-bottom: 1px solid ${AE.color.hairline};
          }
          .qq-sheet-title {
            font-size: 17px; font-weight: 600;
            color: ${AE.color.text};
            letter-spacing: -0.01em;
          }
          .qq-sheet-close {
            display: inline-flex; align-items: center; justify-content: center;
            min-width: 44px; min-height: 44px; padding: 0;
            background: transparent; border: none; cursor: pointer;
            color: ${AE.color.secondary};
            border-radius: ${AE.radius.md};
          }
          .qq-sheet-close:active { background: ${AE.color.surface}; }
          .qq-sheet-close:focus-visible {
            outline: 2px solid ${AE.color.accent};
            outline-offset: -2px;
          }

          /* ── Scrollable content ────────────────────────────────── */
          .qq-sheet-content {
            flex: 1; min-height: 0;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            padding: 8px 12px;
            scroll-behavior: smooth;
          }
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
            padding: 10px 12px;
            border-top: 1px solid ${AE.color.hairline};
            background: ${AE.color.bg};
            flex-shrink: 0;
            z-index: 2;
          }
          .qq-sheet-footer-reset {
            display: inline-flex; align-items: center; gap: 6px;
            min-height: 44px; padding: 0 14px;
            background: ${AE.color.surface};
            border: 1px solid ${AE.color.hairline};
            border-radius: ${AE.radius.md};
            font: inherit; font-size: 13px; font-weight: 500;
            color: ${AE.color.text};
            cursor: pointer;
            transition: background 0.12s ease, border-color 0.12s ease,
                        color 0.12s ease;
          }
          .qq-sheet-footer-reset:hover { background: ${AE.color.surfaceHover}; }
          .qq-sheet-footer-help {
            display: inline-flex; align-items: center; justify-content: center;
            min-width: 44px; min-height: 44px; padding: 0 10px;
            background: ${AE.color.surface};
            border: 1px solid ${AE.color.hairline};
            border-radius: ${AE.radius.md};
            color: ${AE.color.text};
            cursor: pointer;
            transition: background 0.12s ease, border-color 0.12s ease,
                        color 0.12s ease;
          }
          .qq-sheet-footer-help:hover { background: ${AE.color.surfaceHover}; }
          .qq-sheet-footer-help:focus-visible {
            outline: 2px solid ${AE.color.accent};
            outline-offset: -2px;
          }
          .qq-sheet-footer-reset.is-confirm {
            background: ${AE.color.accentTint};
            border-color: ${AE.color.accent};
            color: ${AE.color.accent};
          }
          .qq-sheet-footer-done {
            flex: 1; min-height: 44px;
            background: ${AE.color.publish};
            color: ${AE.color.publishText};
            border: none;
            border-radius: ${AE.radius.md};
            font: inherit; font-size: 14px; font-weight: 600;
            cursor: pointer;
            box-shadow: none;
            transition: box-shadow 0.12s ease, background 0.12s ease;
          }
          .qq-sheet-footer-done:hover:not(:disabled) {
            background: ${AE.color.accentHover};
          }
          .qq-sheet-footer-done:disabled {
            opacity: 0.55; cursor: not-allowed;
          }

          /* Dark editor theme ── flip surfaces. */
          .qq-editor-shell[data-theme="dark"] .qq-sheet {
            background: var(--qq-surface);
            border-top-color: var(--qq-border);
          }
          .qq-editor-shell[data-theme="dark"] .qq-sheet-header {
            border-bottom-color: var(--qq-border);
          }
          .qq-editor-shell[data-theme="dark"] .qq-sheet-title {
            color: var(--qq-text, rgba(255,255,255,1));
          }
          .qq-editor-shell[data-theme="dark"] .qq-sheet-footer {
            background: var(--qq-surface);
            border-top-color: var(--qq-border);
          }
          .qq-editor-shell[data-theme="dark"] .qq-sheet-footer-reset,
          .qq-editor-shell[data-theme="dark"] .qq-sheet-footer-help {
            background: rgba(255,255,255,0.04);
            border-color: var(--qq-border);
            color: var(--qq-text);
          }
        }

        /* prefers-reduced-motion — instant open/close, no transitions. */
        @media (prefers-reduced-motion: reduce) {
          .qq-sheet, .qq-sheet-content {
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
        .qq-sheet.is-reduced-motion {
          transition: none !important;
        }
      `}</style>
    </>,
    document.body,
  );
}
