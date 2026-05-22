// useFoldablePanels — BD-3g Item 2.
//
// Non-invasive enhancer that adds click-to-toggle fold/unfold behavior to
// every `<fieldset class="qq-style-group">` (and a small allowlist of
// section-shaped containers — see SELECTOR below) inside the host element.
//
// Why a DOM enhancer instead of a wrapper component? StyleTab + SettingsTab
// have 17+ fieldsets across 4 tabs, each with varied internal structure
// (some have a wrapping `qq-style-group-body` div, some have direct
// children). Wrapping every fieldset in a `<Collapsible>` JSX wrapper
// would require replacing 17 sites and threading per-panel state through
// each call. Doing it in-place after render keeps the change to a single
// hook call per tab.
//
// What it does on mount + when the host's children change:
//   1. Finds every `<fieldset[data-testid]>` under the host (using
//      MutationObserver for tabs that swap content dynamically, e.g.
//      Brand Studio's Pro / Free variants).
//   2. Reads sessionStorage entry `qq-wizard-panel-${tabName}-${panelId}`
//      where panelId = fieldset's `data-testid` (falls back to defaultOpen).
//   3. Sets `data-panel-open` on the fieldset and ensures a chevron `<svg>`
//      with class `qq-foldable-chevron` is the last child of the legend.
//   4. Wires a click handler onto the legend that toggles the state +
//      persists to sessionStorage.
//
// All visual behavior (animation, chevron rotation) lives in CSS mounted
// from WizardShell. The state persisted here is the source of truth.
//
// Accessibility:
//   - The legend gains `role="button"`, `tabIndex=0`, and `aria-expanded`.
//   - Enter / Space toggle.
//   - Body content is hidden via `aria-hidden` when collapsed; the body
//     stays in the DOM so internal React state isn't lost.
//
// Reduced motion is honored by the CSS rule (no JS-side handling needed).

import { useEffect, type RefObject } from 'react';

const STORAGE_PREFIX = 'qq-wizard-panel-';

/** Selector for fieldsets we want to make foldable. */
const SELECTOR = 'fieldset.qq-style-group[data-testid]';

/** Per-panel defaults: panel-id → defaultOpen. Anything not listed defaults
 *  to true (open). Brand Studio sub-cards default closed; Theme + Colours
 *  default open (most-likely-edited per BD-3g spec). */
const PANEL_DEFAULTS: Record<string, boolean> = {
  // Style tab — keep the highest-traffic panels open
  'style-group-theme': true,
  'style-group-colours': true,
  'style-group-typography': true,
  'style-group-shape': false,
  'style-group-layout': false,
  'style-group-branding': false,
  // Brand Studio is advanced — collapse by default
  'style-group-brand-kit': false,
  'style-group-brand-studio': false,
  // Settings tab — keep functional panels open, secondary collapsed
  'settings-group-trade': true,
  'settings-group-lead-email': true,
  'settings-group-business-profile': false,
  'settings-group-pricing': true,
  'settings-group-numberformat': false,
  'settings-group-cta': false,
  'settings-group-scheduling': false,
  'settings-group-brand-badge': false,
};

