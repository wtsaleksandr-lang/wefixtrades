// selection.tsx — Wave I item (c) click-to-highlight selection sync.
//
// One shared piece of selection state ("which row is the user looking at?")
// shared between the LEFT pane (FieldRow / CalculationRow / HeaderResults) and
// the RIGHT pane (PreviewPane field wrappers). Clicking a field in the preview
// highlights the matching row in the left pane (and scrolls it into view).
// Clicking a row in the left pane outlines the matching field in the preview.
//
// State is component-local (no localStorage) — refreshing resets selection.
// Mobile parity: tap works the same; on mobile the preview stacks ABOVE the
// editor so we scroll the matching left-pane row into view after selection
// (and likewise scroll the preview when a left-pane row is selected).
//
// Tagging convention:
//   - field rows / preview field wrappers: kind='field', id=<fieldId>
//   - calc rows: kind='calc', id=<calcId>
//   - results panel + result-tab in left pane: kind='results', id='__results'
//   - header bar / header inputs in left pane: kind='header', id='__header'
//
// The test ids `selected-in-preview` and `selected-in-pane` are emitted by
// whichever element is currently the active selection on its side.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';

export type SelectionKind = 'field' | 'calc' | 'results' | 'header';

export interface SelectionTarget {
  kind: SelectionKind;
  id: string;
}

export interface SelectionContextValue {
  /** The current selection, or `null` when nothing is selected. */
  selected: SelectionTarget | null;
  /** Select a target. Pass `null` to clear. Re-selecting toggles off. */
  select: (target: SelectionTarget | null) => void;
  /** True iff `target` equals the current selection (kind+id). */
  isSelected: (target: SelectionTarget) => boolean;
  /**
   * Register a DOM node tied to a selection target so the provider can scroll
   * it into view when selection changes (cross-pane sync). Returns a stable
   * callback ref the consumer can spread onto the element.
   */
  registerNode: (
    target: SelectionTarget,
    side: 'pane' | 'preview',
  ) => (el: HTMLElement | null) => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

interface ProviderProps {
  children: React.ReactNode;
}

export function SelectionProvider({ children }: ProviderProps) {
  const [selected, setSelected] = useState<SelectionTarget | null>(null);

  // node registry: side → kind:id → HTMLElement. Refs only; no re-renders.
  const nodesRef = useRef<{
    pane: Map<string, HTMLElement>;
    preview: Map<string, HTMLElement>;
  }>({ pane: new Map(), preview: new Map() });

  const keyOf = (t: SelectionTarget) => `${t.kind}:${t.id}`;

  const select = useCallback((target: SelectionTarget | null) => {
    setSelected((prev) => {
      if (target === null) return null;
      if (prev && prev.kind === target.kind && prev.id === target.id) {
        // Toggle off if same.
        return null;
      }
      return { ...target };
    });
  }, []);

  const isSelected = useCallback(
    (target: SelectionTarget) =>
      !!selected && selected.kind === target.kind && selected.id === target.id,
    [selected],
  );

  const registerNode = useCallback(
    (target: SelectionTarget, side: 'pane' | 'preview') => {
      return (el: HTMLElement | null) => {
        const map = nodesRef.current[side];
        const k = keyOf(target);
        if (el) map.set(k, el);
        else map.delete(k);
      };
    },
    [],
  );

  // On selection change, scroll both sides into view (best-effort).
  useEffect(() => {
    if (!selected) return;
    const k = keyOf(selected);
    const paneEl = nodesRef.current.pane.get(k);
    const previewEl = nodesRef.current.preview.get(k);
    // Respect reduced-motion — fall back to instant scroll if requested.
    const reduce = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
    const behavior: ScrollBehavior = reduce ? 'auto' : 'smooth';
    if (paneEl) {
      try { paneEl.scrollIntoView({ block: 'center', behavior }); } catch {}
    }
    if (previewEl) {
      try { previewEl.scrollIntoView({ block: 'center', behavior }); } catch {}
    }
  }, [selected]);

  const value = useMemo<SelectionContextValue>(
    () => ({ selected, select, isSelected, registerNode }),
    [selected, select, isSelected, registerNode],
  );

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

/**
 * Selection hook for the editor shell. Safe to call OUTSIDE the provider —
 * returns a no-op shape so individual panels remain testable in isolation
 * (and so the Wave H1-H6 tests keep passing without the provider mounted).
 */
export function useSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (ctx) return ctx;
  // Inert fallback — no-op selection. Components stay functional.
  return {
    selected: null,
    select: () => {},
    isSelected: () => false,
    registerNode: () => () => {},
  };
}
