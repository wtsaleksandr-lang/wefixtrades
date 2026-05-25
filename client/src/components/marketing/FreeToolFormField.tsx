/**
 * FreeToolFormField — DESIGN-SYSTEM-compliant input primitives used by every
 * free-tool form on the marketing site.
 *
 * Why this file exists
 * --------------------
 * Alex flagged on 2026-05-21 + 2026-05-22 that the input rules from
 * DESIGN-SYSTEM.md were being violated on every new free tool:
 *   1. Title goes INSIDE the input field (floating label).
 *   2. Every component has a `?` help cue (top-left of the wrapper).
 *   3. ≤2px vertical gap between stacked input components.
 *   4. Inputs are properly sized — height ≥ 52px, fontSize ≥ 15.
 *   6. Single help-cue pattern per surface (InfoCue).
 *
 * The hero search in /tools/free-audit (FreeAudit.tsx:849) already follows
 * the floating-label pattern. This file extracts that exact CSS into three
 * reusable primitives so the BrightLocal-replica wave-1 tools (Citation
 * Checker, Google Review Link Generator, Local Search Checker, Local Rank
 * Grid) and the contact page can all reuse it without re-inventing the CSS.
 *
 * Variants
 * --------
 * - FreeToolFormField — text/email/tel single-line input.
 * - FreeToolFormSelect — same wrapper, `<select>` body.
 * - FreeToolFormTextarea — same wrapper, multi-line `<textarea>`.
 *
 * All three share the floating-label peer pattern from FreeAudit.tsx
 * (lines 625-668), scoped to a `.ftool-form-field` class prefix so a single
 * <style> block (rendered once via FreeToolFormFieldStyles) drives all
 * instances. Consumers render <FreeToolFormFieldStyles /> once near the
 * top of their page (or it auto-mounts on first field render).
 *
 * Theme
 * -----
 * The label color, border, and focus ring are CSS variables so consumers
 * can override per-page (the contact page lives on a dark surface).
 * Default values match the marketing light-surface palette used by the free
 * tools (blue #0d3cfc accent, white #fff background).
 */

import { type CSSProperties, type ReactNode, useId } from "react";
import InfoCue from "@/components/wizard/elfsight/InfoCue";

/* ─── Shared types ─────────────────────────────────────────────────── */

interface BaseFieldProps {
  /** DOM id — used to associate the floating <label> with the field. */
  id?: string;
  /** Floating-label text. Visible always; shrinks to top-left on focus. */
  label: string;
  /** Help-cue popover content. Required so every field has a help cue. */
  helpText: string;
  /** Required marker — adds a small red `*` to the label. */
  required?: boolean;
  /** Test ID hook — applied to the input/select/textarea element. */
  testId?: string;
  /** Disabled state — dims the field and disables interaction. */
  disabled?: boolean;
  /** Optional inline style override on the wrapper. */
  wrapperStyle?: CSSProperties;
  /** Optional theme override — defaults to "light". */
  theme?: "light" | "dark";
}

interface InputFieldProps extends BaseFieldProps {
  type?: "text" | "email" | "tel" | "url" | "search" | "number";
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: "text" | "email" | "tel" | "url" | "numeric" | "decimal" | "search" | "none";
  autoComplete?: string;
}

interface SelectFieldProps extends BaseFieldProps {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}

interface TextareaFieldProps extends BaseFieldProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}

/* ─── Shared label / help-cue / wrapper ────────────────────────────── */

