// TemplateGallery — Wave H7.
//
// Two surfaces, sharing the same card layout:
//
//  - <TemplateStrip/> — slim, single-row horizontal scroller mounted at the
//    TOP of the Build tab. The first card is "Start blank"; the rest are
//    the TEMPLATE_PRESETS in catalogue order. A "Browse all" button opens
//    the modal below for vertical / categorised browsing.
//
//  - <TemplateBrowseModal/> — vertical browser shown over the editor when
//    the user wants the full list. Categorised by `TemplateConfig.category`,
//    closed via × or backdrop click. No new deps.
//
// Card click applies the template via `onApplyTemplate(template)` —
// WizardShell replaces fields / calculations / layout / header / results
// from `getTemplatePreset(id)`. The blank card calls with `null`.
//
// Mobile: same horizontal scroller. Drag-to-scroll on mouse, native
// touch swipe on phones. The Browse-all modal is full-screen on phones.

import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { platformTheme } from '@/theme/platformTheme';
import { dashboardTheme } from '@/theme/dashboardTheme';
import {
  TEMPLATE_PRESETS, getTemplateCategories, type TemplateConfig,
} from '@shared/templatePresets';

const p = platformTheme;
const d = dashboardTheme;

/** What WizardShell needs to know to apply a template — null = start blank. */
export type ApplyTemplatePayload = TemplateConfig | null;

/* ───────────────────────────────────────────────────────────── */
/* Mini-mockup card preview — no external deps; pure CSS shapes. */
/* ───────────────────────────────────────────────────────────── */

interface MockupProps {
  /** Accent stripe colour for the card top — keeps cards visually distinct. */
  accent: string;
}

/**
 * Tiny inline mockup — a header stripe + two faux input rows + a CTA bar.
 * Standalone (no dependency on H1 `PreviewPane`) so the gallery can render
 * 100+ cards without spinning up the live AdvancedCalculator per card.
 */
