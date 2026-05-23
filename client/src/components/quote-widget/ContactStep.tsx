/**
 * BD-2a — final step (after the quote is shown): contact capture + dual CTAs.
 *
 * Research (BD-0 punch list):
 *  - "Email me this quote" (soft CTA) recovers up to 35 % of abandoners via
 *    the email-quote follow-up (busyseed study).
 *  - "Book consultation" (hard CTA) is the highest-intent action — wire it
 *    to the business profile's calendar link when one is configured.
 *
 * Submit posts to the existing `/api/leads` endpoint (see
 * server/routes/leadRoutes.ts). Name + email are required; phone optional.
 *
 * Pure presentational + side-effect-free POST. State is owned by the parent
 * (`AdvancedCalculator`) so a back/forward through the stepper preserves
 * what the user typed.
 */
import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { WidgetTheme } from './widgetThemes';
import AddressAutocompleteField, { type AddressSelection } from './AddressAutocompleteField';

/* ─── BD-2a-polish — Input field rules compliance ───
 *
 * Design-system rule (locked 2026-05-21):
 *   1. Title INSIDE the input field (placeholder-as-label / floating label)
 *   2. Help cue (?) anchored top-left of the component
 *   3. No duplicated titles
 *   4. Max 2px vertical gap between stacked input components
 *   5. Button-choice fields: pills/chips flush at 1-2px gap
 *
 * `<FloatingLabelInput>` below is a tiny inline helper — placeholder doubles
 * as the resting label, focus / value lifts it to a smaller label above the
 * value. No external font; uses the theme's fontFamily prop. Inline styles
 * keep parity with the rest of this file. */
function FloatingLabelInput({
  id, label, value, onChange, type = 'text', autoComplete, theme,
  fontFamily, radiusPx = '10px', testId,
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
}) {
  const [focused, setFocused] = useState(false);
  const lifted = focused || value.length > 0;

  const wrapperStyle: CSSProperties = {
    position: 'relative', width: '100%',
  };
  const inputStyle: CSSProperties = {
    width: '100%', height: 48, borderRadius: radiusPx,
    border: `1px solid ${focused ? theme.accent : theme.border}`,
    padding: '18px 12px 6px 12px',
    fontSize: 14, color: theme.text, background: theme.surface,
    fontFamily, outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 150ms ease-out',
  };
  const labelStyle: CSSProperties = {
    position: 'absolute',
    left: 12,
    top: lifted ? 6 : 14,
    fontSize: lifted ? 10 : 13,
    color: lifted ? (focused ? theme.accent : theme.textMuted) : theme.textMuted,
    pointerEvents: 'none',
    transition: 'all 150ms ease-out',
    fontFamily,
    letterSpacing: lifted ? '0.04em' : 'normal',
    textTransform: lifted ? 'uppercase' : 'none',
    fontWeight: lifted ? 700 : 400,
  };

  return (
    <div data-theme="light" style={wrapperStyle}>
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
        // Placeholder intentionally a single space so the input is never
        // "empty" for browser auto-styling but the floating label is the
        // only visible label.
        placeholder=" "
      />
      <label htmlFor={id} style={labelStyle}>{label}</label>
    </div>
  );
}

