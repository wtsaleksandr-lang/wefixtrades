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
import EditorTabs from './EditorTabs';
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
  const [device, setDevice] = useState<PreviewDevice>('desktop');
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
          if (!cancelled && typeof data?.plan_tier === 'string') {
            setPlanTier(data.plan_tier);
          }
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
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={undo}
              onRedo={redo}
            />

            <EditorTabs
              active={activeTab}
              onChange={setActiveTab}
              previewCollapsed={previewCollapsed}
              onTogglePreview={togglePreviewCollapsed}
            />

            <div
              className={`qq-editor-body${previewCollapsed ? ' is-preview-collapsed' : ''}`}
              data-preview-collapsed={previewCollapsed ? 'true' : 'false'}
            >
              <div
                className="qq-editor-left"
                data-testid="editor-left-panel"
                style={{ width: paneWidth }}
              >
                <div className="qq-editor-left-inner">
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
                  {activeTab === 'build' && (
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
                />
              </div>
            </div>

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
                    onClick={() => setDevice(device === 'desktop' ? 'mobile' : 'desktop')}
                    data-testid="wizard-mobile-actionbar-device"
                  >
                    {device === 'desktop' ? 'Mobile preview' : 'Desktop preview'}
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
            .qq-editor-topbar {
              display: flex; align-items: center; gap: 10px;
              padding: 10px 16px; flex-shrink: 0;
              background: ${d.colors.panelHeader};
              border-bottom: 1px solid ${d.colors.borderLight};
              /* Wave X #17 — sticky topbar.
                 Was static; the brand wordmark, saved indicator, device
                 toggle, help and close button now stay pinned at the
                 top of the editor frame even when the left pane is
                 scrolled. Stacks above the tabs bar (z:6 > z:5). */
              position: sticky;
              top: 0;
              z-index: 6;
            }
            .qq-editor-brand {
              display: flex; align-items: center; gap: 7px; text-decoration: none;
              font-size: 13px; font-weight: 800; color: ${p.colors.heading}; flex-shrink: 0;
            }
            .qq-editor-saved {
              font-size: 11px; font-weight: 600; color: ${p.colors.accentDark};
              background: ${p.colors.accentLighter}; padding: 3px 9px; border-radius: 999px;
              transition: opacity 0.3s ease; flex-shrink: 0;
            }
            .qq-editor-spacer { flex: 1; min-width: 0; }
            .qq-editor-device {
              display: flex; gap: 3px; padding: 3px; flex-shrink: 0;
              border-radius: 9px; background: #fff;
              border: 1px solid ${p.colors.borderLight};
            }
            .qq-editor-device button {
              display: flex; align-items: center; justify-content: center;
              width: 32px; height: 25px; border-radius: 7px; border: none;
              cursor: pointer; transition: background 0.15s ease;
            }
            .qq-editor-icon-btn {
              width: 26px; height: 26px; border-radius: 50%; cursor: pointer;
              border: 1px solid ${p.colors.border}; background: #fff;
              color: ${p.colors.muted}; padding: 0;
              display: flex; align-items: center; justify-content: center;
              transition: background 0.12s ease, color 0.12s ease;
            }
            .qq-editor-icon-btn:hover:not(:disabled) {
              background: ${p.colors.surfaceRaised};
              color: ${p.colors.heading};
            }
            /* BD-3a fix 1 — Undo/Redo icon button states. 32px touch target
             * (was 26px) and an accent-blue tint on hover for affordance,
             * dimmed when the corresponding stack is empty. */
            .qq-editor-history-btn {
              width: 32px;
              height: 32px;
              flex-shrink: 0;
            }
            .qq-editor-history-btn:hover:not(:disabled) {
              background: ${p.colors.accentLighter};
              color: ${p.colors.accent};
              border-color: ${p.colors.accent};
            }
            .qq-editor-history-btn:disabled {
              opacity: 0.4;
              cursor: not-allowed;
            }
            /* Wave L N1 — keep the tab bar visible while the left-pane content
             * scrolls. The tabs are a child of .qq-editor-frame (siblings of
             * .qq-editor-body), so sticky to the top of the frame; the topbar
             * sits at 0..~46px so the tabs sit at the topbar's height. */
            .qq-editor-tabs {
              display: flex; flex-shrink: 0;
              background: #fff;
              border-bottom: 1px solid ${d.colors.borderLight};
              overflow-x: auto;
              scrollbar-width: none;
              position: sticky;
              /* Wave X #17 — tabs stick *under* the now-sticky topbar.
                 The topbar's height is ~46px (10px padding + ~26px
                 icon-button row). Tabs sit at that offset so both
                 surfaces stay pinned and stacked. */
              top: 46px;
              z-index: 5;
            }
            .qq-editor-tabs::-webkit-scrollbar { display: none; }
            .qq-editor-tabs-inner {
              display: flex; align-items: center; gap: 4px;
              padding: 0 12px;
              min-width: max-content;
            }
            .qq-editor-tab {
              font: inherit; background: none; border: none; cursor: pointer;
              padding: 12px 16px;
              font-size: 13px; font-weight: 600;
              border-bottom: 2px solid transparent;
              transition: color 0.12s ease, border-color 0.12s ease;
            }
            .qq-editor-tab:hover { color: ${p.colors.heading}; }
            .qq-editor-tab.is-active { font-weight: 700; }

            /* Wave M — fold/unfold preview button, pushed to the far right
               of the tab row so it sits on the same horizontal line as the
               tabs but visibly separate. */
            .qq-editor-fold {
              margin-left: auto;
              display: inline-flex; align-items: center; gap: 6px;
              padding: 6px 10px;
              min-height: 32px;
              border: 1px solid transparent;
              border-radius: 7px;
              background: transparent;
              color: ${p.colors.muted};
              font: inherit; font-size: 12px; font-weight: 600;
              cursor: pointer;
              transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease;
            }
            .qq-editor-fold:hover {
              color: ${p.colors.accent};
              background: ${p.colors.accentLighter};
              border-color: ${p.colors.accentLighter};
            }
            .qq-editor-fold:focus-visible {
              outline: none;
              border-color: ${p.colors.accent};
              box-shadow: 0 0 0 2px ${p.colors.accentLighter};
            }
            .qq-editor-fold.is-collapsed {
              color: ${p.colors.accent};
              background: ${p.colors.accentLighter};
            }
            .qq-editor-fold-label {
              font-weight: 600;
              letter-spacing: 0.005em;
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

            /* Wave AA — fold/unfold preview is mobile-only. On desktop
               (>768px) the left-pane stretched to full width when the
               preview was collapsed, which looked wrong since the split
               view IS the desktop layout. Hide the fold button + neutralise
               any persisted collapsed state on desktop. */
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
            /* Wave I (d) — resize handle on the right edge of the left pane. */
            .qq-editor-resize {
              position: absolute; top: 0; right: -3px; bottom: 0;
              width: 6px;
              background: transparent;
              border: 0; padding: 0; cursor: col-resize;
              z-index: 5;
              touch-action: none;
              transition: background 0.12s ease;
            }
            .qq-editor-resize:hover,
            .qq-editor-resize.is-resizing {
              background: ${p.colors.accentLighter};
            }
            .qq-editor-resize > span {
              position: absolute; top: 50%; left: 50%;
              transform: translate(-50%, -50%);
              width: 2px; height: 30px; border-radius: 2px;
              background: ${p.colors.borderLight};
            }
            .qq-editor-resize:hover > span,
            .qq-editor-resize.is-resizing > span {
              background: ${p.colors.accent};
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
              .qq-editor-tab { padding: 10px 12px; font-size: 12.5px; }
              /* Wave M — tap-target on mobile + collapse the stacked
                 preview (mobile lays out vertically: preview on top, editor
                 below — collapsing hides it entirely so the editor uses
                 the full viewport height). */
              .qq-editor-fold {
                min-height: 44px;
                padding: 8px 12px;
                font-size: 13px;
              }
              .qq-editor-body.is-preview-collapsed .qq-editor-right {
                display: none;
                height: 0 !important;
                padding: 0 !important;
                border: 0 !important;
              }
            }
            @media (max-width: 480px) {
              .qq-editor-topbar { padding: 8px 10px; gap: 6px; }
              .qq-editor-saved { font-size: 10.5px; padding: 2px 7px; }
              .qq-editor-device button { width: 28px; height: 22px; }
              .qq-editor-icon-btn { width: 24px; height: 24px; }
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
              /* Wave X #17 sticky topbar already in place; tighten the
               * mobile presentation with a backdrop blur so it reads as
               * a true app-style sticky header rather than an opaque slab. */
              .qq-editor-topbar {
                background: rgba(255, 255, 255, 0.94);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
              }
              .qq-editor-tabs {
                background: rgba(255, 255, 255, 0.94);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
              }
              .qq-editor-shell[data-theme="dark"] .qq-editor-topbar,
              .qq-editor-shell[data-theme="dark"] .qq-editor-tabs {
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
