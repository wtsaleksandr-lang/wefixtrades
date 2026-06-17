/**
 * Lead-capture MODAL — opened by the widget's primary CTA.
 *
 * A short, conversion-focused form (Full Name / Phone / Email — all required)
 * shown in an accessible, theme-aware dialog overlaid on the widget. Built on
 * the same self-contained inline-style + `FloatingLabelInput` pattern as
 * `ContactStep.tsx` (no app-level Radix/Dialog dependency — the widget ships
 * as an isolated embeddable bundle, so it stays dependency-light).
 *
 * Theming + contrast:
 *  - Surface / text / border come from the resolved `WidgetTheme` (`cc`,
 *    already contrast-guarded by the calculator). Every text colour the modal
 *    paints is additionally routed through `guardTextColor` so it can never
 *    read bright-on-bright or dark-on-dark (CONTRAST RULE).
 *  - The submit button reuses the CTA's guarded bg/fg pair (`ctaBg` /
 *    `ctaFg`). On the black/yellow car_towing theme this renders as a dark
 *    modal with light text and a yellow submit with dark text.
 *
 * Accessibility: role="dialog", aria-modal, labelled by the heading, focus
 * trap, Esc-to-close, click-outside-to-close, and body scroll lock while open.
 *
 * Lead delivery: the parent passes an `onSubmit` callback that POSTs to
 * `/api/leads`. When omitted (preview / wizard) the form still works but
 * skips the network call — the success state flips regardless so the
 * preview path isn't broken.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { WidgetTheme } from './widgetThemes';
import { guardTextColor } from '@/lib/contrastGuard';

/* ─── FloatingLabelInput — title-in-field, theme-aware (mirrors ContactStep) ───
 * Placeholder doubles as the resting label; focus / value lifts it to a small
 * uppercase label above the value. Inline styles keep parity with the widget. */
