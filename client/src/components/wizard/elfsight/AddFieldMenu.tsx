// AddFieldMenu — type picker for Build > Fields > "Add field".
//
// Surfaces the FULL component palette — input, display, and CTA types — so an
// owner working only in the Build tab can reach every component the in-preview
// ComponentPicker offers (no Build-tab-only gaps). The trigger button toggles a
// popover; clicking a type fires `onPick` with the public type id and the parent
// (`FieldsPanel`) maps it to the canonical TemplateField via makeField() and
// appends it. The TYPES list below is kept label-for-label in sync with
// ComponentPicker's CATEGORIES so the two menus describe the same components
// identically.
//
// Wave I:
//  - (e) Renders into a React PORTAL on document.body, positioned via the
//    trigger's `getBoundingClientRect()`. This kills the pane-clipping bug
//    where the popover got cropped by the left pane / mobile viewport.
//  - (e) On mobile (≤768px), the menu renders as a full-width BOTTOM SHEET
//    with large tap targets and a backdrop instead of a fiddly dropdown.
//  - (b) Each menu item is also a draggable source via @dnd-kit's
//    `useDraggable`. Dragging an item over the preview pane (DnD root in
//    WizardShell) drops a new field at that position. The simple click-pick
//    path stays the dominant interaction — drag is a power-user shortcut.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDraggable } from '@dnd-kit/core';
import {
  Sliders, Hash, ChevronDown, CircleDot, Image as ImageIcon, Heading2,
  Type as TypeIcon, ToggleLeft as ToggleIcon, Layers, Mail as MailIcon,
  MapPin, Table, Camera,
  FileText, Minus, Video as VideoIcon, MousePointerClick, Link as LinkIcon,
  type LucideIcon,
} from 'lucide-react';
import { platformTheme } from '@/theme/platformTheme';
import { DND_CONTAINERS } from './dnd';
import type { PublicFieldType } from './types';

const p = platformTheme;

interface Props {
  onPick: (type: PublicFieldType) => void;
  /** True when there are no fields yet — render as the large empty-state CTA. */
  emphasis?: boolean;
}

interface TypeMeta {
  id: PublicFieldType;
  label: string;
  /** Short tagline still shown under the label. */
  hint: string;
  /** 8-15 word plain-English description. */
  description: string;
  /** Optional "Recommended for…" badge shown on hover/focus. */
  recommendedFor?: string;
  Icon: LucideIcon;
}

