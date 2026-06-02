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
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { WidgetTheme } from './widgetThemes';

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
}

export default function WidgetSelect({
  id, value, options, onChange, label, theme, inputBase, radiusPx, fontFamily, labelColor,
}: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selectedIdx = Math.max(0, options.findIndex((o) => o.id === value));
  const selectedLabel = options[selectedIdx]?.label ?? '';

  // Open → focus the active (selected) option for keyboard nav.
  useEffect(() => {
    if (open) setActive(selectedIdx);
  }, [open, selectedIdx]);

  // Click-outside + Escape close.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
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

  return (
    <div ref={wrapRef} style={{ position: 'relative', fontFamily }}>
      <button
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
          paddingTop: 20, paddingBottom: 5, paddingRight: 12,
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

      {/* Floated title-in-field label (always floated for a select). */}
      <label
        htmlFor={id}
        style={{
          position: 'absolute', left: 14, top: 4, fontSize: 12, fontWeight: 800,
          letterSpacing: '0.015em', color: labelColor, pointerEvents: 'none',
          textShadow: '0 1px 2px rgba(0,0,0,0.55)', lineHeight: 1, background: 'transparent', padding: '0 2px',
        }}
      >
        {label}
      </label>

      <AnimatePresence>
        {open && (
          <motion.ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 60,
              listStyle: 'none', margin: 0, padding: 4,
              background: theme.surface, border: `1px solid ${theme.border}`,
              borderRadius: panelRadius, boxShadow: '0 16px 44px rgba(0,0,0,0.34)',
              maxHeight: 248, overflowY: 'auto', transformOrigin: 'top center',
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
                    color: isSel ? 'rgba(255,255,255,1)' : theme.text,
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
      </AnimatePresence>
    </div>
  );
}
