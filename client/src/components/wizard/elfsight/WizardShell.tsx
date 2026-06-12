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
import { createPortal } from 'react-dom';
import { useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import {
  DndContext, type DragEndEvent, type DragOverEvent, type DragStartEvent,
  closestCenter, pointerWithin,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { apiRequest } from '@/lib/queryClient';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { validateFormula } from '@shared/formulaEngine';
import { platformTheme } from '@/theme/platformTheme';
import { dashboardTheme } from '@/theme/dashboardTheme';
import { AE } from './appleEditor';
import { buildAdvancedConfig } from './buildAdvancedConfig';
import {
  buildBlankPreviewConfig, getTemplatePreset, deriveStyleFromCategory,
  type TemplateField, type TemplateCalculation, type TemplateConfig,
  type TemplateTiered,
  type TrustBadge,
  type TemplateStep,
} from '@shared/templatePresets';
import {
  SlidersHorizontal, Palette, Settings as SettingsIcon, MousePointerClick, HelpCircle,
} from 'lucide-react';
import AIBubble from './AIBubble';
import EditorTopBar from './EditorTopBar';
import HelpModal from './HelpModal';
// 2026-05-22 (revert of PR #535) — EditorBottomBar was deleted; the tab
// strip lives back in the top chrome again. See EditorTopBar.tsx.
import MobileBottomSheet from './MobileBottomSheet';
import BottomTabBar from './BottomTabBar';
// BH-2 — EditorTabs is no longer rendered as a standalone bar; the tab
// strip is rendered inline inside EditorTopBar so the top chrome lives on
// a single horizontal row. The component file is preserved for any future
// reuse but is intentionally not imported here.
import TabPlaceholder from './TabPlaceholder';
import BuildTab from './BuildTab';
import PreviewPane from './PreviewPane';
import StyleTab from './StyleTab';
import SettingsTab from './SettingsTab';
import ActionTab from './ActionTab';
import InstallTab from './InstallTab';
import { makeField } from './FieldsPanel';
import { SelectionProvider, useSelection } from './selection';
import { useEditorDndSensors, DND_CONTAINERS } from './dnd';
import {
  INITIAL_SHELL_STATE, DEFAULT_SHELL_STYLE, DEFAULT_SHELL_NUMBER_FORMAT,
  DEVICE_PRESET_STORAGE_KEY, EDITOR_TABS,
  type EditorTab, type EditorTheme, type PreviewDevice, type ShellState,
  type ShellHeader, type ShellResults, type ShellStyle,
  type ShellSettings, type ShellPricing,
  type PublicFieldType,
} from './types';

const p = platformTheme;
const d = dashboardTheme;

const STORAGE_KEY = 'qq_elfsight_shell';
const PANE_WIDTH_KEY = 'qq_editor_pane_width';
const EDITOR_THEME_KEY = 'qq_editor_theme';
// Wave M — fold/unfold preview pane. Persists across reloads.
const PREVIEW_COLLAPSED_KEY = 'qq_preview_collapsed';
const PANE_WIDTH_MIN = 320;
const PANE_WIDTH_MAX = 640;
const PANE_WIDTH_DEFAULT = 420;

function loadEditorTheme(): EditorTheme {
  try {
    const raw = localStorage.getItem(EDITOR_THEME_KEY);
    if (raw === 'light' || raw === 'dark') return raw;
  } catch {}
  // No saved choice → default to light (bright). The toggle still persists a
  // user's pick to EDITOR_THEME_KEY, so a switch to dark sticks across reloads.
  return 'light';
}

function seedFields(layout: ShellState['layout']): TemplateField[] {
  return buildBlankPreviewConfig(layout).fields.map((f) => ({ ...f }));
}
function seedCalculations(layout: ShellState['layout']): TemplateCalculation[] {
  return buildBlankPreviewConfig(layout).calculations.map((c) => ({ ...c }));
}

/**
 * DATA-LOSS FIX — `hasUserAuthoredContent`.
 *
 * Picking a theme/template card in the Build strip used to overwrite the
 * user's `fields` / `calculations` wholesale (see `applyTemplate`). To a user
 * the colour-forward template cards read as "themes", so clicking one to
 * change the look silently wiped every add-on / field they had configured.
 *
 * This predicate distinguishes a *pristine* calculator (still on the blank
 * seed for its current layout, or empty) from one the user has actually built
 * on. When it returns `true`, `applyTemplate` keeps the user's structural
 * config and applies ONLY the template's visual style — so selecting a theme
 * can never drop fields/add-ons. When `false` (blank/seed), the template loads
 * fully, preserving the "start from a template" flow.
 *
 * Pristine = the current fields are exactly the blank seed for the current
 * layout (same ids, same length). Any add/remove/edit/reorder makes at least
 * one id or the length diverge, so the calculator is treated as user-authored.
 */
function hasUserAuthoredContent(state: ShellState): boolean {
  const fields = state.fields ?? [];
  if (fields.length === 0) return false;
  const seed = seedFields(state.layout);
  // A different field count means the user added or removed fields.
  if (fields.length !== seed.length) return true;
  const seedIds = seed.map((f) => f.id).join('');
  const curIds = fields.map((f) => f.id).join('');
  // Same ids in the same order ⇒ still the untouched blank seed. Editing a
  // field's label/options/type keeps its id, which would read as pristine —
  // but the only place those seed ids exist is the freshly-seeded blank state,
  // and any *content* edit there is harmless to preserve, so id-identity is a
  // safe, false-negative-only signal (it never wrongly drops user work).
  return seedIds !== curIds;
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
        // Re-seed the 3-field starter whenever the persisted fields are missing
        // OR an empty array (length 0). A returning user whose localStorage held
        // `fields: []` used to land on a truly blank "Add your first field"
        // canvas; seeding on empty (not just undefined) guarantees the starter
        // calculator always renders. hasUserAuthoredContent() still guards real
        // saved work — a non-empty fields array is preserved untouched.
        fields: hasFields ? parsed.fields : seedFields(layout),
        calculations: hasCalcs ? parsed.calculations : seedCalculations(layout),
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

/**
 * Thrown by saveDraftMutation when a calc formula fails validation, so the
 * mutation rejects (no POST) and onError can show the named, specific reason.
 */
class FormulaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaValidationError';
  }
}

/**
 * P0 data-loss fix (fix/wizard-persistence) — Fix 2: validate every calc
 * formula BEFORE saving so a broken formula never gets persisted (it would
 * render as a silent $0 at quote time).
 *
 * For each calculation, in order:
 *   1. Syntax check via the shared `validateFormula` (parse-only).
 *   2. Reference check — every `[name]` must resolve to a field name OR a
 *      PRECEDING calc name (case-insensitive), matching FormulaEditor's live
 *      validator (FormulaEditor.tsx ~375-399). A calc may reference any calc
 *      defined before it, so subtotals can chain into a total.
 *
 * Returns the first failure as `{ calcName, error }`, or null when all valid.
 * Empty / no calcs → null (saving an empty calculator is fine).
 */
function firstInvalidFormula(
  calculations: TemplateCalculation[],
  fields: TemplateField[],
): { calcName: string; error: string } | null {
  const fieldNames = fields.map((f) => f.name);
  const seenCalcNames: string[] = [];
  const resolves = (ref: string, calcNames: string[]): boolean => {
    const lower = ref.toLowerCase();
    return (
      fieldNames.includes(ref) ||
      calcNames.includes(ref) ||
      fieldNames.some((n) => n.toLowerCase() === lower) ||
      calcNames.some((n) => n.toLowerCase() === lower)
    );
  };
  for (const calc of calculations) {
    const formula = calc.formula ?? '';
    const displayName = (calc.name ?? '').trim() || 'Unnamed calculation';
    if (formula.trim() !== '') {
      const syntax = validateFormula(formula);
      if (!syntax.valid) {
        return { calcName: displayName, error: syntax.error || 'Invalid formula' };
      }
      const refs: string[] = [];
      const re = /\[([^\]]+)\]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(formula))) refs.push(m[1].trim());
      const missing = refs.filter((r) => !resolves(r, seenCalcNames));
      if (missing.length > 0) {
        const list = missing.map((r) => `[${r}]`).join(', ');
        return {
          calcName: displayName,
          error: missing.length === 1
            ? `references an unknown field or calculation: ${list}`
            : `references unknown fields or calculations: ${list}`,
        };
      }
    }
    // This calc is now available as a reference for the calcs that follow it.
    if ((calc.name ?? '').trim() !== '') seenCalcNames.push(calc.name);
  }
  return null;
}

interface Props {
  embed?: boolean;
}

// BD-3a fix 1 — undo/redo history stack depth. Capped to prevent memory bloat
// when an owner edits a lot inside one session (each tweak pushes the prior
// state). 50 entries handles a typical build session comfortably.
const HISTORY_LIMIT = 50;

// feat/wizard-section-sync (2026-06-07) — menu-side persistent highlight for
// the generic `spot` selection kind (CTA / trust-badges / tier-selector /
// stepper / business). Field rows, the header section and the results section
// already self-mark `.is-selected` via useSelection inside their own panels;
// the structural panel anchors are plain `[data-edit-key]` divs that don't
// consume the context, so this tiny consumer (mounted INSIDE SelectionProvider)
// drives their persistent outline from the SAME shared selection. It toggles a
// `.qq-edit-selected` class on the resolved anchor — distinct from the transient
// `.qq-edit-highlight` pulse — and clears it from any previously-selected node.
// Mirrors resolveEditTarget's key→section expand logic so an anchor inside a
// collapsed AdvancedSection is opened before it's highlighted.
function MenuSpotSelectionSync({
  reduceMotion, mobileSheetOpen, activeTab,
}: {
  reduceMotion: boolean;
  // Re-run when the mobile sheet opens or the active tab changes so a `spot`
  // anchor that mounts only once its panel/sheet is shown still gets the
  // persistent outline (the anchor isn't in the DOM while the sheet is folded).
  mobileSheetOpen: boolean;
  activeTab: EditorTab;
}) {
  const { selected } = useSelection();
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const strip = () => {
      document.querySelectorAll<HTMLElement>('.qq-edit-selected').forEach((el) => {
        el.classList.remove('qq-edit-selected');
      });
    };
    // Only the generic `spot` kind is driven here; field/header/results own
    // their persistent menu outline inside their own components.
    if (!selected || selected.kind !== 'spot') {
      strip();
      return undefined;
    }
    const SECTION_FOR_KEY: Record<string, string> = {
      'trust-badges': 'style-advanced',
      tiered: 'style-advanced',
    };
    const key = selected.id;
    const behavior: ScrollBehavior = reduceMotion ? 'auto' : 'smooth';
    const raf = requestAnimationFrame(() => {
      strip();
      let el = document.querySelector<HTMLElement>(`[data-edit-key="${CSS.escape(key)}"]`);
      if (!el) {
        const sectionId = SECTION_FOR_KEY[key];
        const section = sectionId
          ? document.querySelector<HTMLElement>(`[data-testid="advanced-section-${sectionId}"]`)
          : null;
        if (section && section.getAttribute('data-open') === 'false') {
          section.querySelector<HTMLButtonElement>(`[data-testid="advanced-toggle-${sectionId}"]`)?.click();
        }
        // Retry next frame after the expand reflow.
        requestAnimationFrame(() => {
          const node = document.querySelector<HTMLElement>(`[data-edit-key="${CSS.escape(key)}"]`);
          if (node) {
            node.classList.add('qq-edit-selected');
            try { node.scrollIntoView({ block: 'center', behavior }); } catch { /* ignore */ }
          }
        });
        return;
      }
      const collapsed = el.closest<HTMLElement>('[data-testid^="advanced-section-"][data-open="false"]');
      if (collapsed) {
        collapsed.querySelector<HTMLButtonElement>('[data-testid^="advanced-toggle-"]')?.click();
      }
      el.classList.add('qq-edit-selected');
      try { el.scrollIntoView({ block: 'center', behavior }); } catch { /* ignore */ }
    });
    return () => cancelAnimationFrame(raf);
  }, [selected, reduceMotion, mobileSheetOpen, activeTab]);
  return null;
}

