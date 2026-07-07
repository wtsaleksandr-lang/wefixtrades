/**
 * WidgetSelect — a custom, themeable dropdown that replaces the native
 * <select> in the QuoteQuick calculator so we can render:
 *   - a clearly-visible themed chevron (the native arrow was invisible on dark
 *     themes — Alex's "where is the white arrow?"),
 *   - a rounded options panel that opens with a smooth spring/fade, and
 *   - the same floated title-in-field label as the other inputs.
 *
 * Keeps it accessible: role=combobox trigger + role=listbox panel, arrow/Home/
 * End/Enter/Escape keys, click-outside + Escape to close, and aria-selected on
 * the active option. The selected value is still a plain string id passed up
 * via onChange, so callers are unchanged from the old native select.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { WidgetTheme } from './widgetThemes';
import { getRelativeLuminance } from '@/lib/contrastGuard';

export interface SelectOption { id: string; label: string }

interface Props {
  id?: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (id: string) => void;
  label: string;
  theme: WidgetTheme;
  inputBase: CSSProperties;
  radiusPx: number | string;
  fontFamily?: string;
  /** Floated-label colour (the accent), matching the other float fields. */
  labelColor: string;
  /**
   * `float` (default) renders the title-in-field floated label. `stacked`
   * renders no internal label — the caller places a title ABOVE the box
   * (Elfsight layout) — and the trigger uses normal centred padding.
   */
  labelLayout?: 'float' | 'stacked';
}

