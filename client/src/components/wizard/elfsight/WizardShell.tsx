// WizardShell — Elfsight-clone editor shell (Wave H1 → Wave I).
//
// Layout:
//   ┌────────────────────────────────────────────────────────┐
//   │ EditorTopBar  (brand · saved · spacer · device · ? · X) │
//   ├──────────┬─────────────────────────────────────────────┤
//   │ Tabs     │ Build · Style · Settings · Install          │
//   ├──────────┴─────────────┬───────────────────────────────┤
//   │ <TabPlaceholder>       │  <PreviewPane>                │
//   │ (editor column)        │  sticky live preview          │
//   └────────────────────────┴───────────────────────────────┘
//
// Wave I additions:
//  - One <DndContext/> spans the entire body so drags from the AddFieldMenu
//    (in the left pane) into the preview (right pane) work cross-section.
//    The single onDragEnd handler routes by container id.
//  - <SelectionProvider/> shares "which row is the user looking at?" state
//    between left-pane rows and right-pane preview-overlay decorators.
//  - Vertical drag-handle on the right edge of the left pane resizes it;
//    persisted to localStorage (`qq_editor_pane_width`). Hidden on mobile
//    (≤768px) via CSS — replaced by nothing since mobile stacks vertically.
//  - Open / close transitions on the wizard-shell-modal overlay (CSS only,
//    respects `prefers-reduced-motion`). Snappier on mobile.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import {
  DndContext, type DragEndEvent, type DragOverEvent, type DragStartEvent,
  closestCenter, pointerWithin,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { apiRequest } from '@/lib/queryClient';
import { platformTheme } from '@/theme/platformTheme';
import { dashboardTheme } from '@/theme/dashboardTheme';
import {
  buildBlankPreviewConfig, getTemplatePreset, deriveStyleFromCategory,
  type TemplateField, type TemplateCalculation, type TemplateConfig,
  type TemplateTiered,
  type TrustBadge,
  type TemplateStep,
} from '@shared/templatePresets';
import AIBubble from './AIBubble';
import EditorTopBar from './EditorTopBar';
// 2026-05-22 (revert of PR #535) — EditorBottomBar was deleted; the tab
// strip lives back in the top chrome again. See EditorTopBar.tsx.
import MobileBottomSheet from './MobileBottomSheet';
// BH-2 — EditorTabs is no longer rendered as a standalone bar; the tab
// strip is rendered inline inside EditorTopBar so the top chrome lives on
// a single horizontal row. The component file is preserved for any future
// reuse but is intentionally not imported here.
import TabPlaceholder from './TabPlaceholder';
import BuildTab from './BuildTab';
import PreviewPane from './PreviewPane';
import StyleTab from './StyleTab';
import SettingsTab from './SettingsTab';
import InstallTab from './InstallTab';
import { makeField } from './FieldsPanel';
import { SelectionProvider } from './selection';
import { useEditorDndSensors, DND_CONTAINERS } from './dnd';
import {
  INITIAL_SHELL_STATE, DEFAULT_SHELL_STYLE, DEFAULT_SHELL_NUMBER_FORMAT,
  DEVICE_PRESET_STORAGE_KEY,
  type EditorTab, type EditorTheme, type PreviewDevice, type ShellState,
  type ShellHeader, type ShellResults, type ShellStyle,
  type ShellSettings, type ShellNumberFormat, type ShellPricing,
  type PublicFieldType,
} from './types';

const p = platformTheme;
const d = dashboardTheme;

const STORAGE_KEY = 'qq_elfsight_shell';
const PANE_WIDTH_KEY = 'qq_editor_pane_width';
const EDITOR_THEME_KEY = 'qq_editor_theme';
// Wave M — fold/unfold preview pane. Persists across reloads.
const PREVIEW_COLLAPSED_KEY = 'qq_preview_collapsed';
// W-AO-1 — mobile sticky action bar extended-state. Collapsed = primary
// CTA only (56px); extended = primary CTA + horizontally scrollable
// secondary row (~140px). Persists across reloads so the user's stance
// survives the wizard reopening.
const ACTION_BAR_EXTENDED_KEY = 'qq_wizard_action_bar_extended';
const PANE_WIDTH_MIN = 320;
const PANE_WIDTH_MAX = 640;
const PANE_WIDTH_DEFAULT = 420;

function readPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
}
function loadEditorTheme(): EditorTheme {
  try {
    const raw = localStorage.getItem(EDITOR_THEME_KEY);
    if (raw === 'light' || raw === 'dark') return raw;
  } catch {}
  return readPrefersDark() ? 'dark' : 'light';
}

function seedFields(layout: ShellState['layout']): TemplateField[] {
  return buildBlankPreviewConfig(layout).fields.map((f) => ({ ...f }));
}
function seedCalculations(layout: ShellState['layout']): TemplateCalculation[] {
  return buildBlankPreviewConfig(layout).calculations.map((c) => ({ ...c }));
}

function loadShellState(): ShellState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const layout = parsed.layout ?? INITIAL_SHELL_STATE.layout;
      const hasFields = Array.isArray(parsed.fields) && parsed.fields.length > 0;
      const hasCalcs = Array.isArray(parsed.calculations) && parsed.calculations.length > 0;
      return {
        ...INITIAL_SHELL_STATE,
        ...parsed,
        layout,
        fields: hasFields
          ? parsed.fields
          : (parsed.fields === undefined ? seedFields(layout) : []),
        calculations: hasCalcs
          ? parsed.calculations
          : (parsed.calculations === undefined ? seedCalculations(layout) : []),
        header: parsed.header ?? {},
        results: parsed.results ?? {},
        resultCalcId: parsed.resultCalcId,
        style: { ...DEFAULT_SHELL_STYLE, ...(parsed.style ?? {}) },
        settings: {
          ...(INITIAL_SHELL_STATE.settings ?? {}),
          ...(parsed.settings ?? {}),
          numberFormat: {
            ...DEFAULT_SHELL_NUMBER_FORMAT,
            ...((parsed.settings && parsed.settings.numberFormat) ?? {}),
          },
        },
        // Wave J — logo (optional). null when not set, data URL when uploaded.
        logo: (typeof parsed.logo === 'string' && parsed.logo) ? parsed.logo : (parsed.logo === null ? null : null),
      };
    }
  } catch {}
  return {
    ...INITIAL_SHELL_STATE,
    fields: seedFields(INITIAL_SHELL_STATE.layout),
    calculations: seedCalculations(INITIAL_SHELL_STATE.layout),
    style: { ...DEFAULT_SHELL_STYLE },
  };
}

function loadPaneWidth(): number {
  try {
    const raw = localStorage.getItem(PANE_WIDTH_KEY);
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= PANE_WIDTH_MIN && n <= PANE_WIDTH_MAX) return n;
    }
  } catch {}
  return PANE_WIDTH_DEFAULT;
}

// Wave M — load the persisted fold/unfold state. Defaults to false (preview
// shown) so first-time users see the full editor + preview layout.
function loadPreviewCollapsed(): boolean {
  try {
    return localStorage.getItem(PREVIEW_COLLAPSED_KEY) === '1';
  } catch { return false; }
}

// W-AO-1 — bottom action-bar extended state. Defaults to collapsed (56px
// primary-only) because most first-time mobile users only need the
// primary Save CTA; secondary tools are surfaced via a chevron drag.
function loadActionBarExtended(): boolean {
  try {
    return localStorage.getItem(ACTION_BAR_EXTENDED_KEY) === '1';
  } catch { return false; }
}

function thousandsLiteral(sep: ShellNumberFormat['thousands']): ',' | ' ' | '' {
  return sep === 'comma' ? ',' : sep === 'space' ? ' ' : '';
}
function decimalLiteral(sep: ShellNumberFormat['decimal']): '.' | ',' {
  return sep === 'comma' ? ',' : '.';
}

function toAdvNumberFormat(nf: ShellNumberFormat | undefined) {
  const resolved = nf ?? DEFAULT_SHELL_NUMBER_FORMAT;
  return {
    thousands: thousandsLiteral(resolved.thousands),
    decimal: decimalLiteral(resolved.decimal),
    currency: resolved.currency || 'USD',
  };
}

function toPricingConfig(pricing: ShellPricing | undefined) {
  if (!pricing) {
    return { pricingType: 'hourly', unitName: 'hour', rate: 75, baseFee: 50 } as const;
  }
  if (pricing.mode === 'hourly') {
    const rate = typeof pricing.rate === 'number' && pricing.rate >= 0 ? pricing.rate : 75;
    return { pricingType: 'hourly', unitName: 'hour', rate } as const;
  }
  if (pricing.mode === 'fixed') {
    const minCharge = typeof pricing.value === 'number' && pricing.value >= 0 ? pricing.value : 0;
    return { pricingType: 'min_charge_plus_addons', minCharge } as const;
  }
  const unitName = (pricing.label ?? '').trim() || 'unit';
  const rate = typeof pricing.rate === 'number' && pricing.rate >= 0 ? pricing.rate : 1;
  return { pricingType: 'per_unit', unitName, rate } as const;
}

interface Props {
  embed?: boolean;
}

// BD-3a fix 1 — undo/redo history stack depth. Capped to prevent memory bloat
// when an owner edits a lot inside one session (each tweak pushes the prior
// state). 50 entries handles a typical build session comfortably.
const HISTORY_LIMIT = 50;