export default function WizardShell({ embed = false }: Props) {
  const [, navigate] = useLocation();
  // fix/wizard-save-anon — the autosave POST /api/calculators requires a
  // signed-in owner AND a non-empty business name (server Zod `.min(1)`).
  // On a fresh anonymous session both are missing, so the POST 400s and the
  // mutation's onError fired a scary destructive toast — even though the full
  // draft is already persisted to localStorage (qq_elfsight_shell) and nothing
  // is lost. We detect auth via the existing useAuth hook (backed by
  // GET /api/auth/me) and gate every autosave-style call below.
  const { isAuthenticated } = useAuth();
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
  // Elfsight-parity (2026-06): Install/embed folded into the Publish flow.
  // Tapping Publish saves the draft AND opens this modal with the hosted link,
  // embed code, and "have us install" — there is no separate Install tab.
  const [publishOpen, setPublishOpen] = useState(false);

  // BD-3a fix 1 — undo / redo stacks of prior ShellState snapshots. We use
  // refs so pushing to the stacks doesn't itself trigger a re-render; the
  // `histLen` state below mirrors the stack lengths and is the SOLE driver of
  // the rendered canUndo / canRedo enabled-state (see BD-3a-fix2 below).
  const undoStackRef = useRef<ShellState[]>([]);
  const redoStackRef = useRef<ShellState[]>([]);
  // `isReplayingRef` guards setState() during undo/redo so the replay itself
  // doesn't get pushed back onto the undo stack (which would make undo a no-op
  // toggle between the two most recent states).
  const isReplayingRef = useRef(false);
  // Coalescing — a burst of rapid consecutive edits (e.g. typing a word) should
  // collapse into ONE undo entry, not one-per-keystroke. We push a new history
  // entry only when the gap since the last edit is ≥ COALESCE_MS; within the
  // window the earlier pre-burst snapshot already on the stack stays the undo
  // target. `lastPushTsRef` records the timestamp of the last edit (push or
  // coalesced). Reset to 0 after discrete actions (drag) to force a fresh entry.
  const COALESCE_MS = 350;
  const lastPushTsRef = useRef(0);
  // BD-3a-fix2 — real state that drives the Undo/Redo button enabled-state.
  // `u` = undo stack length, `r` = redo stack length. Updated SYNCHRONOUSLY
  // right after every stack mutation so the rendered enabled-state can never
  // desync from the actual stacks.
  const [histLen, setHistLen] = useState({ u: 0, r: 0 });
  // `latestStateRef` always mirrors the committed `state` so the stable
  // setState / undo / redo callbacks can read the freshest snapshot without
  // relying on when React invokes a functional state updater. Kept in sync on
  // every render below.
  const latestStateRef = useRef(state);
  latestStateRef.current = state;

  // Wrap setState so that every USER-INITIATED mutation pushes the previous
  // snapshot onto the undo stack and clears the redo stack (the classic
  // editor undo/redo semantics — new edit invalidates redo history).
  // fix/wizard-same-tick-state-clobber (2026-06-12) — this wrapper previously
  // computed `next` OUTSIDE React from `latestStateRef.current` (which is only
  // refreshed on render) and committed it via setStateInner(next) as a PLAIN
  // OBJECT. Two wrapper calls in the same synchronous tick therefore both
  // computed from the SAME stale snapshot, and the second silently overwrote
  // the first (live repro: the AI applier's setBusinessName(...) followed by
  // replaceTemplate(...) in one tick lost the business name). Every commit now
  // flows through the FUNCTIONAL form of setStateInner, so call 2 composes on
  // call 1's queued result. History bookkeeping moved INSIDE the updater (the
  // only place the true `prev` exists); the `committed` closure latch makes it
  // run exactly once per wrapper call, so StrictMode's double-invocation of
  // the updater can't double-push history. Note same-tick pairs land within
  // COALESCE_MS, so they collapse into ONE undo entry (one Ctrl+Z restores the
  // pre-pair state) — consistent with the typing-burst coalescing semantics.
  const setState = useCallback<typeof setStateInner>((updater) => {
    if (isReplayingRef.current) {
      // Replay path — don't touch the history stacks.
      setStateInner(updater);
      return;
    }
    // Per-call idempotency latch. React may invoke the updater below more
    // than once for this single dispatch (StrictMode double-invocation, or an
    // eager evaluation followed by a render-pass replay). The state math is
    // pure and safe to re-run; the history mutation must happen exactly once.
    let committed = false;
    setStateInner((prev) => {
      const next = typeof updater === 'function'
        ? (updater as (s: ShellState) => ShellState)(prev)
        : updater;
      if (next === prev) return prev;
      // Keep the ref mirroring the freshest dispatched state so undo/redo
      // (which read it synchronously, possibly in this same tick) never
      // snapshot a stale value. Re-confirmed by the render-time sync above.
      latestStateRef.current = next;
      if (!committed) {
        committed = true;
        const stack = undoStackRef.current;
        // Coalesce rapid consecutive edits (typing) into a single undo entry.
        // If the previous edit landed < COALESCE_MS ago AND there's already a
        // snapshot on the stack to undo back to, skip pushing a new entry —
        // the pre-burst snapshot already on top stays the undo target. We
        // STILL clear redo (redo length may have changed). Otherwise push as
        // normal (idle gap ≥ COALESCE_MS, or empty stack).
        const now = Date.now();
        const coalesce = now - lastPushTsRef.current < COALESCE_MS && stack.length > 0;
        lastPushTsRef.current = now;
        if (!coalesce) {
          stack.push(prev);
          if (stack.length > HISTORY_LIMIT) stack.shift();
        }
        redoStackRef.current = [];
      }
      return next;
    });
    // Mirror the stack lengths into render state. Functional form: this
    // update is queued in the same batch as the state update above, and React
    // processes the `state` hook's queue (declared earlier) before this one,
    // so the lengths read here are always post-mutation. Returning the same
    // object when nothing changed lets React bail out of a redundant
    // re-render when the wrapped update was a no-op (next === prev).
    setHistLen((h) => {
      const u = undoStackRef.current.length;
      const r = redoStackRef.current.length;
      return (h.u === u && h.r === r) ? h : { u, r };
    });
    // BD-3d Feature 2 — broadcast every user-initiated patch so the AI
    // chat bubble can detect "5+ rapid edits without saving" (rapid-edit
    // signal → proactive nudge). Fired once per wrapper call; a no-op update
    // can now also fire it, which is acceptable for a heuristic nudge signal.
    if (typeof window !== 'undefined') {
      try { window.dispatchEvent(new CustomEvent('quotequick:wizard-patch')); } catch { /* ignore */ }
    }
  }, []);

  const undo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const prev = stack.pop()!;
    // Snapshot the CURRENT committed state onto the redo stack, then replay
    // the popped snapshot. isReplayingRef guards setState() so this replay
    // isn't re-pushed onto the undo stack.
    const current = latestStateRef.current;
    redoStackRef.current.push(current);
    if (redoStackRef.current.length > HISTORY_LIMIT) redoStackRef.current.shift();
    isReplayingRef.current = true;
    setStateInner(prev);
    // Keep the ref on the freshest dispatched state (same invariant the
    // setState wrapper maintains) so a same-tick follow-up undo/redo/edit
    // never snapshots the pre-replay value.
    latestStateRef.current = prev;
    setHistLen({ u: undoStackRef.current.length, r: redoStackRef.current.length });
    queueMicrotask(() => {
      isReplayingRef.current = false;
    });
  }, []);

  const redo = useCallback(() => {
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const next = stack.pop()!;
    const current = latestStateRef.current;
    undoStackRef.current.push(current);
    if (undoStackRef.current.length > HISTORY_LIMIT) undoStackRef.current.shift();
    isReplayingRef.current = true;
    setStateInner(next);
    // Same invariant as in undo() above.
    latestStateRef.current = next;
    setHistLen({ u: undoStackRef.current.length, r: redoStackRef.current.length });
    queueMicrotask(() => {
      isReplayingRef.current = false;
    });
  }, []);

  const canUndo = histLen.u > 0;
  const canRedo = histLen.r > 0;

  // Bug A (2026-06-12) — Escape-to-close for the Help overlay now lives in
  // the shared <HelpModal> itself (capture-phase listener), so no local
  // keydown effect is needed here anymore.

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

  // Edit token from the URL — the ownership credential the Integrations panel
  // (Action tab) uses to read/save its outbound-webhook config. Empty in the
  // pre-save create flow; the panel shows a "save the calculator first" hint.
  const editToken = useMemo(() => {
    if (typeof window === 'undefined') return '';
    try {
      return new URLSearchParams(window.location.search).get('token') || '';
    } catch {
      return '';
    }
  }, []);

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

  // fix/wizardshell-resize-and-minimize (2026-06-12) — fullscreen-preview
  // state is owned by PreviewPane; we mirror it here (via onFullscreenChange)
  // so WizardShell can hide its own chrome — specifically the .qq-editor-resize
  // splitter, which otherwise floats over the fullscreen calculator (Issue 3).
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);

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
  /** "Generate with AI" Build-tab card → routes a prompt into the existing
   *  floating AIBubble (seed + auto-send). `nonce` bumps per Generate click so
   *  the bubble's seed effect re-fires even when the prompt text is unchanged. */
  const [aiSeed, setAiSeed] = useState<{ prompt: string; image?: string; nonce: number }>({ prompt: '', nonce: 0 });
  /** ?ai-upload=1 entry-point — when the wizard is opened via the /templates
   *  "Upload your quote" card, this nonce ticks so AIBubble opens + highlights
   *  the paperclip with a hint message. Mirrors the ?template= param pattern. */
  const [aiUploadNonce, setAiUploadNonce] = useState(0);
  const handleAIGenerate = useCallback((prompt: string, image?: string) => {
    const p = prompt.trim();
    if (!p) return;
    // `image` (optional data URL) is the Build-card reference screenshot — it
    // rides the same seed so the auto-sent turn fuses text + image server-side.
    setAiSeed((s) => ({ prompt: p, image: image || undefined, nonce: s.nonce + 1 }));
  }, []);
  const toggleFloatingLauncherPreview = useCallback(() => {
    setFloatingLauncherPreview((v) => {
      const next = !v;
      // Always start in collapsed (bubble) state on entering preview mode.
      if (next) setFloatingLauncherExpanded(false);
      return next;
    });
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
      window.removeEventListener('touchmove', onMove, { capture: false } as EventListenerOptions);
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
  //
  // DATA-LOSS FIX — `forceStructure`. The Build-tab template strip's
  // colour-forward cards read as "themes" to users; clicking one to restyle
  // used to overwrite every field/add-on the user had configured. Now, when
  // the calculator already has user-authored content (see
  // `hasUserAuthoredContent`), selecting a template applies ONLY its visual
  // style (+ activeTemplateId) and PRESERVES the user's fields, calculations,
  // header/results text and steps — so a theme switch never drops their work.
  // `forceStructure: true` opts back into the full structural replace; the
  // first-mount `?template=` URL flow passes it so landing on a marketing
  // template link still loads that template's fields into a blank wizard.
  const applyTemplate = useCallback((preset: TemplateConfig | null, accentOverride?: string, forceStructure?: boolean) => {
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
      // The website color tabs pass the chosen accent via `?accent=`; honour it
      // so the wizard opens with the same colour the visitor previewed.
      const nextStyle = {
        ...DEFAULT_SHELL_STYLE,
        ...(presetStyle as typeof s.style),
        ...(accentOverride ? { accent: accentOverride } : {}),
      };

      // Trade persistence (2026-06-12) — the Settings-tab trade selector was
      // removed; trade is now categorised via the template. When the calculator
      // has no trade set yet, seed `settings.tradeId` from the template's first
      // trade slug so the save path's `trade_type` stays non-'general' for
      // trade-bearing templates. Never overwrite an existing user choice.
      const nextSettings =
        (s.settings?.tradeId ?? '').trim() === '' && preset.trades?.[0]
          ? { ...(s.settings ?? {}), tradeId: preset.trades[0] }
          : s.settings;

      // DATA-LOSS FIX — when the user has already built on this calculator and
      // the caller hasn't explicitly opted into a full structural replace,
      // treat the template card as a THEME picker: apply only the visual style
      // (+ activeTemplateId) and keep every field / add-on / calculation /
      // header+results text / step exactly as the user left them.
      if (!forceStructure && hasUserAuthoredContent(s)) {
        return {
          ...s,
          activeTemplateId: preset.id,
          style: nextStyle,
          settings: nextSettings,
        };
      }

      return {
        ...s,
        activeTemplateId: preset.id,
        settings: nextSettings,
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
        // AI-gen quality (gap 4) — carry the template's niche default icon
        // into shell state so the preview + save path surface it as
        // `advanced.defaultIcon` (renderer falls back to it when no logo
        // is uploaded). Undefined when the template ships none — clears a
        // stale icon from a previously-applied template, same as
        // trustBadges above.
        defaultIcon: preset.defaultIcon,
        // BG-7 Item 4 — seed step content from the template's explicit
        // `steps[]`. Undefined when the template lets the renderer
        // auto-derive — owners must define steps before adding
        // descriptions (panel hides itself for the auto-derive case).
        steps: preset.steps ? preset.steps.map((s) => ({ ...s, fields: [...s.fields] })) : undefined,
      };
    });
  }, []);

  // ── W-TG-SELECT-FIX — interactive template pick (Build strip + Browse-all
  // modal). Picking a template means "load THIS calculator", so it must do a
  // full structural replace (forceStructure: true) — the old wiring called
  // `applyTemplate(t)` with no force, so when the user had any edits it fell
  // into the theme-only branch and the template's fields/pricing never loaded
  // (the bug Alex hit). We still protect real work: if the calculator has
  // genuine user-authored content we confirm BEFORE replacing; otherwise
  // (blank / default seed / metadata-only) we apply immediately.
  const [pendingTemplate, setPendingTemplate] = useState<TemplateConfig | null | undefined>(undefined);
  // Read the latest state inside the (stable) callback without re-creating it
  // on every keystroke — a ref mirrors `state` for the authored-content check.
  const stateRef = useRef(state);
  stateRef.current = state;
  const requestApplyTemplate = useCallback((preset: TemplateConfig | null) => {
    if (hasUserAuthoredContent(stateRef.current)) {
      // Defer to the confirm dialog — store the pending pick (null = blank).
      setPendingTemplate(preset);
      return;
    }
    // No real work to protect → apply with full structural replace now.
    applyTemplate(preset, undefined, true);
  }, [applyTemplate]);
  const confirmApplyTemplate = useCallback(() => {
    setPendingTemplate((pending) => {
      if (pending !== undefined) applyTemplate(pending, undefined, true);
      return undefined;
    });
  }, [applyTemplate]);
  const cancelApplyTemplate = useCallback(() => setPendingTemplate(undefined), []);

  // ── Wave I (f): in-preview remove / add ──────────────────────────────
  const removeField = useCallback((fieldId: string) => {
    setState((s) => ({ ...s, fields: s.fields.filter((f) => f.id !== fieldId) }));
  }, []);
  // Wave 61 — partial update for a single field by id. Drives the
  // floating <InlineStyleToolbar /> in PreviewPane: every toolbar click
  // (Bold / Italic / Colour / Font size / Alignment / …) flows through
  // here so the existing setFields-based undo stack picks up cosmetic
  // edits the same way left-pane edits do.
  const updateField = useCallback((fieldId: string, partial: Partial<TemplateField>) => {
    setState((s) => ({
      ...s,
      fields: s.fields.map((f) => (f.id === fieldId ? { ...f, ...partial } : f)),
    }));
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
  // The AI assistant explicitly intends to (re)build the calculator from the
  // chosen preset, so force the full structural replace here — the data-loss
  // guard is only for the Build strip's "looks like a theme" card clicks.
  const applyTemplatePreset = useCallback((presetId: string) => {
    const preset = getTemplatePreset(presetId);
    if (preset) applyTemplate(preset, undefined, true);
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
      // Optional accent from the website color tabs. Hex-validated before use
      // so an arbitrary query value can never be injected into a CSS variable.
      const rawAccent = (params.get('accent') || '').trim();
      const accentOverride = /^#[0-9a-fA-F]{3,8}$/.test(rawAccent) ? rawAccent : undefined;
      const preset = getTemplatePreset(requestedId);
      if (preset) {
        // First-mount marketing-link apply: force the full structural load so
        // landing on /wizard?template=<id> seeds that template's fields into
        // the blank wizard (the data-loss guard only protects interactive,
        // post-build theme switches — not this intentional initial seed).
        applyTemplate(preset, accentOverride, true);
      } else {
        console.warn(
          `[wizard] /wizard?template=${requestedId} — no template preset matches that id; keeping current state.`,
        );
      }
      // Strip the consumed params from the URL so a reload doesn't re-apply
      // (which would discard any edits the user made after landing).
      params.delete('template');
      params.delete('accent');
      const qs = params.toString();
      const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
      try { window.history.replaceState(null, '', nextUrl); } catch { /* ignore */ }
    } catch { /* no window — SSR no-op */ }
  }, [applyTemplate]);

  // ── ?ai-upload=1 — open the AI bubble with upload hint on mount ────────
  // Fired once after the ?template= handler (token guard mirrors that block).
  // Strips the param from the URL so a reload doesn't re-trigger it.
  const aiUploadAppliedRef = useRef(false);
  useEffect(() => {
    if (aiUploadAppliedRef.current) return;
    aiUploadAppliedRef.current = true;
    try {
      const params = new URLSearchParams(window.location.search);
      if (!params.get('ai-upload')) return;
      // Bump the nonce so AIBubble's openForUploadNonce effect fires once.
      setAiUploadNonce((n) => n + 1);
      params.delete('ai-upload');
      const qs = params.toString();
      const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
      try { window.history.replaceState(null, '', nextUrl); } catch { /* ignore */ }
    } catch { /* SSR no-op */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  // True once any dragOver reorder has been applied during the current drag,
  // so the same-id drop path can know the live preview actually moved (and a
  // pre-drag snapshot is worth recording) without reading mid-flight state.
  const dragMovedRef = useRef(false);

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
    dragMovedRef.current = false;
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
    setStateInner((s) => {
      const moved = applyReorder(s, pending.activeId, pending.overId);
      if (moved !== s) dragMovedRef.current = true;
      return moved;
    });
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
      // The live preview already reflects any dragOver moves (kept as-is).
      // Record the pre-drag snapshot onto the undo stack ONLY if the drag
      // actually reordered something (dragMovedRef), so a pure click-drag
      // that snapped back to the same target doesn't create a no-op undo
      // entry. The push + counter update run here, outside any updater.
      if (snapshot && dragMovedRef.current) {
        const stack = undoStackRef.current;
        stack.push(snapshot);
        if (stack.length > HISTORY_LIMIT) stack.shift();
        redoStackRef.current = [];
        setHistLen({ u: stack.length, r: 0 });
        // Discrete action — force the next text edit to start a fresh undo
        // entry instead of coalescing into this drag.
        lastPushTsRef.current = 0;
      }
      return;
    }

    // ── (a) Reorder Fields — commit the FINAL order into the undo stack.
    // applyReorder is pure, so the final state is deterministic from the
    // pre-drag snapshot + the active→over move; compute it here (outside any
    // updater), push the snapshot + bump the counter synchronously, then apply
    // the final order via setStateInner. This keeps the intermediate dragOver
    // states out of the undo stack while recording exactly one entry.
    const next = snapshot
      ? applyReorder(snapshot, activeId, overId)
      : null;
    if (snapshot && next && snapshot !== next) {
      const stack = undoStackRef.current;
      stack.push(snapshot);
      if (stack.length > HISTORY_LIMIT) stack.shift();
      redoStackRef.current = [];
      setHistLen({ u: stack.length, r: 0 });
      // Discrete action — force the next text edit to start a fresh undo entry.
      lastPushTsRef.current = 0;
      setStateInner(next);
      // Mirror setState()'s broadcast so the AIBubble rapid-edit
      // counter still ticks for drag-driven reorders.
      if (typeof window !== 'undefined') {
        try { window.dispatchEvent(new CustomEvent('quotequick:wizard-patch')); } catch { /* ignore */ }
      }
    } else {
      // No snapshot or no net change — still ensure the live preview reflects
      // the final over-target (matches the prior setStateInner(applyReorder)).
      setStateInner((current) => applyReorder(current, activeId, overId));
    }
  }, [addField, applyReorder, flushDragOver]);

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const settings = state.settings ?? {};
      const leadEmail = (settings.leadEmail ?? '').trim();
      const leadEmailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadEmail);
      const tradeId = (settings.tradeId ?? '').trim();

      // P0 data-loss fix (fix/wizard-persistence) — Fix 2: BLOCK the save if any
      // calc formula is invalid or references an unknown field/calc. A broken
      // formula otherwise saves silently and renders as $0 at quote time. A
      // valid (or empty) calculator is never blocked.
      const badFormula = firstInvalidFormula(
        state.calculations ?? [],
        state.fields ?? [],
      );
      if (badFormula) {
        const msg = `"${badFormula.calcName}" ${badFormula.error}`;
        throw new FormulaValidationError(msg);
      }

      // P0 data-loss fix (fix/wizard-persistence) — persist the FULL authored
      // config, not just numberFormat/results/spamProtection. The SAME shared
      // buildAdvancedConfig() helper the live preview uses assembles the
      // complete `advanced` shape: fields, calculations, result_calc (resolved
      // rename-safe from resultCalcId), style, tiered, trustBadges, steps,
      // header, results, numberFormat, businessProfile, spamProtection. Without
      // this, a published widget lost the owner's custom fields/calcs/style.
      // `forSave: true` strips the synthetic `__preview` marker.
      const advanced = buildAdvancedConfig({
        layout: state.layout,
        businessName: state.businessName,
        fields: state.fields,
        calculations: state.calculations,
        header: state.header,
        results: state.results,
        resultCalcId: state.resultCalcId,
        style: state.style,
        settings,
        stepLayout: state.stepLayout,
        tiered: state.tiered,
        trustBadges: state.trustBadges,
        defaultIcon: state.defaultIcon,
        steps: state.steps,
        category: state.activeTemplateId
          ? getTemplatePreset(state.activeTemplateId)?.category
          : undefined,
        forSave: true,
      });

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
    onError: (err) => {
      // Fix 2 — surface a clear, specific error. Formula-validation failures
      // name the offending calc + reason so the owner can fix it; any other
      // save failure gets a generic message. Either way the broken config was
      // NOT persisted (the throw happened before the POST).
      if (err instanceof FormulaValidationError) {
        toast({
          variant: 'destructive',
          title: "Can't save — formula error",
          description: err.message,
        });
        return;
      }
      // fix/wizard-save-anon — defense in depth. The autosave/publish paths are
      // now gated so an anonymous / no-business-name save never POSTs, but if a
      // 400/401 from those specific conditions ever reaches here, do NOT show
      // the scary destructive "try again" toast: the draft is already safe in
      // localStorage and the user just needs to sign up / add a name. apiRequest
      // throws Error("<status>: <body>"); match the auth/validation statuses.
      const msg = err instanceof Error ? err.message : String(err);
      if (/^(400|401|403):/.test(msg)) {
        return;
      }
      // Genuine save errors for authenticated users with a real business name
      // (5xx, network, unexpected) still report normally.
      toast({
        variant: 'destructive',
        title: "Couldn't save your calculator",
        description: 'Something went wrong saving. Please try again.',
      });
    },
  });

  // fix/wizard-save-anon — a remote save (POST /api/calculators) can only
  // succeed when the user is signed in AND has entered a business name (server
  // requires both). The full draft is ALWAYS persisted to localStorage
  // independently, so when we can't save remotely we simply skip the POST
  // instead of letting it 400 with a destructive toast.
  const canSaveRemotely = useCallback(
    () => isAuthenticated && !!state.businessName.trim(),
    [isAuthenticated, state.businessName],
  );

  // Background autosave (inline-title commit, mobile sheet save, etc.) — fire
  // the remote save only when it can actually succeed; otherwise the work is
  // already safe in localStorage and we stay silent (no toast, no 400).
  const autosaveDraft = useCallback(() => {
    if (!canSaveRemotely()) return;
    saveDraftMutation.mutate();
  }, [canSaveRemotely, saveDraftMutation]);

  // Publish — when anonymous, don't POST (it would 400). Instead route to the
  // sign-up flow with a friendly nudge; the localStorage draft is untouched so
  // the user returns to exactly what they built. When signed in but missing a
  // business name, prompt for that inline rather than firing a doomed save.
  const handlePublish = useCallback(() => {
    if (!isAuthenticated) {
      toast({
        title: 'Create a free account to save & publish',
        description:
          'Your calculator is saved on this device — sign up to publish it and get your embed code.',
      });
      navigate('/signup');
      return;
    }
    if (!state.businessName.trim()) {
      toast({
        title: 'Add a business name first',
        description: 'Your calculator needs a business name before it can be published.',
      });
      setActiveTab('build');
      return;
    }
    saveDraftMutation.mutate();
    setPublishOpen(true);
  }, [isAuthenticated, state.businessName, saveDraftMutation, navigate]);

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

  // Elfsight-mobile rebuild (2026-06-05) — the mobile panel sheet is now an
  // explicit open/closed overlay over the full-screen preview (NOT the old
  // 3-snap collapsible). Default = closed (full preview). Tapping a bottom-bar
  // panel tab opens that tab's sheet; tapping the ACTIVE tab again, the close
  // chevron, or the backdrop closes it back to the preview.
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const closeMobileSheet = useCallback(() => setMobileSheetOpen(false), []);
  const onMobileSelectTab = useCallback((tab: EditorTab) => {
    setActiveTab((prev) => {
      // Tap the already-active tab while its sheet is open → toggle closed.
      if (prev === tab) {
        setMobileSheetOpen((wasOpen) => !wasOpen);
        return prev;
      }
      setMobileSheetOpen(true);
      return tab;
    });
  }, []);
  // If the viewport leaves the mobile breakpoint, drop the sheet-open flag so
  // returning to mobile starts from the clean full-preview default.
  useEffect(() => {
    if (!isMobile) setMobileSheetOpen(false);
  }, [isMobile]);

  // First-run discoverability (fix/wizard-mobile-firstrun) — on a real phone a
  // brand-new user lands on the full-screen preview + bottom tab bar with NO
  // obvious "start editing" affordance (the Build sheet is closed by default).
  // Auto-open the Build sheet ONCE on the first mobile mount of a fresh session
  // so the editor is immediately discoverable. It opens to its default resting
  // height (DEFAULT_HEIGHT_FRAC ≈ 42% of the work area — a peeked, draggable
  // state, NOT full-screen), and the preview stays visible above it.
  //
  // Once-only guards so we never fight the user:
  //   - `firstRunOpenedRef` — fires at most once per component lifetime.
  //   - sessionStorage flag — survives re-mounts within the tab/session, so if
  //     the user closes the sheet it does NOT spring back open. A fresh session
  //     (new tab / reload after close) shows it again.
  // Desktop is untouched (guarded by isMobile); the default `activeTab` is
  // already 'build', so the Build tab is what opens.
  const firstRunOpenedRef = useRef(false);
  useEffect(() => {
    if (!isMobile || firstRunOpenedRef.current) return;
    firstRunOpenedRef.current = true;
    try {
      if (typeof window !== 'undefined'
        && window.sessionStorage.getItem('qq_wizard_sheet_autoopened') === '1') {
        return; // already auto-opened (and possibly dismissed) this session
      }
      window.sessionStorage.setItem('qq_wizard_sheet_autoopened', '1');
    } catch {
      // sessionStorage may throw in private mode / sandboxed iframes — still
      // open once for this mount (the ref guard prevents a re-open loop).
    }
    setMobileSheetOpen(true);
  }, [isMobile]);

  // ── Click-to-edit (2026-06-06) — tapping a spot on the live preview jumps
  // the editor to the control that edits it. PreviewPane fires
  // `onPreviewSpotEdit(tab, targetKey)`; we switch to `tab`, then scroll-to +
  // pulse the matching editor control. On mobile we also pulse the tab in the
  // bottom bar and defer the in-sheet highlight until the sheet opens.
  //
  // `targetKey` → DOM resolver. Most keys map to a `[data-edit-key]` anchor on
  // the panels (added minimally to the section wrappers); fields use the
  // existing `[data-testid="field-row-<id>"]` rows. Returns the first match in
  // the live editor DOM (desktop left pane OR mobile sheet — both share these
  // attributes since the same panel components render in each).
  const resolveEditTarget = useCallback((targetKey: string): HTMLElement | null => {
    if (typeof document === 'undefined') return null;
    if (targetKey.startsWith('field:')) {
      const id = targetKey.slice('field:'.length);
      return document.querySelector<HTMLElement>(`[data-testid="field-row-${CSS.escape(id)}"]`);
    }
    return document.querySelector<HTMLElement>(`[data-edit-key="${CSS.escape(targetKey)}"]`);
  }, []);

  // Transient highlight timer so re-firing clears the previous pulse cleanly.
  const editHighlightTimerRef = useRef<number | null>(null);
  // Scroll a resolved control into view + restart the transient pulse.
  const highlightNode = useCallback((node: HTMLElement) => {
    node.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    node.classList.remove('qq-edit-highlight');
    // Force reflow so removing + re-adding restarts the keyframes.
    void node.offsetWidth;
    node.classList.add('qq-edit-highlight');
    if (editHighlightTimerRef.current != null) {
      window.clearTimeout(editHighlightTimerRef.current);
    }
    editHighlightTimerRef.current = window.setTimeout(() => {
      node.classList.remove('qq-edit-highlight');
      editHighlightTimerRef.current = null;
    }, 1500);
  }, [reduceMotion]);
  const applyEditHighlight = useCallback((targetKey: string) => {
    // Some edit anchors live inside an AdvancedSection that UNMOUNTS its
    // children when collapsed (header/results under "Titles & result text";
    // trust-badges/tiered under Style "Advanced settings"). When the section
    // is closed the anchor isn't in the DOM, so resolveEditTarget returns null.
    // Map those keys → their owning section id so we can expand-then-retry.
    const SECTION_FOR_KEY: Record<string, string> = {
      header: 'build-titles',
      results: 'build-titles',
      'trust-badges': 'style-advanced',
      tiered: 'style-advanced',
    };
    // Defer one frame so the freshly-switched tab's panel has mounted.
    requestAnimationFrame(() => {
      const el = resolveEditTarget(targetKey);
      if (!el) {
        // Anchor may be hidden inside a collapsed (child-unmounting) section —
        // open it via its toggle, then retry on the next frame.
        const sectionId = SECTION_FOR_KEY[targetKey];
        const section = sectionId
          ? document.querySelector<HTMLElement>(`[data-testid="advanced-section-${sectionId}"]`)
          : null;
        if (section && section.getAttribute('data-open') === 'false') {
          section.querySelector<HTMLButtonElement>(`[data-testid="advanced-toggle-${sectionId}"]`)?.click();
          requestAnimationFrame(() => {
            const node = resolveEditTarget(targetKey);
            if (node) highlightNode(node);
          });
        }
        return;
      }
      // If the target sits inside a collapsed AdvancedSection (mounted but
      // closed), expand it first so the control is actually visible.
      const collapsed = el.closest<HTMLElement>('[data-testid^="advanced-section-"][data-open="false"]');
      if (collapsed) {
        const toggle = collapsed.querySelector<HTMLButtonElement>('[data-testid^="advanced-toggle-"]');
        toggle?.click();
      }
      // Scroll-to + pulse on the next frame (after any expand reflow).
      requestAnimationFrame(() => {
        highlightNode(resolveEditTarget(targetKey) ?? el);
      });
    });
  }, [resolveEditTarget, highlightNode]);

  // Mobile: which bottom-bar tab to pulse, and the highlight to apply once
  // that tab's sheet is opened by the user. `pulseTab` is cleared after the
  // hint animation (BottomTabBar also self-clears on a timer / open).
  const [pulseTab, setPulseTab] = useState<EditorTab | null>(null);
  const pendingMobileHighlightRef = useRef<string | null>(null);
  const clearPulseTimerRef = useRef<number | null>(null);

  const onPreviewSpotEdit = useCallback((tab: EditorTab, targetKey: string) => {
    setActiveTab(tab);
    if (isMobile) {
      // feat/mobile-wizard-gestures (F3) — tapping a field in the preview now
      // JUMPS the editor straight to that field: stash the highlight, switch
      // to the target's tab (setActiveTab above), and OPEN the sheet. The
      // deferred effect below (keyed on mobileSheetOpen + activeTab) runs
      // applyEditHighlight as soon as the sheet is open — auto-expanding the
      // owning collapsed section, scrolling the control into view, and pulsing
      // it. We still pulse the bottom tab as a secondary hint cue.
      pendingMobileHighlightRef.current = targetKey;
      setPulseTab(tab);
      setMobileSheetOpen(true);
      if (clearPulseTimerRef.current != null) window.clearTimeout(clearPulseTimerRef.current);
      clearPulseTimerRef.current = window.setTimeout(() => {
        setPulseTab(null);
        clearPulseTimerRef.current = null;
      }, 2400);
    } else {
      // Desktop — the panel is visible; switch tab then scroll-to + pulse.
      applyEditHighlight(targetKey);
    }
  }, [isMobile, applyEditHighlight]);

  // Mobile — when the sheet opens (for the pulsed tab), run the deferred
  // highlight on the control inside the sheet, then clear the pending state.
  useEffect(() => {
    if (!isMobile || !mobileSheetOpen) return;
    const key = pendingMobileHighlightRef.current;
    if (!key) return;
    pendingMobileHighlightRef.current = null;
    setPulseTab(null);
    applyEditHighlight(key);
  }, [isMobile, mobileSheetOpen, activeTab, applyEditHighlight]);

  // Cleanup transient timers on unmount.
  useEffect(() => () => {
    if (editHighlightTimerRef.current != null) window.clearTimeout(editHighlightTimerRef.current);
    if (clearPulseTimerRef.current != null) window.clearTimeout(clearPulseTimerRef.current);
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
        // Same-tab SPA navigation fires no storage/focus event, so the App-root
        // MinimizedWizardBadge won't re-read the stash on its own — notify it directly.
        window.dispatchEvent(new Event('qq-wizard-minimized-change'));
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
      {/* feat/wizard-section-sync — persists the menu-side outline for generic
          structural `spot` selections (CTA / trust / tier / stepper / business)
          from the shared selection. Renders nothing. */}
      <MenuSpotSelectionSync
        reduceMotion={reduceMotion}
        mobileSheetOpen={mobileSheetOpen}
        activeTab={activeTab}
      />
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
              /* Elfsight-mobile rebuild (2026-06-05) — on phones the top bar
                 renders a clean ✕ · name · autosave · Publish chrome. Publish
                 maps to the existing save-draft commit; name to the editable
                 business name + autosave indicator. Desktop is unchanged. */
              mobile={isMobile}
              businessName={state.businessName}
              onBusinessNameChange={setBusinessName}
              onPublish={handlePublish}
              isPublishing={saveDraftMutation.isPending}
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
              {/* Phase 0b (2026-06-05) — Elfsight-style left ICON RAIL.
                  The section nav (Build · Action · Style · Settings) moved
                  out of the top chrome into this vertical rail, the first
                  column of the desktop editor frame. A Help item is pinned to
                  the bottom, wired to the SAME help overlay the top-bar / mobile
                  Help buttons use (setShowHelp(true)). The rail is hidden under
                  the mobile breakpoint (the bottom sheet stays the mobile nav).
                  Testids preserved: the tablist carries data-testid="editor-tabs"
                  and each button data-testid="editor-tab-${id}" so existing
                  checks/Playwright still pass. The same activeTab state +
                  setActiveTab handler the top strip used drive the panel.
                  Gated to desktop only (!isMobile) so its tab buttons do NOT
                  duplicate the BottomTabBar's testids in the mobile DOM. */}
              {!isMobile && (
              <nav
                className="qq-editor-rail"
                role="tablist"
                aria-label="Editor sections"
                aria-orientation="vertical"
                data-testid="editor-tabs"
              >
                <div className="qq-editor-rail-tabs">
                  {EDITOR_TABS.map(({ id, label }) => {
                    const isActive = id === activeTab;
                    const RailIcon =
                      id === 'build' ? SlidersHorizontal
                      : id === 'action' ? MousePointerClick
                      : id === 'style' ? Palette
                      : SettingsIcon; // settings
                    return (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        data-testid={`editor-tab-${id}`}
                        className={`qq-editor-rail-item${isActive ? ' is-active' : ''}`}
                        onClick={() => setActiveTab(id)}
                        title={label}
                      >
                        <RailIcon
                          className="qq-editor-rail-icon"
                          style={{ width: 20, height: 20 }}
                          aria-hidden="true"
                        />
                        <span className="qq-editor-rail-label">{label}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="qq-editor-rail-item qq-editor-rail-help"
                  data-testid="editor-rail-help"
                  onClick={() => setShowHelp(true)}
                  aria-label="Help"
                  title="Help"
                >
                  <HelpCircle
                    className="qq-editor-rail-icon"
                    style={{ width: 20, height: 20 }}
                    aria-hidden="true"
                  />
                  <span className="qq-editor-rail-label">Help</span>
                </button>
              </nav>
              )}
              {/* fix/wizardshell-resize-and-minimize (2026-06-12) — the resize
                  splitter used to live INSIDE .qq-editor-left, which is the
                  scrolling container (overflow-y:auto). An absolutely-positioned
                  top:0/bottom:0 child of a scroller is sized against the CONTENT
                  box, so the splitter only spanned the first viewport-height and
                  scrolled away — Alex saw "only the top". We now wrap the pane in
                  a NON-scrolling, position:relative column (.qq-editor-left-col)
                  that owns the layout box (width / flex / order / mobile hide),
                  and mount the splitter as a sibling of the scroll area so its
                  top:0/bottom:0 resolve against this stable box → full height at
                  any scroll position. */}
              <div
                className="qq-editor-left-col"
                data-testid="editor-left-col"
                style={{ width: paneWidth }}
                aria-hidden={isMobile || undefined}
              >
              <div
                className="qq-editor-left"
                data-testid="editor-left-panel"
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
                      onApplyTemplate={requestApplyTemplate}
                      /* BG-7 Item 4 — per-step rich-text descriptions.
                         The StepContentPanel renders only when the active
                         template ships explicit `steps[]`. */
                      steps={state.steps}
                      onStepsChange={setSteps}
                      onGenerateWithAI={handleAIGenerate}
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
                  ) : activeTab === 'action' ? (
                    <ActionTab
                      settings={state.settings ?? {}}
                      onChange={setSettings}
                      style={state.style ?? { ...DEFAULT_SHELL_STYLE }}
                      onStyleChange={setStyle}
                      planTier={planTier}
                      editToken={editToken}
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
                        /* fix/wizard-save-anon — anonymous users can type a
                           business name and click Save, which previously 400'd
                           (server requires a signed-in owner). Route them to
                           the friendly sign-up nudge instead; the draft is
                           already safe in localStorage. Authed users save as
                           normal. */
                        onClick={() => {
                          if (canSaveRemotely()) { saveDraftMutation.mutate(); return; }
                          toast({
                            title: 'Create a free account to save',
                            description:
                              'Your calculator is saved on this device — sign up to save it to your account.',
                          });
                          navigate('/signup');
                        }}
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
              </div>
              {/* Resize handle (d). Hidden on mobile via CSS. Now a sibling of
                  .qq-editor-left (the scroll area) inside the non-scrolling
                  .qq-editor-left-col wrapper, so top:0/bottom:0 span the full
                  pane height regardless of scroll position (Issue 4). Hidden
                  entirely while the preview is in fullscreen mode so the blue
                  splitter never floats over the fullscreen calculator (Issue 3
                  — fullscreen state is lifted from PreviewPane via
                  onFullscreenChange below). */}
              {!isPreviewFullscreen && (
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
              )}
              </div>

              <div
                className="qq-editor-right"
                data-testid="editor-right-pane"
                aria-hidden={previewCollapsed || undefined}
              >
                <PreviewPane
                  businessName={state.businessName}
                  onBusinessNameChange={setBusinessName}
                  /* fix/tmpl-editor-mobile (B) — pencil-driven inline edit of
                     the preview HEADER TITLE commits to state.header.title via
                     setHeader, keeping the BuildTab header field in sync. */
                  onHeaderTitleChange={(v) => setHeader({ ...(state.header ?? {}), title: v })}
                  /* feat/inline-edit-all-sections (2026-06-08) — inline edits of
                     the SUBTITLE and the result HEADING / FOOTNOTE in the preview
                     commit to the same state fields the BuildTab header/result
                     editors bind to, keeping the two panes in sync. */
                  onHeaderSubtitleChange={(v) => setHeader({ ...(state.header ?? {}), subtitle: v })}
                  onResultsTextChange={(which, v) => setResults({ ...(state.results ?? {}), [which]: v })}
                  /* BUG-3 fix (fix/inline-title-edit): persist the draft when an
                     inline title edit is committed (debounced inside PreviewPane)
                     so a title typed on the mockup survives navigation without a
                     separate "Save draft" click. Reuses the existing mutation. */
                  onCommitTitle={() => autosaveDraft()}
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
                  /* AI-gen quality (gap 4) — niche default icon; renders in
                     the preview header when no logo is uploaded. */
                  defaultIcon={state.defaultIcon}
                  /* BG-7 Item 4 — owner-edited step descriptions. */
                  steps={state.steps}
                  category={
                    state.activeTemplateId
                      ? getTemplatePreset(state.activeTemplateId)?.category
                      : undefined
                  }
                  onRemoveField={removeField}
                  onAddField={addField}
                  /* Click-to-edit (2026-06-06) — tapping a preview spot jumps
                     the editor to the control that edits it. */
                  onPreviewSpotEdit={onPreviewSpotEdit}
                  /* Wave 61 — wires the floating <InlineStyleToolbar /> to
                     the existing setFields-based undo stack. */
                  onUpdateField={updateField}
                  /* Wave P — when the Install tab is active, render the
                   * widget inside the user's chosen hosted-page chrome so
                   * the preview matches what visitors at {slug}.your-quote
                   * .net actually see. */
                  hostedFrame={publishOpen}
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
                  /* fix/wizardshell-resize-and-minimize (2026-06-12) — lift the
                     fullscreen-preview flag up so WizardShell can hide its resize
                     splitter while the calculator is fullscreen (Issue 3). */
                  onFullscreenChange={setIsPreviewFullscreen}
                />
              </div>
            </div>

            {/* 2026-05-22 (revert of PR #535) — the EditorBottomBar that
                 hosted the wizard tab strip was deleted; tabs are back in
                 the top chrome. The mobile bottom sheet (BH-3) below is for
                 property panels, not tabs, and remains. */}

            {/* ── Elfsight-mobile rebuild (2026-06-05) — panel sheet (≤768px).
                 Default mobile state = full preview with NO sheet open. Tapping
                 a panel tab in the persistent dark BottomTabBar opens THAT tab's
                 body (BuildTab / StyleTab / SettingsTab / InstallTab) as a bottom
                 sheet over the preview; a close chevron / backdrop / re-tapping
                 the active tab dismisses it. Save lives in the sheet footer. */}
            {isMobile && (
              <MobileBottomSheet
                open={mobileSheetOpen}
                onClose={closeMobileSheet}
                activeTab={activeTab}
                onTabChange={(tab) => { setActiveTab(tab); setMobileSheetOpen(true); }}
                onResetTab={resetActiveTab}
                /* fix/wizard-save-anon — explicit mobile Save: when it can't
                   save remotely (anonymous or no business name) the draft is
                   already safe in localStorage, so show a friendly nudge to
                   create an account instead of firing a doomed 400. */
                onSave={() => {
                  if (canSaveRemotely()) { saveDraftMutation.mutate(); return; }
                  if (!isAuthenticated) {
                    toast({
                      title: 'Create a free account to save',
                      description:
                        'Your calculator is saved on this device — sign up to save it to your account.',
                    });
                    navigate('/signup');
                  } else {
                    toast({
                      title: 'Add a business name first',
                      description: 'Your calculator needs a business name before it can be saved.',
                    });
                    setActiveTab('build');
                  }
                }}
                onHelp={() => setShowHelp(true)}
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
                    onApplyTemplate={requestApplyTemplate}
                    steps={state.steps}
                    onStepsChange={setSteps}
                    onGenerateWithAI={handleAIGenerate}
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
                ) : activeTab === 'action' ? (
                  <ActionTab
                    settings={state.settings ?? {}}
                    onChange={setSettings}
                    style={state.style ?? { ...DEFAULT_SHELL_STYLE }}
                    onStyleChange={setStyle}
                    planTier={planTier}
                    editToken={editToken}
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

            {/* ── Elfsight-mobile rebuild (2026-06-05) — persistent dark 5-tab
                 bottom bar. REPLACES the old W-AO-1 collapsible action bar
                 (Save/Reset/theme/preview/close pill). Save now lives in the
                 panel-sheet footer + autosave; theme/preview/device live in
                 state (the desktop top bar + keyboard shortcuts still drive
                 them). The 5 items map to the four EDITOR_TABS + Help; tapping
                 a panel tab opens its sheet over the preview. Mobile-only
                 (hidden ≥768px via the component's own CSS), and only rendered
                 when isMobile so desktop is wholly unaffected. */}
            {isMobile && (
              <BottomTabBar
                activeTab={activeTab}
                sheetOpen={mobileSheetOpen}
                onSelectTab={onMobileSelectTab}
                onHelp={() => setShowHelp(true)}
                /* Click-to-edit — pulse this tab to hint the tapped preview
                   spot is editable here; cleared when its sheet opens. */
                pulseTab={pulseTab}
              />
            )}

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
              /* AI-gen quality (gap 1) — lets the replace_template applier
                 honour the optional `business_name` param. */
              setBusinessName={setBusinessName}
              applyTemplatePreset={applyTemplatePreset}
              /* AI "build / replace my calculator" is an explicit structural
                 action — force the full replace past the theme-switch guard. */
              replaceTemplate={(cfg) => applyTemplate(cfg, undefined, true)}
              seedPrompt={aiSeed.prompt}
              seedImage={aiSeed.image}
              seedNonce={aiSeed.nonce}
              openForUploadNonce={aiUploadNonce}
            />

            {/* 2026-06-12 — shared Help modal (HelpModal.tsx). Replaces the
                 inline mailto: card duplicated here and in EditorTopBar. The
                 modal portals itself to <body>, owns Escape/backdrop
                 dismissal, and offers two in-app actions: open the builder
                 chat (AIBubble launcher) or message support without leaving
                 the editor. */}
            {showHelp && (
              <HelpModal editorTheme={editorTheme} onClose={() => setShowHelp(false)} />
            )}

            {/* Publish flow (Elfsight-parity) — embed/hosted-link/install folded
                here from the old Install tab. Opens on Publish. */}
            {publishOpen && typeof document !== 'undefined' && createPortal(
              <div
                className="qq-editor-help"
                role="dialog"
                aria-label="Publish your calculator"
                data-theme={editorTheme}
                onClick={() => setPublishOpen(false)}
                data-testid="editor-publish-overlay"
              >
                <div
                  className="qq-editor-help-card"
                  onClick={(e) => e.stopPropagation()}
                  style={{ maxWidth: 560, width: '92%', maxHeight: '86vh', overflowY: 'auto' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <p style={{ fontSize: 15, fontWeight: 700, margin: 0, color: p.colors.heading }}>
                      Publish your calculator
                    </p>
                    <button
                      type="button"
                      onClick={() => setPublishOpen(false)}
                      aria-label="Close publish"
                      data-testid="editor-publish-close"
                      className="qq-editor-btn"
                      style={{ padding: '5px 12px' }}
                    >
                      Done
                    </button>
                  </div>
                  <InstallTab
                    settings={state.settings ?? {}}
                    onChange={setSettings}
                    businessName={state.businessName}
                    logoUrl={state.logo}
                    style={state.style ?? { ...DEFAULT_SHELL_STYLE }}
                  />
                </div>
              </div>,
              document.body,
            )}

            {/* W-TG-SELECT-FIX — confirm before replacing genuine work with a
                picked template. Only shown when hasUserAuthoredContent() is
                true at pick time; a blank/seed calculator applies directly.
                Reuses the wizard's native .qq-editor-help overlay + card so it
                inherits the theme + z-order (no admin-UI Radix dialog, which
                this embed never imports). */}
            {pendingTemplate !== undefined && typeof document !== 'undefined' && createPortal(
              <div
                className="qq-editor-help"
                role="dialog"
                aria-modal="true"
                aria-label="Replace calculator with template"
                data-theme={editorTheme}
                onClick={cancelApplyTemplate}
                data-testid="template-replace-confirm-overlay"
              >
                <div
                  className="qq-editor-help-card"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px', color: p.colors.heading }}>
                    {pendingTemplate === null
                      ? 'Start from a blank calculator?'
                      : 'Replace your current calculator?'}
                  </p>
                  <p style={{ fontSize: 13, lineHeight: 1.45, margin: '0 0 16px', color: p.colors.muted }}>
                    {pendingTemplate === null
                      ? 'Your current fields and pricing will be cleared so you can start fresh. This can’t be undone from here.'
                      : 'Your current fields and pricing will be replaced with this template’s setup. Everything stays editable afterwards.'}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button
                      type="button"
                      className="qq-editor-btn qq-editor-btn--ghost"
                      onClick={cancelApplyTemplate}
                      data-testid="template-replace-cancel"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="qq-editor-btn"
                      onClick={confirmApplyTemplate}
                      data-testid="template-replace-confirm"
                    >
                      {pendingTemplate === null ? 'Start blank' : 'Replace'}
                    </button>
                  </div>
                </div>
              </div>,
              document.body,
            )}
          </div>

          <style>{`
            /* ── Click-to-edit (2026-06-06) — transient highlight ─────
             *
             * When the user taps a spot on the live preview, WizardShell
             * switches to the editing tab and adds .qq-edit-highlight to
             * the responsible control (a field row, the header section, the
             * pricing/result section, the CTA panel, …) for ~1.5s. The pulse
             * is a soft accent outline that breathes once — Apple-like, never
             * jarring — and auto-removes. Uses the AE brand-accent token (no
             * bare colour literal). Reduced-motion users get the steady
             * outline without the pulse keyframe. */
            .qq-edit-highlight {
              outline: 2px solid ${AE.color.accent};
              outline-offset: 2px;
              border-radius: 10px;
              animation: qq-edit-pulse 1.2s ease-out;
              scroll-margin: 24px;
            }
            @keyframes qq-edit-pulse {
              0%   { box-shadow: 0 0 0 0 ${AE.color.accentTint};   outline-color: ${AE.color.accent}; }
              45%  { box-shadow: 0 0 0 6px ${AE.color.accentTint}; }
              100% { box-shadow: 0 0 0 0 transparent;             outline-color: ${AE.color.accent}; }
            }
            @media (prefers-reduced-motion: reduce) {
              .qq-edit-highlight { animation: none; }
            }

            /* ── feat/wizard-section-sync (2026-06-07) — PERSISTENT menu-side
             * selection outline for structural spot anchors (CTA / trust /
             * tier / stepper / business). Unlike the 1.5s qq-edit-highlight
             * pulse above, this outline stays until another item is selected,
             * mirroring the persistent qq-selected outline on the preview
             * side. Selected = a steady 2px brand-accent OUTLINE (never a bright
             * fill), honouring the user accent var with the AE token fallback —
             * no bare colour literal. Reduced-motion users simply get the steady
             * outline with no transition. */
            .qq-edit-selected {
              outline: 2px solid var(--qq-accent, ${AE.color.accent});
              outline-offset: 2px;
              border-radius: 10px;
              scroll-margin: 24px;
              transition: outline-color 120ms ease;
            }
            @media (prefers-reduced-motion: reduce) {
              .qq-edit-selected { transition: none; }
            }

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
              /* Apple-clean (Phase 0) — SF-style system type + near-black text
                 across the editor chrome. Dark-theme overrides still apply via
                 the [data-theme="dark"] rules below / index.css. */
              font-family: ${AE.font.family};
              color: ${AE.color.text};
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
              /* No rest-state transform: an identity transform (or
               * will-change: transform) still establishes a containing block,
               * which made position:fixed descendants (the mobile bottom sheet,
               * the floating toolbar) anchor to THIS frame instead of the
               * viewport — pushing the bottom-sheet pill off-screen until you
               * scrolled. Animating to none still tweens the entrance. */
              transform: none;
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
              background: ${AE.color.bg};
              border-radius: ${AE.radius.lg};
              box-shadow: ${AE.shadow.pop};
              /* P0 sticky fix — use clip (not hidden) so sticky descendants
               * in the preview widget bind to the preview pane's scroll
               * context. See memory/project_overflow_clip_for_sticky.md */
              overflow: clip;
              min-height: calc(100vh - ${d.layout.shellPad} - ${d.layout.shellPad});
              transition: opacity 200ms ease-out, transform 200ms ease-out;
              /* will-change: transform is intentionally OMITTED — it alone
               * establishes a fixed-positioning containing block (see the
               * .is-open note above). opacity-only is safe. */
              will-change: opacity;
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
            /* Apple-clean (Phase 0) — white bar, single hairline bottom
               border, no heavy shadow, ~56px tall. */
            .qq-editor-topbar {
              display: flex; align-items: center;
              gap: 10px;
              padding: 10px 16px; flex-shrink: 0;
              min-height: 56px;
              background: ${AE.color.bg};
              border-bottom: 1px solid ${AE.color.hairline};
              font-family: ${AE.font.family};
              position: sticky;
              top: 0;
              z-index: 6;
            }
            .qq-editor-brand {
              display: inline-flex; align-items: center; gap: 6px;
              text-decoration: none;
              font-size: 15px; font-weight: 600; color: ${AE.color.text};
              letter-spacing: -0.01em;
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
              font-size: 12px; font-weight: 500; color: ${AE.color.secondary};
              padding: 3px 4px; border-radius: ${AE.radius.pill};
              transition: opacity 0.3s ease; flex-shrink: 0;
            }
            .qq-editor-spacer { flex: 1; min-width: 4px; }
            /* BH-2 — hairline vertical divider between functional groups.
               1px wide, ~22px tall, centred. Hidden when adjacent groups
               collapse on narrow widths. */
            .qq-editor-divider {
              flex-shrink: 0;
              width: 1px; height: 22px;
              background: ${AE.color.hairline};
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
              border-radius: ${AE.radius.md}; background: ${AE.color.surface};
              border: 1px solid ${AE.color.hairline};
            }
            .qq-editor-device button {
              display: flex; align-items: center; justify-content: center;
              width: 30px; height: 26px; border-radius: 7px; border: none;
              background: transparent;
              cursor: pointer; transition: background 0.15s ease;
            }
            /* BH-2 / BH-5 — icon-btn at-rest contrast lifted (was muted /
             * ~0.55, now heading / 0.85) so the Undo/Redo + tool icons
             * remain readable on both light and dark chrome backgrounds.
             * Icons inherit colour via currentColor — see the inline SVG
             * style on each lucide-react icon in EditorTopBar.tsx. */
            /* Apple-clean (Phase 0) — quiet icon button: transparent at rest,
               secondary-grey icon, soft grey hover fill, 10px radius. No
               border / circle chrome. */
            .qq-editor-icon-btn {
              width: 32px; height: 32px; border-radius: ${AE.radius.md}; cursor: pointer;
              border: none; background: transparent;
              color: ${AE.color.secondary}; padding: 0;
              opacity: 1;
              display: flex; align-items: center; justify-content: center;
              transition: background 0.12s ease, color 0.12s ease, opacity 0.12s ease;
              flex-shrink: 0;
            }
            .qq-editor-icon-btn:hover:not(:disabled) {
              background: ${AE.color.surface};
              color: ${AE.color.text};
              opacity: 1;
            }
            /* BD-3a fix 1 / BH-2 / BH-5 — Undo/Redo share the icon-btn base
             * but gain a brand-blue tint on hover. */
            .qq-editor-history-btn:hover:not(:disabled) {
              background: ${AE.color.accentTint};
              color: ${AE.color.accent};
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
            /* Apple-clean (Phase 0) — clean segmented tabs. Inactive =
               secondary-grey text on transparent; active = near-black text on
               a subtle grey pill. Quiet, not a loud brand-blue fill. */
            .qq-editor-tab {
              font: inherit; background: transparent; border: none; cursor: pointer;
              padding: 6px 14px;
              min-height: 30px;
              font-size: 13px; font-weight: 500;
              color: ${AE.color.secondary};
              border-radius: ${AE.radius.sm};
              white-space: nowrap;
              transition: color 0.12s ease, background 0.12s ease;
            }
            .qq-editor-tab:hover { color: ${AE.color.text}; }
            /* Active = near-black label on a soft grey pill. We force the
             * colours with !important so the dark-mode stylesheet (index.css),
             * which pins every .qq-editor-tab color to var(--qq-text), can't
             * mask the active-state contrast. */
            .qq-editor-tab.is-active {
              font-weight: 600;
              color: ${AE.color.text} !important;
              background: ${AE.color.surface} !important;
            }

            /* ── Phase 0b — left vertical icon rail (Elfsight-style) ──────
             * The section nav lives here now (not the top bar). First column
             * of the desktop editor frame, flush-left of the settings panel,
             * full editor height, white bg with a 1px hairline right border.
             * Tabs stack from the top; the Help item is pushed to the bottom
             * via margin-top:auto. Hidden under the mobile breakpoint (the
             * bottom sheet is the mobile nav) — see the max-width:768px block. */
            .qq-editor-rail {
              flex-shrink: 0;
              width: 64px;
              display: flex; flex-direction: column;
              align-items: stretch;
              padding: 8px 6px;
              background: ${AE.color.bg};
              border-right: 1px solid ${AE.color.hairline};
              font-family: ${AE.font.family};
              overflow-y: auto;
            }
            .qq-editor-rail-tabs {
              display: flex; flex-direction: column;
              align-items: stretch; gap: 4px;
            }
            .qq-editor-rail-help { margin-top: auto; }
            .qq-editor-rail-item {
              display: flex; flex-direction: column;
              align-items: center; justify-content: center;
              gap: 5px;
              width: 100%; min-height: 60px;
              padding: 8px 2px;
              border: none; background: transparent; cursor: pointer;
              border-radius: ${AE.radius.md};
              color: ${AE.color.secondary};
              transition: background 0.12s ease, color 0.12s ease;
            }
            .qq-editor-rail-item:hover {
              background: ${AE.color.surface};
            }
            .qq-editor-rail-icon { display: block; }
            .qq-editor-rail-label {
              font-size: 11px; font-weight: 500; line-height: 1;
              letter-spacing: -0.01em;
            }
            /* Active = brand-blue icon + label on a subtle accent-tint pill
             * (outline/tint, NOT a heavy fill). !important guards the colour
             * against the dark-mode index.css that pins editor text tokens. */
            .qq-editor-rail-item.is-active {
              color: ${AE.color.accent} !important;
              background: ${AE.color.accentTint} !important;
            }

            /* BH-2 — preview fold/unfold reuses the icon-btn footprint. The
             * collapsed state takes on accent colour so the user can see
             * the preview is hidden at a glance. */
            .qq-editor-fold.is-collapsed {
              color: ${AE.color.accent};
              background: ${AE.color.accentTint};
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
            .qq-editor-body.is-preview-collapsed .qq-editor-left-col {
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
                border-left: 1px solid ${AE.color.hairline} !important;
              }
              .qq-editor-body.is-preview-collapsed .qq-editor-left-col {
                flex: 0 0 auto;
                width: var(--qq-editor-pane-width, 420px) !important;
              }
              .qq-editor-body.is-preview-collapsed .qq-editor-resize {
                display: flex !important;
              }
            }

            /* fix/wizardshell-resize-and-minimize (2026-06-12) — the
               NON-scrolling layout column. Owns the pane's box (width / flex /
               order) and is the positioning context for the resize splitter, so
               the splitter's top:0/bottom:0 span the full pane height regardless
               of how far .qq-editor-left has scrolled (Issue 4). */
            .qq-editor-left-col {
              position: relative;
              flex-shrink: 0;
              display: flex;
              min-height: 0;
            }
            .qq-editor-left {
              /* Fills the .qq-editor-left-col box; this is the SCROLL area. */
              flex: 1 1 auto;
              width: 100%;
              min-height: 0;
              background: ${AE.color.bg};
              border-right: 1px solid ${AE.color.hairline};
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
             * invisible against the surrounding panels.
             *
             * Wave 55 — Alex still reports the splitter is invisible. Root
             * causes addressed:
             *  (1) Parent .qq-editor-left has overflow-y: auto, which
             *      establishes a clipping context that clips the right:-5px
             *      offset. Splitter now sits INSIDE the pane edge at right:0
             *      so the bar is never clipped.
             *  (2) Resting opacity 0.18 was too subtle against the panel
             *      background. Bumped to ~0.42 (light) / 0.48 (dark) so the
             *      bar reads as a clear vertical divider at rest.
             *  (3) Width bumped from 5px to 6px at rest, 12px on hover,
             *      with a brighter inset so the divider is always
             *      perceptible even at a glance. */
            .qq-editor-resize {
              position: absolute; top: 0; right: 0; bottom: 0;
              width: 6px;
              background: rgba(13, 60, 252, 0.42);
              border: 0; padding: 0; cursor: col-resize;
              z-index: 5;
              touch-action: none;
              display: flex; align-items: center; justify-content: center;
              box-shadow:
                inset 1px 0 0 rgba(13, 60, 252, 0.55),
                inset -1px 0 0 rgba(13, 60, 252, 0.55);
              transition: background 0.12s ease, width 0.12s ease, box-shadow 0.12s ease;
            }
            .qq-editor-shell[data-theme="dark"] .qq-editor-resize {
              background: rgba(96, 165, 250, 0.48);
              box-shadow:
                inset 1px 0 0 rgba(96, 165, 250, 0.65),
                inset -1px 0 0 rgba(96, 165, 250, 0.65);
            }
            .qq-editor-resize:hover {
              background: #0d3cfc;
              width: 12px;
              box-shadow:
                inset 1px 0 0 rgba(255, 255, 255, 0.30),
                inset -1px 0 0 rgba(255, 255, 255, 0.30);
            }
            .qq-editor-resize.is-resizing {
              background: #0d3cfc;
              width: 12px;
              box-shadow:
                inset 1px 0 0 rgba(255, 255, 255, 0.30),
                inset -1px 0 0 rgba(255, 255, 255, 0.30);
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
              color: #ffffff;
              opacity: 0.95;
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
              border-top: 1px solid ${AE.color.hairline};
              background: ${AE.color.bg};
              position: sticky; bottom: 0; z-index: 4;
            }
            .qq-editor-shell[data-theme="dark"] .qq-editor-actions {
              background: var(--qq-surface);
            }
            .qq-editor-btn {
              display: inline-flex; align-items: center; justify-content: center;
              padding: 9px 16px; border-radius: ${AE.radius.md};
              font-size: 13px; font-weight: 600; cursor: pointer;
              background: ${AE.color.publish}; color: ${AE.color.publishText}; border: none;
              box-shadow: none;
              transition: background 0.12s ease, transform 0.06s ease;
            }
            .qq-editor-btn:hover:not(:disabled) { background: ${AE.color.accentHover}; }
            .qq-editor-btn:disabled { opacity: 0.55; cursor: not-allowed; }
            /* W-TG-SELECT-FIX — ghost (secondary) variant for the template
               replace-confirm Cancel button. Outlined, not filled, per the
               selected=outline UI rule; theme-aware via AE tokens. */
            .qq-editor-btn--ghost {
              background: ${AE.color.surface};
              color: ${AE.color.text};
              border: 1px solid ${AE.color.hairline};
            }
            .qq-editor-btn--ghost:hover:not(:disabled) { background: ${AE.color.accentTint}; }
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
               See memory/project_overflow_clip_for_sticky.md

               Wave 55 — bottom-right zoom toolbar was getting clipped at
               the bottom because .qq-preview-pane has min-height: 100%
               and could grow taller than .qq-editor-right (which clips
               on desktop). The toolbar bottom:14px then anchored to the
               OFF-SCREEN bottom of the pane. Constrain the pane to the
               right column visible area on desktop so the toolbar (and
               any future floating action UI) sits at the visible
               bottom-right corner. The bezel inside is centered via
               flex and has its own max-height cap, so the canvas itself
               does not get clipped at typical viewport sizes. */
            @media (min-width: 769px) {
              .qq-editor-right {
                overflow: clip;
                display: flex; flex-direction: column;
              }
              .qq-editor-right > .qq-preview-pane {
                flex: 1 1 auto;
                min-height: 0;
                max-height: 100%;
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
              /* Elfsight-clean (desktop) — no canvas grid. The preview sits on
                 a plain light surface like Elfsight's editor, not a design-tool
                 dotted/grid canvas. Dark mode keeps the dark surface, no grid. */
              background-image: none;
              background-color: rgba(255,255,255,1);
            }
            .qq-editor-shell[data-theme="dark"] .qq-preview-pane {
              background-image: none;
            }
            .qq-preview-stage {
              width: 100%; max-width: 920px;
              display: flex; flex-direction: column;
              align-items: center; justify-content: flex-start; background: transparent;
            }
            .qq-editor-help {
              /* Portaled to document.body — must paint ABOVE the mobile bottom
               * sheet (backdrop 9997 / sheet 9998 / topbar+bubble bumped to
               * 9999) and any modal. Near-max int guarantees it's on top. */
              position: fixed; inset: 0; z-index: 2147483600;
              background: rgba(15,23,42,0.45);
              display: flex; align-items: center; justify-content: center;
              padding: 20px;
            }
            .qq-editor-help-card {
              background: ${AE.color.bg}; border-radius: ${AE.radius.lg};
              padding: 18px 20px; max-width: 380px; width: 100%;
              box-shadow: ${AE.shadow.pop};
              border: 1px solid ${AE.color.hairline};
            }

            /* Mobile — preview stacks below the editor column. Resize handle
               is hidden (mobile is vertical-stack, no use for it). */
            @media (max-width: 768px) {
              /* Edge-to-edge full-screen (issue #5, 2026-06-05) — the editor
               * must fill the entire phone viewport like the Elfsight mobile
               * builder: no rounded card, no grey page gutter, no shadow. The
               * shell wrapper drops its 8px page padding so the frame can reach
               * every edge. */
              .qq-editor-shell { padding: 0; }
              /* The modal IS the full-bleed surface on mobile — kill the grey
               * page backdrop + any gutters so the white editor goes edge to
               * edge with no visible margin. (Mobile backdrop-filter stays off,
               * handled by the existing always-visible-sheet block below.) */
              .wizard-shell-modal,
              .wizard-shell-modal.is-entering,
              .wizard-shell-modal.is-open,
              .wizard-shell-modal.is-leaving {
                padding: 0 !important;
                background: rgba(255, 255, 255, 1) !important;
              }
              /* Apple-mobile-clean (2026-06-05) — on a real ≤768px viewport the
               * preview renders the Elfsight-style CLEAN calculator (no editor
               * canvas chrome). Strip the 24×24 dotted/square canvas grid so the
               * preview reads as a plain scrollable widget, not a design canvas.
               * Desktop keeps the grid via the unguarded .qq-preview-pane rule. */
              .qq-preview-pane {
                background-image: none !important;
                padding: 0 !important;
              }
              /* ALWAYS-VISIBLE BOTTOM-SHEET FIX (2026-06-05) — the modal's own
               * backdrop-filter ALSO establishes a fixed-positioning containing
               * block (same spec rule as transform/filter). Because the modal
               * is the scroll container (overflow-y:auto, content taller than
               * the viewport), the sheet's open-state bottom offset was
               * anchoring to the bottom of the SCROLLED content instead of
               * the viewport bottom — so .qq-sheet.is-open rendered ~70vh BELOW
               * the fold (the y≈929 bug). Dropping the blur on mobile removes
               * the containing block; the opaque editor frame fills this fixed
               * overlay anyway, so there is no visual change on phones. Desktop
               * keeps its blur (its @media min-width:769px rules are untouched).
               */
              .wizard-shell-modal,
              .wizard-shell-modal.is-entering,
              .wizard-shell-modal.is-open,
              .wizard-shell-modal.is-leaving {
                backdrop-filter: none !important;
                -webkit-backdrop-filter: none !important;
              }
              .qq-editor-frame {
                /* Edge-to-edge full-screen (issue #5) — fill the whole phone
                 * viewport: no rounded corners, no shadow, no margin. The frame
                 * becomes the screen, anchored to all four edges. 100dvh tracks
                 * the dynamic viewport (mobile browser chrome show/hide). */
                border-radius: 0 !important;
                box-shadow: none !important;
                margin: 0 !important;
                inset: 0;
                width: 100vw;
                max-width: 100vw;
                height: 100dvh;
                min-height: 100dvh;
                /* ALWAYS-VISIBLE BOTTOM-SHEET FIX (2026-06-04) — root cause of
                 * the collapsed sheet pill vanishing on scroll. On mobile the
                 * frame is taller than the viewport and scrolls inside
                 * .wizard-shell-modal. ANY transform on this ancestor (the
                 * entrance/leave slide animations below set translateY+scale)
                 * turns it into the containing block for position:fixed
                 * descendants — so the sheet's fixed pill stops anchoring to
                 * the viewport and instead rides UP with the frame as the page
                 * scrolls, sliding off the bottom of the screen. We hard-pin
                 * the frame to transform:none + will-change:auto at this
                 * breakpoint in EVERY phase so the fixed pill always anchors to
                 * the viewport and stays on-screen. The entrance fade (opacity)
                 * still plays; only the transform slide is dropped on mobile. */
                transform: none !important;
                will-change: auto !important;
              }
              .wizard-shell-modal.is-entering .qq-editor-frame,
              .wizard-shell-modal.is-open .qq-editor-frame,
              .wizard-shell-modal.is-leaving .qq-editor-frame {
                transform: none !important;
                will-change: auto !important;
              }
              .qq-editor-body { flex-direction: column; }
              /* Phase 0b — the icon rail is desktop-only. On mobile the
                 bottom sheet (MobileBottomSheet) owns section navigation, so
                 the rail is hidden entirely at this breakpoint. */
              .qq-editor-rail { display: none !important; }
              .qq-editor-left-col {
                width: 100% !important;
                order: 1;
              }
              .qq-editor-left {
                border-right: none;
                border-bottom: 1px solid ${AE.color.hairline};
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
              .qq-editor-body.is-mobile-sheet .qq-editor-left-col {
                display: none !important;
              }
              /* Keep the sticky editor topbar above the docked sheet (9998)
               * and bottom tab bar so its chrome — tabs (editor-tab-*),
               * fold-toggle, theme/help/close icons — stays interactive while
               * the sheet is open. (The old tap-catching, blurring backdrop was
               * removed; the sheet is now docked, not modal, so the preview
               * stays fully visible + scrollable above it.) */
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
                /* Elfsight-mobile rebuild — the preview fills the work area
                 * between the clean mobile top bar (~64px) and the persistent
                 * dark bottom tab bar (~60px + safe-area), MINUS the docked
                 * sheet's current visible height (--qq-sheet-h, published live
                 * by MobileBottomSheet on every drag/snap; 0px when closed). So
                 * the preview shrinks/grows as the sheet resizes and always
                 * stays visible + independently scrollable above it. iOS Safari
                 * needs a concrete height for overflow-y:auto to enable
                 * touch-pan, so we compute it explicitly. */
                height: calc(100dvh - 64px - 60px - var(--qq-sheet-h, 0px) - env(safe-area-inset-bottom, 0px));
                max-height: calc(100dvh - 64px - 60px - var(--qq-sheet-h, 0px) - env(safe-area-inset-bottom, 0px));
                padding-bottom: 12px;
                overflow-y: auto;
                -webkit-overflow-scrolling: touch;
              }
              .qq-editor-body.is-mobile-sheet .qq-preview-pane {
                /* Drop the bottom hairline — the sheet handle already
                 * provides the visual separator. */
                border-bottom: none;
              }
              /* AIBubble — keep it reachable over the panel sheet. The bubble
               * is z-index 1100 by default; lift it to 9999 so it floats above
               * the open sheet (9998) on mobile. */
              .qq-editor-body.is-mobile-sheet ~ .qq-ai-bubble,
              .qq-editor-body.is-mobile-sheet ~ .qq-ai-panel {
                z-index: 9999 !important;
              }
              /* fix/tmpl-editor-mobile (C) — keep the floating AI bubble OFF
               * the widget's primary CTA / card on mobile. The default pill
               * (label + icon, right:18 bottom:76) sat over the "Get My Quote"
               * button and the card content. On mobile we:
               *   • shrink it to a compact icon-only circle (label hidden),
               *   • tuck it tight into the bottom-right corner, and
               *   • lift it clear above the persistent dark bottom tab bar
               *     (~60px) + safe-area, with extra clearance so it floats
               *     beside — not over — the CTA.
               * The widget CTA stays fully reachable/unobscured. */
              .qq-editor-body.is-mobile-sheet ~ .qq-ai-bubble {
                right: 10px;
                bottom: calc(84px + env(safe-area-inset-bottom, 0px));
                padding: 0;
                width: 40px;
                height: 40px;
                border-radius: 50%;
                justify-content: center;
                gap: 0;
              }
              /* Icon-only on mobile — drop the "AI" text so the footprint is a
               * small circle that doesn't span across the CTA. */
              .qq-editor-body.is-mobile-sheet ~ .qq-ai-bubble .qq-ai-bubble-label {
                display: none;
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
              /* Declutter the phone top-bar (Alex: "6 buttons, very
               * confusing"). The "Preview as bubble" toggle is a niche
               * desktop preview mode; drop it on phones so the right cluster
               * reads as the 4 clear actions: collapse-preview, theme, help,
               * close. (Bubble preview stays available on tablet/desktop.) */
              .qq-editor-launcher-toggle { display: none !important; }
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

            /* ── Elfsight-mobile rebuild (2026-06-05) ──────────────────
             * The old W-AO-1 collapsible action bar was removed; its CSS goes
             * with it. The persistent dark bottom tab bar (BottomTabBar) carries
             * its own scoped styles. Below: only the still-needed mobile chrome
             * — keep the bottom of the editor frame clear of the ~60px bottom
             * tab bar, and hide the in-pane sticky Save footer (Save now lives
             * in the panel-sheet footer + autosave). */
            @media (max-width: 768px) {
              /* Clear the persistent dark bottom tab bar (~60px + safe-area)
               * so the editor-only (preview-collapsed) view never hides its
               * last rows behind the bar. */
              .qq-editor-frame {
                padding-bottom: calc(60px + env(safe-area-inset-bottom, 0px));
              }
              /* The in-pane sticky Save footer (.qq-editor-actions) is hidden on
               * mobile — Save lives in the panel-sheet footer + autosave. */
              .qq-editor-actions {
                display: none !important;
              }
            }
          `}</style>
        </div>
      </DndContext>
    </SelectionProvider>
  );
}
