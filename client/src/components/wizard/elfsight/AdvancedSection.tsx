// AdvancedSection — Apple-clean progressive-disclosure wrapper (Phase 1).
//
// The redesign keeps every existing power feature but tucks the non-core ones
// behind a single collapsible "Advanced settings" row so the default panel reads
// minimal (the Elfsight/Apple feel). Nothing is deleted — children are simply
// hidden until the user expands. Open/closed state persists per panel via
// sessionStorage so a power user's expanded view survives tab switches.
//
// Visual: a full-width hairline-topped row with a left label, an optional helper
// count, and a chevron that rotates on expand. Uses the scoped AE editor tokens.

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { AE } from './appleEditor';

interface Props {
  /** Stable id used for the sessionStorage open/closed key. */
  id: string;
  /** Row label. Defaults to "Advanced settings". */
  label?: string;
  /** Optional small count/hint shown next to the label (e.g. "8 more"). */
  hint?: string;
  /** Start expanded? Default false (collapsed = the simple default). */
  defaultOpen?: boolean;
  /**
   * Prominent variant — an accent-tinted card with a bold accent chevron and a
   * bottom grab-handle, so a key collapsible (the "Start from a template / AI"
   * entry point) reads as an obviously-expandable surface instead of a quiet
   * hairline row. Other sections stay minimal. Default false.
   */
  prominent?: boolean;
  children: React.ReactNode;
}

const KEY = (id: string) => `qq-adv-open-${id}`;

export default function AdvancedSection({ id, label = 'Advanced settings', hint, defaultOpen = false, prominent = false, children }: Props) {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const v = sessionStorage.getItem(KEY(id));
      return v === null ? defaultOpen : v === '1';
    } catch {
      return defaultOpen;
    }
  });

  useEffect(() => {
    try { sessionStorage.setItem(KEY(id), open ? '1' : '0'); } catch { /* sessionStorage unavailable */ }
  }, [id, open]);

  const toggle = useCallback(() => setOpen((o) => !o), []);

  return (
    <section
      className={`qq-adv${prominent ? ' qq-adv--prominent' : ''}`}
      data-testid={`advanced-section-${id}`}
      data-open={open ? 'true' : 'false'}
    >
      <button
        type="button"
        className="qq-adv-toggle"
        data-testid={`advanced-toggle-${id}`}
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="qq-adv-toggle-label">{label}</span>
        {hint ? <span className="qq-adv-toggle-hint">{hint}</span> : null}
        <ChevronDown size={prominent ? 20 : 16} className="qq-adv-chevron" aria-hidden="true" />
        {prominent ? <span className="qq-adv-handle" aria-hidden="true" /> : null}
      </button>
      {open ? (
        <div className="qq-adv-body" data-testid={`advanced-body-${id}`}>
          {children}
        </div>
      ) : null}

      <style>{`
        .qq-adv {
          margin-top: 14px;
          border-top: 1px solid ${AE.color.hairline};
        }
        .qq-adv-toggle {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 14px 2px;
          background: transparent;
          border: 0;
          cursor: pointer;
          font-family: ${AE.font.family};
          text-align: left;
        }
        .qq-adv-toggle-label {
          font-size: ${AE.type.label.size};
          font-weight: 600;
          color: ${AE.color.text};
        }
        .qq-adv-toggle-hint {
          font-size: ${AE.type.caption.size};
          font-weight: 500;
          color: ${AE.color.secondary};
        }
        .qq-adv-chevron {
          margin-left: auto;
          color: ${AE.color.secondary};
          transition: transform 0.18s ease;
        }
        .qq-adv[data-open="true"] .qq-adv-chevron { transform: rotate(180deg); }
        .qq-adv-toggle:hover .qq-adv-toggle-label { color: ${AE.color.accent}; }
        .qq-adv-toggle:focus-visible {
          outline: none;
          box-shadow: ${AE.shadow.focus};
          border-radius: ${AE.radius.sm};
        }
        .qq-adv-body {
          display: flex;
          flex-direction: column;
          /* #10 — tighter vertical rhythm so the advanced-style controls don't
             read as too far apart (was 16px). 11px keeps a clear separation
             while pulling the grouped controls together. */
          gap: 11px;
          padding-bottom: 6px;
        }
        /* Dark editor chrome — the Apple light grays above (#1d1d1f label,
           #6e6e73 hint/chevron) render dark-on-dark on the #1e293b panel.
           Repaint to the shared dark text tokens (≥4.5:1) without touching
           light mode. */
        .qq-editor-shell[data-theme="dark"] .qq-adv-toggle-label {
          color: var(--qq-text, #f1f5f9);
        }
        .qq-editor-shell[data-theme="dark"] .qq-adv-toggle-hint {
          color: var(--qq-muted, #94a3b8);
        }
        .qq-editor-shell[data-theme="dark"] .qq-adv-chevron {
          color: var(--qq-muted, #94a3b8);
        }

        /* Prominent variant — an accent-tinted card that signals "this opens".
           Used for the "Start from a template / AI" entry so users don't miss
           that templates live behind it. Accent chevron + bottom grab-handle. */
        .qq-adv--prominent {
          margin-top: 14px;
          border: 1px solid ${AE.color.accent}40;
          border-top: 1px solid ${AE.color.accent}40;
          background: ${AE.color.accentTint};
          border-radius: ${AE.radius.md};
          box-shadow: ${AE.shadow.card};
          overflow: hidden;
          transition: box-shadow 0.15s ease, border-color 0.15s ease;
        }
        .qq-adv--prominent:hover {
          border-color: ${AE.color.accent};
          box-shadow: ${AE.shadow.pop};
        }
        .qq-adv--prominent .qq-adv-toggle {
          padding: 14px 16px 18px;
          position: relative;
        }
        .qq-adv--prominent .qq-adv-toggle-label {
          font-size: ${AE.type.title.size};
          font-weight: 700;
        }
        .qq-adv--prominent .qq-adv-chevron {
          color: ${AE.color.accent};
          width: 20px; height: 20px;
        }
        .qq-adv--prominent:hover .qq-adv-toggle-label { color: ${AE.color.accent}; }
        /* Bottom grab-handle — a centered pill at the lower edge of the header
           that reads as "pull to unfold" (mirrors the mobile sheet handle). */
        .qq-adv-handle {
          position: absolute;
          left: 50%; bottom: 7px; transform: translateX(-50%);
          width: 40px; height: 4px; border-radius: ${AE.radius.pill};
          background: ${AE.color.accent};
          opacity: 0.38;
          transition: opacity 0.15s ease, width 0.15s ease;
        }
        .qq-adv--prominent:hover .qq-adv-handle { opacity: 0.6; width: 52px; }
        .qq-adv--prominent .qq-adv-body {
          padding: 0 14px 12px;
        }
        .qq-editor-shell[data-theme="dark"] .qq-adv--prominent .qq-adv-toggle-label {
          color: var(--qq-text, #f1f5f9);
        }
      `}</style>
    </section>
  );
}