interface Props {
  /** Resolved widget theme — accent / borders / text colours. */
  theme: WidgetTheme;
  /** Style-tab font stack. */
  fontFamily?: string;
  /** Style-tab radius applied to inputs / buttons. */
  radiusPx?: string;
  /** Calculator id (numeric) — required to POST to /api/leads. When absent
   *  (preview / wizard), the soft CTA renders disabled with a note. */
  calculatorId?: number;
  /** Headline value shown above the form ("Your quote: $1,200 – $1,500"). */
  quoteHeadline?: string;
  /** Booking URL (e.g. Calendly link) wired from the business profile.
   *  When absent, the "Book consultation" button falls back to a `mailto:`
   *  prefill via `ownerEmail` or hides itself entirely. */
  bookingUrl?: string;
  /** Owner email — used as a `mailto:` fallback when no booking URL exists. */
  ownerEmail?: string;
  /** Snapshot of the user's answers (sent with the lead payload). */
  answers?: Record<string, unknown>;
  /** Numeric quote value sent with the lead payload (for CRM-side analysis). */
  quoteAmount?: number;
  /** Initial name (resumes across stepper back/forward). */
  initialName?: string;
  /** Initial email. */
  initialEmail?: string;
  /** Initial phone. */
  initialPhone?: string;
  /** Persist edits back to the parent so a back-button doesn't wipe them. */
  onChange?: (next: { name: string; email: string; phone: string; address?: string }) => void;
  /** Fired after a successful soft-CTA submit ("Email me"). */
  onEmailQuoteSent?: () => void;
  /** Fired after a successful hard-CTA submit ("Book consultation"). The
   *  parent should redirect to `bookingUrl` after the lead is captured. */
  onBookingRequested?: () => void;
  /**
   * BD-2c — when true, render the Google Places address autocomplete field
   * above the name/email/phone block. Falls back to a plain text input when
   * `VITE_GOOGLE_PLACES_API_KEY` is missing (graceful degradation).
   * Set from `advanced.requireAddress` on the template.
   */
  requireAddress?: boolean;
  /** BD-2c — initial address (resumes across stepper back/forward). */
  initialAddress?: string;
  /** BD-2c — business service area, used to restrict autocomplete countries. */
  serviceArea?: string;
  /** BD-2c — fired when the user picks a Places suggestion. Used by the
   *  result-panel peer-anchor line (needs ZIP). */
  onAddressSelected?: (selection: AddressSelection) => void;
  /**
   * BG-7 Item 6 — owner override for the soft-CTA "Email me this quote"
   * button. Sanitized HTML; falls back to the default copy when absent /
   * empty. AdvancedCalculator passes the sanitized value down — this
   * component does NOT sanitize again (single source of truth, the value
   * is already safe).
   */
  emailQuoteLabelHtml?: string;
  /** BG-7 Item 6 — owner override for the hard-CTA "Book a consultation"
   *  / "Email the team" button. Same shape as `emailQuoteLabelHtml`. */
  bookSlotLabelHtml?: string;
}

