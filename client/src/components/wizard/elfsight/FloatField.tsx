// FloatField — Wave J item 1 + Wave R-pre v2 InfoCue overlay.
//
// Tiny helper that wraps an input (or select) with a floating label using
// the `.float-field` / `.premium-input` CSS that landed in Wave A and is
// kept in client/src/index.css. The label sits inside the field when empty
// and floats to the top as a small badge once focused or filled.
//
// Usage:
//   <FloatField label="Business name" htmlFor="qq-name">
//     <input id="qq-name" className="premium-input" placeholder=" " ... />
//   </FloatField>
//
// IMPORTANT: every child input MUST carry `placeholder=" "` (a single space)
// for `:placeholder-shown` to drive the label transition. Pass any other
// placeholder text via the floating label itself, not the placeholder attr.
//
// The wrapper also accepts a `variant="select"` which adapts spacing for
// native <select> children (their built-in chevron crowds the right edge).
//
// Wave R-pre v2 — `infoText` puts an InfoCue trigger inside the field's
// top-right corner (Alex's global rule: all titles inside the field, all
// help cues at top-right of the field itself, no labels-above-input).

import type { CSSProperties, ReactNode } from 'react';
import InfoCue from './InfoCue';
import { guardTextColor } from '@/lib/contrastGuard';

interface Props {
  label: string;
  htmlFor: string;
  /**
   * FIX #3 — the field's actual background colour. The `.float-field > label`
   * CSS assumes a white/light field; on any non-white surface the resting /
   * floated label can fall to bright-on-bright (e.g. the floated `#0d3cfc`
   * on a dark navy field, or an inherited near-white label on a white field).
   * When provided, the label colours are contrast-guarded against this
   * background inline (overriding the CSS) so the title is never invisible.
   * Defaults to white — the `.premium-input` `--field-bg-light` value — so a
   * caller that doesn't pass it still gets the guard against the real field.
   */
  fieldBg?: string;
  /**
   * FIX #3 — the floated/focused label colour the design intends (usually the
   * brand accent). Guarded against `fieldBg` so a bright accent on a bright
   * field can't disappear. Defaults to the CSS accent `#0d3cfc`.
   */
  floatColor?: string;
  /**
   * Default variant is `input`. Use `select` for native dropdowns so the
   * label sits a little lower and the field gets right-padding for the
   * native chevron.
   */
  variant?: 'input' | 'select';
  /** Optional extra className on the wrapper (rare). */
  className?: string;
  /**
   * Wave R-pre v2 — when provided, renders an InfoCue at the top-right
   * corner of the field. The text is the body of the popover. This
   * replaces the legacy pattern of placing an InfoCue beside a section
   * legend (which created a duplicated label feel).
   */
  infoText?: string;
  /** Optional testid suffix for the in-field InfoCue. */
  infoTestid?: string;
  children: ReactNode;
}

export default function FloatField({
  label, htmlFor, variant = 'input', className, infoText, infoTestid,
  fieldBg = 'rgba(255,255,255,1)', floatColor = '#0d3cfc', children,
}: Props) {
  const cls = `float-field${variant === 'select' ? ' float-field--select' : ''}${infoText ? ' float-field--with-info' : ''}${className ? ` ${className}` : ''}`;
  // FIX #3 — derive both label states to contrast the real field background.
  // Resting starts from the CSS grey (#9CA3AF); floated from the accent. The
  // guard only shifts a colour when it fails WCAG against `fieldBg`, so the
  // common white-field case keeps the exact legacy colours.
  const restingColor = guardTextColor('#9CA3AF', fieldBg, 'floatFieldResting');
  const floatedColor = guardTextColor(floatColor, fieldBg, 'floatFieldFloated', { largeText: true });
  // The CSS swaps resting → floated via `:focus`/`:not(:placeholder-shown)`;
  // a static inline colour can't express that pseudo-state. We expose both as
  // custom properties and a small scoped style sets the floated colour. The
  // resting colour goes inline on the label (overrides the CSS default).
  const labelStyle: CSSProperties = { color: restingColor };
  const floatVarStyle = { ['--qq-float-color' as string]: floatedColor } as CSSProperties;
  return (
    <div className={cls} style={floatVarStyle}>
      {children}
      <label htmlFor={htmlFor} style={labelStyle}>{label}</label>
      {infoText && (
        <span className="float-field-info" aria-hidden={false}>
          <InfoCue
            testid={infoTestid ?? `${htmlFor}-info`}
            text={infoText}
          />
        </span>
      )}
    </div>
  );
}