function FloatingLabelInput({
  id, label, value, onChange, type = 'text', autoComplete, theme,
  fontFamily, radiusPx = '10px', testId, invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  type?: 'text' | 'email' | 'tel';
  autoComplete?: string;
  theme: WidgetTheme;
  fontFamily?: string;
  radiusPx?: string;
  testId?: string;
  invalid?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const lifted = focused || value.length > 0;

  const fieldText = guardTextColor(theme.text, theme.surface, 'leadModalFieldText');
  const labelColor = guardTextColor(theme.textMuted, theme.surface, 'leadModalFieldLabel');
  const fieldErrorColor = theme.error || 'rgb(185,28,28)';

  const wrapperStyle: CSSProperties = { position: 'relative', width: '100%' };
  const inputStyle: CSSProperties = {
    width: '100%', height: 48, borderRadius: radiusPx,
    border: `1px solid ${invalid ? fieldErrorColor : focused ? theme.accent : theme.border}`,
    padding: '18px 12px 6px 12px',
    fontSize: 14, color: fieldText, background: theme.surface,
    fontFamily, outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 150ms ease-out',
  };
  const labelStyle: CSSProperties = {
    position: 'absolute', left: 12,
    top: lifted ? 6 : 14,
    fontSize: lifted ? 10 : 13,
    color: lifted ? (focused ? theme.accent : labelColor) : labelColor,
    pointerEvents: 'none', transition: 'all 150ms ease-out', fontFamily,
    letterSpacing: lifted ? '0.04em' : 'normal',
    textTransform: lifted ? 'uppercase' : 'none',
    fontWeight: lifted ? 700 : 400,
  };

  return (
    <div style={wrapperStyle}>
      <input
        id={id}
        data-testid={testId}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={inputStyle}
        placeholder=" "
        aria-invalid={invalid || undefined}
      />
      <label htmlFor={id} style={labelStyle}>{label}</label>
    </div>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Basic presence + digit-count check: phone is required but we don't enforce a
// strict format (international numbers vary). Just needs ≥7 digits.
const phoneOk = (v: string) => v.replace(/\D/g, '').length >= 7;

/** Captured lead data shape — exported for the parent's `onSubmit` signature. */
export type Lead = { name: string; phone: string; email: string };

/** LEAD-FORM-FIELDS — one owner-defined custom field (mirrors the deployed
 *  widget's LeadCaptureStep + lead_form.custom_fields). */
export interface LeadModalCustomField {
  id: string;
  type: 'text' | 'email' | 'phone' | 'number' | 'select' | 'textarea' | 'checkbox';
  label: string;
  required: boolean;
  options: string[];
}

export interface LeadModalProps {
  /** Whether the modal is mounted/visible. */
  open: boolean;
  /** Close handler (Esc, backdrop click, ✕ button). */
  onClose: () => void;
  /** Resolved + contrast-guarded widget theme (pass the calculator's `cc`). */
  theme: WidgetTheme;
  /** CTA background (guarded pair with `ctaFg`). */
  ctaBg: string;
  /** CTA foreground (already guarded against `ctaBg`). */
  ctaFg: string;
  /** Style-tab font stack. */
  fontFamily?: string;
  /** Style-tab radius applied to inputs / buttons. */
  radiusPx?: string;
  /** Optional heading override; defaults to "Almost there — where should we reach you?". */
  heading?: string;
  /** Optional subcopy override. */
  subcopy?: string;
  /** Optional submit-button label override; defaults to "Send my request". */
  submitLabel?: string;
  /**
   * Action tab — owner-configured success line shown after a successful
   * submit. When absent, the built-in default copy ("We've got your request…")
   * is used. (Named `successMessage` to avoid colliding with the internal
   * `successText` colour token computed below.)
   */
  successMessage?: string;
  /**
   * Action tab — client-side spam honeypot. When `true` (default), an
   * off-screen, aria-hidden, non-tabbable input is rendered; if a bot fills
   * it, `handleSubmit` silently drops the submission (no network call, no
   * error shown — the modal just flips to the success state so the bot can't
   * tell it was blocked). Real customers never see or focus the field, so it
   * never interferes with genuine submissions. No backend / no captcha.
   */
  honeypot?: boolean;
  /** Async callback fired with captured lead data. The parent is responsible
   *  for the actual POST to `/api/leads`. When absent (preview / wizard) the
   *  form flips to the success state without a network call. */
  onSubmit?: (lead: Lead) => Promise<void>;
  /**
   * LEAD-FORM-FIELDS — owner-defined custom fields rendered below the standard
   * Name / Phone / Email inputs (mirrors the deployed widget's LeadCaptureStep).
   * Preview-fidelity: in the wizard these surface the fields the owner authored
   * in the Action tab. Their values are NOT part of the `Lead` POST shape (the
   * deployed widget carries them in /api/leads `answers`); here they exist so
   * the preview renders faithfully. Required custom fields gate the submit. */
  customFields?: LeadModalCustomField[];
}

export default function LeadModal({
  open, onClose, theme, ctaBg, ctaFg, fontFamily, radiusPx = '10px',
  heading = 'Almost there \u2014 where should we reach you?',
  subcopy = "Drop your details and we'll get back to you shortly.",
  submitLabel = 'Send my request',
  successMessage,
  honeypot = true,
  onSubmit,
  customFields = [],
}: LeadModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  // LEAD-FORM-FIELDS — owner-defined custom field values (preview-only; not
  // part of the Lead POST shape). Required ones gate the submit alongside the
  // standard fields.
  const [customValues, setCustomValues] = useState<Record<string, string | boolean>>({});
  const setCustomValue = (id: string, value: string | boolean) =>
    setCustomValues((p) => ({ ...p, [id]: value }));
  // Action tab \u2014 spam honeypot. A real user never sees or focuses this field,
  // so a non-empty value means a bot auto-filled it \u2192 drop on submit.
  const [hpValue, setHpValue] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const nameOk = name.trim().length >= 2;
  const emailOk = EMAIL_RE.test(email.trim());
  const phoneValid = phoneOk(phone);
  // LEAD-FORM-FIELDS — every REQUIRED custom field must be filled (a checkbox
  // must be checked; any other type must be non-empty) before the form is ready.
  const customOk = customFields.every((f) => {
    if (!f.required) return true;
    const v = customValues[f.id];
    return f.type === 'checkbox' ? v === true : String(v ?? '').trim() !== '';
  });
  const ready = nameOk && phoneValid && emailOk && customOk;

  // Body scroll lock + Esc + initial focus while open.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    document.addEventListener('keydown', onKey);
    // Focus the first field once mounted.
    const t = window.setTimeout(() => {
      dialogRef.current?.querySelector<HTMLElement>('input,button')?.focus();
    }, 0);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  // Reset to a clean form each time the modal is (re)opened.
  useEffect(() => {
    if (open) { setSubmitted(false); setSubmitting(false); setSubmitError(null); setShowErrors(false); setHpValue(''); setCustomValues({}); }
  }, [open]);

  if (!open) return null;

  // Simple focus trap: keep Tab cycling within the dialog.
  function onTrapKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
      'input, button, [href], select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  async function handleSubmit() {
    if (!ready) { setShowErrors(true); return; }
    // Action tab — honeypot trip. A non-empty value means a bot auto-filled the
    // hidden field (humans never see it). Silently flip to success WITHOUT
    // calling onSubmit — the bot can't distinguish a drop from a real success,
    // and no lead reaches the backend.
    if (honeypot && hpValue.trim() !== '') {
      setSubmitted(true);
      return;
    }
    const lead: Lead = { name: name.trim(), phone: phone.trim(), email: email.trim() };
    if (onSubmit) {
      setSubmitting(true);
      setSubmitError(null);
      try {
        await onSubmit(lead);
      } catch (e: any) {
        setSubmitting(false);
        setSubmitError(e?.message || 'Something went wrong. Please try again.');
        return;
      }
      setSubmitting(false);
    }
    setSubmitted(true);
  }

  const errorColor = theme.error || 'rgb(185,28,28)';
  const headingColor = guardTextColor(theme.text, theme.surface, 'leadModalHeading');
  const subColor = guardTextColor(theme.textMuted, theme.surface, 'leadModalSub');
  const consentColor = guardTextColor(theme.textMuted, theme.surface, 'leadModalConsent');
  const closeColor = guardTextColor(theme.textMuted, theme.surface, 'leadModalClose');
  const successText = guardTextColor(theme.text, theme.accentTint, 'leadModalSuccess');
  const successSub = guardTextColor(theme.textMuted, theme.accentTint, 'leadModalSuccessSub');

  const backdropStyle: CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 9990,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16, boxSizing: 'border-box',
  };
  const dialogStyle: CSSProperties = {
    position: 'relative', width: '100%', maxWidth: 380,
    maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
    background: theme.surface, color: headingColor,
    border: `1px solid ${theme.border}`, borderRadius: radiusPx,
    boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
    padding: 20, boxSizing: 'border-box', fontFamily,
  };
  const submitBtnStyle: CSSProperties = {
    width: '100%', height: 48, borderRadius: radiusPx, border: 'none',
    background: ctaBg, color: ctaFg,
    fontSize: 14, fontWeight: 800, fontFamily, cursor: 'pointer',
    letterSpacing: '0.01em', marginTop: 14,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  };

  return (
    <div
      data-testid="lead-modal-backdrop"
      style={backdropStyle}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-modal-heading"
        data-testid="lead-modal"
        style={dialogStyle}
        onKeyDown={onTrapKeyDown}
      >
        <button
          type="button"
          aria-label="Close"
          data-testid="lead-modal-close"
          onClick={onClose}
          style={{
            position: 'absolute', top: 10, right: 10,
            width: 28, height: 28, borderRadius: 999,
            border: `1px solid ${theme.border}`, background: theme.surface,
            color: closeColor, fontSize: 16, lineHeight: 1, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0,
          }}
        >
          <span aria-hidden="true">×</span>
        </button>

        {submitted ? (
          <div
            data-testid="lead-modal-success"
            style={{
              display: 'flex', flexDirection: 'column', gap: 8,
              padding: 16, borderRadius: radiusPx,
              background: theme.accentTint, color: successText,
            }}
          >
            <p style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>
              Thanks, {name.trim().split(' ')[0] || 'there'} — we'll be in touch.
            </p>
            <p style={{ fontSize: 13, color: successSub, margin: 0, lineHeight: 1.5 }}>
              {successMessage && successMessage.trim() !== ''
                ? successMessage
                : "We've got your request and a team member will reach out shortly."}
            </p>
          </div>
        ) : (
          <>
            <h2
              id="lead-modal-heading"
              data-testid="lead-modal-heading"
              style={{
                margin: '0 28px 4px 0', fontSize: 18, fontWeight: 800,
                color: headingColor, lineHeight: 1.25,
              }}
            >
              {heading}
            </h2>
            <p style={{ margin: '0 0 14px 0', fontSize: 13, color: subColor, lineHeight: 1.5 }}>
              {subcopy}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <FloatingLabelInput
                id="lead-modal-name" testId="lead-modal-name" label="Full name"
                value={name} onChange={setName} autoComplete="name"
                theme={theme} fontFamily={fontFamily} radiusPx={radiusPx}
                invalid={showErrors && !nameOk}
              />
              <FloatingLabelInput
                id="lead-modal-phone" testId="lead-modal-phone" label="Phone" type="tel"
                value={phone} onChange={setPhone} autoComplete="tel"
                theme={theme} fontFamily={fontFamily} radiusPx={radiusPx}
                invalid={showErrors && !phoneValid}
              />
              <FloatingLabelInput
                id="lead-modal-email" testId="lead-modal-email" label="Email address" type="email"
                value={email} onChange={setEmail} autoComplete="email"
                theme={theme} fontFamily={fontFamily} radiusPx={radiusPx}
                invalid={showErrors && !emailOk}
              />
              {/* LEAD-FORM-FIELDS — owner-defined custom fields, below the
                  standard Name/Phone/Email (mirrors the deployed LeadCaptureStep). */}
              {customFields.map((f) => {
                const val = customValues[f.id];
                const missing = showErrors && f.required
                  && (f.type === 'checkbox' ? val !== true : String(val ?? '').trim() === '');
                if (f.type === 'checkbox') {
                  return (
                    <label key={f.id} data-testid={`lead-modal-custom-${f.id}`}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: subColor, fontFamily, cursor: 'pointer' }}>
                      <input type="checkbox" checked={val === true}
                        onChange={(e) => setCustomValue(f.id, e.target.checked)}
                        style={{ marginTop: 2 }} />
                      <span>{f.label}{f.required ? ' *' : ''}</span>
                    </label>
                  );
                }
                const fieldBorder = missing ? errorColor : theme.border;
                return (
                  <div key={f.id} data-testid={`lead-modal-custom-${f.id}`}
                    style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: subColor, fontFamily }}>
                      {f.label}{f.required ? '' : ' (optional)'}
                    </span>
                    {f.type === 'select' ? (
                      <select value={String(val ?? '')}
                        onChange={(e) => setCustomValue(f.id, e.target.value)}
                        style={{ width: '100%', height: 48, borderRadius: radiusPx, border: `1px solid ${fieldBorder}`, padding: '0 12px', fontSize: 14, color: headingColor, background: theme.surface, fontFamily, outline: 'none', boxSizing: 'border-box' }}>
                        <option value="">Select...</option>
                        {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : f.type === 'textarea' ? (
                      <textarea rows={3} value={String(val ?? '')}
                        onChange={(e) => setCustomValue(f.id, e.target.value)}
                        style={{ width: '100%', borderRadius: radiusPx, border: `1px solid ${fieldBorder}`, padding: '8px 12px', fontSize: 14, color: headingColor, background: theme.surface, fontFamily, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
                    ) : (
                      <input
                        type={f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : f.type === 'number' ? 'number' : 'text'}
                        value={String(val ?? '')}
                        onChange={(e) => setCustomValue(f.id, e.target.value)}
                        style={{ width: '100%', height: 48, borderRadius: radiusPx, border: `1px solid ${fieldBorder}`, padding: '0 12px', fontSize: 14, color: headingColor, background: theme.surface, fontFamily, outline: 'none', boxSizing: 'border-box' }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Action tab — spam honeypot. Off-screen + aria-hidden + tabIndex
                -1 so humans never see, focus, or tab into it; bots that fill
                every input trip it and the submission is silently dropped.
                Deliberately NOT display:none (some bots skip those). */}
            {honeypot && (
              <input
                type="text"
                name="company_website"
                data-testid="lead-modal-honeypot"
                value={hpValue}
                onChange={(e) => setHpValue(e.target.value)}
                tabIndex={-1}
                aria-hidden="true"
                autoComplete="off"
                style={{
                  position: 'absolute',
                  width: 1, height: 1,
                  padding: 0, margin: -1, border: 0,
                  left: '-9999px', top: 'auto',
                  overflow: 'hidden', opacity: 0,
                  pointerEvents: 'none',
                }}
              />
            )}

            {showErrors && !ready && (
              <p
                data-testid="lead-modal-error"
                style={{ fontSize: 12, color: errorColor, margin: '8px 0 0 0' }}
              >
                {!nameOk
                  ? 'Please enter your full name.'
                  : !phoneValid
                    ? 'Please enter a valid phone number.'
                    : 'Please enter a valid email address.'}
              </p>
            )}

            {submitError && (
              <p
                data-testid="lead-modal-submit-error"
                style={{ fontSize: 12, color: errorColor, margin: '8px 0 0 0' }}
              >
                {submitError}
              </p>
            )}

            <button
              type="button"
              data-testid="lead-modal-submit"
              onClick={handleSubmit}
              disabled={submitting}
              style={{ ...submitBtnStyle, opacity: submitting ? 0.7 : 1 }}
            >
              {submitting ? 'Sending…' : submitLabel}
              {!submitting && <span aria-hidden="true" style={{ fontSize: 16 }}>→</span>}
            </button>

            {/* Optional consent line. */}
            <p style={{ fontSize: 11, color: consentColor, margin: '10px 0 0 0', lineHeight: 1.5 }}>
              By submitting, you agree to be contacted about your request. We'll
              only use your details to follow up on this quote.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