type Status = 'idle' | 'sending' | 'sent' | 'error';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ContactStep({
  theme, fontFamily, radiusPx = '10px', calculatorId, quoteHeadline,
  bookingUrl, ownerEmail, answers, quoteAmount,
  initialName = '', initialEmail = '', initialPhone = '',
  onChange, onEmailQuoteSent, onBookingRequested,
  requireAddress = false, initialAddress = '', serviceArea,
  onAddressSelected,
  emailQuoteLabelHtml, bookSlotLabelHtml,
}: Props) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  // BD-2c — address state. Always declared (cost ~0 when requireAddress=false);
  // simpler than gating the hook behind the flag.
  const [address, setAddress] = useState(initialAddress);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const accent = theme.accent;
  const nameOk = name.trim().length >= 2;
  const emailOk = EMAIL_RE.test(email.trim());
  const ready = nameOk && emailOk;

  function persist(nextName: string, nextEmail: string, nextPhone: string, nextAddress?: string) {
    if (onChange) {
      onChange({
        name: nextName, email: nextEmail, phone: nextPhone,
        ...(requireAddress ? { address: nextAddress ?? address } : null),
      });
    }
  }

  async function submitLead(intent: 'email' | 'booking') {
    if (!ready) return;
    setStatus('sending');
    setError(null);
    try {
      if (calculatorId) {
        const resp = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            calculator_id: calculatorId,
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim() || null,
            quote_amount: typeof quoteAmount === 'number' && Number.isFinite(quoteAmount)
              ? quoteAmount : null,
            // BD-2c — when address autocomplete is on, the formatted address
            // rides along inside the `answers` blob (no schema change). The
            // lead row already accepts arbitrary keys here.
            answers: requireAddress && address.trim()
              ? { ...(answers ?? {}), service_address: address.trim() }
              : (answers ?? null),
          }),
        });
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body?.error || `Request failed (${resp.status})`);
        }
      }
      setStatus('sent');
      if (intent === 'email' && onEmailQuoteSent) onEmailQuoteSent();
      if (intent === 'booking') {
        if (onBookingRequested) onBookingRequested();
        if (bookingUrl) {
          // Open the booking link in a new tab so the calculator stays mounted
          // (so the success thank-you stays visible). Falls back to same-window
          // if the popup is blocked.
          const w = window.open(bookingUrl, '_blank', 'noopener,noreferrer');
          if (!w) window.location.href = bookingUrl;
        }
      }
    } catch (e: any) {
      setStatus('error');
      setError(e?.message || 'Something went wrong. Please try again.');
    }
  }

  const primaryBtnStyle: CSSProperties = {
    width: '100%', height: 46, borderRadius: radiusPx, border: 'none',
    background: accent, color: '#ffffff',
    fontSize: 14, fontWeight: 800, fontFamily, cursor: 'pointer',
    letterSpacing: '0.01em',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  };

  const secondaryBtnStyle: CSSProperties = {
    width: '100%', height: 44, borderRadius: radiusPx,
    background: 'transparent', color: theme.text,
    border: `1.5px solid ${theme.border}`,
    fontSize: 13, fontWeight: 700, fontFamily, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  };

  // Determine the hard CTA target — booking URL wins; otherwise mailto.
  const hardCtaAvailable = !!bookingUrl || !!ownerEmail;
  const hardCtaLabel = bookingUrl ? 'Book a consultation' : 'Email the team';

  if (status === 'sent') {
    return (
      <div
        data-testid="contact-step-thanks"
        style={{
          display: 'flex', flexDirection: 'column', gap: 8,
          padding: 16, borderRadius: radiusPx,
          background: theme.accentTint, color: theme.text, fontFamily,
        }}
      >
        <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>
          Thanks, {name.split(' ')[0] || 'and'} — we’ll be in touch shortly.
        </p>
        <p style={{ fontSize: 13, color: theme.textMuted, margin: 0, lineHeight: 1.5 }}>
          We just sent a copy of this quote to {email.trim()}.
          {bookingUrl ? ' If you’d like to lock in a time, the booking link is open in a new tab.' : ''}
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="contact-step"
      data-component-name="Contact step"
      data-component-type="contact-step"
      style={{
        position: 'relative',
        display: 'flex', flexDirection: 'column', gap: 2,
        padding: '16px 16px 14px 16px', borderRadius: radiusPx,
        background: theme.surface, border: `1px solid ${theme.border}`,
        fontFamily, color: theme.text, boxSizing: 'border-box',
      }}
    >
      {/* BD-2a-polish — single help cue anchored top-left of the whole step,
          covering all three fields (name / email / phone). One label, one
          popover — no per-field duplication. */}
      <ContactStepHelpCue theme={theme} fontFamily={fontFamily} />

      {quoteHeadline && (
        <p
          data-testid="contact-step-headline"
          style={{
            fontSize: 13, fontWeight: 700, color: theme.textMuted,
            margin: '0 0 8px 0', paddingLeft: 28,
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}
        >
          Your quote: <span style={{ color: accent }}>{quoteHeadline}</span>
        </p>
      )}

      {/* BD-2c — Google Places address autocomplete. Renders only when the
          template opts in via `requireAddress`. Falls back to a plain text
          input (same FloatingLabelInput pattern) when the API key is
          missing — no broken UX. */}
      {requireAddress && (
        <AddressAutocompleteField
          theme={theme}
          fontFamily={fontFamily}
          radiusPx={radiusPx}
          value={address}
          serviceArea={serviceArea}
          onChange={(v) => { setAddress(v); persist(name, email, phone, v); }}
          onSelect={(sel) => {
            setAddress(sel.formatted);
            persist(name, email, phone, sel.formatted);
            if (onAddressSelected) onAddressSelected(sel);
          }}
          testId="contact-step-address"
        />
      )}
      <FloatingLabelInput
        id="contact-step-name"
        testId="contact-step-name"
        label="Your name"
        value={name}
        onChange={(v) => { setName(v); persist(v, email, phone); }}
        autoComplete="name"
        theme={theme}
        fontFamily={fontFamily}
        radiusPx={radiusPx}
      />
      <FloatingLabelInput
        id="contact-step-email"
        testId="contact-step-email"
        label="Email address"
        type="email"
        value={email}
        onChange={(v) => { setEmail(v); persist(name, v, phone); }}
        autoComplete="email"
        theme={theme}
        fontFamily={fontFamily}
        radiusPx={radiusPx}
      />
      <FloatingLabelInput
        id="contact-step-phone"
        testId="contact-step-phone"
        label="Phone (optional)"
        type="tel"
        value={phone}
        onChange={(v) => { setPhone(v); persist(name, email, v); }}
        autoComplete="tel"
        theme={theme}
        fontFamily={fontFamily}
        radiusPx={radiusPx}
      />

      {/* CTA cluster — explicit 12px gap from the input cluster above, then
          12px between buttons. Tight 2px gap is for STACKED INPUTS only;
          actions reclaim the airy 8/12px scale per the design-system rule. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
        {error && (
          <p
            data-testid="contact-step-error"
            style={{ fontSize: 12, color: '#b91c1c', margin: 0 }}
          >
            {error}
          </p>
        )}

        <button
          type="button"
          data-testid="contact-step-email-cta"
          onClick={() => submitLead('email')}
          disabled={!ready || status === 'sending'}
          style={{
            ...primaryBtnStyle,
            opacity: ready && status !== 'sending' ? 1 : 0.6,
            cursor: ready && status !== 'sending' ? 'pointer' : 'not-allowed',
          }}
        >
          {/* BG-7 Item 6 — owner override (sanitized HTML) or default copy. */}
          {status === 'sending'
            ? 'Sending…'
            : emailQuoteLabelHtml
              ? <span dangerouslySetInnerHTML={{ __html: emailQuoteLabelHtml }} />
              : 'Email me this quote'}
          {status !== 'sending' && <span style={{ fontSize: 16 }}>→</span>}
        </button>

        {hardCtaAvailable && (
          <button
            type="button"
            data-testid="contact-step-book-cta"
            onClick={() => {
              // The booking button captures the lead first (so we never lose the
              // contact info even if the user bails on the calendar) and THEN
              // opens the booking URL — handled inside `submitLead`.
              if (bookingUrl || ownerEmail) submitLead('booking');
            }}
            disabled={!ready || status === 'sending'}
            style={{
              ...secondaryBtnStyle,
              opacity: ready && status !== 'sending' ? 1 : 0.55,
              cursor: ready && status !== 'sending' ? 'pointer' : 'not-allowed',
            }}
          >
            {/* BG-7 Item 6 — owner override (sanitized HTML) or default copy. */}
            {bookSlotLabelHtml
              ? <span dangerouslySetInnerHTML={{ __html: bookSlotLabelHtml }} />
              : hardCtaLabel}
          </button>
        )}

        <p
          style={{
            fontSize: 11, color: theme.textMuted, margin: 0, lineHeight: 1.5,
          }}
        >
          We’ll only use your details to send this quote and follow up.
        </p>
      </div>
    </div>
  );
}

/* ─── BD-2a-polish — Help cue (top-left anchored) ───
 *
 * One popover for the whole contact step (not per field), per the
 * design-system "help cue top-left of the component" rule. Hover or
 * click-to-toggle on small screens. */
function ContactStepHelpCue({
  theme, fontFamily,
}: { theme: WidgetTheme; fontFamily?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        position: 'absolute', top: 8, left: 8,
        zIndex: 2,
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="What do we do with this information?"
        data-testid="contact-step-helpcue"
        onClick={() => {
          setOpen((v) => !v);
          // BD-2c — explicit Help click also reveals the AI chat bubble
          // when in 'rescue' visibility mode.
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('quotequick:help'));
          }
        }}
        style={{
          width: 18, height: 18, borderRadius: 999,
          border: `1px solid ${theme.border}`,
          background: theme.surface,
          color: theme.textMuted,
          fontSize: 11, fontWeight: 700, fontFamily,
          lineHeight: '16px', textAlign: 'center',
          padding: 0, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >?</button>
      {open && (
        <div
          role="tooltip"
          data-testid="contact-step-helpcue-popover"
          style={{
            position: 'absolute', top: 22, left: 0,
            width: 240, padding: 10,
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            fontSize: 12, lineHeight: 1.5,
            color: theme.text, fontFamily,
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}
        >
          We use these details only to send your quote and follow up.
          Email is required; phone is optional and helps us reach you faster
          for time-sensitive work.
        </div>
      )}
    </div>
  );
}
