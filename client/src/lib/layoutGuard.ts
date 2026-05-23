/**
 * LAYOUT-1 — Runtime overlap/crumple detector for the editor wizard.
 *
 * Mirror of CONTRAST-1's pattern: silent in production, `console.warn` in dev
 * so engineers and coding agents catch layout bugs (siblings overlapping,
 * crumpled stacks, runaway gaps, double info-cues) before the PR lands.
 *
 * Zero auto-fix — this module DETECTS only. Auto-fix is the responsibility
 * of LAYOUT-3 (shared primitives) and the long-tail of CSS work.
 *
 * Sister waves (do NOT touch from here):
 *   - LAYOUT-2 — CI lint over the design tokens
 *   - LAYOUT-3 — shared layout primitives (Stack, Cluster, Section)
 *
 * Production behaviour: the hook short-circuits on its first line when
 * `process.env.NODE_ENV === 'production'`. Vite replaces that string at
 * build time so the entire body of the hook (observers, geometry math,
 * console warnings, the warning de-dup Set) is dead-code-eliminated.
 * The exported geometry helpers (`rectsOverlap`, `verticalGapPx`) stay
 * accessible for unit testing but cost nothing if no one imports them
 * from a production codepath.
 */

import { useEffect, type RefObject } from 'react';

/* ─── Tunables ─────────────────────────────────────────────────────── */

/** Minimum intersection (in CSS px) before we call it an overlap. 1px
 *  is just enough to ignore sub-pixel rounding from CSS transforms.    */
const OVERLAP_TOLERANCE_PX = 1;

/** Default `maxGapPx` when the caller doesn't specify. Picked to match
 *  the WeFixTrades input-cluster spacing token (4px). Sections override
 *  with a much looser value (24px).                                    */
const DEFAULT_MAX_GAP_PX = 4;

/** A vertical gap below this (in px) means the elements are touching
 *  or visually crumpled. Distinct from `OVERLAP_TOLERANCE_PX` — overlap
 *  means rects intersect; crumple means they kiss without overlap.    */
const CRUMPLE_GAP_PX = 1;

/** Debounce window for ResizeObserver + MutationObserver callbacks. The
 *  re-check is purely diagnostic so we can afford to coalesce bursts.  */
const DEBOUNCE_MS = 150;

/** Selector used to find help-cue elements. Matches BOTH the new
 *  `[data-cue]` attribute (preferred going forward) and the existing
 *  `.qq-info-cue` class so we catch the legacy elements too.          */
const CUE_SELECTOR = '[data-cue], .qq-info-cue';

/* ─── Geometry helpers (pure; exported for unit tests) ─────────────── */

/** Minimal DOMRect-shaped object — accepts real DOMRects or test stubs. */
export interface RectLike {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

/**
 * Returns the area (in px²) that two axis-aligned rects share. Returns
 * 0 when they don't overlap at all. Used by `rectsOverlap` and by the
 * warning serialiser so we can report HOW BAD the overlap is.
 */
export function overlapAreaPx(a: RectLike, b: RectLike): number {
  const xOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const yOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return xOverlap * yOverlap;
}

/**
 * True when two rects overlap by more than `OVERLAP_TOLERANCE_PX` in
 * BOTH axes. Strict AND — siblings stacked vertically that share an
 * X span don't count as overlap unless they also share a Y span.
 */
export function rectsOverlap(a: RectLike, b: RectLike, tolerancePx = OVERLAP_TOLERANCE_PX): boolean {
  const xOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const yOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return xOverlap > tolerancePx && yOverlap > tolerancePx;
}

/**
 * Vertical gap between two rects in CSS px. Negative when they
 * overlap on the Y axis. Order-independent: returns the gap between
 * whichever rect is on top and whichever is below.
 *
 * Returns `null` when the rects don't share any horizontal span — they
 * sit side-by-side and a vertical-gap metric isn't meaningful.
 */
export function verticalGapPx(a: RectLike, b: RectLike): number | null {
  // No horizontal overlap → side-by-side → vertical gap N/A.
  const xOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  if (xOverlap <= 0) return null;

  // Pick the upper / lower rect by top edge.
  const upper = a.top <= b.top ? a : b;
  const lower = a.top <= b.top ? b : a;
  return lower.top - upper.bottom;
}

/* ─── Dev-mode warning helpers ─────────────────────────────────────── */

/**
 * One-shot warning de-dup. Keyed by a synthesised tuple so the same
 * (parent, child-pair, problem) only logs once per page load — repeated
 * renders of the same wizard panel don't flood the console.
 */
const warnedKeys = new Set<string>();

function isProd(): boolean {
  return typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';
}

/** Short, copy-pastable description of an element for the console. */
function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const cls = el.classList.length > 0 ? `.${Array.from(el.classList).join('.')}` : '';
  const testid = el.getAttribute('data-testid');
  const testidStr = testid ? `[data-testid="${testid}"]` : '';
  return `<${tag}${id}${cls}${testidStr}>`;
}

function warnOnce(key: string, payload: () => unknown[]): void {
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  // eslint-disable-next-line no-console
  console.warn(...payload());
}

/* ─── Hook options ─────────────────────────────────────────────────── */