function loadPanelOpen(tabName: string, panelId: string): boolean {
  try {
    const v = sessionStorage.getItem(`${STORAGE_PREFIX}${tabName}-${panelId}`);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch { /* ignore */ }
  return PANEL_DEFAULTS[panelId] ?? true;
}

function savePanelOpen(tabName: string, panelId: string, open: boolean) {
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}${tabName}-${panelId}`, open ? '1' : '0');
  } catch { /* ignore */ }
}

/** Chevron SVG used as a deterministic marker (so we don't double-insert
 *  it on re-runs). Matches lucide:ChevronDown at 14px. */
const CHEVRON_HTML = '<svg class="qq-foldable-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="6 9 12 15 18 9"></polyline></svg>';

/** Apply the open/closed state to a single fieldset by animating its
 *  max-height. The fieldset's open height is measured via scrollHeight
 *  on each toggle (so React-driven content changes don't break the
 *  animation). Reduced motion snaps without animating. */
function applyState(fieldset: HTMLElement, open: boolean, animate: boolean) {
  const reduce = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
  const useAnim = animate && !reduce;
  const legend = fieldset.querySelector<HTMLLegendElement>(':scope > legend.qq-style-legend');
  // When the fieldset has been laid out, the legend's offsetHeight is the
  // floor we collapse to. Fall back to 44px (matches the legend's natural
  // height in the editor theme) if not yet laid out.
  const collapsedH = legend ? legend.offsetHeight : 44;

  fieldset.dataset.panelOpen = open ? 'true' : 'false';

  if (!useAnim) {
    fieldset.style.transition = 'none';
    fieldset.style.maxHeight = open ? '' : `${collapsedH}px`;
    // Force reflow then restore transition so the NEXT toggle animates.
    void fieldset.offsetHeight;
    fieldset.style.transition = '';
    return;
  }

  // Animate: measure scrollHeight to pin a concrete starting value, then
  // transition to the target. CSS handles the easing/duration.
  const currentH = fieldset.scrollHeight;
  fieldset.style.transition = 'none';
  fieldset.style.maxHeight = `${currentH}px`;
  void fieldset.offsetHeight; // flush
  fieldset.style.transition = '';
  // requestAnimationFrame so the browser commits the starting frame
  // before we ask it to transition to the target frame.
  requestAnimationFrame(() => {
    fieldset.style.maxHeight = open ? `${fieldset.scrollHeight}px` : `${collapsedH}px`;
    // After the transition finishes, clear maxHeight on open so the panel
    // can grow if React adds content (e.g. expanded sub-sections).
    if (open) {
      const onEnd = () => {
        if (fieldset.dataset.panelOpen === 'true') {
          fieldset.style.maxHeight = '';
        }
        fieldset.removeEventListener('transitionend', onEnd);
      };
      fieldset.addEventListener('transitionend', onEnd);
    }
  });
}

function enhance(fieldset: HTMLElement, tabName: string) {
  if (fieldset.dataset.foldableEnhanced === '1') return;
  const panelId = fieldset.dataset.testid;
  if (!panelId) return;
  const legend = fieldset.querySelector<HTMLLegendElement>(':scope > legend.qq-style-legend');
  if (!legend) return;

  fieldset.dataset.foldableEnhanced = '1';

  // Append chevron if not yet present.
  if (!legend.querySelector('.qq-foldable-chevron')) {
    const spacer = fieldset.ownerDocument.createElement('span');
    spacer.className = 'qq-foldable-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    legend.appendChild(spacer);
    legend.insertAdjacentHTML('beforeend', CHEVRON_HTML);
  }

  legend.classList.add('qq-foldable-legend');
  legend.setAttribute('role', 'button');
  legend.setAttribute('tabindex', '0');

  const open = loadPanelOpen(tabName, panelId);
  legend.setAttribute('aria-expanded', String(open));
  applyState(fieldset, open, false);

  const toggle = () => {
    const next = fieldset.dataset.panelOpen !== 'true';
    applyState(fieldset, next, true);
    legend.setAttribute('aria-expanded', String(next));
    savePanelOpen(tabName, panelId, next);
  };

  legend.addEventListener('click', (e) => {
    // Don't toggle when the click landed on an InfoCue trigger or any
    // interactive descendant — InfoCue uses a real button inside the
    // legend, and toggling on its click would steal the cue's behavior.
    const target = e.target as HTMLElement;
    if (target.closest('button, a, [role="button"]:not(.qq-foldable-legend), input, [data-no-fold-toggle]')) {
      // The chevron itself is part of the legend (not a separate button),
      // so still toggle when it's clicked. Detect via .qq-foldable-chevron.
      if (!target.closest('.qq-foldable-chevron')) return;
    }
    toggle();
  });
  legend.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  });
}

export function useFoldablePanels(
  hostRef: RefObject<HTMLElement>,
  tabName: string,
) {
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scan = () => {
      const fieldsets = host.querySelectorAll<HTMLElement>(SELECTOR);
      fieldsets.forEach((fs) => enhance(fs, tabName));
    };

    scan();
    // MutationObserver picks up fieldsets that mount later (e.g. Pro vs
    // Free Brand Studio swap, Scheduling section expanding sub-fieldsets).
    const obs = new MutationObserver(() => scan());
    obs.observe(host, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [hostRef, tabName]);
}