const TYPES: ReadonlyArray<TypeMeta> = [
  {
    id: 'slider',
    label: 'Slider',
    hint: 'Numeric range input',
    description: 'Customer drags a slider. Best for ranges with a min and max.',
    recommendedFor: 'area / square footage',
    Icon: Sliders,
  },
  {
    id: 'number',
    label: 'Number',
    hint: 'Exact integer / decimal',
    description: 'Customer types an exact number. Multiplies their total in the quote.',
    recommendedFor: 'quantity / count',
    Icon: Hash,
  },
  {
    id: 'dropdown',
    label: 'Dropdown',
    hint: 'Pick one from a list',
    description: 'Customer picks one option from a list. Each option has its own price.',
    recommendedFor: 'long option lists',
    Icon: ChevronDown,
  },
  {
    id: 'choice',
    label: 'Choice',
    hint: 'Radio-style options',
    description: 'Customer picks one option shown as radio buttons. Each option sets a price.',
    recommendedFor: 'short option lists',
    Icon: CircleDot,
  },
  {
    id: 'imageChoice',
    label: 'Image choice',
    hint: 'Visual option cards',
    description: 'Customer picks one option from visual cards with images. Each adds its price.',
    recommendedFor: 'visual products',
    Icon: ImageIcon,
  },
  {
    id: 'heading',
    label: 'Heading',
    hint: 'Section divider text',
    description: 'Visual label that separates fields. Has no price impact.',
    Icon: Heading2,
  },
  // FIELD-PALETTE — surface three existing engine types in the Build tab too.
  {
    id: 'text',
    label: 'Text',
    hint: 'Single-line text input',
    description: 'Customer types a short free-text answer. No price impact on its own.',
    recommendedFor: 'names / notes',
    Icon: TypeIcon,
  },
  {
    id: 'toggle',
    label: 'Toggle',
    hint: 'Yes / no switch',
    description: 'Customer flips a yes/no switch. Adds its price when turned on.',
    recommendedFor: 'add-on yes/no',
    Icon: ToggleIcon,
  },
  {
    id: 'multiSelect',
    label: 'Multi-select',
    hint: 'Pick several from a list',
    description: 'Customer picks several options. Each chosen option adds its own price.',
    recommendedFor: 'add-on bundles',
    Icon: Layers,
  },
  // COMPONENT-PARITY — display + CTA content components. These already exist
  // in the in-preview ComponentPicker and the makeField() factory; surface them
  // in the Build-tab Add-field menu too so an owner working only in the Build
  // tab can reach every component type (paragraph / divider / image / video /
  // button / link). Labels + hints mirror ComponentPicker so the two menus
  // describe the same component identically.
  {
    id: 'paragraph',
    label: 'Paragraph',
    hint: 'Block of body copy',
    description: 'A block of body copy that gives customers context. Has no price impact.',
    recommendedFor: 'context / notes',
    Icon: FileText,
  },
  {
    id: 'divider',
    label: 'Divider',
    hint: 'Horizontal rule',
    description: 'A horizontal rule that visually separates sections. Has no price impact.',
    Icon: Minus,
  },
  {
    id: 'image',
    label: 'Image',
    hint: 'Inline image',
    description: 'An inline image shown in the form — a photo, diagram, or banner. No price impact.',
    recommendedFor: 'photos / diagrams',
    Icon: ImageIcon,
  },
  {
    id: 'video',
    label: 'Video embed',
    hint: 'YouTube / Vimeo',
    description: 'Embeds a YouTube or Vimeo video in the form. Has no price impact.',
    recommendedFor: 'how-it-works clips',
    Icon: VideoIcon,
  },
  {
    id: 'button',
    label: 'Button',
    hint: 'Tappable call / link button',
    description: 'A tappable button that calls you or opens a link. Has no price impact.',
    recommendedFor: 'call / book now',
    Icon: MousePointerClick,
  },
  {
    id: 'link',
    label: 'Link',
    hint: 'Inline text link',
    description: 'An inline text link to any URL — your site, terms, or a booking page. No price impact.',
    Icon: LinkIcon,
  },
  // WIZARD-GAPS — contact form content component. Submits via /api/leads.
  {
    id: 'contact_form',
    label: 'Contact form',
    hint: 'Name + email + message',
    description: 'An inline contact block. Submissions arrive as leads, just like the quote form.',
    recommendedFor: 'extra enquiries',
    Icon: MailIcon,
  },
  // PRICING-MODELS (U3) — distance / rate-matrix / photo-upload inputs.
  {
    id: 'address_distance',
    label: 'Distance',
    hint: 'Job-site address → driving distance',
    description: 'Customer types their address; we calculate driving distance from your business location.',
    recommendedFor: 'per-mile pricing',
    Icon: MapPin,
  },
  {
    id: 'rate_matrix',
    label: 'Rate matrix',
    hint: 'Zone / lane pricing table',
    description: 'Customer picks a pickup and drop-off zone; the matching lane rate feeds the quote.',
    recommendedFor: 'zone / lane rates',
    Icon: Table,
  },
  {
    id: 'photo_upload',
    label: 'Photo upload',
    hint: 'Customer photos of the job',
    description: 'Customer attaches photos of the job. Photos arrive with the lead — no price impact.',
    recommendedFor: 'job scoping',
    Icon: Camera,
  },
];

const MOBILE_BREAKPOINT = 768;

/** Window-relative coordinates and metrics for the portal-positioned menu. */
interface AnchorRect {
  left: number;
  top: number;
  bottom: number;
  width: number;
  viewportWidth: number;
  viewportHeight: number;
}