export default function WidgetSelect({
  id, value, options, onChange, label, theme, inputBase, radiusPx, fontFamily, labelColor,
  labelLayout = 'float',
}: Props) {
  const stacked = labelLayout === 'stacked';
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // SSR-SAFE PORTAL — the panel is portaled to `document.body`, and that target
  // is evaluated on EVERY render (the createPortal wraps AnimatePresence so exit
  // animations can play). On the server `document` is undefined, so gate the
  // portal behind a client-only mounted flag (the SSR field-types guard renders
  // WidgetSelect server-side and would otherwise throw "document is not defined").
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  // PORTAL-POSITIONING — the calculator body is now a scroll container
  // (`overflow-y:auto` + `overflow-x:clip`, see AdvancedCalculator BD-2a-shell).
  // Any `overflow: auto/clip/hidden` ancestor CLIPS an absolutely-positioned
  // descendant, so the old `position:absolute` panel got cut off at the body's
  // box (fixed-height iframe / wizard bezel) or grew the inner scroll. Fix: the
  // open panel is portaled to `document.body` and positioned `fixed` against the
  // trigger's viewport rect — it escapes every clip context. All colours are
  // passed as inline style VALUES (from `theme.*`) so theming survives the move
  // out of the widget's scoped-token subtree.
  const [panelPos, setPanelPos] = useState<{
    left: number; width: number; top?: number; bottom?: number; maxHeight: number; flip: boolean;
  } | null>(null);

  const computePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 6;
    const cap = 248;
    const vh = window.innerHeight;
    const spaceBelow = vh - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    // Flip above only when there isn't enough room below AND there's more above.
    const flip = spaceBelow < Math.min(cap, 160) && spaceAbove > spaceBelow;
    const avail = flip ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(96, Math.min(cap, avail - 8));
    setPanelPos(
      flip
        ? { left: rect.left, width: rect.width, bottom: vh - rect.top + gap, maxHeight, flip }
        : { left: rect.left, width: rect.width, top: rect.bottom + gap, maxHeight, flip },
    );
  };

  const selectedIdx = Math.max(0, options.findIndex((o) => o.id === value));
  const selectedLabel = options[selectedIdx]?.label ?? '';

  // Client-only mount flag for the body portal (see `mounted` above).
  useEffect(() => { setMounted(true); }, []);

  // Open → focus the active (selected) option for keyboard nav.
  useEffect(() => {
    if (open) setActive(selectedIdx);
  }, [open, selectedIdx]);

  // Click-outside + Escape close. The panel now lives in a body portal, so a
  // click inside it is NOT inside wrapRef — also allow clicks within the portaled
  // list (listRef) before treating it as "outside".
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Position the portaled panel on open, and keep it pinned to the trigger while
  // open — the body scroll container (and window) can move the trigger under it,
  // so listen in capture phase to catch scrolls on any ancestor scroller.
  useLayoutEffect(() => {
    if (!open) { setPanelPos(null); return; }
    computePosition();
    const onScroll = () => computePosition();
    const onResize = () => computePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  // Keep the active option scrolled into view.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (idx: number) => {
    const opt = options[idx];
    if (opt) onChange(opt.id);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); }
  };

  const hoverBg = theme.accentTint;
  const rPx = typeof radiusPx === 'number' ? radiusPx : (parseInt(String(radiusPx), 10) || 12);
  const optRadius = Math.max(8, rPx - 4);
  const panelRadius = Math.max(12, rPx);
  // CONTRAST RULE — the SELECTED option highlight paints `theme.accent` behind
  // its label, so the label colour must OPPOSE the accent's luminance: white on
  // a dark accent, DARK text on a BRIGHT accent. This is the dropdown's version
  // of the no-white-on-yellow rule — a yellow accent (two-zone Colour A scheme,
  // or any bright brand accent) must never render white-on-yellow here.
  const selectedOptionFg = getRelativeLuminance(theme.accent) >= 0.5
    ? 'rgb(17,17,17)'
    : 'rgba(255,255,255,1)';

  return (
    <div ref={wrapRef} style={{ position: 'relative', fontFamily }}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        style={{
          ...inputBase,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          textAlign: 'left', cursor: 'pointer',
          // Float mode reserves top room for the floated label; stacked mode
          // (title sits above the box) centres the value normally.
          ...(stacked
            ? { paddingRight: 12 }
            : { paddingTop: 20, paddingBottom: 5, paddingRight: 12 }),
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedLabel}</span>
        {/* Small, subtle down-chevron — premium and understated (matches the
            up/down steppers on the adjacent number field). */}
        <svg
          width={16} height={16} viewBox="0 0 24 24" aria-hidden
          style={{ color: theme.text, flexShrink: 0, transition: 'transform 200ms ease', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Floated title-in-field label (float mode only — stacked callers
          render their own title above the box). No text-shadow: the old drop
          shadow read as a glow on light backgrounds (Alex). */}
      {!stacked && (
        <label
          htmlFor={id}
          title={label}
          className="qq-w-grouplabel"
          style={{
            position: 'absolute', left: 14, top: 4, fontSize: 12, fontWeight: 700,
            // Mirror the contrast-guarded label colour into --qq-w-grouplabel so
            // the editor-dark-mode override (index.css `.qq-w-grouplabel`) can
            // re-assert it past the editor chrome's blanket
            // `label { color: var(--qq-text) !important }` rule, which would
            // otherwise paint this floated SELECT caption near-white on the
            // light widget surface (≈1.1:1, invisible).
            letterSpacing: '0.015em', color: labelColor, pointerEvents: 'none',
            ['--qq-w-grouplabel' as any]: labelColor,
            lineHeight: 1, background: 'transparent', padding: '0 2px',
            // Clamp the floated label to ONE line so a long question
            // ("How often do you want service?") can't wrap to 2 lines and
            // overprint the value span ("One-Off") below it. maxWidth leaves
            // room for the chevron + right padding; full text stays available
            // via the native title tooltip.
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            maxWidth: 'calc(100% - 28px)',
          }}
        >
          {label}
        </label>
      )}

      {/* Panel is portaled to <body> (position:fixed against the trigger rect)
          so it escapes the calculator body's overflow clip. `fontFamily` is
          re-applied here because the portal target sits OUTSIDE this wrapper's
          font-family context. */}
      {mounted && createPortal(
        <AnimatePresence>
          {open && panelPos && (
            <motion.ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={label}
              initial={{ opacity: 0, y: panelPos.flip ? 6 : -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: panelPos.flip ? 6 : -6, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              style={{
                position: 'fixed',
                left: panelPos.left,
                width: panelPos.width,
                ...(panelPos.flip ? { bottom: panelPos.bottom } : { top: panelPos.top }),
                zIndex: 2147483000,
                listStyle: 'none', margin: 0, padding: 4,
                fontFamily,
                background: theme.surface, border: `1px solid ${theme.border}`,
                borderRadius: panelRadius, boxShadow: '0 16px 44px rgba(0,0,0,0.34)',
                maxHeight: panelPos.maxHeight, overflowY: 'auto',
                transformOrigin: panelPos.flip ? 'bottom center' : 'top center',
                boxSizing: 'border-box',
              }}
            >
              {options.map((o, idx) => {
                const isSel = o.id === value;
                const isActive = idx === active;
                return (
                  <li
                    key={o.id}
                    role="option"
                    aria-selected={isSel}
                    data-idx={idx}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => choose(idx)}
                    style={{
                      padding: '9px 12px', borderRadius: optRadius, cursor: 'pointer',
                      fontSize: 14, lineHeight: 1.3,
                      color: isSel ? selectedOptionFg : theme.text,
                      background: isSel ? theme.accent : (isActive ? hoverBg : 'transparent'),
                      transition: 'background 120ms ease',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  >
                    {o.label}
                  </li>
                );
              })}
            </motion.ul>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