export interface LayoutGuardOptions {
  /** Max allowed vertical gap (px) between siblings before we warn.
   *  Default 4px (input-cluster spacing). Use a much larger value
   *  (e.g. 24px) for `data-section`-scoped containers.               */
  maxGapPx?: number;
  /** Override the dev-mode detection — useful for forcing the guard
   *  on / off from a test or storybook setup. Defaults to "on when
   *  NODE_ENV !== 'production'".                                    */
  enabled?: boolean;
  /** Human-readable label included in every warning so multi-panel
   *  pages can be triaged. Defaults to the ref'd element's data-testid. */
  label?: string;
}

/* ─── Main hook ────────────────────────────────────────────────────── */

/**
 * `useLayoutGuard(ref, opts?)` — attaches a dev-time observer that
 * inspects the immediate children of `ref.current` after every
 * layout-affecting change. Warns (once per problem) when:
 *
 *   1. **Overlap**  — two siblings' rects intersect by > 1px.
 *   2. **Crumpled** — adjacent siblings' vertical gap < 1px (touching).
 *   3. **Runaway gap** — vertical gap > opts.maxGapPx (default 4px).
 *   4. **Cue density** — > 1 element matching `[data-cue], .qq-info-cue`
 *      directly under the same immediate child.
 *
 * No DOM is modified, no render is blocked. Returns nothing.
 */
export function useLayoutGuard(
  ref: RefObject<HTMLElement | null>,
  opts: LayoutGuardOptions = {},
): void {
  // First line — in production, every subsequent line is reachable only
  // via this hook reference, so the closure-creation cost is the only
  // residue. The body of the effect never runs.
  const enabled = opts.enabled ?? !isProd();

  useEffect(() => {
    if (!enabled) return;
    const root = ref.current;
    if (!root) return;
    if (typeof window === 'undefined') return;

    const maxGapPx = opts.maxGapPx ?? DEFAULT_MAX_GAP_PX;
    const label = opts.label ?? root.getAttribute('data-testid') ?? 'layoutGuard';

    let timer: number | null = null;

    /** Walk the immediate children of `root` and check the rules.    */
    const check = (): void => {
      const children = Array.from(root.children).filter(
        (c): c is HTMLElement => c instanceof HTMLElement,
      );

      // Skip invisible elements — `display: none` rects are 0×0 at the
      // same coordinates and would generate phantom overlap warnings.
      const visible = children.filter((c) => {
        const r = c.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });

      // Pair-wise check on visible siblings.
      for (let i = 0; i < visible.length; i++) {
        for (let j = i + 1; j < visible.length; j++) {
          const a = visible[i];
          const b = visible[j];
          const rectA = a.getBoundingClientRect();
          const rectB = b.getBoundingClientRect();

          // 1. Overlap.
          if (rectsOverlap(rectA, rectB)) {
            const area = Math.round(overlapAreaPx(rectA, rectB));
            const key = `${label}::overlap::${i}::${j}`;
            warnOnce(key, () => [
              `[layout-guard] OVERLAP — siblings intersect by ~${area}px² in ${label}\n  `,
              describeElement(a),
              '\n  ',
              describeElement(b),
              '\n  container:',
              describeElement(root),
            ]);
            continue; // Don't double-report gap problems on overlapping rects.
          }

          // 2 & 3. Gap-based checks — only for adjacent siblings (j === i + 1)
          // since non-adjacent gap doesn't represent a visible layout error.
          if (j === i + 1) {
            const gap = verticalGapPx(rectA, rectB);
            if (gap !== null) {
              if (gap < CRUMPLE_GAP_PX) {
                const key = `${label}::crumpled::${i}::${j}`;
                warnOnce(key, () => [
                  `[layout-guard] CRUMPLED — adjacent siblings touching (gap ${gap.toFixed(1)}px) in ${label}\n  `,
                  describeElement(a),
                  '\n  ',
                  describeElement(b),
                  '\n  container:',
                  describeElement(root),
                ]);
              } else if (gap > maxGapPx) {
                const key = `${label}::runaway::${i}::${j}`;
                warnOnce(key, () => [
                  `[layout-guard] RUNAWAY GAP — ${gap.toFixed(1)}px between adjacent siblings exceeds maxGapPx=${maxGapPx} in ${label}\n  `,
                  describeElement(a),
                  '\n  ',
                  describeElement(b),
                  '\n  container:',
                  describeElement(root),
                ]);
              }
            }
          }
        }
      }

      // 4. Help-cue density — count cues directly inside each immediate
      // child. Multiple cues per child suggests a copy-paste duplicate.
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const cues = child.querySelectorAll(CUE_SELECTOR);
        if (cues.length > 1) {
          const key = `${label}::cues::${i}::${cues.length}`;
          warnOnce(key, () => [
            `[layout-guard] CUE DENSITY — ${cues.length} cues inside one child of ${label}\n  child:`,
            describeElement(child),
            '\n  container:',
            describeElement(root),
          ]);
        }
      }
    };

    const schedule = (): void => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        check();
      }, DEBOUNCE_MS);
    };

    // Initial pass after the first paint — children may not have
    // laid out yet when the effect fires, so debounce keeps us honest.
    schedule();

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    if (ro) {
      ro.observe(root);
      // Observing each child individually catches the case where a
      // child grows / shrinks but the parent doesn't (flex children
      // under `align-items: stretch`).
      for (const c of Array.from(root.children)) {
        if (c instanceof HTMLElement) ro.observe(c);
      }
    }

    const mo =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(schedule)
        : null;
    if (mo) {
      mo.observe(root, {
        childList: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden'],
        subtree: false,
      });
    }

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      ro?.disconnect();
      mo?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ref, opts.maxGapPx, opts.label]);
}