function TemplateCardMockup({ accent }: MockupProps) {
  return (
    <div className="qq-tg-mockup" aria-hidden="true">
      <div className="qq-tg-mockup-header" style={{ background: accent }} />
      <div className="qq-tg-mockup-row" />
      <div className="qq-tg-mockup-row" style={{ width: '70%' }} />
      <div className="qq-tg-mockup-cta" style={{ background: accent }} />
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── */
/* TemplateStrip — horizontal scrolling row at the top of Build. */
/* ───────────────────────────────────────────────────────────── */

interface StripProps {
  /** When non-null, the card with this id gets the "is-active" ring. */
  activeTemplateId?: string;
  /** Called with the picked template, or null for "Start blank". */
  onApplyTemplate: (next: ApplyTemplatePayload) => void;
}

/** Returns a stable hue for a given template id so cards look distinct. */
function templateAccent(id: string): string {
  // Hash id → hue [0, 360). Deterministic, no deps.
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

export default function TemplateStrip({ activeTemplateId, onApplyTemplate }: StripProps) {
  const [open, setOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Mouse-drag-to-scroll. Touch-swipe is native to overflow-x: auto on
  // mobile so we only special-case desktop pointer drag.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    const onDown = (e: MouseEvent) => {
      isDown = true;
      el.classList.add('is-dragging');
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
    };
    const onLeave = () => { isDown = false; el.classList.remove('is-dragging'); };
    const onUp = () => { isDown = false; el.classList.remove('is-dragging'); };
    const onMove = (e: MouseEvent) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - el.offsetLeft;
      const walk = (x - startX) * 1.2;
      el.scrollLeft = scrollLeft - walk;
    };
    el.addEventListener('mousedown', onDown);
    el.addEventListener('mouseleave', onLeave);
    el.addEventListener('mouseup', onUp);
    el.addEventListener('mousemove', onMove);
    return () => {
      el.removeEventListener('mousedown', onDown);
      el.removeEventListener('mouseleave', onLeave);
      el.removeEventListener('mouseup', onUp);
      el.removeEventListener('mousemove', onMove);
    };
  }, []);

  return (
    <section
      className="qq-tg-strip-section"
      data-testid="template-strip-section"
      aria-label="Start from a template"
    >
      <div className="qq-tg-strip-header">
        <div>
          <h3 className="qq-tg-strip-h">Start from a template</h3>
          {/* Wave L T1 — subtitle removed. The section title alone is enough;
           * the strip below already shows the templates and a card count
           * isn't critical context. */}
        </div>
        <button
          type="button"
          className="qq-tg-browse-all"
          onClick={() => setOpen(true)}
          data-testid="template-browse-all"
        >
          Browse all
        </button>
      </div>

      <div
        ref={scrollerRef}
        className="qq-tg-strip"
        data-testid="template-strip-scroller"
        role="list"
        tabIndex={0}
      >
        {/* "Start blank" card — always first. */}
        <button
          type="button"
          className={`qq-tg-card qq-tg-card-blank${!activeTemplateId ? ' is-active' : ''}`}
          data-testid="template-card-blank"
          onClick={() => onApplyTemplate(null)}
          role="listitem"
        >
          <div className="qq-tg-mockup qq-tg-mockup-blank" aria-hidden="true">
            <span className="qq-tg-plus">+</span>
          </div>
          <div className="qq-tg-card-body">
            <span className="qq-tg-card-name">Start blank</span>
            <span className="qq-tg-card-tags">Custom build</span>
          </div>
        </button>

        {TEMPLATE_PRESETS.map((t) => {
          const accent = templateAccent(t.id);
          const isActive = t.id === activeTemplateId;
          const tradeTags = (t.trades ?? []).slice(0, 2).join(', ');
          return (
            <button
              key={t.id}
              type="button"
              className={`qq-tg-card${isActive ? ' is-active' : ''}`}
              data-testid={`template-strip-card-${t.id}`}
              onClick={() => onApplyTemplate(t)}
              role="listitem"
            >
              <TemplateCardMockup accent={accent} />
              <div className="qq-tg-card-body">
                <span className="qq-tg-card-name">{t.name}</span>
                <span className="qq-tg-card-tags">{tradeTags || t.category}</span>
              </div>
            </button>
          );
        })}
      </div>

      {open && (
        <TemplateBrowseModal
          onClose={() => setOpen(false)}
          onApplyTemplate={(payload) => {
            onApplyTemplate(payload);
            setOpen(false);
          }}
          activeTemplateId={activeTemplateId}
        />
      )}

      <style>{`
        .qq-tg-strip-section { display: flex; flex-direction: column; gap: 10px; }
        .qq-tg-strip-header {
          display: flex; align-items: flex-end; justify-content: space-between;
          gap: 12px;
        }
        .qq-tg-strip-h {
          font-size: 13px; font-weight: 700; color: ${p.colors.heading};
          margin: 0 0 2px; letter-spacing: -0.005em;
        }
        .qq-tg-strip-sub {
          font-size: 11.5px; color: ${p.colors.muted}; margin: 0;
        }
        /* Wave L T2 — smaller "Browse all" — closer to secondary-link weight
         * than a card-CTA button. Reduced font, padding, and min-height. */
        .qq-tg-browse-all {
          font: inherit; font-size: 11.5px; font-weight: 600;
          color: ${p.colors.accent}; background: transparent;
          border: 1px solid ${p.colors.border}; border-radius: 6px;
          padding: 4px 9px; cursor: pointer;
          min-height: 26px; white-space: nowrap;
          transition: background 0.12s ease, border-color 0.12s ease;
        }
        .qq-tg-browse-all:hover {
          background: ${p.colors.surfaceRaised};
          border-color: ${p.colors.accent};
        }

        /* The strip: single row, horizontal scroll. */
        .qq-tg-strip {
          display: flex; flex-direction: row; flex-wrap: nowrap;
          gap: 10px;
          overflow-x: auto;
          overflow-y: hidden;
          padding: 4px 2px 12px;
          scroll-snap-type: x proximity;
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
        }
        .qq-tg-strip.is-dragging { cursor: grabbing; user-select: none; }
        .qq-tg-strip::-webkit-scrollbar { height: 6px; }
        .qq-tg-strip::-webkit-scrollbar-thumb {
          background: ${p.colors.border}; border-radius: 3px;
        }

        .qq-tg-card {
          flex: 0 0 auto;
          width: 156px;
          background: #fff;
          border: 1px solid ${p.colors.border};
          border-radius: 10px;
          padding: 8px;
          display: flex; flex-direction: column; gap: 6px;
          cursor: pointer;
          scroll-snap-align: start;
          text-align: left;
          font: inherit;
          transition: border-color 0.12s ease, box-shadow 0.12s ease, transform 0.06s ease;
        }
        .qq-tg-card:hover {
          border-color: ${p.colors.accent};
          box-shadow: ${p.shadows.button};
        }
        .qq-tg-card.is-active {
          border-color: ${p.colors.accent};
          box-shadow: 0 0 0 2px ${p.colors.accentLighter};
        }
        .qq-tg-card-body {
          display: flex; flex-direction: column; gap: 2px;
          padding: 2px 2px 4px;
          min-height: 36px;
        }
        .qq-tg-card-name {
          font-size: 12px; font-weight: 700; color: ${p.colors.heading};
          line-height: 1.3;
          overflow: hidden; text-overflow: ellipsis;
          display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;
        }
        .qq-tg-card-tags {
          font-size: 10.5px; font-weight: 600; color: ${p.colors.muted};
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        /* Mini-mockup. */
        .qq-tg-mockup {
          width: 100%; height: 76px;
          background: ${d.colors.canvas};
          border-radius: 6px;
          padding: 8px;
          box-sizing: border-box;
          display: flex; flex-direction: column; gap: 4px;
          overflow: hidden;
          position: relative;
        }
        .qq-tg-mockup-header {
          height: 8px; width: 60%; border-radius: 2px;
        }
        .qq-tg-mockup-row {
          height: 5px; width: 100%; border-radius: 2px;
          background: ${p.colors.borderLight};
        }
        .qq-tg-mockup-cta {
          height: 10px; width: 40%; border-radius: 3px;
          margin-top: auto;
        }
        .qq-tg-mockup-blank {
          display: flex; align-items: center; justify-content: center;
        }
        .qq-tg-plus {
          font-size: 28px; font-weight: 300; color: ${p.colors.muted};
          line-height: 1;
        }

        /* Mobile — slightly smaller cards. Wave L T2: the smaller browse-all
         * still meets the 32px tap-target threshold (Apple HIG; not 44 in
         * this context because it's a tertiary navigation control, not a
         * primary action). */
        @media (max-width: 768px) {
          .qq-tg-card { width: 140px; min-height: 44px; }
          .qq-tg-browse-all { min-height: 32px; padding: 4px 10px; font-size: 12px; }
        }
      `}</style>
    </section>
  );
}