export default function AddFieldMenu({ onPick, emphasis = false }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
  });
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  // The popover/sheet PORTALS to document.body — outside `.qq-editor-shell` —
  // so the index.css `.qq-editor-shell[data-theme="dark"] .qq-addfield-*`
  // rules never match it (it would fall back to white). Mirror the shell's
  // live `data-theme` onto the portaled roots (same trick AIBubble uses) and
  // pair it with self-/descendant-scoped `[data-theme="dark"]` rules in this
  // component's own <style> block so the menu themes correctly off-tree.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [portalTheme, setPortalTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    if (!open) return;
    // NB: the local root wrapper hardcodes data-theme="light" (to keep the
    // trigger light), so target the editor shell explicitly to read the REAL
    // theme rather than that wrapper.
    const shell = rootRef.current?.closest<HTMLElement>('.qq-editor-shell[data-theme]');
    const read = () =>
      setPortalTheme(shell?.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    read();
    if (!shell) return;
    // Keep in sync with the editor's live day/night toggle.
    const mo = new MutationObserver(read);
    mo.observe(shell, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, [open]);

  // Track viewport size — switches between dropdown (desktop) and bottom sheet (mobile).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);

  // Compute anchor position when the popover opens. Re-measure on scroll /
  // resize so the menu tracks the trigger when the user moves the page.
  useLayoutEffect(() => {
    if (!open || isMobile) return;
    const measure = () => {
      const btn = triggerRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      setAnchor({
        left: r.left,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
    };
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, isMobile]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Lock body scroll when the mobile bottom-sheet is open so backdrop taps
  // don't accidentally scroll the underlying editor.
  useEffect(() => {
    if (!open || !isMobile || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open, isMobile]);

  // Compute desktop popover style — anchored below the trigger when there's
  // room, above when there isn't. Clamped within the viewport. The popover is
  // a 2-column grid on desktop so each tile has room for icon + label +
  // description, so it's wider than the original 260px dropdown.
  const desktopMenuStyle: React.CSSProperties | null = (() => {
    if (!anchor) return null;
    const MENU_W = Math.min(560, Math.max(360, anchor.viewportWidth - 24));
    const MENU_H_EST = 360;
    const flipUp = anchor.bottom + MENU_H_EST > anchor.viewportHeight - 8;
    let left = anchor.left;
    if (left + MENU_W > anchor.viewportWidth - 8) {
      left = Math.max(8, anchor.viewportWidth - MENU_W - 8);
    }
    return {
      position: 'fixed',
      left,
      top: flipUp ? Math.max(8, anchor.top - 6 - MENU_H_EST) : anchor.bottom + 6,
      width: MENU_W,
      maxHeight: `min(${MENU_H_EST}px, calc(100vh - 24px))`,
      zIndex: 1200,
    };
  })();

  const handlePick = (type: PublicFieldType) => { onPick(type); setOpen(false); };

  const menu = open ? (
    isMobile ? (
      // ── Mobile bottom sheet ───────────────────────────────────────────
      <div
        data-testid="add-field-portal"
        className="qq-addfield-sheet-root"
        data-theme={portalTheme}
        role="presentation"
        onMouseDown={(e) => {
          // Tap on the backdrop (root) closes; taps inside the sheet stop.
          if (e.target === e.currentTarget) setOpen(false);
        }}
      >
        <div
          ref={menuRef}
          role="menu"
          data-testid="add-field-menu"
          data-add-field-variant="sheet"
          className="qq-addfield-sheet"
        >
          <div className="qq-addfield-sheet-handle" aria-hidden="true" />
          <p className="qq-addfield-sheet-title">Add a field</p>
          {TYPES.map((t) => (
            <DraggableMenuItem
              key={t.id}
              type={t}
              variant="sheet"
              onPick={() => handlePick(t.id)}
            />
          ))}
          <button
            type="button"
            className="qq-addfield-sheet-cancel"
            onClick={() => setOpen(false)}
            data-testid="add-field-cancel"
          >Cancel</button>
        </div>
      </div>
    ) : desktopMenuStyle ? (
      // ── Desktop dropdown in portal ───────────────────────────────────
      <div
        ref={menuRef}
        role="menu"
        data-testid="add-field-menu"
        data-add-field-variant="dropdown"
        className="qq-addfield-menu"
        data-theme={portalTheme}
        style={desktopMenuStyle}
      >
        <p className="qq-addfield-menu-title">Pick a field type</p>
        <div className="qq-addfield-grid">
          {TYPES.map((t) => (
            <DraggableMenuItem
              key={t.id}
              type={t}
              variant="dropdown"
              onPick={() => handlePick(t.id)}
            />
          ))}
        </div>
      </div>
    ) : null
  ) : null;

  return (
    <div ref={rootRef} data-theme="light" className="qq-addfield-root" data-testid="add-field-root">
      <button
        ref={triggerRef}
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

      {typeof document !== 'undefined' && menu
        ? createPortal(menu, document.body)
        : null}

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

        /* Desktop popover (portaled into body, position:fixed) */
        .qq-addfield-menu {
          padding: 12px;
          background: #fff; border-radius: 12px;
          border: 1px solid ${p.colors.borderLight};
          box-shadow: ${p.shadows.lg};
          display: flex; flex-direction: column; gap: 8px;
          overflow-y: auto;
          animation: qq-addfield-fade-in 140ms ease-out;
          box-sizing: border-box;
        }
        @keyframes qq-addfield-fade-in {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .qq-addfield-menu { animation: none; }
        }
        .qq-addfield-menu-title {
          margin: 0 2px 2px;
          font-size: 11px; font-weight: 700;
          letter-spacing: 0.04em; text-transform: uppercase;
          color: ${p.colors.subtle};
        }
        /* 2-column grid on desktop, single column under 520px popover width */
        .qq-addfield-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        @media (max-width: 520px) {
          .qq-addfield-grid { grid-template-columns: minmax(0, 1fr); }
        }
        .qq-addfield-item {
          position: relative;
          display: flex; align-items: flex-start; gap: 12px;
          padding: 12px; border-radius: 10px;
          font: inherit; cursor: pointer; text-align: left;
          background: #fff;
          border: 1px solid ${p.colors.borderLight};
          color: ${p.colors.body};
          transition: background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease, transform 0.12s ease;
          touch-action: none;
        }
        .qq-addfield-item:hover,
        .qq-addfield-item:focus-visible {
          background: ${p.colors.accentLighter};
          border-color: ${p.colors.accent};
          box-shadow: 0 1px 2px rgba(15,23,42,0.04);
          outline: none;
        }
        .qq-addfield-icon {
          width: 36px; height: 36px; border-radius: 8px; flex-shrink: 0;
          background: ${p.colors.accentLighter}; color: ${p.colors.accent};
          display: inline-flex; align-items: center; justify-content: center;
          transition: background 0.12s ease, color 0.12s ease;
        }
        .qq-addfield-item:hover .qq-addfield-icon,
        .qq-addfield-item:focus-visible .qq-addfield-icon {
          background: ${p.colors.accent}; color: #fff;
        }
        .qq-addfield-text {
          display: flex; flex-direction: column; gap: 2px; min-width: 0;
        }
        .qq-addfield-label {
          font-size: 13px; font-weight: 700; color: ${p.colors.heading};
          line-height: 1.25;
        }
        .qq-addfield-hint {
          font-size: 11px; font-weight: 500; color: ${p.colors.subtle};
          line-height: 1.25;
        }
        .qq-addfield-desc {
          margin-top: 2px;
          font-size: 11.5px; font-weight: 400; color: ${p.colors.body};
          line-height: 1.35;
        }
        /* P2 UX fix (2026-05-22, wave 2): badge still felt too prominent in
         * top-left and competed visually with the icon. Shrunk further to
         * 8px / 0.3px letter-spacing / 1px 4px padding and moved to the
         * TOP-RIGHT corner of each card so it reads as a quiet tag/chip rather
         * than a label fighting the icon for attention. Background opacity
         * dropped from 0.85 → 0.70 for additional subtlety. */
        .qq-addfield-recommended {
          position: absolute; top: 4px; right: 4px;
          padding: 1px 4px;
          font-size: 8px; font-weight: 700;
          letter-spacing: 0.3px; text-transform: uppercase;
          background: rgba(13, 60, 252, 0.70); color: #fff;
          border-radius: 999px;
          opacity: 0; transform: translateY(-2px);
          transition: opacity 0.12s ease, transform 0.12s ease;
          pointer-events: none;
          white-space: nowrap;
          overflow: hidden;
        }
        .qq-addfield-item:hover .qq-addfield-recommended,
        .qq-addfield-item:focus-visible .qq-addfield-recommended {
          opacity: 1; transform: translateY(0);
        }
        @media (prefers-reduced-motion: reduce) {
          .qq-addfield-item,
          .qq-addfield-icon,
          .qq-addfield-recommended { transition: none; }
        }

        /* Mobile bottom sheet — full-width, anchored to viewport bottom. */
        .qq-addfield-sheet-root {
          position: fixed; inset: 0; z-index: 1200;
          background: rgba(15,23,42,0.45);
          display: flex; align-items: flex-end; justify-content: stretch;
          animation: qq-addfield-sheet-fade 160ms ease-out;
        }
        .qq-addfield-sheet {
          width: 100%; padding: 10px 14px 18px; box-sizing: border-box;
          background: #fff;
          border-radius: 18px 18px 0 0;
          box-shadow: 0 -6px 24px rgba(15,23,42,0.18);
          display: flex; flex-direction: column; gap: 4px;
          animation: qq-addfield-sheet-slide 180ms ease-out;
        }
        @keyframes qq-addfield-sheet-fade {
          from { opacity: 0; } to { opacity: 1; }
        }
        @keyframes qq-addfield-sheet-slide {
          from { transform: translateY(16px); } to { transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .qq-addfield-sheet-root, .qq-addfield-sheet { animation: none; }
        }
        .qq-addfield-sheet-handle {
          width: 42px; height: 4px; border-radius: 3px;
          background: ${p.colors.borderLight};
          margin: 0 auto 6px;
        }
        .qq-addfield-sheet-title {
          margin: 4px 4px 8px; font-size: 13px; font-weight: 700;
          color: ${p.colors.heading};
        }
        .qq-addfield-sheet .qq-addfield-item {
          padding: 12px 12px; border-radius: 10px; min-height: 48px;
          border: 1px solid ${p.colors.borderLight};
        }
        .qq-addfield-sheet .qq-addfield-icon {
          width: 38px; height: 38px;
        }
        .qq-addfield-sheet .qq-addfield-label { font-size: 13.5px; }
        .qq-addfield-sheet .qq-addfield-hint { font-size: 11.5px; }
        .qq-addfield-sheet .qq-addfield-desc { font-size: 12px; }
        /* Mobile sheet: hide the "Recommended for…" pill — limited width and
           a tap-driven UI means hover hints aren't useful there. */
        .qq-addfield-sheet .qq-addfield-recommended { display: none; }
        .qq-addfield-sheet-cancel {
          margin-top: 6px; padding: 12px;
          font: inherit; font-size: 13px; font-weight: 700; cursor: pointer;
          background: ${p.colors.surfaceRaised};
          color: ${p.colors.heading};
          border: 1px solid ${p.colors.borderLight};
          border-radius: 10px;
          min-height: 48px;
        }

        /* ── Dark mode (portaled — see the data-theme mirror above) ──────────
         * The popover/sheet portals to document.body, so the index.css rules
         * scoped under .qq-editor-shell[data-theme="dark"] can't reach it.
         * We mirror the shell's data-theme onto the portal roots
         * (.qq-addfield-menu / .qq-addfield-sheet-root) and re-state the dark
         * styling here, self-/descendant-scoped to that mirrored attribute so
         * it matches off-tree. Values mirror the index.css dark palette
         * (#1e293b surface, #0f172a bg, #243149 item, #e2e8f0 text). Light
         * mode is unaffected — these only apply when data-theme="dark". */
        .qq-addfield-menu[data-theme="dark"] {
          background: #1e293b;
          border-color: rgba(255,255,255,0.10);
          color: #e2e8f0;
        }
        .qq-addfield-menu[data-theme="dark"] .qq-addfield-menu-title {
          color: #94a3b8;
        }
        .qq-addfield-sheet-root[data-theme="dark"] .qq-addfield-sheet,
        .qq-addfield-sheet-root[data-theme="dark"] .qq-addfield-sheet-cancel {
          background: #1e293b;
          border-color: rgba(255,255,255,0.10);
          color: #e2e8f0;
        }
        .qq-addfield-sheet-root[data-theme="dark"] .qq-addfield-sheet-title {
          color: #e2e8f0;
        }
        .qq-addfield-sheet-root[data-theme="dark"] .qq-addfield-sheet-handle {
          background: rgba(255,255,255,0.18);
        }
        /* Option cards (shared by dropdown + sheet). */
        [data-theme="dark"].qq-addfield-menu .qq-addfield-item,
        .qq-addfield-sheet-root[data-theme="dark"] .qq-addfield-item {
          background: #243149;
          border-color: rgba(255,255,255,0.10);
          color: #e2e8f0;
        }
        [data-theme="dark"].qq-addfield-menu .qq-addfield-item:hover,
        [data-theme="dark"].qq-addfield-menu .qq-addfield-item:focus-visible,
        .qq-addfield-sheet-root[data-theme="dark"] .qq-addfield-item:hover,
        .qq-addfield-sheet-root[data-theme="dark"] .qq-addfield-item:focus-visible {
          background: rgba(13, 60, 252, 0.18);
          border-color: #0d3cfc;
        }
        [data-theme="dark"].qq-addfield-menu .qq-addfield-label,
        .qq-addfield-sheet-root[data-theme="dark"] .qq-addfield-label {
          color: #e2e8f0;
        }
        [data-theme="dark"].qq-addfield-menu .qq-addfield-hint,
        [data-theme="dark"].qq-addfield-menu .qq-addfield-desc,
        .qq-addfield-sheet-root[data-theme="dark"] .qq-addfield-hint,
        .qq-addfield-sheet-root[data-theme="dark"] .qq-addfield-desc {
          color: #94a3b8;
        }

        /* Wave N — secondary-sized "+ Add field" trigger on phones. The
           in-preview "+ Add component" affordance (Wave L) is the 44px
           primary tap target; the Build-tab Add buttons can be smaller. */
        @media (max-width: 480px) {
          .qq-addfield-trigger:not(.is-emphasis) {
            padding: 6px 10px;
            font-size: 12px;
            min-height: 32px;
            gap: 4px;
          }
        }
      `}</style>
    </div>
  );
}

/* ── one menu item, draggable for item (b) ─────────────────────────────── */

interface DraggableMenuItemProps {
  type: TypeMeta;
  variant: 'dropdown' | 'sheet';
  onPick: () => void;
}

function DraggableMenuItem({ type, variant, onPick }: DraggableMenuItemProps) {
  const {
    attributes, listeners, setNodeRef, isDragging,
  } = useDraggable({
    // Container prefix `addfield:` lets WizardShell's onDragEnd recognise this
    // is a NEW field source vs an existing field id being reordered.
    id: `addfield:${type.id}`,
    data: { source: DND_CONTAINERS.addFieldMenu, publicType: type.id },
  });
  const { Icon } = type;
  // Spread @dnd-kit attributes (which include role='button'), then explicitly
  // re-assert role='menuitem' after for the parent's role='menu' a11y contract.
  return (
    <button
      ref={setNodeRef}
      type="button"
      data-testid={`add-field-${type.id}`}
      data-add-field-variant={variant}
      className="qq-addfield-item"
      onClick={onPick}
      style={{ opacity: isDragging ? 0.55 : 1 }}
      /* P2 UX fix (2026-05-22): the longer "Recommended for {use case}"
       * detail moves to a native title tooltip so hover users still get the
       * recommendation context without the badge having to spell it out
       * inline. The badge itself is now a short "RECOMMENDED" pill. */
      title={type.recommendedFor ? `Recommended for ${type.recommendedFor}` : undefined}
      {...attributes}
      {...listeners}
      role="menuitem"
    >
      <span className="qq-addfield-icon" aria-hidden="true">
        <Icon size={20} strokeWidth={2} />
      </span>
      <span className="qq-addfield-text">
        <span className="qq-addfield-label">{type.label}</span>
        <span className="qq-addfield-hint">{type.hint}</span>
        <span className="qq-addfield-desc">{type.description}</span>
      </span>
      {type.recommendedFor ? (
        <span className="qq-addfield-recommended" aria-hidden="true">
          Recommended
        </span>
      ) : null}
    </button>
  );
}
