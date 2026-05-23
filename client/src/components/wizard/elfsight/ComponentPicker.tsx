// ComponentPicker — BF-10.
//
// Elementor / Webflow / Framer-style component picker. Surfaces an
// anchored popup with categorised components (Inputs / Display / Logic /
// CTA), a sticky search box at the top, and click-to-insert flow.
//
// USAGE
//  - Mount via createPortal in a parent component (PreviewPane is the
//    primary caller). Pass:
//      - anchor: { left, top } in viewport coordinates
//      - onPick(publicType): called when the user picks an entry; the
//        parent decides where to insert
//      - onClose(): close on ESC / click-outside / after insertion
//
// HARD RULES
//  - No new dependencies (lucide-react already in tree).
//  - Mobile (≤768px): full-screen modal with backdrop.
//  - Search filters across labels + descriptions.
//  - Each category is independently fold/unfold (BD-3g fold pattern).
//  - prefers-reduced-motion respected.
//  - Coverage limited to currently-supported PublicFieldType set. Items
//    flagged with `disabled: true` are surfaced as "coming soon" pills so
//    users see the roadmap without being able to insert non-existent
//    field types. This is intentional — the brief listed aspirational
//    components (multi-select, file upload, video embed, formula, etc.)
//    that don't yet exist in the field-type enum.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Sliders, Hash, ChevronDown, CircleDot, Image as ImageIcon, Heading2,
  Layers, FileText, Minus, Type as TypeIcon, Video as VideoIcon,
  GitBranch, Calculator as CalcIcon, MousePointerClick, Link as LinkIcon,
  Mail as MailIcon, X as XIcon, Search as SearchIcon,
  ChevronRight, ChevronDown as ChevronDownToggle,
  type LucideIcon,
} from 'lucide-react';
import { platformTheme } from '@/theme/platformTheme';
import type { PublicFieldType } from './types';

const p = platformTheme;

const MOBILE_BREAKPOINT = 768;

export interface ComponentPickerAnchor {
  /** Viewport-relative left position (px). */
  left: number;
  /** Viewport-relative top position (px). The popup is placed ABOVE this y
   *  on desktop (since drop zones sit between fields and we want the picker
   *  to read as floating off the click target). */
  top: number;
}

interface Props {
  anchor: ComponentPickerAnchor;
  onPick: (type: PublicFieldType) => void;
  onClose: () => void;
}

type CategoryId = 'inputs' | 'display' | 'logic' | 'cta';

interface ComponentEntry {
  id: string;
  label: string;
  hint: string;
  Icon: LucideIcon;
  /** Only entries with a `publicType` are insertable today. */
  publicType?: PublicFieldType;
  /** When true, surface as coming-soon (not insertable). */
  disabled?: boolean;
}

interface CategoryDef {
  id: CategoryId;
  label: string;
  entries: ReadonlyArray<ComponentEntry>;
}

const CATEGORIES: ReadonlyArray<CategoryDef> = [
  {
    id: 'inputs',
    label: 'Inputs',
    entries: [
      // COMPONENTS-1 — text + multi-select went live (publicType wired).
      { id: 'text', label: 'Text field', hint: 'Single-line text input', Icon: TypeIcon, publicType: 'text' },
      { id: 'number', label: 'Number', hint: 'Exact integer / decimal', Icon: Hash, publicType: 'number' },
      { id: 'dropdown', label: 'Dropdown', hint: 'Pick one from a list', Icon: ChevronDown, publicType: 'dropdown' },
      { id: 'multi-select', label: 'Multi-select', hint: 'Pick several from a list', Icon: Layers, publicType: 'multiSelect' },
      { id: 'file', label: 'File upload', hint: 'Image / document attach', Icon: FileText, disabled: true },
      { id: 'slider', label: 'Slider', hint: 'Numeric range input', Icon: Sliders, publicType: 'slider' },
      { id: 'choice', label: 'Choice', hint: 'Radio-style options', Icon: CircleDot, publicType: 'choice' },
      { id: 'imageChoice', label: 'Image choice', hint: 'Visual option cards', Icon: ImageIcon, publicType: 'imageChoice' },
    ],
  },
  {
    id: 'display',
    label: 'Display',
    entries: [
      { id: 'heading', label: 'Heading', hint: 'Section divider text', Icon: Heading2, publicType: 'heading' },
      // COMPONENTS-1 — paragraph / divider / image went live.
      { id: 'paragraph', label: 'Paragraph', hint: 'Block of body copy', Icon: FileText, publicType: 'paragraph' },
      { id: 'divider', label: 'Divider', hint: 'Horizontal rule', Icon: Minus, publicType: 'divider' },
      { id: 'image', label: 'Image', hint: 'Inline image', Icon: ImageIcon, publicType: 'image' },
      { id: 'video', label: 'Video embed', hint: 'YouTube / Vimeo', Icon: VideoIcon, disabled: true },
    ],
  },
  {
    id: 'logic',
    label: 'Logic',
    entries: [
      { id: 'conditional', label: 'Conditional section', hint: 'Show / hide based on answers', Icon: GitBranch, disabled: true },
      { id: 'calc', label: 'Calculation formula', hint: 'Math formula on field values', Icon: CalcIcon, disabled: true },
    ],
  },
  {
    id: 'cta',
    label: 'CTA',
    entries: [
      { id: 'button', label: 'Button', hint: 'Action / submit', Icon: MousePointerClick, disabled: true },
      { id: 'link', label: 'Link', hint: 'External anchor', Icon: LinkIcon, disabled: true },
      { id: 'contact', label: 'Contact form', hint: 'Name + email + message', Icon: MailIcon, disabled: true },
    ],
  },
];

