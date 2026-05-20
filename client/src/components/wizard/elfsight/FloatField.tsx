// FloatField — Wave J item 1.
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

import type { ReactNode } from 'react';

interface Props {
  label: string;
  htmlFor: string;
  /**
   * Default variant is `input`. Use `select` for native dropdowns so the
   * label sits a little lower and the field gets right-padding for the
   * native chevron.
   */
  variant?: 'input' | 'select';
  /** Optional extra className on the wrapper (rare). */
  className?: string;
  children: ReactNode;
}

export default function FloatField({
  label, htmlFor, variant = 'input', className, children,
}: Props) {
  const cls = `float-field${variant === 'select' ? ' float-field--select' : ''}${className ? ` ${className}` : ''}`;
  return (
    <div className={cls}>
      {children}
      <label htmlFor={htmlFor}>{label}</label>
    </div>
  );
}