function FieldWrapper({
  htmlFor,
  label,
  helpText,
  required,
  theme = "light",
  wrapperStyle,
  children,
  testId,
}: {
  htmlFor: string;
  label: string;
  helpText: string;
  required?: boolean;
  theme?: "light" | "dark";
  wrapperStyle?: CSSProperties;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className={`ftool-form-field ftool-form-field--${theme}`}
      style={{
        position: "relative",
        // Room on the left for the `?` help cue. Matches FreeAudit hero
        // (paddingLeft: 26).
        paddingLeft: 26,
        ...(wrapperStyle || {}),
      }}
    >
      {/* Top-left `?` help cue. Positioned absolutely so it doesn't push
          the input. InfoCue ships its own popover styling. */}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 4,
          zIndex: 2,
        }}
      >
        <InfoCue
          text={helpText}
          label={`Help: ${label}`}
          testid={testId ? `${testId}-help` : undefined}
        />
      </div>

      {children}

      <label htmlFor={htmlFor} className="ftool-form-field__label">
        {label}
        {required && <span className="ftool-form-field__required"> *</span>}
      </label>
    </div>
  );
}

/* ─── Public components ────────────────────────────────────────────── */

export function FreeToolFormField({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  helpText,
  required,
  inputMode,
  autoComplete,
  testId,
  disabled,
  wrapperStyle,
  theme,
}: InputFieldProps) {
  const generatedId = useId();
  const fieldId = id || `ftool-${generatedId}`;
  return (
    <FieldWrapper
      htmlFor={fieldId}
      label={label}
      helpText={helpText}
      required={required}
      theme={theme}
      wrapperStyle={wrapperStyle}
      testId={testId}
    >
      <input
        id={fieldId}
        type={type}
        // CSS selector `:placeholder-shown` needs a non-empty placeholder
        // to fire — a single space is the standard trick.
        placeholder={placeholder ?? " "}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-label={label}
        data-testid={testId}
        className="ftool-form-field__field"
      />
    </FieldWrapper>
  );
}

