// AddFieldMenu — the type picker dropdown for Build > Fields > "Add field".
//
// Shows 6 field types matching Elfsight's Build tab: slider, number,
// dropdown, choice (radio), imageChoice, heading. The trigger button toggles
// a small popover; clicking a type fires `onPick` with the public type id —
// the parent (`FieldsPanel`) maps it to the canonical TemplateField type and
// appends a sensible default.

import { useEffect, useRef, useState } from 'react';
import { platformTheme } from '@/theme/platformTheme';
import type { PublicFieldType } from './types';

const p = platformTheme;

interface Props {
  onPick: (type: PublicFieldType) => void;
  /** True when there are no fields yet — render as the large empty-state CTA. */
  emphasis?: boolean;
}

const TYPES: ReadonlyArray<{ id: PublicFieldType; label: string; hint: string; icon: string }> = [
  { id: 'slider', label: 'Slider', hint: 'Numeric range input', icon: '⇋' },
  { id: 'number', label: 'Number', hint: 'Exact integer / decimal', icon: '#' },
  { id: 'dropdown', label: 'Dropdown', hint: 'Pick one from a list', icon: '▾' },
  { id: 'choice', label: 'Choice', hint: 'Radio-style options', icon: '◉' },
  { id: 'imageChoice', label: 'Image choice', hint: 'Visual option cards', icon: '◧' },
  { id: 'heading', label: 'Heading', hint: 'Section divider text', icon: 'T' },
];

export default function AddFieldMenu({ onPick, emphasis = false }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="qq-addfield-root" data-testid="add-field-root">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="add-field-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        className={`qq-addfield-trigger${emphasis ? ' is-emphasis' : ''}`}
      >
        <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
        <span>Add field</span>
      </button>

      {open && (
        <div
          role="menu"
          data-testid="add-field-menu"
          className="qq-addfield-menu"
        >
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitem"
              data-testid={`add-field-${t.id}`}
              className="qq-addfield-item"
              onClick={() => { onPick(t.id); setOpen(false); }}
            >
              <span className="qq-addfield-icon" aria-hidden="true">{t.icon}</span>
              <span className="qq-addfield-text">
                <span className="qq-addfield-label">{t.label}</span>
                <span className="qq-addfield-hint">{t.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <style>{`
        .qq-addfield-root { position: relative; display: inline-block; }
        .qq-addfield-trigger {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 12px; border-radius: 8px;
          font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer;
          background: #fff; color: ${p.colors.heading};
          border: 1px dashed ${p.colors.border};
          transition: border-color 0.12s ease, background 0.12s ease, color 0.12s ease;
        }
        .qq-addfield-trigger:hover {
          border-color: ${p.colors.accent};
          color: ${p.colors.accent};
          background: ${p.colors.accentLighter};
        }
        .qq-addfield-trigger.is-emphasis {
          padding: 10px 16px; font-size: 13px;
          background: ${p.colors.accent}; color: #fff;
          border: 1px solid ${p.colors.accent};
          box-shadow: ${p.shadows.button};
        }
        .qq-addfield-trigger.is-emphasis:hover {
          background: ${p.colors.accentDark};
          border-color: ${p.colors.accentDark};
          color: #fff;
          box-shadow: ${p.shadows.buttonHover};
        }
        .qq-addfield-menu {
          position: absolute; left: 0; top: calc(100% + 6px); z-index: 50;
          min-width: 240px; padding: 6px;
          background: #fff; border-radius: 10px;
          border: 1px solid ${p.colors.borderLight};
          box-shadow: ${p.shadows.lg};
          display: flex; flex-direction: column; gap: 2px;
        }
        .qq-addfield-item {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 10px; border-radius: 7px;
          font: inherit; cursor: pointer; text-align: left;
          background: transparent; border: none; color: ${p.colors.body};
          transition: background 0.1s ease;
        }
        .qq-addfield-item:hover { background: ${p.colors.surfaceRaised}; }
        .qq-addfield-icon {
          width: 26px; height: 26px; border-radius: 6px; flex-shrink: 0;
          background: ${p.colors.accentLighter}; color: ${p.colors.accent};
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 700;
        }
        .qq-addfield-text {
          display: flex; flex-direction: column; gap: 1px; min-width: 0;
        }
        .qq-addfield-label {
          font-size: 12.5px; font-weight: 700; color: ${p.colors.heading};
        }
        .qq-addfield-hint {
          font-size: 11px; font-weight: 500; color: ${p.colors.subtle};
        }
      `}</style>
    </div>
  );
}