/* ───────────────────────────────────────────────────────────── */
/* TemplateBrowseModal — full-list categorised browser.          */
/* ───────────────────────────────────────────────────────────── */

interface ModalProps {
  activeTemplateId?: string;
  onClose: () => void;
  onApplyTemplate: (next: ApplyTemplatePayload) => void;
}

function TemplateBrowseModal({ activeTemplateId, onClose, onApplyTemplate }: ModalProps) {
  const categories = useMemo(() => getTemplateCategories(), []);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  // Wave M — search field (case-insensitive substring on name). Combines
  // with the active category (AND logic).
  const [search, setSearch] = useState<string>('');

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byCat = activeCategory === 'All'
      ? TEMPLATE_PRESETS
      : TEMPLATE_PRESETS.filter((t) => t.category === activeCategory);
    if (!q) return byCat;
    return byCat.filter((t) => t.name.toLowerCase().includes(q));
  }, [activeCategory, search]);

  // ESC to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="qq-tg-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Browse all templates"
      data-testid="template-browse-modal"
      onClick={onClose}
    >
      <div
        className="qq-tg-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="qq-tg-modal-header">
          <h2 className="qq-tg-modal-title">Browse all templates</h2>
          <button
            type="button"
            className="qq-tg-modal-close"
            onClick={onClose}
            aria-label="Close template browser"
            data-testid="template-browse-close"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {/* Wave M — search field. Filters by template name (case-insensitive
            substring) and combines with the active category. */}
        <div className="qq-tg-modal-search">
          <input
            type="search"
            className="qq-tg-modal-search-input"
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search templates"
            data-testid="template-browse-search"
          />
        </div>
        {/* Wave Q-Hotfix — category filter is now a dropdown <select>
            (per user request). The previous Wave M chips strip was
            scroll-x with a fade mask; the dropdown is more compact and
            doesn't require horizontal swiping to discover categories. */}
        <div className="qq-tg-modal-filter-row">
          <label
            htmlFor="qq-tg-modal-cat-select"
            className="qq-tg-modal-filter-label"
          >
            Filter
          </label>
          <select
            id="qq-tg-modal-cat-select"
            className="qq-tg-modal-cat-select"
            value={activeCategory}
            onChange={(e) => setActiveCategory(e.target.value)}
            data-testid="template-browse-cat-select"
            aria-label="Filter templates by category"
          >
            <option value="All">All categories ({TEMPLATE_PRESETS.length})</option>
            {categories.map((c) => {
              const count = TEMPLATE_PRESETS.filter((t) => t.category === c).length;
              return (
                <option key={c} value={c}>
                  {c} ({count})
                </option>
              );
            })}
          </select>
        </div>
        <div className="qq-tg-modal-grid" data-testid="template-browse-grid">
          {visible.map((t) => {
            const accent = templateAccent(t.id);
            const isActive = t.id === activeTemplateId;
            // Wave M — subtitle (trade tags) removed; name + mockup only.
            return (
              <button
                key={t.id}
                type="button"
                className={`qq-tg-card qq-tg-card--no-sub${isActive ? ' is-active' : ''}`}
                data-testid={`template-browse-card-${t.id}`}
                onClick={() => onApplyTemplate(t)}
              >
                <TemplateCardMockup accent={accent} />
                <div className="qq-tg-card-body">
                  <span className="qq-tg-card-name">{t.name}</span>
                </div>
              </button>
            );
          })}
          {visible.length === 0 && (
            <p className="qq-tg-modal-empty" data-testid="template-browse-empty">
              No templates match "{search}".
            </p>
          )}
        </div>
      </div>

      <style>{`
        .qq-tg-modal-backdrop {
          position: fixed; inset: 0; z-index: 1200;
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(2px);
          -webkit-backdrop-filter: blur(2px);
          display: flex; align-items: center; justify-content: center;
          padding: 24px;
        }
        .qq-tg-modal {
          background: #fff; border-radius: 14px;
          /* Wave R-pre v2 — tightened from 880 to 720 max-width and added
           * 78vh max-height on desktop so the modal doesn't dominate the
           * screen. The audit pass found the old 880×86vh was felt as
           * "huge" relative to the actual content shown. */
          width: 100%; max-width: 720px;
          max-height: 78vh; display: flex; flex-direction: column;
          box-shadow: ${p.shadows.xl};
          overflow: hidden;
        }
        .qq-tg-modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 18px;
          border-bottom: 1px solid ${p.colors.borderLight};
        }
        .qq-tg-modal-title {
          margin: 0; font-size: 14px; font-weight: 800; color: ${p.colors.heading};
        }
        /* Wave R-pre v2 — close button restyled. Was 32×32 round, muted
         * grey, hard to spot. Now 40×40, heading-coloured X icon, with a
         * subtle background ring + a clear surfaceRaised hover. */
        .qq-tg-modal-close {
          width: 40px; height: 40px; border-radius: 50%;
          background: ${p.colors.surfaceRaised};
          border: 1px solid ${p.colors.border};
          color: ${p.colors.heading};
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
        }
        .qq-tg-modal-close:hover {
          background: ${p.colors.danger ?? '#dc2626'};
          border-color: ${p.colors.danger ?? '#dc2626'};
          color: #fff;
        }
        .qq-tg-modal-close:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px ${p.colors.accentLighter};
        }
        /* Wave M — search bar above the category chips. */
        .qq-tg-modal-search {
          padding: 12px 18px 4px;
          flex-shrink: 0;
        }
        .qq-tg-modal-search-input {
          width: 100%; box-sizing: border-box;
          font: inherit; font-size: 13px;
          padding: 9px 12px;
          border: 1px solid ${p.colors.border};
          border-radius: 9px;
          background: #fff; color: ${p.colors.heading};
          transition: border-color 0.12s ease, box-shadow 0.12s ease;
        }
        .qq-tg-modal-search-input::placeholder {
          color: ${p.colors.muted};
        }
        .qq-tg-modal-search-input:focus {
          outline: none;
          border-color: ${p.colors.accent};
          box-shadow: 0 0 0 3px ${p.colors.accentLighter};
        }
        /* Wave Q-Hotfix — dropdown filter (replaces Wave M chips). */
        .qq-tg-modal-filter-row {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 18px;
          border-bottom: 1px solid ${p.colors.borderLight};
          flex-shrink: 0;
        }
        .qq-tg-modal-filter-label {
          font-size: 11.5px; font-weight: 700;
          color: ${p.colors.muted};
          text-transform: uppercase; letter-spacing: 0.04em;
          flex-shrink: 0;
        }
        .qq-tg-modal-cat-select {
          flex: 1; min-width: 0;
          font: inherit; font-size: 13px; font-weight: 600;
          color: ${p.colors.heading};
          background: #fff;
          border: 1px solid ${p.colors.border};
          border-radius: 8px;
          padding: 8px 12px; min-height: 38px;
          cursor: pointer;
          outline: none;
        }
        .qq-tg-modal-cat-select:focus {
          border-color: ${p.colors.accent};
        }
        .qq-tg-modal-grid {
          padding: 16px 18px 24px;
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
          grid-auto-rows: 1fr;
          overflow-y: auto;
        }
        /* Wave R-pre W-CARDS — force equal card heights per row.
         * grid-auto-rows: 1fr above makes every row in the modal grid
         * stretch to the tallest cell. The card itself is already a
         * column flex container, so stretching is automatic. We also
         * pin a min-height on the card so very short single-line
         * titles still hit a consistent baseline when a row contains
         * only short titles (no 2-line peer to stretch against). */
        .qq-tg-modal-grid .qq-tg-card,
        .qq-tg-modal-grid .qq-tg-card--no-sub {
          height: 100%;
          min-height: 150px;
        }
        /* Wave R-pre v2 — name-only cards inside the browse modal.
         * Previous version (Wave Q-Hotfix) bumped title weight + size,
         * but 1-line vs 2-line titles still rendered at the TOP of a
         * fixed-height card body — making rows look misaligned. Now
         * the body is a centered flex container with a stable 48px
         * min-height so both 1-line and 2-line titles share the same
         * row baseline. */
        .qq-tg-card--no-sub .qq-tg-card-body {
          min-height: 48px;
          padding: 8px 6px 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex: 1 1 auto;
        }
        .qq-tg-card--no-sub .qq-tg-card-name {
          font-size: 13px;
          font-weight: 700;
          color: ${p.colors.heading};
          line-height: 1.3;
          -webkit-line-clamp: 2;
          white-space: normal;
          text-align: center;
          width: 100%;
        }
        .qq-tg-modal-empty {
          grid-column: 1 / -1;
          text-align: center;
          font-size: 12.5px; color: ${p.colors.muted};
          padding: 28px 8px;
          margin: 0;
        }
        @media (max-width: 768px) {
          .qq-tg-modal-backdrop { padding: 8px; }
          .qq-tg-modal { max-height: 96vh; }
          .qq-tg-modal-grid { grid-template-columns: repeat(2, 1fr); }
          .qq-tg-modal-close { min-width: 44px; min-height: 44px; }
          .qq-tg-modal-search { padding: 10px 12px 4px; }
          .qq-tg-modal-search-input { padding: 11px 12px; min-height: 44px; }
          .qq-tg-modal-filter-row { padding: 10px 12px; }
          .qq-tg-modal-cat-select { min-height: 44px; font-size: 14px; }
        }
      `}</style>
    </div>
  );
}