export default function ComponentPicker({ anchor, onPick, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [folded, setFolded] = useState<Record<CategoryId, boolean>>({
    inputs: false, display: false, logic: false, cta: false,
  });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
  });
  const [placed, setPlaced] = useState<{ left: number; top: number } | null>(null);

  // Track viewport size — desktop popup vs mobile full-screen modal.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);

  // Compute clamped position on desktop. We anchor ABOVE the click point so
  // the picker reads as floating off the drop zone (Elementor pattern). If
  // not enough room above, flip to below.
  useLayoutEffect(() => {
    if (isMobile) return;
    const POPUP_W = 360;
    const POPUP_H_EST = 420;
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = anchor.left - POPUP_W / 2;
    if (left < margin) left = margin;
    if (left + POPUP_W > vw - margin) left = vw - POPUP_W - margin;
    let top = anchor.top - POPUP_H_EST - 12;
    if (top < margin) {
      // No room above — flip below.
      top = anchor.top + 12;
      if (top + POPUP_H_EST > vh - margin) top = Math.max(margin, vh - POPUP_H_EST - margin);
    }
    setPlaced({ left, top });
  }, [anchor.left, anchor.top, isMobile]);

  // Focus search input on open.
  useEffect(() => {
    const id = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  // Lock body scroll while the mobile modal is open.
  useEffect(() => {
    if (!isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isMobile]);

  // Close on Escape + click outside (desktop only; mobile modal closes via
  // explicit backdrop / cancel button).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (isMobile) return;
    const onDown = (e: MouseEvent | PointerEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [isMobile, onClose]);

  // Filter entries by search; categories with zero matches stay visible but
  // empty (so users see their structure). When the search is empty we render
  // each category respecting its fold state.
  const filtered = useMemo<ReadonlyArray<{ cat: CategoryDef; entries: ComponentEntry[] }>>(() => {
    const q = search.trim().toLowerCase();
    return CATEGORIES.map(cat => {
      let entries: ComponentEntry[] = [...cat.entries];
      if (q !== '') {
        entries = entries.filter(e =>
          e.label.toLowerCase().includes(q)
          || e.hint.toLowerCase().includes(q)
          || e.id.toLowerCase().includes(q),
        );
      }
      return { cat, entries };
    });
  }, [search]);

  const reduceMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch { return false; }
  }, []);

  const toggleFold = (id: CategoryId) => {
    setFolded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handlePick = (entry: ComponentEntry) => {
    if (entry.disabled || !entry.publicType) return;
    onPick(entry.publicType);
    onClose();
  };

  // Auto-unfold a category when the search query has matches in it (so users
  // see results immediately without expanding folded sections manually).
  const isSearchActive = search.trim() !== '';

  const body = (
    <div
      ref={rootRef}
      data-theme="light"
      className={`qq-comppicker${isMobile ? ' is-mobile' : ' is-desktop'}`}
      data-testid="component-picker"
      role="dialog"
      aria-modal={isMobile ? true : undefined}
      aria-label="Add component"
      style={isMobile ? undefined : placed ? {
        position: 'fixed', left: placed.left, top: placed.top,
        width: 360, maxHeight: 'min(420px, calc(100vh - 24px))',
      } : { visibility: 'hidden', position: 'fixed', left: 0, top: 0 }}
    >
      <header className="qq-comppicker-header">
        <div className="qq-comppicker-search">
          <SearchIcon size={14} aria-hidden="true" className="qq-comppicker-search-icon" />
          <input
            ref={searchInputRef}
            type="text"
            className="qq-comppicker-search-input"
            placeholder="Search components"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="component-picker-search"
            aria-label="Search components"
          />
        </div>
        <button
          type="button"
          className="qq-comppicker-close"
          onClick={onClose}
          aria-label="Close component picker"
          data-testid="component-picker-close"
        >
          <XIcon size={14} aria-hidden="true" />
        </button>
      </header>
      <div className="qq-comppicker-body">
        {filtered.map(({ cat, entries }) => {
          const isFolded = !isSearchActive && folded[cat.id];
          return (
            <section
              key={cat.id}
              className={`qq-comppicker-cat${isFolded ? ' is-folded' : ''}`}
              data-testid={`component-picker-cat-${cat.id}`}
            >
              <button
                type="button"
                className="qq-comppicker-cat-header"
                onClick={() => toggleFold(cat.id)}
                aria-expanded={!isFolded}
                data-testid={`component-picker-cat-header-${cat.id}`}
              >
                {isFolded
                  ? <ChevronRight size={12} aria-hidden="true" />
                  : <ChevronDownToggle size={12} aria-hidden="true" />}
                <span>{cat.label}</span>
                <span className="qq-comppicker-cat-count">{entries.length}</span>
              </button>
              {!isFolded && (
                <div className="qq-comppicker-cat-grid">
                  {entries.length === 0 ? (
                    <p className="qq-comppicker-empty">No matches</p>
                  ) : entries.map(e => {
                    const { Icon } = e;
                    return (
                      <button
                        key={e.id}
                        type="button"
                        className={`qq-comppicker-item${e.disabled ? ' is-disabled' : ''}`}
                        onClick={() => handlePick(e)}
                        disabled={e.disabled}
                        title={e.disabled ? 'Coming soon' : e.hint}
                        data-testid={`component-picker-item-${e.id}`}
                        data-disabled={e.disabled ? 'true' : 'false'}
                      >
                        <span className="qq-comppicker-item-icon" aria-hidden="true">
                          <Icon size={16} strokeWidth={2} />
                        </span>
                        <span className="qq-comppicker-item-text">
                          <span className="qq-comppicker-item-label">{e.label}</span>
                          <span className="qq-comppicker-item-hint">{e.hint}</span>
                        </span>
                        {e.disabled && (
                          <span className="qq-comppicker-soon">SOON</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {isMobile && (
        <footer className="qq-comppicker-footer">
          <button
            type="button"
            className="qq-comppicker-cancel"
            onClick={onClose}
            data-testid="component-picker-cancel"
          >Cancel</button>
        </footer>
      )}

      <style>{`
        .qq-comppicker {
          background: #fff; color: ${p.colors.body};
          font: inherit;
          z-index: 1300;
          display: flex; flex-direction: column;
        }
        .qq-comppicker.is-desktop {
          border-radius: 12px;
          border: 1px solid ${p.colors.borderLight};
          box-shadow: 0 12px 32px rgba(15,23,42,0.18);
          overflow: hidden;
          animation: ${reduceMotion ? 'none' : 'qq-comppicker-fade 140ms ease-out'};
        }
        .qq-comppicker.is-mobile {
          position: fixed; inset: 0;
          z-index: 1300;
          animation: ${reduceMotion ? 'none' : 'qq-comppicker-slide 180ms ease-out'};
        }
        @keyframes qq-comppicker-fade {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes qq-comppicker-slide {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .qq-comppicker-header {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 10px;
          background: #fafbfc;
          border-bottom: 1px solid ${p.colors.borderLight};
          flex-shrink: 0;
        }
        .qq-comppicker-search {
          flex: 1; position: relative;
          display: flex; align-items: center;
        }
        .qq-comppicker-search-icon {
          position: absolute; left: 8px; top: 50%;
          transform: translateY(-50%);
          color: ${p.colors.subtle};
          pointer-events: none;
        }
        .qq-comppicker-search-input {
          width: 100%; box-sizing: border-box;
          padding: 7px 8px 7px 28px;
          font: inherit; font-size: 12.5px;
          color: ${p.colors.body};
          background: #fff;
          border: 1px solid ${p.colors.border};
          border-radius: 6px; outline: none;
          transition: border-color 0.1s ease, box-shadow 0.1s ease;
        }
        .qq-comppicker-search-input:focus {
          border-color: ${p.colors.accent};
          box-shadow: 0 0 0 3px ${p.colors.accentLighter};
        }
        .qq-comppicker-close {
          width: 26px; height: 26px;
          display: inline-flex; align-items: center; justify-content: center;
          background: transparent; border: none; border-radius: 6px;
          color: ${p.colors.subtle}; cursor: pointer;
        }
        .qq-comppicker-close:hover {
          background: ${p.colors.accentLighter};
          color: ${p.colors.accent};
        }
        .qq-comppicker-body {
          overflow-y: auto;
          padding: 6px 6px 8px;
          display: flex; flex-direction: column; gap: 2px;
        }
        .qq-comppicker.is-mobile .qq-comppicker-body {
          flex: 1;
        }
        .qq-comppicker-cat {
          display: flex; flex-direction: column;
          padding: 2px 4px;
        }
        .qq-comppicker-cat-header {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 4px;
          font: inherit; font-size: 10.5px; font-weight: 700;
          letter-spacing: 0.05em; text-transform: uppercase;
          color: ${p.colors.muted};
          background: transparent; border: 0;
          cursor: pointer; text-align: left;
          border-radius: 4px;
        }
        .qq-comppicker-cat-header:hover { color: ${p.colors.accent}; }
        .qq-comppicker-cat-count {
          margin-left: auto;
          font-size: 9.5px; font-weight: 700;
          padding: 1px 6px; border-radius: 999px;
          background: ${p.colors.accentLighter}; color: ${p.colors.accent};
        }
        .qq-comppicker-cat-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 4px;
          padding: 2px 0 6px;
        }
        @media (max-width: ${MOBILE_BREAKPOINT}px) {
          .qq-comppicker-cat-grid {
            grid-template-columns: minmax(0, 1fr);
          }
        }
        .qq-comppicker-item {
          position: relative;
          display: flex; align-items: center; gap: 8px;
          padding: 8px 10px;
          font: inherit; text-align: left;
          background: #fff;
          border: 1px solid ${p.colors.borderLight};
          border-radius: 8px;
          color: ${p.colors.body};
          cursor: pointer;
          transition: ${reduceMotion ? 'none' : 'background 0.12s, border-color 0.12s, transform 0.12s'};
        }
        .qq-comppicker-item:not(:disabled):hover,
        .qq-comppicker-item:not(:disabled):focus-visible {
          background: ${p.colors.accentLighter};
          border-color: ${p.colors.accent};
          outline: none;
        }
        .qq-comppicker-item.is-disabled {
          opacity: 0.55; cursor: not-allowed;
        }
        .qq-comppicker-item-icon {
          width: 28px; height: 28px; border-radius: 6px;
          flex-shrink: 0;
          display: inline-flex; align-items: center; justify-content: center;
          background: ${p.colors.accentLighter}; color: ${p.colors.accent};
        }
        .qq-comppicker-item:hover:not(:disabled) .qq-comppicker-item-icon {
          background: ${p.colors.accent}; color: #fff;
        }
        .qq-comppicker-item-text {
          display: flex; flex-direction: column; gap: 1px; min-width: 0;
          flex: 1;
        }
        .qq-comppicker-item-label {
          font-size: 12px; font-weight: 700; color: ${p.colors.heading};
          line-height: 1.25;
        }
        .qq-comppicker-item-hint {
          font-size: 10.5px; color: ${p.colors.subtle}; line-height: 1.25;
        }
        .qq-comppicker-soon {
          font-size: 9px; font-weight: 700;
          letter-spacing: 0.04em;
          padding: 2px 5px; border-radius: 999px;
          background: ${p.colors.surfaceRaised};
          color: ${p.colors.muted};
        }
        .qq-comppicker-empty {
          margin: 4px 6px; font-size: 11.5px;
          color: ${p.colors.subtle};
        }
        .qq-comppicker-footer {
          padding: 8px; flex-shrink: 0;
          border-top: 1px solid ${p.colors.borderLight};
          background: #fafbfc;
        }
        .qq-comppicker-cancel {
          width: 100%; min-height: 44px;
          font: inherit; font-size: 13.5px; font-weight: 700;
          background: ${p.colors.surfaceRaised};
          color: ${p.colors.heading};
          border: 1px solid ${p.colors.borderLight};
          border-radius: 10px;
          cursor: pointer;
        }
        @media (prefers-reduced-motion: reduce) {
          .qq-comppicker, .qq-comppicker-item { animation: none; transition: none; }
        }
      `}</style>
    </div>
  );

  if (typeof document === 'undefined') return null;

  if (isMobile) {
    return createPortal(
      <div
        className="qq-comppicker-backdrop"
        data-testid="component-picker-backdrop"
        role="presentation"
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        {body}
        <style>{`
          .qq-comppicker-backdrop {
            position: fixed; inset: 0; z-index: 1290;
            background: rgba(15,23,42,0.55);
          }
        `}</style>
      </div>,
      document.body,
    );
  }

  return createPortal(body, document.body);
}