export default function WizardShell({ embed = false }: Props) {
  const [, navigate] = useLocation();
  const [state, setStateInner] = useState<ShellState>(() => loadShellState());
  const [activeTab, setActiveTab] = useState<EditorTab>('build');
  // BH-1 — device preset persisted in sessionStorage so the user's pick
  // survives navigation between Build / Style / Settings / Install tabs but
  // doesn't bleed across browser sessions (the wizard always opens on the
  // default for a fresh session).
  const [device, setDeviceInner] = useState<PreviewDevice>(() => {
    if (typeof window === 'undefined') return 'desktop';
    try {
      const raw = window.sessionStorage.getItem(DEVICE_PRESET_STORAGE_KEY);
      if (raw === 'desktop' || raw === 'tablet' || raw === 'mobile') return raw;
    } catch { /* private mode — fall through */ }
    return 'desktop';
  });
  const setDevice = useCallback((next: PreviewDevice) => {
    setDeviceInner(next);
    if (typeof window === 'undefined') return;
    try { window.sessionStorage.setItem(DEVICE_PRESET_STORAGE_KEY, next); }
    catch { /* private mode — ignore */ }
  }, []);
  const [justSaved, setJustSaved] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // BD-3a fix 1 — undo / redo stacks of prior ShellState snapshots. We use
  // refs so pushing to the stacks doesn't itself trigger a re-render; the
  // `historyTick` counter is bumped after each push so EditorTopBar can read
  // the up-to-date `canUndo` / `canRedo` flags via a stable selector.
  const undoStackRef = useRef<ShellState[]>([]);
  const redoStackRef = useRef<ShellState[]>([]);
  // `isReplayingRef` guards setState() during undo/redo so the replay itself
  // doesn't get pushed back onto the undo stack (which would make undo a no-op
  // toggle between the two most recent states).
  const isReplayingRef = useRef(false);
  const [historyTick, setHistoryTick] = useState(0);

  // Wrap setState so that every USER-INITIATED mutation pushes the previous
  // snapshot onto the undo stack and clears the redo stack (the classic
  // editor undo/redo semantics — new edit invalidates redo history).
  const setState = useCallback<typeof setStateInner>((updater) => {
    if (isReplayingRef.current) {
      // Replay path — don't touch the history stacks.
      setStateInner(updater);
      return;
    }
    setStateInner((prev) => {
      const next = typeof updater === 'function'
        ? (updater as (s: ShellState) => ShellState)(prev)
        : updater;
      if (next !== prev) {
        const stack = undoStackRef.current;
        stack.push(prev);
        if (stack.length > HISTORY_LIMIT) stack.shift();
        redoStackRef.current = [];
        // Defer the tick bump so React doesn't warn about setting state
        // during render — undoStackRef.current was just mutated synchronously
        // but historyTick is a plain useState.
        queueMicrotask(() => setHistoryTick((t) => t + 1));
        // BD-3d Feature 2 — broadcast every user-initiated patch so the AI
        // chat bubble can detect "5+ rapid edits without saving" (rapid-edit
        // signal → proactive nudge).
        if (typeof window !== 'undefined') {
          try { window.dispatchEvent(new CustomEvent('quotequick:wizard-patch')); } catch { /* ignore */ }
        }
      }
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const prev = stack.pop()!;
    setStateInner((current) => {
      redoStackRef.current.push(current);
      if (redoStackRef.current.length > HISTORY_LIMIT) redoStackRef.current.shift();
      return prev;
    });
    isReplayingRef.current = true;
    queueMicrotask(() => {
      isReplayingRef.current = false;
      setHistoryTick((t) => t + 1);
    });
  }, []);

  const redo = useCallback(() => {
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const next = stack.pop()!;
    setStateInner((current) => {
      undoStackRef.current.push(current);
      if (undoStackRef.current.length > HISTORY_LIMIT) undoStackRef.current.shift();
      return next;
    });
    isReplayingRef.current = true;
    queueMicrotask(() => {
      isReplayingRef.current = false;
      setHistoryTick((t) => t + 1);
    });
  }, []);

  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;
  // Suppress unused-var lint — `historyTick` exists purely to re-render when
  // the ref-backed stacks change.
  void historyTick;

  // BD-3a fix 1 — keyboard shortcuts. Cmd/Ctrl+Z = undo, Cmd/Ctrl+Shift+Z
  // (or Cmd/Ctrl+Y) = redo. We skip when the user is typing in a real text
  // field so the browser's native input undo keeps working there.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const target = ev.target as Element | null;
      const inEditableField = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || (target instanceof HTMLElement && target.isContentEditable);
      if (inEditableField) return;
      const meta = ev.metaKey || ev.ctrlKey;
      if (!meta) return;
      const key = ev.key.toLowerCase();
      if (key === 'z' && !ev.shiftKey) {
        ev.preventDefault();
        undo();
      } else if ((key === 'z' && ev.shiftKey) || key === 'y') {
        ev.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // Wave R-pre D — token-driven plan_tier load. When the wizard is opened
  // via `/wizard?token=...` (the post-publish dashboard link), fetch the
  // calculator's plan_tier and surface it to tier-aware bits (Settings
  // tab brand-badge toggle, future AI/feature gates). Plain `/wizard`
  // visitors default to 'free'. No leak: the endpoint returns only id,
  // slug, plan_tier, business_name.
  const [planTier, setPlanTier] = useState<string>('free');
  // IA-1 (2026-05-22) — minimal calculator identity captured from
  // /api/calculators/me. Used by the minimize-to-dashboard handler to
  // build a resumable session for the floating badge.
  const [calcIdentity, setCalcIdentity] = useState<{ id: number | null; businessName: string | null }>({
    id: null, businessName: null,
  });

  // IA-1 — capture where the user came from BEFORE the wizard mounts
  // replaces history. We use this to land them back on the same
  // dashboard when they click Minimize. Document.referrer is the
  // truth-source here; we only persist /admin/* or /portal/* paths.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (embed) return;
    try {
      // If a return path is ALREADY stashed, leave it — the user may
      // have refreshed mid-wizard and we want the original origin.
      if (sessionStorage.getItem('qq-wizard-came-from')) return;
      const ref = document.referrer;
      if (!ref || !ref.startsWith(window.location.origin)) return;
      const refPath = new URL(ref).pathname;
      if (refPath.startsWith('/admin') || refPath.startsWith('/portal')) {
        sessionStorage.setItem('qq-wizard-came-from', refPath);
      }
    } catch { /* sessionStorage blocked / bad URL — silently skip */ }
  }, [embed]);
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      if (!token) return;
      let cancelled = false;
      (async () => {
        try {
          const r = await fetch(`/api/calculators/me?token=${encodeURIComponent(token)}`);
          if (!r.ok) return;
          const data = await r.json();
          if (cancelled) return;
          if (typeof data?.plan_tier === 'string') {
            setPlanTier(data.plan_tier);
          }
          // Capture minimal identity for the minimize handler — id +
          // business_name only. /api/calculators/me already restricts
          // its response to these fields, so no PII leak.
          setCalcIdentity({
            id: typeof data?.id === 'number' ? data.id : null,
            businessName: typeof data?.business_name === 'string' ? data.business_name : null,
          });
        } catch { /* silent — plan_tier stays 'free' */ }
      })();
      return () => { cancelled = true; };
    } catch { /* no window — SSR no-op */ }
  }, []);
  // Wave J item 3 — editor chrome theme (light/dark). Independent of the
  // template-level theme that drives the live preview / AdvancedCalculator.
  const [editorTheme, setEditorTheme] = useState<EditorTheme>(() => loadEditorTheme());
  useEffect(() => {
    try { localStorage.setItem(EDITOR_THEME_KEY, editorTheme); } catch {}
  }, [editorTheme]);

  // ── Wave I (d): resizable left pane width ─────────────────────────────
  const [paneWidth, setPaneWidth] = useState<number>(() => loadPaneWidth());
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(PANE_WIDTH_KEY, String(paneWidth)); } catch {}
  }, [paneWidth]);

  // ── Wave M: fold/unfold preview pane ──────────────────────────────────
  const [previewCollapsed, setPreviewCollapsed] = useState<boolean>(
    () => loadPreviewCollapsed(),
  );
  useEffect(() => {
    try {
      localStorage.setItem(PREVIEW_COLLAPSED_KEY, previewCollapsed ? '1' : '0');
    } catch {}
  }, [previewCollapsed]);
  const togglePreviewCollapsed = useCallback(() => {
    setPreviewCollapsed((v) => !v);
  }, []);

  // ── P2 UX: floating launcher preview mode ─────────────────────────
  // Lets wizard owners SEE what visitors see — when on, the preview canvas
  // dims and the widget collapses to a 56×56 bubble in the bottom-right
  // (mimicking BD-3m's floating launcher). Click the bubble to expand
  // back to the full widget; click outside the expanded widget to collapse
  // back to the bubble. Toggle the top-chrome button to exit. NOT
  // persisted across sessions — it's a transient preview lens.
  const [floatingLauncherPreview, setFloatingLauncherPreview] = useState(false);
  const [floatingLauncherExpanded, setFloatingLauncherExpanded] = useState(false);
  const toggleFloatingLauncherPreview = useCallback(() => {
    setFloatingLauncherPreview((v) => {
      const next = !v;
      // Always start in collapsed (bubble) state on entering preview mode.
      if (next) setFloatingLauncherExpanded(false);
      return next;
    });
  }, []);

  // ── W-AO-1: mobile sticky action bar extended state ────────────────
  const [actionBarExtended, setActionBarExtended] = useState<boolean>(
    () => loadActionBarExtended(),
  );
  useEffect(() => {
    try {
      localStorage.setItem(ACTION_BAR_EXTENDED_KEY, actionBarExtended ? '1' : '0');
    } catch {}
  }, [actionBarExtended]);
  const toggleActionBarExtended = useCallback(() => {
    setActionBarExtended((v) => !v);
  }, []);

  const onResizeStart = useCallback((startX: number, startWidth: number) => {
    setIsResizing(true);
    const onMove = (ev: MouseEvent | TouchEvent) => {
      const x = 'touches' in ev ? ev.touches[0].clientX : ev.clientX;
      const next = Math.max(PANE_WIDTH_MIN, Math.min(PANE_WIDTH_MAX, startWidth + (x - startX)));
      setPaneWidth(next);
    };
    const onUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);
  }, []);

  // ── Wave H7: reflect the chosen language on the shell wrapper. Only the
  // LANG attribute is wired; translation strings are out of scope.
  // TODO(i18n): when translations land, propagate down to AdvancedCalculator
  // and the wizard headline copy as well.
  const shellLang = (state.settings?.language ?? 'en');

  // P2 UX — business-level currency symbol. Read from
  // `settings.numberFormat.currency` (ISO 4217 code) and mapped to a
  // glyph for use as a wizard label suffix (e.g. "Deposit amount ($)").
  // Falls back to `$` when unset so legacy calculators don't change
  // visually. Mirrors `CURRENCY_SYMBOLS` in `AdvancedCalculator.tsx`.
  const currencySymbol = (() => {
    const map: Record<string, string> = {
      USD: '$', CAD: '$', AUD: '$', NZD: '$', SGD: '$', HKD: '$', MXN: '$',
      EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', CHF: 'CHF',
      SEK: 'kr', NOK: 'kr', DKK: 'kr', PLN: 'zł', INR: '₹', BRL: 'R$', ZAR: 'R',
    };
    const code = (state.settings?.numberFormat?.currency ?? 'USD').toString().toUpperCase();
    return map[code] ?? '$';
  })();

  // ── Wave I (h): mount/unmount transition state ────────────────────────
  // The modal wrapper paints in `is-entering` → `is-open` for the open
  // animation, and is set to `is-leaving` for ~180ms (snappier on mobile)
  // before navigation completes the close. `prefers-reduced-motion` skips.
  const [openPhase, setOpenPhase] = useState<'entering' | 'open' | 'leaving'>('entering');
  useEffect(() => {
    if (embed) { setOpenPhase('open'); return; }
    // Settle to "open" after the next frame so the entering keyframe paints.
    const id = requestAnimationFrame(() => setOpenPhase('open'));
    return () => cancelAnimationFrame(id);
  }, [embed]);

  // Persist locally.
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }, [state]);

  const setBusinessName = useCallback((v: string) => {
    setState((s) => ({ ...s, businessName: v }));
  }, []);

  // Wave J item 5 — logo (data URL or null). Persisted alongside the rest
  // of the shell state via the existing localStorage write effect.
  const setLogo = useCallback((next: string | null) => {
    setState((s) => ({ ...s, logo: next }));
  }, []);

  const setFields = useCallback((next: TemplateField[]) => {
    setState((s) => ({ ...s, fields: next }));
  }, []);

  const setCalculations = useCallback((next: TemplateCalculation[]) => {
    setState((s) => ({ ...s, calculations: next }));
  }, []);

  const setHeader = useCallback((next: ShellHeader) => {
    setState((s) => ({ ...s, header: next }));
  }, []);

  const setResults = useCallback((next: ShellResults) => {
    setState((s) => ({ ...s, results: next }));
  }, []);

  const setStyle = useCallback((next: ShellStyle) => {
    setState((s) => ({ ...s, style: next }));
  }, []);

  const setSettings = useCallback((next: ShellSettings) => {
    setState((s) => ({ ...s, settings: next }));
  }, []);

  /** BD-2a — owner-level override for the multi-step renderer. */
  const setStepLayout = useCallback((next: 'stepper' | 'single') => {
    setState((s) => ({ ...s, stepLayout: next }));
  }, []);

  // BD-2b — Good/Better/Best tier override. `undefined` clears the explicit
  // value so the renderer falls back to the category-derived default.
  const setTiered = useCallback((next: TemplateTiered | undefined) => {
    setState((s) => ({ ...s, tiered: next }));
  }, []);

  // BG-7 Item 1 — trust badges (owner-edited). When the new array is empty
  // the slot is cleared so the renderer falls back to the template seed
  // (which is also what an unset value means at server-side persistence).
  const setTrustBadges = useCallback((next: TrustBadge[]) => {
    setState((s) => ({ ...s, trustBadges: next.length === 0 ? undefined : next }));
  }, []);

  // BG-7 Item 4 — owner-edited step content. Only mutates the steps[]
  // array — fields and other top-level template state stay untouched.
  // BuildTab's StepContentPanel only renders the editor when the array
  // is non-empty, so callers always pass a populated list.
  const setSteps = useCallback((next: TemplateStep[]) => {
    setState((s) => ({ ...s, steps: next }));
  }, []);

  // W-AO-5 — `setResultCalc` was removed alongside the Build > Headline
  // result dropdown that consumed it. The Primary/Secondary segmented
  // control inside each CalculationRow already mutates
  // `calculations[*].resultMode` via `setCalculations`, which is the only
  // path PreviewPane actually reads for the explicit-primary headline.
  // `state.resultCalcId` is still loaded from saved templates and read by
  // PreviewPane for back-compat, but nothing in the editor mutates it.

  // ── Wave H7: apply a template preset (or "start blank"). Replaces the
  // structural slice of state (layout / fields / calculations / header /
  // results / resultCalcId) with the picked preset. Preserves the user's
  // business name, settings (trade / lead email / pricing / etc.), and
  // style overrides — those are independent of the template choice.
  // Passing `null` resets to a blank seed.
  const applyTemplate = useCallback((preset: TemplateConfig | null) => {
    setState((s) => {
      if (!preset) {
        // Blank seed — same as the H1 first-load behaviour.
        const layout = s.layout; // keep whatever layout was set
        return {
          ...s,
          activeTemplateId: undefined,
          fields: seedFields(layout),
          calculations: seedCalculations(layout),
          header: {},
          results: {},
          resultCalcId: undefined,
        };
      }
      // Clone deep enough that mutation in the editor doesn't reach back
      // into the catalogue object (the preset is shared across tabs).
      const nextFields = preset.fields.map((f) => ({ ...f }));
      const nextCalcs = preset.calculations.map((c) => ({ ...c }));
      // Find the headline calc id (if the preset names a specific one).
      const headlineCalc = nextCalcs.find((c) => c.name === preset.result_calc);
      // W-AS-1b — when a template ships with a `style` block (W-AS-1 sample
      // templates + every Brand Studio-styled future template), apply it to
      // the shell state so the editor PreviewPane renders the template's
      // visual identity (gradient bg, accent colour, result-panel emphasis,
      // etc.) instead of falling back to the bare theme. Without this the
      // preset.style block is silently dropped on apply and the user only
      // sees the template's intended look AFTER save. Style fields the
      // template doesn't set fall through to the existing shell defaults.
      // W-BB-2 — when a template DOESN'T ship its own `style`, fall back
      // to a category-derived `AdvStyle` so the 44 templates that aren't
      // AS-1c-styled still pick up a distinct per-category visual identity
      // (gradient bg, accent, result-panel emphasis, animations) in the
      // wizard preview. Templates with explicit `style` keep it untouched.
      const presetStyle = preset.style ?? deriveStyleFromCategory(preset);
      const nextStyle = { ...DEFAULT_SHELL_STYLE, ...(presetStyle as typeof s.style) };
      return {
        ...s,
        activeTemplateId: preset.id,
        layout: preset.layout,
        fields: nextFields,
        calculations: nextCalcs,
        header: {
          title: preset.header?.title,
          subtitle: preset.header?.subtitle,
        },
        results: {
          heading: preset.results?.heading,
          footnote: preset.results?.footnote,
        },
        resultCalcId: headlineCalc?.id,
        style: nextStyle,
        // BG-7 Item 1 — seed the trust-badge editor from the template's
        // pre-curated set. Owners can then add/remove/edit via StyleTab.
        // Undefined when the template ships no badges (renderer hides the
        // row in that case anyway).
        trustBadges: preset.trustBadges ? preset.trustBadges.map((b) => ({ ...b })) : undefined,
        // BG-7 Item 4 — seed step content from the template's explicit
        // `steps[]`. Undefined when the template lets the renderer
        // auto-derive — owners must define steps before adding
        // descriptions (panel hides itself for the auto-derive case).
        steps: preset.steps ? preset.steps.map((s) => ({ ...s, fields: [...s.fields] })) : undefined,
      };
    });
  }, []);

  // ── Wave I (f): in-preview remove / add ──────────────────────────────
  const removeField = useCallback((fieldId: string) => {
    setState((s) => ({ ...s, fields: s.fields.filter((f) => f.id !== fieldId) }));
  }, []);
  const addField = useCallback((publicType: PublicFieldType, atIndex?: number) => {
    setState((s) => {
      const next = [...s.fields];
      const f = makeField(publicType);
      // BF-10 — when atIndex is provided, splice in at that position so the
      // ComponentPicker's drop-zone insertion lands where the user clicked.
      // Out-of-range / undefined values fall back to append (legacy behaviour).
      if (typeof atIndex === 'number' && Number.isFinite(atIndex)
        && atIndex >= 0 && atIndex <= next.length) {
        next.splice(atIndex, 0, f);
      } else {
        next.push(f);
      }
      return { ...s, fields: next };
    });
  }, []);

  // ── Wave L E3: swipe-to-delete undo. PreviewPane dispatches a
  // `qq-undo-restore-field` event on window when the user taps Undo. We
  // splice the field back in at its original index. Defensive: if the
  // index is out of range (e.g. lots of edits happened in the undo window)
  // we append instead.
  useEffect(() => {
    const onRestore = (e: Event) => {
      const ev = e as CustomEvent<{ field: TemplateField; index: number }>;
      const detail = ev.detail;
      if (!detail || !detail.field) return;
      setState((s) => {
        // Avoid duplicates if the field still exists (e.g. removal failed).
        if (s.fields.some((f) => f.id === detail.field.id)) return s;
        const next = [...s.fields];
        const ins = Math.max(0, Math.min(detail.index, next.length));
        next.splice(ins, 0, detail.field);
        return { ...s, fields: next };
      });
    };
    window.addEventListener('qq-undo-restore-field', onRestore as EventListener);
    return () => window.removeEventListener('qq-undo-restore-field', onRestore as EventListener);
  }, []);

  // ── Wave K: apply a template preset by id (used by the AI assistant). ─
  const applyTemplatePreset = useCallback((presetId: string) => {
    const preset = getTemplatePreset(presetId);
    if (preset) applyTemplate(preset);
  }, [applyTemplate]);

  // ── P1 fix — apply `?template=<id>` from the URL on first mount. ──────
  // The marketing `/templates/:slug` page's "Use this template" CTA, the
  // `/templates` index "Use" CTA, and the `/demo/:id` "Start Free" CTA all
  // link to `/wizard?template=<preset.id>`. Without this effect the wizard
  // ignored the param and loaded whatever was in localStorage from the
  // user's previous session (which felt like a random template).
  //
  // Behaviour:
  //  - Runs once on mount (empty deps + a ref guard so React 18's strict-
  //    mode double-invoke doesn't apply twice).
  //  - Skipped when `?token=` is present: a saved draft is being loaded
  //    via the token flow above, and the saved draft wins so the user's
  //    existing work isn't clobbered by a marketing-link preset.
  //  - Looks up the preset by id. If found, applies it via the existing
  //    `applyTemplate` (which preserves the user's business name, settings,
  //    pricing, and style.brand — only the structural slice is replaced).
  //  - If the id is missing or unknown, we leave the existing state alone
  //    and `console.warn` so future regressions surface in the console
  //    instead of silently picking another template.
  //  - Strips `?template=<id>` from the URL after applying so a page
  //    refresh doesn't blow away the user's in-progress edits with the
  //    template seed a second time. Other query params (e.g. `?embed=1`,
  //    `?token=...`) are preserved.
  const templateUrlAppliedRef = useRef(false);
  useEffect(() => {
    if (templateUrlAppliedRef.current) return;
    templateUrlAppliedRef.current = true;
    try {
      const params = new URLSearchParams(window.location.search);
      // Saved draft via token wins — don't overwrite with a marketing preset.
      if (params.get('token')) return;
      const requestedId = params.get('template');
      if (!requestedId) return;
      const preset = getTemplatePreset(requestedId);
      if (preset) {
        applyTemplate(preset);
      } else {
        console.warn(
          `[wizard] /wizard?template=${requestedId} — no template preset matches that id; keeping current state.`,
        );
      }
      // Strip the consumed param from the URL so a reload doesn't re-apply
      // (which would discard any edits the user made after landing).
      params.delete('template');
      const qs = params.toString();
      const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
      try { window.history.replaceState(null, '', nextUrl); } catch { /* ignore */ }
    } catch { /* no window — SSR no-op */ }
  }, [applyTemplate]);

  // ── Wave I (a)+(b): cross-section DnD router ─────────────────────────
  const sensors = useEditorDndSensors();

  /* BD-3g Item 1 — live drag-sync to preview.
   *
   * Previously the preview only repainted on drag-end. Now `onDragOver`
   * applies the in-progress order to the live state immediately so the
   * preview tracks the cursor; the snapshot taken on drag-start is the
   * one that lands on the undo stack at drag-end (so undo restores the
   * ORIGINAL pre-drag order, not whatever intermediate position the
   * cursor was at when the mouse moved).
   *
   * Mechanics:
   *  - `preDragStateRef` captures the state at drag-start. Used by
   *    onDragEnd to push exactly one entry onto the undo stack (matching
   *    the BD-3a semantics) and by onDragCancel to revert.
   *  - `dragOverThrottleRef` carries an rAF id so onDragOver collapses
   *    rapid pointer events into one paint per frame (Alex called out
   *    ~50ms; rAF is ~16ms which is well below visible latency but
   *    avoids React rendering on every mousemove).
   *  - `setStateInner` is used inside the drag handlers so transient
   *    intermediate states don't pollute the undo stack — only the
   *    final dragEnd patch goes through `setState`.
   */
  const preDragStateRef = useRef<ShellState | null>(null);
  const dragOverThrottleRef = useRef<number | null>(null);
  const pendingDragOverRef = useRef<{ activeId: string; overId: string } | null>(null);

  const applyReorder = useCallback((s: ShellState, activeId: string, overId: string): ShellState => {
    if (activeId === overId) return s;
    const fieldIds = s.fields.map((f) => f.id);
    const fIdx = fieldIds.indexOf(activeId);
    if (fIdx >= 0) {
      const newIdx = fieldIds.indexOf(overId);
      if (newIdx >= 0) return { ...s, fields: arrayMove(s.fields, fIdx, newIdx) };
      return s;
    }
    const calcIds = s.calculations.map((c) => c.id);
    const cIdx = calcIds.indexOf(activeId);
    if (cIdx >= 0) {
      const newIdx = calcIds.indexOf(overId);
      if (newIdx >= 0) return { ...s, calculations: arrayMove(s.calculations, cIdx, newIdx) };
      return s;
    }
    return s;
  }, []);

  const onDragStart = useCallback((event: DragStartEvent) => {
    const activeId = String(event.active.id);
    // Don't snapshot for cross-section adds from the AddFieldMenu — those
    // already enter the undo stack via the normal `addField` path on drop.
    if (activeId.startsWith('addfield:')) return;
    setStateInner((s) => {
      preDragStateRef.current = s;
      return s;
    });
  }, []);

  const flushDragOver = useCallback(() => {
    dragOverThrottleRef.current = null;
    const pending = pendingDragOverRef.current;
    pendingDragOverRef.current = null;
    if (!pending) return;
    // Apply directly via setStateInner so the undo stack isn't touched
    // — the live preview is transient until drag-end.
    setStateInner((s) => applyReorder(s, pending.activeId, pending.overId));
  }, [applyReorder]);

  const onDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    if (activeId.startsWith('addfield:')) return;
    const overId = String(over.id);
    if (activeId === overId) return;
    pendingDragOverRef.current = { activeId, overId };
    if (dragOverThrottleRef.current != null) return;
    dragOverThrottleRef.current = window.requestAnimationFrame(flushDragOver);
  }, [flushDragOver]);

  const onDragCancel = useCallback(() => {
    // Cancel any queued rAF flush and revert to the pre-drag snapshot.
    if (dragOverThrottleRef.current != null) {
      cancelAnimationFrame(dragOverThrottleRef.current);
      dragOverThrottleRef.current = null;
    }
    pendingDragOverRef.current = null;
    const snapshot = preDragStateRef.current;
    preDragStateRef.current = null;
    if (snapshot) setStateInner(snapshot);
  }, []);

  const onDragEnd = useCallback((event: DragEndEvent) => {
    // Drain any queued rAF first so the visible preview reflects the
    // final over-target even if drop fires the same tick.
    if (dragOverThrottleRef.current != null) {
      cancelAnimationFrame(dragOverThrottleRef.current);
      dragOverThrottleRef.current = null;
      flushDragOver();
    }
    pendingDragOverRef.current = null;
    const { active, over } = event;
    const snapshot = preDragStateRef.current;
    preDragStateRef.current = null;
    if (!over) {
      // Dropped outside any droppable — same semantics as cancel.
      if (snapshot) setStateInner(snapshot);
      return;
    }
    const activeId = String(active.id);
    const overId = String(over.id);

    // ── (b) Drag from AddFieldMenu into the preview ────────────────────
    if (activeId.startsWith('addfield:')) {
      const overKind = (over.data?.current as { kind?: string } | undefined)?.kind;
      const overContainer = over.id as string;
      if (
        overKind === 'preview-append'
        || overContainer === 'qq-dnd-preview-pane'
      ) {
        const publicType = activeId.slice('addfield:'.length) as PublicFieldType;
        addField(publicType);
      }
      return;
    }

    // Same-id = no-op, but make sure the (already-live) preview state is
    // recorded onto the undo stack via setState() — otherwise the user
    // can't undo a drag that visually reordered then snapped back.
    if (activeId === overId) {
      if (snapshot) {
        setStateInner((current) => {
          if (current === snapshot) return current;
          // Push the pre-drag snapshot onto the undo stack and keep
          // `current` (which already reflects the dragOver moves).
          const stack = undoStackRef.current;
          stack.push(snapshot);
          if (stack.length > HISTORY_LIMIT) stack.shift();
          redoStackRef.current = [];
          queueMicrotask(() => setHistoryTick((t) => t + 1));
          return current;
        });
      }
      return;
    }

    // ── (a) Reorder Fields — commit the FINAL order into the undo stack
    // by manually pushing the pre-drag snapshot, then applying the move
    // via setStateInner (so the standard setState() doesn't push the
    // intermediate dragOver state onto the stack).
    setStateInner((current) => {
      const next = applyReorder(current, activeId, overId);
      if (snapshot && snapshot !== next) {
        const stack = undoStackRef.current;
        stack.push(snapshot);
        if (stack.length > HISTORY_LIMIT) stack.shift();
        redoStackRef.current = [];
        queueMicrotask(() => setHistoryTick((t) => t + 1));
        // Mirror setState()'s broadcast so the AIBubble rapid-edit
        // counter still ticks for drag-driven reorders.
        if (typeof window !== 'undefined') {
          try { window.dispatchEvent(new CustomEvent('quotequick:wizard-patch')); } catch { /* ignore */ }
        }
      }
      return next;
    });
  }, [addField, applyReorder, flushDragOver]);

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const settings = state.settings ?? {};
      const leadEmail = (settings.leadEmail ?? '').trim();
      const leadEmailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadEmail);
      const tradeId = (settings.tradeId ?? '').trim();
      const ctaLabel = (settings.ctaLabel ?? '').trim();

      const advanced: Record<string, unknown> = {
        numberFormat: toAdvNumberFormat(settings.numberFormat),
      };
      if (ctaLabel !== '') {
        advanced.results = { cta_label: ctaLabel };
      }

      // Wave H7 — surface the language pick as both a top-level
      // `calculator_settings.language` (explicit, easy for server consumers)
      // AND inside `shell_settings.language` (raw user state). The server
      // schema's `.catchall(z.any())` accepts the top-level field.
      const language = (settings.language ?? 'en');

      const res = await apiRequest('POST', '/api/calculators', {
        business_name: state.businessName,
        trade_type: tradeId || 'general',
        is_draft: true,
        pricing_config: toPricingConfig(settings.pricing),
        ...(leadEmailOk ? { owner_email: leadEmail } : {}),
        primary_color: p.colors.accent,
        // Wave P-F — pass the user's custom slug pick (if any) so the
        // server uses it verbatim instead of slugifying business name.
        // generateUniqueSlug() falls back gracefully when it's missing,
        // invalid, or taken.
        ...(settings.preferredSlug ? { preferred_slug: settings.preferredSlug } : {}),
        calculator_settings: {
          calculator_type: 'estimate_only',
          ui_template: { template_id: 'classic_single' },
          advanced,
          // Wave J item 5 — surface the logo into the saved payload so the
          // server can stash it. Stored as a top-level slot inside
          // calculator_settings (the schema's .catchall(z.any()) accepts it).
          ...(state.logo ? { logo: state.logo } : {}),
          shell_settings: { ...settings, logo: state.logo ?? null },
          language,
          // Wave R-pre D — map brandBadge (wizard) to appearance
          // .show_powered_by (server schema). The server-side gate
          // (Wave Q-D) strips show_powered_by=false for free-tier
          // calculators, so this only takes effect for Pro / Business.
          //
          // Wave R-2 — surface the deposit config under the same
          // appearance slot. The flow builder + widget read it from
          // there at render time, and /api/widget-deposit/create-session
          // re-validates against it server-side.
          //
          // Wave R-1 — also flatten the wizard's `scheduling` slot into
          // appearance.scheduling + a top-level scheduling_enabled bool
          // (so the widget can cheaply check whether to show the step).
          appearance: {
            show_powered_by: settings.brandBadge !== false,
            ...(settings.deposit ? { deposit: settings.deposit } : {}),
            ...(settings.scheduling
              ? {
                  scheduling_enabled: !!settings.scheduling.enabled,
                  scheduling: {
                    enabled: !!settings.scheduling.enabled,
                    working_days: settings.scheduling.workingDays,
                    working_hours_start: settings.scheduling.workingHoursStart,
                    working_hours_end: settings.scheduling.workingHoursEnd,
                    slot_duration_minutes: settings.scheduling.slotDurationMinutes,
                    buffer_minutes: settings.scheduling.bufferMinutes,
                  },
                }
              : {}),
          },
        },
      });
      return res.json();
    },
    onSuccess: () => {
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1800);
      // BD-3d Feature 2 — save resets the rapid-edit counter so the proactive
      // chat doesn't nag users who are actively saving their work.
      if (typeof window !== 'undefined') {
        try { window.dispatchEvent(new CustomEvent('quotequick:wizard-save')); } catch { /* ignore */ }
      }
    },
  });

  const reduceMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // BH-3 — track mobile breakpoint so the wizard switches between the
  // desktop side-panel and the bottom-sheet layouts. Updates on resize /
  // orientation change. SSR-safe: defaults to false so the initial paint
  // matches the desktop layout (mobile hydration corrects on mount).
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    try { return window.matchMedia('(max-width: 768px)').matches; }
    catch { return false; }
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = (ev: MediaQueryListEvent) => setIsMobile(ev.matches);
    // Set initial post-mount in case SSR default was wrong.
    setIsMobile(mq.matches);
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  // BH-3 — Reset-to-default for the currently active tab. Style + Settings
  // are the tabs with persistent customisations; Build / Install are
  // structural. Reset wipes the relevant ShellState slice back to defaults.
  const resetActiveTab = useCallback(() => {
    setState((s) => {
      if (activeTab === 'style') {
        return { ...s, style: { ...DEFAULT_SHELL_STYLE } };
      }
      if (activeTab === 'settings') {
        return {
          ...s,
          settings: {
            ...(INITIAL_SHELL_STATE.settings ?? {}),
            numberFormat: { ...DEFAULT_SHELL_NUMBER_FORMAT },
          },
        };
      }
      if (activeTab === 'build') {
        const layout = s.layout;
        return {
          ...s,
          fields: seedFields(layout),
          calculations: seedCalculations(layout),
          header: {},
          results: {},
          resultCalcId: undefined,
        };
      }
      return s;
    });
  }, [activeTab, setState]);

  const handleClose = useCallback(() => {
    // Item (h): paint the exit transition, then navigate.
    if (!embed) setOpenPhase('leaving');
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    const exitMs = reduceMotion ? 0 : (isMobile ? 150 : 180);

    setTimeout(() => {
      if (typeof window !== 'undefined' && window.history.length > 1) {
        window.history.back();
        setTimeout(() => {
          if (typeof window !== 'undefined' && window.location.pathname === '/wizard') {
            navigate('/');
          }
        }, 80);
      } else {
        navigate('/');
      }
    }, exitMs);
  }, [navigate, embed, reduceMotion]);

  // IA-1 (2026-05-22) — minimize the wizard back to whichever
  // dashboard the user came from, with a floating "QQ" badge on that
  // dashboard for one-click resume. We:
  //   1. Stash {calculatorId, returnPath, businessName, token,
  //      savedAt} in sessionStorage so the badge can render and the
  //      resume link can rebuild /wizard?token=<token>.
  //   2. Pick returnPath from sessionStorage's "qq-wizard-came-from"
  //      (set on entry), then document.referrer, then role-based
  //      default (/portal vs /admin/crm) via useAuth.
  //   3. Use the same leave-phase animation as handleClose so the
  //      wizard fades out cleanly (reduce-motion respected).
  // Per-session only — closing the tab clears sessionStorage.
  const handleMinimize = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (embed) return; // No minimize in embed mode — there's no host dashboard.
    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token') || '';
      // IA-1-fix (2026-05-23) — also capture template + id so the badge
      // can resume into either flow (template entry pre-save / id post-save).
      const template = params.get('template') || '';
      const idParam = params.get('id') || '';
      // Resolve return path: explicit hint > referrer > role default.
      let returnPath = '';
      try {
        returnPath = sessionStorage.getItem('qq-wizard-came-from') || '';
      } catch { /* sessionStorage blocked */ }
      if (!returnPath) {
        const ref = document.referrer;
        if (ref && ref.startsWith(window.location.origin)) {
          const refPath = new URL(ref).pathname;
          if (refPath.startsWith('/admin') || refPath.startsWith('/portal')) {
            returnPath = refPath;
          }
        }
      }
      // Final fallback — /portal is the safe non-admin default and
      // matches landingPathForRole's "unknown role" branch.
      if (!returnPath) returnPath = '/portal';

      // Prefer URL ?id= over calcIdentity.id when the wizard hasn't
      // materialised an in-memory record yet (template flow pre-save).
      const calcIdNum = calcIdentity.id ?? (idParam ? Number(idParam) : null);
      const payload = {
        calculatorId: Number.isFinite(calcIdNum as number) ? calcIdNum : null,
        businessName: calcIdentity.businessName,
        token,
        template: template || null,
        returnPath,
        savedAt: Date.now(),
      };
      try {
        sessionStorage.setItem('qq-wizard-minimized-from', JSON.stringify(payload));
      } catch { /* sessionStorage blocked — badge won't show but minimize still navigates */ }

      setOpenPhase('leaving');
      const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
      const exitMs = reduceMotion ? 0 : (isMobile ? 150 : 180);
      setTimeout(() => {
        navigate(returnPath);
      }, exitMs);
    } catch {
      // Any failure → fall back to a plain close (history-back / home).
      handleClose();
    }
  }, [navigate, embed, reduceMotion, calcIdentity, handleClose]);

  const modalPhaseClass = embed
    ? ''
    : openPhase === 'entering'
      ? ' is-entering'
      : openPhase === 'leaving'
        ? ' is-leaving'
        : ' is-open';

  return (
    <SelectionProvider>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div
          className={`qq-editor-shell ${embed ? '' : 'wizard-shell-modal'}${modalPhaseClass}`}
          role={embed ? undefined : 'dialog'}
          aria-modal={embed ? undefined : true}
          aria-label="QuoteQuick editor"
          data-testid="quotequick-editor-shell"
          data-modal-phase={embed ? 'embed' : openPhase}
          data-theme={editorTheme}
          lang={shellLang}
          /* BD-3f Item 3 — expose the user-selected accent as a CSS
           * custom property so segmented controls, checkboxes, range
           * sliders, and the Brand Studio chevron all live-update when
           * the owner picks a new accent in the Style tab. */
          style={state.style?.accent
            ? ({ '--qq-accent': state.style.accent } as Record<string, string>)
            : undefined}
        >
          <div className="qq-editor-frame">
            <EditorTopBar
              justSaved={justSaved}
              device={device}
              onDeviceChange={setDevice}
              editorTheme={editorTheme}
              onEditorThemeChange={setEditorTheme}
              onHelp={() => setShowHelp(true)}
              onClose={handleClose}
              /* IA-1 — minimize to dashboard. Not surfaced in embed mode
               *  (no host dashboard to return to). */
              onMinimize={embed ? undefined : handleMinimize}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={undo}
              onRedo={redo}
              /* 2026-05-22 (revert of PR #535) — tabs back in the top
                 chrome. EditorBottomBar removed. Preview-fold also stays
                 here. */
              activeTab={activeTab}
              onTabChange={setActiveTab}
              previewCollapsed={previewCollapsed}
              onTogglePreview={togglePreviewCollapsed}
              floatingLauncherPreview={floatingLauncherPreview}
              onToggleFloatingLauncherPreview={toggleFloatingLauncherPreview}
            />

            {/* BH-3 — Tab body content. Same tree on desktop and mobile;
                 just RELOCATED into the bottom sheet on phones (per the BH-3
                 hard constraint "don't restructure"). On desktop it lives
                 inside .qq-editor-left; on mobile we render it inside the
                 <MobileBottomSheet/> instead, and the left pane is hidden
                 via CSS so the canvas above takes the full viewport. */}
            {(() => null)()}
            <div
              className={`qq-editor-body${previewCollapsed ? ' is-preview-collapsed' : ''}${isMobile ? ' is-mobile-sheet' : ''}`}
              data-preview-collapsed={previewCollapsed ? 'true' : 'false'}
              data-mobile-sheet={isMobile ? 'true' : 'false'}
            >
              <div
                className="qq-editor-left"
                data-testid="editor-left-panel"
                style={{ width: paneWidth }}
                aria-hidden={isMobile || undefined}
              >
                <div className="qq-editor-left-inner">
                  {!isMobile && (activeTab === 'build' ? (
                    <BuildTab
                      businessName={state.businessName}
                      onBusinessNameChange={setBusinessName}
                      logo={state.logo ?? null}
                      onLogoChange={setLogo}
                      fields={state.fields}
                      onFieldsChange={setFields}
                      calculations={state.calculations}
                      onCalculationsChange={setCalculations}
                      header={state.header ?? {}}
                      onHeaderChange={setHeader}
                      results={state.results ?? {}}
                      onResultsChange={setResults}
                      activeTemplateId={state.activeTemplateId}
                      onApplyTemplate={applyTemplate}
                      /* BG-7 Item 4 — per-step rich-text descriptions.
                         The StepContentPanel renders only when the active
                         template ships explicit `steps[]`. */
                      steps={state.steps}
                      onStepsChange={setSteps}
                    />
                  ) : activeTab === 'style' ? (
                    <StyleTab
                      style={state.style ?? { ...DEFAULT_SHELL_STYLE }}
                      onChange={setStyle}
                      logo={state.logo ?? null}
                      onLogoChange={setLogo}
                      planTier={planTier}
                      stepLayout={state.stepLayout}
                      onStepLayoutChange={setStepLayout}
                      /* BD-2b — Pricing tiers (Good/Better/Best). The
                         StyleTab section toggles tiered on/off and lets the
                         owner edit per-tier multiplier / label / tagline.
                         Category is sourced from the active template so the
                         "recommended for this category" hint reads correctly. */
                      tiered={state.tiered}
                      onTieredChange={setTiered}
                      templateCategory={
                        state.activeTemplateId
                          ? getTemplatePreset(state.activeTemplateId)?.category
                          : undefined
                      }
                      /* BG-7 Item 1 — trust-badge editor. Free-tier users
                         see the 4 defaults read-only; Pro+ can edit. */
                      trustBadges={state.trustBadges}
                      onTrustBadgesChange={setTrustBadges}
                      currencySymbol={currencySymbol}
                    />
                  ) : activeTab === 'settings' ? (
                    <SettingsTab
                      settings={state.settings ?? {}}
                      onChange={setSettings}
                      planTier={planTier}
                    />
                  ) : activeTab === 'install' ? (
                    <InstallTab
                      settings={state.settings ?? {}}
                      onChange={setSettings}
                      businessName={state.businessName}
                      logoUrl={state.logo}
                      style={state.style ?? { ...DEFAULT_SHELL_STYLE }}
                    />
                  ) : (
                    <TabPlaceholder
                      tab={activeTab}
                      businessName={state.businessName}
                      onBusinessNameChange={setBusinessName}
                    />
                  ))}
                  {!isMobile && activeTab === 'build' && (
                    <div className="qq-editor-actions">
                      <button
                        type="button"
                        onClick={() => saveDraftMutation.mutate()}
                        disabled={saveDraftMutation.isPending || !state.businessName.trim()}
                        data-testid="quotequick-save-draft"
                        className="qq-editor-btn"
                      >
                        {saveDraftMutation.isPending ? 'Saving…' : 'Save draft'}
                      </button>
                      {saveDraftMutation.isError && (
                        <span className="qq-editor-save-error" data-testid="quotequick-save-error">
                          Couldn't save — try again.
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {/* Resize handle (d). Hidden on mobile via CSS. */}
                <button
                  type="button"
                  className={`qq-editor-resize${isResizing ? ' is-resizing' : ''}`}
                  data-testid="editor-pane-resize"
                  aria-label="Resize editor pane"
                  onMouseDown={(e) => { e.preventDefault(); onResizeStart(e.clientX, paneWidth); }}
                  onTouchStart={(e) => {
                    const x = e.touches[0]?.clientX ?? 0;
                    onResizeStart(x, paneWidth);
                  }}
                  onKeyDown={(e) => {
                    // Keyboard resize (a11y): arrow keys nudge 16px.
                    if (e.key === 'ArrowLeft') {
                      setPaneWidth((w) => Math.max(PANE_WIDTH_MIN, w - 16));
                    } else if (e.key === 'ArrowRight') {
                      setPaneWidth((w) => Math.min(PANE_WIDTH_MAX, w + 16));
                    }
                  }}
                >
                  <span aria-hidden="true" />
                </button>
              </div>

              <div
                className="qq-editor-right"
                data-testid="editor-right-pane"
                aria-hidden={previewCollapsed || undefined}
              >
                <PreviewPane
                  businessName={state.businessName}
                  onBusinessNameChange={setBusinessName}
                  logo={state.logo ?? null}
                  layout={state.layout}
                  device={device}
                  fields={state.fields}
                  calculations={state.calculations}
                  header={state.header}
                  results={state.results}
                  resultCalcId={state.resultCalcId}
                  style={state.style}
                  settings={state.settings}
                  stepLayout={state.stepLayout}
                  /* BD-2b — tiered + category drive Good/Better/Best
                     pricing in the preview. Category is sourced from the
                     active template preset (read-only — picking a template
                     re-applies it); tiered comes from the StyleTab toggle. */
                  tiered={state.tiered}
                  /* BG-7 Item 1 — owner-edited trust badges. Seeded from
                     the template on apply; live edits flow through. */
                  trustBadges={state.trustBadges}
                  /* BG-7 Item 4 — owner-edited step descriptions. */
                  steps={state.steps}
                  category={
                    state.activeTemplateId
                      ? getTemplatePreset(state.activeTemplateId)?.category
                      : undefined
                  }
                  onRemoveField={removeField}
                  onAddField={addField}
                  /* Wave P — when the Install tab is active, render the
                   * widget inside the user's chosen hosted-page chrome so
                   * the preview matches what visitors at {slug}.your-quote
                   * .net actually see. */
                  hostedFrame={activeTab === 'install'}
                  /* BD-3b — session id for zoom persistence. Uses the
                   * active template id when present (per-calculator) and
                   * falls back to 'draft' for unsaved calculators. */
                  sessionId={state.activeTemplateId ?? 'draft'}
                  /* P2 UX — Floating launcher preview lens (transient,
                   * not persisted). Triggered by the top-chrome toggle. */
                  floatingLauncherPreview={floatingLauncherPreview}
                  floatingLauncherExpanded={floatingLauncherExpanded}
                  onFloatingLauncherExpandedChange={setFloatingLauncherExpanded}
                  floatingLauncherPosition={state.style?.floatingLauncher?.position}
                />
              </div>
            </div>

            {/* 2026-05-22 (revert of PR #535) — the EditorBottomBar that
                 hosted the wizard tab strip was deleted; tabs are back in
                 the top chrome. The mobile bottom sheet (BH-3) below is for
                 property panels, not tabs, and remains. */}

            {/* ── BH-3 — Mobile bottom sheet (≤768px only).
                 Replaces the desktop left-pane on phones. Hosts the same
                 tab content components (BuildTab / StyleTab / SettingsTab
                 / InstallTab) but inside a slide-up sheet with search
                 across tabs, in-sheet tab strip, sticky Reset/Done footer,
                 and auto-collapse-on-scroll chrome. Industry pattern:
                 Notion / Canva / Builder.io / Framer / Figma mobile. */}
            {isMobile && (
              <MobileBottomSheet
                activeTab={activeTab}
                onTabChange={setActiveTab}
                onResetTab={resetActiveTab}
                onDone={() => saveDraftMutation.mutate()}
                isBusy={saveDraftMutation.isPending}
              >
                {activeTab === 'build' ? (
                  <BuildTab
                    businessName={state.businessName}
                    onBusinessNameChange={setBusinessName}
                    logo={state.logo ?? null}
                    onLogoChange={setLogo}
                    fields={state.fields}
                    onFieldsChange={setFields}
                    calculations={state.calculations}
                    onCalculationsChange={setCalculations}
                    header={state.header ?? {}}
                    onHeaderChange={setHeader}
                    results={state.results ?? {}}
                    onResultsChange={setResults}
                    activeTemplateId={state.activeTemplateId}
                    onApplyTemplate={applyTemplate}
                    steps={state.steps}
                    onStepsChange={setSteps}
                  />
                ) : activeTab === 'style' ? (
                  <StyleTab
                    style={state.style ?? { ...DEFAULT_SHELL_STYLE }}
                    onChange={setStyle}
                    logo={state.logo ?? null}
                    onLogoChange={setLogo}
                    planTier={planTier}
                    stepLayout={state.stepLayout}
                    onStepLayoutChange={setStepLayout}
                    tiered={state.tiered}
                    onTieredChange={setTiered}
                    templateCategory={
                      state.activeTemplateId
                        ? getTemplatePreset(state.activeTemplateId)?.category
                        : undefined
                    }
                    trustBadges={state.trustBadges}
                    onTrustBadgesChange={setTrustBadges}
                    currencySymbol={currencySymbol}
                  />
                ) : activeTab === 'settings' ? (
                  <SettingsTab
                    settings={state.settings ?? {}}
                    onChange={setSettings}
                    planTier={planTier}
                  />
                ) : activeTab === 'install' ? (
                  <InstallTab
                    settings={state.settings ?? {}}
                    onChange={setSettings}
                    businessName={state.businessName}
                    logoUrl={state.logo}
                    style={state.style ?? { ...DEFAULT_SHELL_STYLE }}
                  />
                ) : (
                  <TabPlaceholder
                    tab={activeTab}
                    businessName={state.businessName}
                    onBusinessNameChange={setBusinessName}
                  />
                )}
              </MobileBottomSheet>
            )}

            {/* ── W-AO-1: mobile sticky bottom action bar.
                 Fixed to the viewport bottom on `max-width: 768px`, hidden
                 above that breakpoint (where the in-pane sticky Save
                 footer already does the job). Collapsed: 56px primary
                 CTA. Extended: chevron flip + a horizontally-scrollable
                 row of secondary actions (theme, preview, help, close).
                 State persists in localStorage via toggleActionBarExtended. */}
            <div
              className={`qq-mobile-actionbar${actionBarExtended ? ' is-extended' : ''}`}
              data-testid="wizard-mobile-actionbar"
              data-extended={actionBarExtended ? 'true' : 'false'}
              role="toolbar"
              aria-label="Wizard quick actions"
            >
              <button
                type="button"
                className="qq-mobile-actionbar-handle"
                data-testid="wizard-mobile-actionbar-handle"
                aria-label={actionBarExtended ? 'Collapse quick actions' : 'Expand quick actions'}
                aria-expanded={actionBarExtended}
                onClick={toggleActionBarExtended}
              >
                <span aria-hidden="true" className="qq-mobile-actionbar-chevron" />
              </button>
              <div className="qq-mobile-actionbar-primary">
                <button
                  type="button"
                  className="qq-mobile-actionbar-cta"
                  data-testid="wizard-mobile-actionbar-save"
                  onClick={() => saveDraftMutation.mutate()}
                  disabled={saveDraftMutation.isPending || !state.businessName.trim()}
                >
                  {saveDraftMutation.isPending ? 'Saving…' : (justSaved ? 'Saved ✓' : 'Save draft')}
                </button>
              </div>
              {actionBarExtended && (
                <div
                  className="qq-mobile-actionbar-secondary"
                  data-testid="wizard-mobile-actionbar-secondary"
                >
                  <button
                    type="button"
                    className="qq-mobile-actionbar-sbtn"
                    onClick={togglePreviewCollapsed}
                    data-testid="wizard-mobile-actionbar-preview"
                  >
                    {previewCollapsed ? 'Show preview' : 'Hide preview'}
                  </button>
                  <button
                    type="button"
                    className="qq-mobile-actionbar-sbtn"
                    onClick={() => setEditorTheme(editorTheme === 'dark' ? 'light' : 'dark')}
                    data-testid="wizard-mobile-actionbar-theme"
                  >
                    {editorTheme === 'dark' ? 'Light theme' : 'Dark theme'}
                  </button>
                  <button
                    type="button"
                    className="qq-mobile-actionbar-sbtn"
                    /* BH-1 — cycle desktop → tablet → mobile → desktop. */
                    onClick={() => setDevice(
                      device === 'desktop' ? 'tablet'
                        : device === 'tablet' ? 'mobile'
                        : 'desktop',
                    )}
                    data-testid="wizard-mobile-actionbar-device"
                  >
                    {device === 'desktop' ? 'Tablet preview'
                      : device === 'tablet' ? 'Mobile preview'
                      : 'Desktop preview'}
                  </button>
                  <button
                    type="button"
                    className="qq-mobile-actionbar-sbtn"
                    onClick={() => setShowHelp(true)}
                    data-testid="wizard-mobile-actionbar-help"
                  >
                    Help
                  </button>
                  <button
                    type="button"
                    className="qq-mobile-actionbar-sbtn is-danger"
                    onClick={handleClose}
                    data-testid="wizard-mobile-actionbar-close"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>

            {/* Wave K — floating AI assistant. Lives inside the frame so it
                 inherits data-theme. The bubble is fixed-position so it
                 doesn't disturb the editor layout. */}
            <AIBubble
              conversationId={state.activeTemplateId ?? 'draft'}
              state={state}
              setFields={setFields}
              setCalculations={setCalculations}
              setHeader={setHeader}
              setResults={setResults}
              setStyle={setStyle}
              setSettings={setSettings}
              setLogo={setLogo}
              applyTemplatePreset={applyTemplatePreset}
              replaceTemplate={applyTemplate}
            />

            {showHelp && (
              <div
                className="qq-editor-help"
                role="dialog"
                aria-label="Editor help"
                onClick={() => setShowHelp(false)}
                data-testid="editor-help-overlay"
              >
                <div className="qq-editor-help-card" onClick={(e) => e.stopPropagation()}>
                  <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: p.colors.heading }}>
                    QuoteQuick editor — Wave H1 preview
                  </p>
                  <p style={{ fontSize: 12.5, color: p.colors.muted, margin: '8px 0 0', lineHeight: 1.5 }}>
                    The new editor shell is in place. Build · Style · Settings · Install
                    tab content lands in subsequent waves.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowHelp(false)}
                    className="qq-editor-btn"
                    style={{ marginTop: 14 }}
                  >
                    Got it
                  </button>
                </div>
              </div>
            )}
          </div>

          <style>{`
            /* ── BD-3g Item 2 — fold/unfold panels ──────────────────
             *
             * useFoldablePanels (DOM enhancer) decorates every
             * <fieldset.qq-style-group[data-testid]> inside the Style /
             * Settings tabs with:
             *  - a click-to-toggle legend (gets .qq-foldable-legend)
             *  - a chevron <svg class="qq-foldable-chevron"> appended
             *    to the legend's last child slot
             *  - a data-panel-open="true|false" attribute on the
             *    fieldset itself; the JS toggles max-height inline-style
             *    to drive the 200ms ease-out animation.
             *
             * Animation: JS measures scrollHeight on each toggle and
             * transitions max-height from current → target. We can't
             * use grid-template-rows because <fieldset> doesn't lay out
             * legends like normal grid children.
             *
             * Reduced motion: JS snaps without animation when the OS
             * setting is active. We also disable the chevron transition
             * via a @media block below.
             *
             * Multi-open: panels are independent — toggling one doesn't
             * close peers (NOT an exclusive accordion, per BD-3g spec). */
            .qq-foldable-legend {
              cursor: pointer;
              user-select: none;
              transition: background 120ms ease;
            }
            .qq-foldable-legend:hover {
              background: rgba(15, 23, 42, 0.03);
            }
            .qq-editor-shell[data-theme="dark"] .qq-foldable-legend:hover {
              background: rgba(255, 255, 255, 0.04);
            }
            .qq-foldable-legend:focus-visible {
              outline: 2px solid ${p.colors.accent};
              outline-offset: -2px;
            }
            .qq-foldable-spacer {
              flex: 1 1 auto;
              min-width: 4px;
            }
            .qq-foldable-chevron {
              flex-shrink: 0;
              opacity: 0.7;
              transition: transform 200ms ease-out;
              transform-origin: center;
            }
            .qq-style-group[data-panel-open="false"] .qq-foldable-chevron {
              transform: rotate(-90deg);
            }
            /* The fieldset itself animates max-height (set inline by JS).
             * Overflow:hidden clips the body content cleanly when
             * collapsed; the legend never gets clipped because its
             * height defines the collapsed floor. */
            .qq-style-group[data-foldable-enhanced="1"] {
              overflow: hidden;
              transition: max-height 200ms ease-out;
            }
            .qq-style-group[data-panel-open="false"] > legend.qq-style-legend {
              /* When collapsed, drop the legend's bottom border so it
               * reads as a single rounded pill rather than a header
               * with a hanging hairline. */
              border-bottom-color: transparent;
            }
            @media (prefers-reduced-motion: reduce) {
              .qq-style-group[data-foldable-enhanced="1"],
              .qq-foldable-chevron {
                transition: none !important;
              }
            }

            .qq-editor-shell {
              background: ${d.colors.canvas};
              min-height: 100vh;
              padding: ${d.layout.shellPad};
              box-sizing: border-box;
            }
            /* BD-3c Feature 1 — desktop static canvas. Lock the shell
               to viewport height and hide outer overflow so ONLY the
               left pane scrolls (.qq-editor-left has overflow-y:auto
               below). The preview/canvas pane stays static. Mobile
               (≤768px) is untouched — keeps the stacked-scroll layout. */
            @media (min-width: 769px) {
              .qq-editor-shell {
                height: 100vh;
                min-height: 100vh;
                max-height: 100vh;
                /* P0 sticky fix — use clip (not hidden) so position:sticky
                 * descendants inside the preview widget still anchor to the
                 * preview pane's scroll context instead of being trapped
                 * here. Same visual effect as hidden.
                 * See memory/project_overflow_clip_for_sticky.md */
                overflow: clip;
              }
              .wizard-shell-modal {
                /* P0 sticky fix — see comment above. */
                overflow: clip !important;
              }
            }
            .wizard-shell-modal {
              position: fixed; inset: 0; z-index: 1000;
              background: rgba(15, 23, 42, 0.55);
              overflow-y: auto;
              backdrop-filter: blur(2px);
              -webkit-backdrop-filter: blur(2px);
            }
            /* Wave I (h) — open / close animations. CSS-only; respects
               prefers-reduced-motion. The frame inside scales/slides from
               translateY(8px) scale(.97) → translateY(0) scale(1). */
            .wizard-shell-modal {
              transition: background-color 200ms ease-out, backdrop-filter 200ms ease-out;
            }
            .wizard-shell-modal.is-entering { background: rgba(15,23,42,0); backdrop-filter: blur(0); }
            .wizard-shell-modal.is-entering .qq-editor-frame {
              opacity: 0;
              transform: translateY(8px) scale(0.97);
            }
            .wizard-shell-modal.is-open .qq-editor-frame {
              opacity: 1;
              transform: translateY(0) scale(1);
              transition: opacity 200ms ease-out, transform 200ms ease-out;
            }
            .wizard-shell-modal.is-leaving {
              background: rgba(15,23,42,0);
              backdrop-filter: blur(0);
              transition: background-color 180ms ease-in, backdrop-filter 180ms ease-in;
            }
            .wizard-shell-modal.is-leaving .qq-editor-frame {
              opacity: 0;
              transform: translateY(8px) scale(0.97);
              transition: opacity 180ms ease-in, transform 180ms ease-in;
            }
            .qq-editor-frame {
              display: flex; flex-direction: column;
              background: ${d.colors.panel};
              border-radius: 14px;
              box-shadow: ${d.shadows.panel};
              /* P0 sticky fix — use clip (not hidden) so sticky descendants
               * in the preview widget bind to the preview pane's scroll
               * context. See memory/project_overflow_clip_for_sticky.md */
              overflow: clip;
              min-height: calc(100vh - ${d.layout.shellPad} - ${d.layout.shellPad});
              transition: opacity 200ms ease-out, transform 200ms ease-out;
              will-change: opacity, transform;
            }
            /* BD-3c Feature 1 — on desktop, constrain frame to viewport so
               its children own their own scroll (left pane scrolls, canvas
               stays static). */
            @media (min-width: 769px) {
              .qq-editor-frame {
                height: calc(100vh - ${d.layout.shellPad} - ${d.layout.shellPad});
                max-height: calc(100vh - ${d.layout.shellPad} - ${d.layout.shellPad});
                min-height: 0;
              }
            }
            @media (max-width: 768px) {
              .wizard-shell-modal {
                transition: background-color 150ms ease-out, backdrop-filter 150ms ease-out;
              }
              .wizard-shell-modal.is-entering .qq-editor-frame {
                transform: translateY(4px) scale(0.99);
              }
              .wizard-shell-modal.is-open .qq-editor-frame {
                transition: opacity 150ms ease-out, transform 150ms ease-out;
              }
              .wizard-shell-modal.is-leaving .qq-editor-frame {
                transition: opacity 150ms ease-in, transform 150ms ease-in;
                transform: translateY(4px) scale(0.99);
              }
            }
            @media (prefers-reduced-motion: reduce) {
              .wizard-shell-modal,
              .wizard-shell-modal.is-entering,
              .wizard-shell-modal.is-open,
              .wizard-shell-modal.is-leaving,
              .wizard-shell-modal .qq-editor-frame,
              .wizard-shell-modal.is-entering .qq-editor-frame,
              .wizard-shell-modal.is-open .qq-editor-frame,
              .wizard-shell-modal.is-leaving .qq-editor-frame {
                transition: none !important;
                transform: none !important;
                opacity: 1 !important;
                animation: none !important;
              }
              .wizard-shell-modal.is-entering { background: rgba(15,23,42,0.55); backdrop-filter: blur(2px); }
              .wizard-shell-modal.is-leaving  { background: rgba(15,23,42,0); backdrop-filter: blur(0); opacity: 0; }
              /* Wave M — kill the fold animation when reduced motion. */
              .qq-editor-right { transition: none !important; }
              .qq-editor-fold { transition: none !important; }
            }
            /* ── BH-2 — single-row top chrome ─────────────────────────────
             *
             * The previously-stacked topbar (~46px) + tab bar (~44px) are
             * collapsed into one ~44px row. Inside, three functional groups
             * (brand · history · tabs · device · tools/save) are separated
             * by hairline dividers and arranged with a flex spacer between
             * the tabs/device cluster and the right-side tools.
             *
             * Height target: 44–48px. Padding stays on the 8px scale; gaps
             * within a functional group are 2–4px, between groups 8–10px.
             *
             * Sticky behaviour preserved (only one sticky surface now). */
            .qq-editor-topbar {
              display: flex; align-items: center;
              gap: 8px;
              padding: 6px 12px; flex-shrink: 0;
              min-height: 44px;
              background: ${d.colors.panelHeader};
              border-bottom: 1px solid ${d.colors.borderLight};
              position: sticky;
              top: 0;
              z-index: 6;
            }
            .qq-editor-brand {
              display: inline-flex; align-items: center; gap: 6px;
              text-decoration: none;
              font-size: 13px; font-weight: 800; color: ${p.colors.heading};
              flex-shrink: 0;
              min-height: 32px;
              padding: 0 2px;
            }
            /* BH-2 — drop wordmark below 1024px so the tab strip + device
               preset switcher get the horizontal real estate. Icon stays. */
            @media (max-width: 1023px) {
              .qq-editor-brand-label { display: none; }
            }
            .qq-editor-saved {
              font-size: 11px; font-weight: 600; color: ${p.colors.accentDark};
              background: ${p.colors.accentLighter}; padding: 3px 9px; border-radius: 999px;
              transition: opacity 0.3s ease; flex-shrink: 0;
            }
            .qq-editor-spacer { flex: 1; min-width: 4px; }
            /* BH-2 — hairline vertical divider between functional groups.
               1px wide, ~22px tall, centred. Hidden when adjacent groups
               collapse on narrow widths. */
            .qq-editor-divider {
              flex-shrink: 0;
              width: 1px; height: 22px;
              background: ${d.colors.borderLight};
              margin: 0 2px;
            }
            /* BH-2 — tight group cluster (history, tools). 2px gap so two
               icon buttons read as a single unit. */
            .qq-editor-group {
              display: inline-flex; align-items: center; gap: 2px;
              flex-shrink: 0;
            }
            .qq-editor-device {
              display: flex; gap: 2px; padding: 2px; flex-shrink: 0;
              border-radius: 8px; background: #fff;
              border: 1px solid ${p.colors.borderLight};
            }
            .qq-editor-device button {
              display: flex; align-items: center; justify-content: center;
              width: 30px; height: 24px; border-radius: 6px; border: none;
              cursor: pointer; transition: background 0.15s ease;
            }
            /* BH-2 / BH-5 — icon-btn at-rest contrast lifted (was muted /
             * ~0.55, now heading / 0.85) so the Undo/Redo + tool icons
             * remain readable on both light and dark chrome backgrounds.
             * Icons inherit colour via currentColor — see the inline SVG
             * style on each lucide-react icon in EditorTopBar.tsx. */
            .qq-editor-icon-btn {
              width: 28px; height: 28px; border-radius: 50%; cursor: pointer;
              border: 1px solid ${p.colors.border}; background: #fff;
              color: ${p.colors.heading}; padding: 0;
              opacity: 0.85;
              display: flex; align-items: center; justify-content: center;
              transition: background 0.12s ease, color 0.12s ease, opacity 0.12s ease;
              flex-shrink: 0;
            }
            .qq-editor-icon-btn:hover:not(:disabled) {
              background: ${p.colors.surfaceRaised};
              color: ${p.colors.heading};
              opacity: 1;
            }
            /* BD-3a fix 1 / BH-2 / BH-5 — Undo/Redo share the icon-btn base
             * but gain a brand-blue tint on hover. At-rest opacity 0.85
             * matches the rest of the chrome's tool icons. */
            .qq-editor-history-btn:hover:not(:disabled) {
              background: ${p.colors.accentLighter};
              color: ${p.colors.accent};
              border-color: ${p.colors.accent};
              opacity: 1;
            }
            .qq-editor-history-btn:disabled {
              opacity: 0.35;
              cursor: not-allowed;
            }
            /* ── BH-2 — inline tab strip ─────────────────────────────────
             * Pill-style compact tabs. Overflow-x:auto inside its own flex
             * region so the strip scrolls horizontally on narrow widths
             * without forcing the whole topbar to scroll. min-width:0 lets
             * the flex container shrink below its intrinsic content size. */
            .qq-editor-tabstrip {
              display: flex; align-items: center; gap: 2px;
              min-width: 0;
              flex: 0 1 auto;
              overflow-x: auto;
              scrollbar-width: none;
              padding: 0 2px;
            }
            .qq-editor-tabstrip::-webkit-scrollbar { display: none; }
            /* Revert of PR #535 (2026-05-22) — tighter pill sizing so the
             * tab strip fits comfortably in the single-row top chrome.
             * 11px font / 6px vertical / 12px horizontal padding / weight 500
             * (active pill bumps to 600 + #fff/brand-blue from PR #515). */
            .qq-editor-tab {
              font: inherit; background: transparent; border: none; cursor: pointer;
              padding: 6px 12px;
              min-height: 28px;
              font-size: 11px; font-weight: 500;
              border-radius: 999px;
              white-space: nowrap;
              transition: color 0.12s ease, background 0.12s ease;
            }
            .qq-editor-tab:hover { color: ${p.colors.heading}; }
            /* BH-5 — solid brand-blue active pill (Option A). The dark-mode
             * stylesheet (index.css) forces every .qq-editor-tab color to
             * var(--qq-text) !important, which previously masked the inline
             * accent color and made the active label invisible against its
             * own light-blue pill. We force white on the active pill here
             * with !important so the label stays legible in either theme. */
            .qq-editor-tab.is-active {
              font-weight: 600;
              color: #ffffff !important;
              background: ${p.colors.accent} !important;
            }

            /* BH-2 — preview fold/unfold reuses the icon-btn footprint. The
             * collapsed state takes on accent colour so the user can see
             * the preview is hidden at a glance. */
            .qq-editor-fold.is-collapsed {
              color: ${p.colors.accent};
              background: ${p.colors.accentLighter};
              border-color: ${p.colors.accentLighter};
            }
            /* P1 UX (2026-05-22) — Floating launcher preview toggle.
             *
             * Was: a bare 14px circular icon button identical to every
             * neighbour. Alex couldn't find it.
             *
             * Now: a pill-shaped toggle ("[ icon ] Floating"), brand-blue
             * tinted at-rest, with a slow attention-pulse the first few
             * seconds after mount so the eye catches it. Active state
             * fills with accent + 3px ring. On <= 480px the label hides
             * and the pill collapses to a 28x28 icon chip so the mobile
             * chrome doesn't crowd.
             *
             * Width override: the base .qq-editor-icon-btn rule pins
             * width:28px; we widen the launcher pill back out via auto. */
            .qq-editor-launcher-toggle {
              width: auto;
              height: 28px;
              padding: 0 10px 0 8px;
              gap: 6px;
              border-radius: 999px;
              font-size: 12px;
              font-weight: 700;
              letter-spacing: 0.01em;
              color: ${p.colors.accent};
              background: ${p.colors.accentLighter};
              border-color: ${p.colors.accentLighter};
              opacity: 1;
              animation: qq-launcher-toggle-pulse 2400ms ease-in-out 0s 3;
            }
            .qq-editor-launcher-toggle:hover:not(:disabled) {
              background: rgba(13, 60, 252, 0.16);
              color: ${p.colors.accent};
              border-color: rgba(13, 60, 252, 0.30);
              opacity: 1;
            }
            .qq-editor-launcher-toggle-label {
              white-space: nowrap;
              line-height: 1;
            }
            .qq-editor-launcher-toggle.is-active {
              color: #fff;
              background: ${p.colors.accent};
              border-color: ${p.colors.accent};
              box-shadow: 0 0 0 3px rgba(13, 60, 252, 0.20);
              opacity: 1;
              /* stop the pulse once active */
              animation: none;
            }
            .qq-editor-launcher-toggle.is-active:hover:not(:disabled) {
              color: #fff;
              background: ${p.colors.accentDark};
              border-color: ${p.colors.accentDark};
            }
            @keyframes qq-launcher-toggle-pulse {
              0%, 100% { box-shadow: 0 0 0 0 rgba(13, 60, 252, 0.0); }
              50%      { box-shadow: 0 0 0 6px rgba(13, 60, 252, 0.18); }
            }
            @media (prefers-reduced-motion: reduce) {
              .qq-editor-launcher-toggle { animation: none !important; }
            }
            /* Mobile: hide the "Floating" label so the pill collapses to
             * a 28x28 icon-only chip — stays discoverable (brand-blue
             * background still draws the eye) without crowding chrome. */
            @media (max-width: 480px) {
              .qq-editor-launcher-toggle {
                width: 28px;
                padding: 0;
                gap: 0;
              }
              .qq-editor-launcher-toggle-label { display: none; }
            }

            .qq-editor-body {
              display: flex; align-items: stretch;
              flex: 1; min-height: 0;
              /* Wave AB-1 — lock outer body so the two panes
                 (.qq-editor-left, .qq-editor-right) own their own vertical
                 scroll. Previously the outer body could also scroll, which
                 competed with each pane's overflow-y:auto and caused the
                 field list to fight the preview when either was overlong.
                 P0 sticky fix — use clip (not hidden) so sticky descendants
                 in the preview widget anchor to the preview pane's scroll
                 context. See memory/project_overflow_clip_for_sticky.md */
              overflow: clip;
            }
            /* Wave M — collapse transition. We animate the right pane's
               width/opacity. The left pane is flex: 1 once collapsed, so
               it naturally fills the space. 250ms ease-out, respects
               prefers-reduced-motion at the block at the bottom of this
               style sheet. */
            .qq-editor-right {
              /* Wave R-pre F — smoother fold/unfold. Slightly longer
               * duration + cubic-bezier with overshoot dampener so the
               * pane glides rather than snaps. Same property list. */
              transition: width 320ms cubic-bezier(0.22, 1, 0.36, 1),
                          opacity 260ms cubic-bezier(0.22, 1, 0.36, 1),
                          flex 320ms cubic-bezier(0.22, 1, 0.36, 1),
                          padding 320ms cubic-bezier(0.22, 1, 0.36, 1),
                          border 320ms cubic-bezier(0.22, 1, 0.36, 1);
              /* P0 sticky fix — use clip (not hidden) so sticky descendants
               * in the preview widget anchor to this pane's scroll context.
               * See memory/project_overflow_clip_for_sticky.md */
              overflow: clip;
              will-change: width, opacity;
            }
            /* Wave R-pre F note — we intentionally do NOT transition the
             * left pane. The drag-resize handle measures width
             * immediately after mouseup, and a transition there caused
             * the audit test to read width mid-animation (~5px off).
             * The right pane's own transition + the user's eye filling
             * in the rest gives a perfectly smooth fold/unfold. */
            .qq-editor-body.is-preview-collapsed .qq-editor-right {
              flex: 0 0 0 !important;
              width: 0 !important;
              min-width: 0 !important;
              opacity: 0;
              pointer-events: none;
              border-left: 0;
            }
            .qq-editor-body.is-preview-collapsed .qq-editor-left {
              flex: 1 1 auto;
              width: auto !important;
            }
            .qq-editor-body.is-preview-collapsed .qq-editor-resize {
              display: none !important;
            }

            /* Wave AA / BH-2 — on desktop (>768px) the left-pane stretched
               to full width when the preview was collapsed, which looked
               wrong since the split view IS the desktop layout. Hide the
               fold button (BH-2 has it inline in the unified top chrome —
               still suppress it on desktop) + neutralise any persisted
               collapsed state. */
            @media (min-width: 769px) {
              .qq-editor-fold { display: none !important; }
              .qq-editor-body.is-preview-collapsed .qq-editor-right {
                flex: 1 1 auto !important;
                width: auto !important;
                min-width: 0 !important;
                opacity: 1 !important;
                pointer-events: auto !important;
                border-left: 1px solid ${d.colors.borderLight} !important;
              }
              .qq-editor-body.is-preview-collapsed .qq-editor-left {
                flex: 0 0 auto;
                width: var(--qq-editor-pane-width, 420px) !important;
              }
              .qq-editor-body.is-preview-collapsed .qq-editor-resize {
                display: flex !important;
              }
            }

            .qq-editor-left {
              position: relative;
              flex-shrink: 0;
              background: ${d.colors.panel};
              border-right: 1px solid ${d.colors.borderLight};
              overflow-y: auto;
            }
            .qq-editor-left-inner {
              padding: 18px 18px 24px;
              display: flex; flex-direction: column; gap: 14px;
              min-height: 100%; box-sizing: border-box;
            }
            /* Wave I (d) — resize handle on the right edge of the left pane.
             *
             * P2 UX fix v2 (2026-05-22): handle is barely visible at rest but
             * discoverable — neutral gray-blue (rgba 0.18 light / 0.20 dark)
             * 4px bar with a centered 3-dot grip glyph (0.5 opacity at rest,
             * 1.0 on hover). On hover the bar widens to 6px and shifts to the
             * brand-blue accent hint (rgba(13,60,252,0.45)). Active drag is
             * solid #0d3cfc. Cursor: col-resize.
             *
             * The 3-dot grip is rendered via a centered pseudo-element on the
             * inner <span> (kept aria-hidden in WizardShell.tsx) — three 1.5px
             * circles, 3px apart, stacked vertically, matching the handle bg
             * tone. CSS-only, no extra DOM.
             *
             * Tap target: the absolute-positioned button extends to fill the
             * 4px (6px on hover) width plus the pane-edge offset. The
             * keyboard a11y path (focus + arrow keys) still works since the
             * button receives focus. */
            /* Wave 54 — bump resting visibility so users actually find the
             * splitter. Was rgba(15,23,42,0.22) on a 6px-wide bar — almost
             * invisible against the surrounding panels. Now a 5px bar with
             * a brand-blue tinted resting state and a wider 10px hover
             * state with a brighter accent border for clear discoverability.
             * The grip rail inside renders 3 dots so the user reads
             * "grabbable splitter" even when no hover. */
            .qq-editor-resize {
              position: absolute; top: 0; right: -5px; bottom: 0;
              width: 5px;
              background: rgba(13, 60, 252, 0.18);
              border: 0; padding: 0; cursor: col-resize;
              z-index: 5;
              touch-action: none;
              display: flex; align-items: center; justify-content: center;
              box-shadow:
                inset 1px 0 0 rgba(13, 60, 252, 0.12),
                inset -1px 0 0 rgba(13, 60, 252, 0.12);
              transition: background 0.12s ease, width 0.12s ease, right 0.12s ease, box-shadow 0.12s ease;
            }
            .qq-editor-shell[data-theme="dark"] .qq-editor-resize {
              background: rgba(96, 165, 250, 0.28);
              box-shadow:
                inset 1px 0 0 rgba(96, 165, 250, 0.20),
                inset -1px 0 0 rgba(96, 165, 250, 0.20);
            }
            .qq-editor-resize:hover {
              background: rgba(13, 60, 252, 0.55);
              width: 10px;
              right: -7px;
            }
            .qq-editor-resize.is-resizing {
              background: #0d3cfc;
              width: 10px;
              right: -7px;
            }
            .qq-editor-resize:focus-visible {
              outline: 2px solid #0d3cfc;
              outline-offset: 2px;
            }
            /* Vertical grip rail — centered on the handle. A taller (32px)
             * thin (3px) vertical pill gives the resize handle clear edge
             * presence: the user immediately reads "grabbable rail" without
             * the bar being visually aggressive. Opacity 0.75 at rest, full
             * on hover/drag. Color: muted-light tone at rest, white when
             * hovering / actively dragging against the brand-blue fill. */
            .qq-editor-resize > span {
              display: block;
              width: 3px; height: 32px;
              border-radius: 999px;
              background: currentColor;
              color: rgba(255, 255, 255, 0.85);
              opacity: 0.75;
              transition: opacity 0.12s ease, color 0.12s ease;
            }
            .qq-editor-shell[data-theme="dark"] .qq-editor-resize > span {
              color: rgba(255, 255, 255, 0.92);
            }
            .qq-editor-resize:hover > span,
            .qq-editor-resize.is-resizing > span {
              opacity: 1;
              color: #ffffff;
            }
            /* Wave L N2 — sticky bottom actions row.
             *
             * When the user is tweaking Style/Settings/Install values, the
             * footer Save-draft action needs to stay anchored at the bottom
             * of the left pane so it doesn't disappear off-screen during
             * scroll. We make the actions row sticky to bottom:0 of its
             * scroll container (.qq-editor-left). Background is opaque so
             * scrolled content behind it doesn't bleed through.
             *
             * The negative horizontal margins extend the row's hairline
             * separator across the full pane width despite the padding on
             * the wrapping .qq-editor-left-inner. */
            .qq-editor-actions {
              display: flex; align-items: center; gap: 10px;
              margin-top: auto;
              padding: 12px 18px 14px;
              margin-left: -18px; margin-right: -18px;
              border-top: 1px solid ${d.colors.borderLight};
              background: ${d.colors.panel};
              position: sticky; bottom: 0; z-index: 4;
            }
            .qq-editor-shell[data-theme="dark"] .qq-editor-actions {
              background: var(--qq-surface);
            }
            .qq-editor-btn {
              display: inline-flex; align-items: center; justify-content: center;
              padding: 8px 14px; border-radius: 8px;
              font-size: 12.5px; font-weight: 700; cursor: pointer;
              background: ${p.colors.accent}; color: #fff; border: none;
              box-shadow: ${p.shadows.button};
              transition: box-shadow 0.12s ease, transform 0.06s ease;
            }
            .qq-editor-btn:hover:not(:disabled) { box-shadow: ${p.shadows.buttonHover}; }
            .qq-editor-btn:disabled { opacity: 0.55; cursor: not-allowed; }
            .qq-editor-save-error { font-size: 11.5px; color: ${p.colors.danger}; font-weight: 600; }
            .qq-editor-right {
              flex: 1; min-width: 0;
              overflow-y: auto;
            }
            /* BD-3c Feature 1 — desktop: canvas/preview is STATIC. The
               left pane scrolls; the right pane is locked. Mobile keeps
               the original overflow-y:auto (the body stacks vertically).
               P0 sticky fix — use clip (not hidden) so the preview widget's
               sticky descendants still bind to the page / iframe scroll
               context. clip gives the same scroll-static visual without
               establishing a scroll container that traps sticky.
               See memory/project_overflow_clip_for_sticky.md */
            @media (min-width: 769px) {
              .qq-editor-right {
                overflow: clip;
              }
            }
            .qq-preview-pane {
              /* Wave AA — anchor widget to TOP of preview area (was centered
                 vertically). Combined with the +22% taller desktop frame,
                 this keeps the widget consistently positioned regardless of
                 content height.

                 Wave AB-2 — dropped position:sticky+top:0 here. The
                 sticky+min-height:100% combination created a feedback loop
                 with the right pane's overflow-y:auto — scrolling to the
                 bottom caused the bezel to flicker as the sticky element
                 fought to stay anchored. The pane is the sole child of the
                 scrolling right column, so sticky was redundant. */
              display: flex; align-items: flex-start; justify-content: center;
              padding: 24px 20px; box-sizing: border-box; min-height: 100%;
              /* BD-3a fix 2 — square 1px grid (was a dotted radial-gradient).
                 Alex called out the day-mode grid as barely visible. Two
                 perpendicular linear-gradients render a clean 24×24 square
                 grid that's subtle but always perceptible on the light
                 canvas. Dark mode flips to a faint white grid for parity. */
              background-image:
                linear-gradient(to right, rgba(15,23,42,0.08) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(15,23,42,0.08) 1px, transparent 1px);
              background-size: 24px 24px;
              background-position: 0 0;
            }
            .qq-editor-shell[data-theme="dark"] .qq-preview-pane {
              background-image:
                linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px);
            }
            .qq-preview-stage {
              width: 100%; max-width: 920px;
              display: flex; flex-direction: column;
              align-items: center; justify-content: flex-start; background: transparent;
            }
            .qq-editor-help {
              position: fixed; inset: 0; z-index: 1100;
              background: rgba(15,23,42,0.45);
              display: flex; align-items: center; justify-content: center;
              padding: 20px;
            }
            .qq-editor-help-card {
              background: #fff; border-radius: 14px;
              padding: 18px 20px; max-width: 380px; width: 100%;
              box-shadow: ${p.shadows.xl};
              border: 1px solid ${p.colors.borderLight};
            }

            /* Mobile — preview stacks below the editor column. Resize handle
               is hidden (mobile is vertical-stack, no use for it). */
            @media (max-width: 768px) {
              .qq-editor-shell { padding: 8px; }
              .qq-editor-frame {
                min-height: calc(100vh - 16px);
              }
              .qq-editor-body { flex-direction: column; }
              .qq-editor-left {
                width: 100% !important; border-right: none;
                border-bottom: 1px solid ${d.colors.borderLight};
                order: 1;
              }
              /* Wave N — trim wasted side-padding on the editor pane so field
                 row titles (e.g. "Local Incentives", "Professional
                 installation") get the horizontal room they need. Desktop
                 padding (18px) stays — only the mobile gutter is tightened. */
              .qq-editor-left-inner {
                padding: 14px 8px 20px;
              }
              .qq-editor-actions {
                padding: 12px 8px 14px;
                margin-left: -8px; margin-right: -8px;
              }
              .qq-editor-resize { display: none !important; }
              .qq-editor-right { order: 0; }
              .qq-preview-pane {
                position: static; padding: 12px 8px;
                border-bottom: 1px solid ${p.colors.border};
              }

              /* ── BH-3 — mobile bottom-sheet layout overrides ──────────
               * When the bottom sheet is active (.qq-editor-body.is-mobile-sheet)
               * the left pane is REPLACED by the sheet, so we hide it entirely
               * and let the canvas fill the area above the sheet. The W-AO-1
               * action bar is also hidden because the sheet's sticky footer
               * carries the primary CTA + Reset action (avoiding two save
               * surfaces). The canvas pane needs bottom padding to keep the
               * widget visible when the sheet is collapsed (56px) — and the
               * scrollable preview still reaches all the way to just above
               * the sheet handle. */
              .qq-editor-body.is-mobile-sheet .qq-editor-left {
                display: none !important;
              }
              /* Wave 10 fix — when the mobile bottom-sheet is open (half/full),
               * its backdrop (.qq-sheet-backdrop, z-index: 9997) covers the
               * entire viewport including the editor chrome above. That blocks
               * pointer events on the editor topbar — tabs (editor-tab-*),
               * fold-toggle, theme/help/close icons — even though they remain
               * visually unobscured. Lift the sticky topbar above the backdrop
               * so the chrome stays interactive while the sheet is visible.
               * Backdrop click still collapses the sheet (taps below the
               * topbar continue to hit it). */
              .qq-editor-topbar {
                z-index: 9999;
              }
              .qq-editor-body.is-mobile-sheet {
                /* Sheet is fixed-position — only the canvas stays in flow. */
                flex-direction: column;
              }
              .qq-editor-body.is-mobile-sheet .qq-editor-right {
                flex: 1 1 auto;
                order: 0;
                /* W-CP-1 (2026-05-23) — iOS Safari requires a concrete
                 * height for overflow-y:auto to enable touch-pan. Without
                 * this the canvas refuses finger scroll. Compute as:
                 *   100dvh
                 *   - topbar (~40px; may grow to ~48px when W-MT-1 wraps
                 *     the tab strip to a second row but the wrapping
                 *     happens INSIDE the topbar, not below it, so the
                 *     visible chrome height is still bounded ~40-72px —
                 *     err generous via a px-stable 40px baseline)
                 *   - collapsed sheet handle (~56px)
                 *   - safe-area-inset-bottom */
                height: calc(100dvh - 40px - 56px - env(safe-area-inset-bottom, 0px));
                max-height: calc(100dvh - 40px - 56px - env(safe-area-inset-bottom, 0px));
                padding-bottom: 12px;
                overflow-y: auto;
                -webkit-overflow-scrolling: touch;
              }
              .qq-editor-body.is-mobile-sheet .qq-preview-pane {
                /* Drop the bottom hairline — the sheet handle already
                 * provides the visual separator. */
                border-bottom: none;
              }
              /* W-AO-1 action bar is redundant once the sheet's sticky
               * footer carries the primary CTA. Hide it whenever the sheet
               * layout is active. */
              .qq-editor-body.is-mobile-sheet ~ .qq-mobile-actionbar {
                display: none !important;
              }
              /* AIBubble — ensure it floats above the sheet (z-index 9998).
               * The bubble itself is z-index 1100 by default; bump above
               * the sheet on mobile so the assistant remains reachable
               * even when the sheet is in 'full' state. */
              .qq-editor-body.is-mobile-sheet ~ .qq-ai-bubble,
              .qq-editor-body.is-mobile-sheet ~ .qq-ai-panel {
                z-index: 9999 !important;
              }
              /* Bottom-anchor the bubble above the collapsed sheet so it
               * doesn't sit behind the handle. */
              .qq-editor-body.is-mobile-sheet ~ .qq-ai-bubble {
                bottom: calc(72px + env(safe-area-inset-bottom, 0px));
              }
              .qq-preview-stage { max-width: 100%; }
              .qq-preview-pane > .qq-preview-stage > .widget-scope { padding: 0 !important; }
              .qq-bezel--desktop {
                max-width: 100% !important;
                max-height: none !important;
                border-radius: 12px;
              }
              .qq-bezel--mobile {
                max-width: 100% !important;
                max-height: none !important;
                padding: 8px 6px !important;
                border-radius: 28px;
              }
              .qq-bezel--mobile > div:last-child { border-radius: 22px; }
              .qq-editor-tab { padding: 6px 10px; font-size: 12.5px; }
              /* Wave M / BH-2 — collapse the stacked preview (mobile lays
                 out vertically: preview on top, editor below — collapsing
                 hides it entirely so the editor uses the full viewport
                 height). The fold control is the icon-btn in the unified
                 top chrome (BH-2), so no separate sizing override here. */
              .qq-editor-body.is-preview-collapsed .qq-editor-right {
                display: none;
                height: 0 !important;
                padding: 0 !important;
                border: 0 !important;
              }
            }
            @media (max-width: 480px) {
              /* BH-2 — tighten gaps + horizontal padding on phone widths
                 so the brand icon, undo/redo, tabs and right-side tools
                 still all fit on the single row. The mobile sticky bottom
                 action bar carries the primary Save CTA and a chevron
                 row for less-frequent secondary tools, so the topbar
                 doesn't need to surface every action at this width. */
              .qq-editor-topbar { padding: 4px 8px; gap: 4px; min-height: 40px; }
              .qq-editor-divider { display: none; }
              .qq-editor-saved { font-size: 10.5px; padding: 2px 7px; }
              .qq-editor-device button { width: 28px; height: 22px; }
              /* Keep tap target >= 28px even at narrow widths. */
              .qq-editor-icon-btn { width: 28px; height: 28px; }
              /* Wave 10 — the fold/unfold toggle is a primary mobile action
               * (collapses the preview pane). Per the global ≥44px tap
               * target rule it needs more padding than the other icon-btns
               * (theme/help/close are secondary and stay 28×28 to keep the
               * topbar tight). */
              .qq-editor-icon-btn.qq-editor-fold {
                min-width: 44px; min-height: 44px;
              }
              /* BH-1 — device preset switcher is hidden on phone-sized
               * wizard windows. A user editing on their phone doesn't
               * need a device-preset switcher (they ARE on a phone). The
               * mobile sticky action bar's device toggle still cycles
               * through the three presets if the user wants to preview a
               * tablet/desktop view. */
              .qq-editor-device { display: none; }
            }
            @media (max-width: 480px) {
              /* W-MT-1 (2026-05-23) — promote the wizard tab strip to its
                 own row below the top chrome so all 4 tabs (Build /
                 Style / Settings / Install) are visible without
                 horizontal scrolling on phone widths. */
              .qq-editor-topbar { flex-wrap: wrap; row-gap: 4px; }
              .qq-editor-tabstrip {
                order: 99;
                flex: 0 0 100%;
                overflow-x: visible;
                justify-content: space-between;
                padding: 4px 0 2px;
                border-top: 1px solid var(--qq-border, rgba(15,23,42,0.08));
                margin: 4px -8px 0;
                padding-left: 8px;
                padding-right: 8px;
              }
              .qq-editor-tab {
                flex: 1;
                padding: 8px 4px;
                font-size: 12px;
                text-align: center;
                min-height: 36px;
              }
            }

            /* ── W-AO-1 — mobile sticky bottom action bar ──────────────
             *
             * Hidden by default; shown only at the mobile breakpoint via the
             * @media block below. The bar is position:fixed to the bottom
             * of the viewport so it survives in-pane scroll. Backdrop blur
             * keeps the underlying content visible but de-emphasised. */
            .qq-mobile-actionbar {
              display: none;
            }
            @media (max-width: 768px) {
              .qq-mobile-actionbar {
                display: flex; flex-direction: column;
                position: fixed; left: 0; right: 0; bottom: 0;
                z-index: 60;
                background: rgba(255, 255, 255, 0.92);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                border-top: 1px solid ${d.colors.borderLight};
                box-shadow: 0 -6px 18px rgba(15,23,42,0.06);
                padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 0px));
                gap: 8px;
                transition: max-height 220ms cubic-bezier(0.22, 1, 0.36, 1);
                max-height: 60vh;
              }
              .qq-mobile-actionbar-handle {
                position: absolute; top: -10px; left: 50%;
                transform: translateX(-50%);
                width: 56px; height: 20px; padding: 0;
                background: rgba(255,255,255,0.95);
                border: 1px solid ${d.colors.borderLight};
                border-radius: 999px;
                box-shadow: 0 2px 6px rgba(15,23,42,0.08);
                cursor: pointer;
                display: inline-flex; align-items: center; justify-content: center;
              }
              .qq-mobile-actionbar-handle:focus-visible {
                outline: none;
                box-shadow: 0 0 0 3px ${p.colors.accentLighter};
              }
              .qq-mobile-actionbar-chevron {
                width: 12px; height: 12px;
                border-right: 2px solid ${p.colors.muted};
                border-bottom: 2px solid ${p.colors.muted};
                transform: rotate(-135deg) translate(-2px, -2px);
                transition: transform 200ms ease;
              }
              .qq-mobile-actionbar.is-extended .qq-mobile-actionbar-chevron {
                transform: rotate(45deg) translate(-2px, -2px);
              }
              .qq-mobile-actionbar-primary {
                display: flex; align-items: stretch; gap: 8px; width: 100%;
              }
              .qq-mobile-actionbar-cta {
                flex: 1;
                min-height: 44px;
                padding: 0 16px;
                font-size: 14px; font-weight: 700;
                background: ${p.colors.accent}; color: #fff;
                border: none; border-radius: 10px;
                cursor: pointer;
                box-shadow: ${p.shadows.button};
                transition: box-shadow 0.12s ease, background 0.12s ease;
              }
              .qq-mobile-actionbar-cta:hover:not(:disabled) {
                box-shadow: ${p.shadows.buttonHover};
              }
              .qq-mobile-actionbar-cta:disabled {
                opacity: 0.55; cursor: not-allowed;
              }
              .qq-mobile-actionbar-secondary {
                display: flex; gap: 8px;
                overflow-x: auto;
                scroll-snap-type: x mandatory;
                -webkit-overflow-scrolling: touch;
                scrollbar-width: none;
                padding: 2px 0 4px;
              }
              .qq-mobile-actionbar-secondary::-webkit-scrollbar { display: none; }
              .qq-mobile-actionbar-sbtn {
                scroll-snap-align: start;
                flex: 0 0 auto;
                min-height: 38px;
                padding: 0 14px;
                font-size: 12.5px; font-weight: 600;
                background: #fff; color: ${p.colors.heading};
                border: 1px solid ${p.colors.border};
                border-radius: 999px;
                cursor: pointer;
                white-space: nowrap;
                transition: background 0.12s ease, border-color 0.12s ease;
              }
              .qq-mobile-actionbar-sbtn:hover {
                background: ${p.colors.accentLighter};
                border-color: ${p.colors.accent};
              }
              .qq-mobile-actionbar-sbtn.is-danger {
                color: ${p.colors.danger};
                border-color: ${p.colors.danger};
              }
              .qq-mobile-actionbar-sbtn.is-danger:hover {
                background: rgba(220, 38, 38, 0.08);
              }
              /* Dark editor theme — flip surface colors. */
              .qq-editor-shell[data-theme="dark"] .qq-mobile-actionbar {
                background: rgba(15, 23, 42, 0.92);
                border-top-color: var(--qq-border);
              }
              .qq-editor-shell[data-theme="dark"] .qq-mobile-actionbar-handle {
                background: rgba(15, 23, 42, 0.95);
                border-color: var(--qq-border);
              }
              .qq-editor-shell[data-theme="dark"] .qq-mobile-actionbar-sbtn {
                background: var(--qq-surface);
                color: var(--qq-text);
                border-color: var(--qq-border);
              }
              /* Leave room at the bottom of the editor frame so the fixed
               * action bar doesn't cover the last few rows of the form.
               * Extended adds extra clearance for the secondary row. */
              .qq-editor-frame {
                padding-bottom: 64px;
              }
              .qq-mobile-actionbar.is-extended ~ .qq-editor-frame,
              .qq-editor-shell:has(.qq-mobile-actionbar.is-extended) .qq-editor-frame {
                padding-bottom: 140px;
              }
              /* The in-pane sticky Save footer (.qq-editor-actions) is
               * redundant once the fixed mobile action bar carries the
               * primary CTA — hide it on mobile to avoid two save
               * buttons fighting for attention. */
              .qq-editor-actions {
                display: none !important;
              }
              /* Wave X #17 / BH-2 — sticky single-row topbar with backdrop
               * blur so it reads as a true app-style sticky header rather
               * than an opaque slab. */
              .qq-editor-topbar {
                background: rgba(255, 255, 255, 0.94);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
              }
              .qq-editor-shell[data-theme="dark"] .qq-editor-topbar {
                background: rgba(15, 23, 42, 0.88);
              }
            }
            @media (prefers-reduced-motion: reduce) {
              .qq-mobile-actionbar,
              .qq-mobile-actionbar-chevron {
                transition: none !important;
              }
            }
          `}</style>
        </div>
      </DndContext>
    </SelectionProvider>
  );
}