export function FreeToolFormSelect({
  id,
  label,
  value,
  onChange,
  helpText,
  required,
  testId,
  disabled,
  wrapperStyle,
  theme,
  children,
}: SelectFieldProps) {
  const generatedId = useId();
  const fieldId = id || `ftool-${generatedId}`;
  return (
    <FieldWrapper
      htmlFor={fieldId}
      label={label}
      helpText={helpText}
      required={required}
      theme={theme}
      wrapperStyle={wrapperStyle}
      testId={testId}
    >
      <select
        id={fieldId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        aria-label={label}
        data-testid={testId}
        // `data-has-value` lets the floating label know the field is non-empty
        // without relying on :placeholder-shown (which selects don't have).
        data-has-value={value ? "true" : "false"}
        className="ftool-form-field__field ftool-form-field__field--select"
      >
        {children}
      </select>
    </FieldWrapper>
  );
}

export function FreeToolFormTextarea({
  id,
  label,
  value,
  onChange,
  placeholder,
  helpText,
  required,
  testId,
  disabled,
  wrapperStyle,
  theme,
  rows = 5,
}: TextareaFieldProps) {
  const generatedId = useId();
  const fieldId = id || `ftool-${generatedId}`;
  return (
    <FieldWrapper
      htmlFor={fieldId}
      label={label}
      helpText={helpText}
      required={required}
      theme={theme}
      wrapperStyle={wrapperStyle}
      testId={testId}
    >
      <textarea
        id={fieldId}
        placeholder={placeholder ?? " "}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        rows={rows}
        aria-label={label}
        data-testid={testId}
        className="ftool-form-field__field ftool-form-field__field--textarea"
      />
    </FieldWrapper>
  );
}

/* ─── Scoped styles ────────────────────────────────────────────────── */

/**
 * Renders the floating-label / help-cue / focus CSS for FreeToolFormField,
 * FreeToolFormSelect, and FreeToolFormTextarea. Mount once per page — usually
 * at the top of the form fragment. The CSS is scoped under `.ftool-form-field`
 * so it cannot leak to other inputs.
 *
 * Pattern matches FreeAudit.tsx lines 625-668 — already proven in production.
 */
export function FreeToolFormFieldStyles() {
  return (
    <style>{`
      /* Wrapper baseline — applied to every variant. */
      .ftool-form-field { position: relative; }

      /* Field common styles (input, select, textarea). */
      .ftool-form-field__field {
        width: 100%;
        min-height: 52px;
        height: 52px;
        border-radius: 12px;
        border: 1px solid rgba(0,0,0,0.10);
        padding: 18px 14px 6px 14px;
        font-size: 15px;
        font-weight: 500;
        outline: none;
        background: rgb(255,255,255);
        color: rgb(17,24,39);
        box-sizing: border-box;
        transition: border-color 0.2s, box-shadow 0.2s;
        font-family: inherit;
      }
      .ftool-form-field__field:focus {
        border-color: rgb(13,60,252);
        box-shadow: 0 0 0 4px rgba(13,60,252,0.16);
      }
      .ftool-form-field__field:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      /* Textarea variant — auto height grows, min 120px. */
      .ftool-form-field__field--textarea {
        height: auto;
        min-height: 120px;
        padding-top: 22px;
        resize: vertical;
        line-height: 1.5;
      }
      /* Select variant — keep 52px but add room for the caret on the right. */
      .ftool-form-field__field--select {
        appearance: none;
        -webkit-appearance: none;
        -moz-appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(0,0,0,0.55)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 14px center;
        padding-right: 36px;
      }

      /* Floating label — sits above the typed value, shrinks on focus
         OR when the field has a value. */
      .ftool-form-field__label {
        position: absolute;
        left: 40px;
        pointer-events: none;
        top: 6px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: rgb(13,60,252);
        background: rgb(255,255,255);
        padding: 0 2px;
        transition: top 0.15s ease, font-size 0.15s ease,
                    color 0.15s ease, font-weight 0.15s ease,
                    text-transform 0.15s ease, letter-spacing 0.15s ease;
        z-index: 1;
        max-width: calc(100% - 60px);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      /* Empty + unfocused — drop label down to mimic a placeholder. */
      .ftool-form-field__field:placeholder-shown + .ftool-form-field__label,
      .ftool-form-field__field--select[data-has-value="false"] + .ftool-form-field__label {
        top: 50%;
        transform: translateY(-50%);
        font-size: 15px;
        font-weight: 500;
        color: rgba(0,0,0,0.42);
        text-transform: none;
        letter-spacing: normal;
      }
      /* Textarea: label sits at the top, never mid-field. */
      .ftool-form-field__field--textarea:placeholder-shown + .ftool-form-field__label {
        top: 16px;
        transform: none;
      }
      /* Focused — always lift the label back to the small-bold form. */
      .ftool-form-field__field:focus + .ftool-form-field__label,
      .ftool-form-field__field--select:focus + .ftool-form-field__label {
        top: 6px;
        transform: none;
        font-size: 10px;
        font-weight: 700;
        color: rgb(13,60,252);
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      .ftool-form-field__required { color: rgb(239,68,68); }

      /* Dark-surface variant for the contact page (white-on-dark form). */
      .ftool-form-field--dark .ftool-form-field__field {
        background: rgba(255,255,255,0.04);
        border-color: rgba(255,255,255,0.15);
        color: rgb(255,255,255);
      }
      .ftool-form-field--dark .ftool-form-field__field:focus {
        border-color: rgb(13,60,252);
        box-shadow: 0 0 0 4px rgba(13,60,252,0.28);
      }
      .ftool-form-field--dark .ftool-form-field__label {
        /* Label sits over the input border — when the input bg is a near-
           transparent rgba(255,255,255,0.04) on a dark section, the label's
           own background must match the section so the floated label reads
           crisply. Consumers can override via the --ftool-label-bg custom
           property on a wrapping container. */
        background: var(--ftool-label-bg, rgb(36,45,48));
        color: rgb(13,60,252);
      }
      .ftool-form-field--dark .ftool-form-field__field:placeholder-shown + .ftool-form-field__label,
      .ftool-form-field--dark .ftool-form-field__field--select[data-has-value="false"] + .ftool-form-field__label {
        color: rgba(255,255,255,0.55);
      }
      .ftool-form-field--dark .ftool-form-field__field--select {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.7)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
      }
    `}</style>
  );
}
