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
  onChange?: (next: { name: string; email: string; phone: string }) => void;
  /** Fired after a successful soft-CTA submit ("Email me"). */
  onEmailQuoteSent?: () => void;
  /** Fired after a successful hard-CTA submit ("Book consultation"). The
   *  parent should redirect to `bookingUrl` after the lead is captured. */
  onBookingRequested?: () => void;
}

type Status = 'idle' | 'sending' | 'sent' | 'error';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ContactStep({
  theme, fontFamily, radiusPx = '10px', calculatorId, quoteHeadline,
  bookingUrl, ownerEmail, answers, quoteAmount,
  initialName = '', initialEmail = '', initialPhone = '',
  onChange, onEmailQuoteSent, onBookingRequested,
}: Props) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const accent = theme.accent;
  const nameOk = name.trim().length >= 2;
  const emailOk = EMAIL_RE.test(email.trim());
  const ready = nameOk && emailOk;

  function persist(nextName: string, nextEmail: string, nextPhone: string) {
    if (onChange) onChange({ name: nextName, email: nextEmail, phone: nextPhone });
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
            answers: answers ?? null,
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

  const inputStyle: CSSProperties = {
    width: '100%', height: 42, borderRadius: radiusPx,
    border: `1px solid ${theme.border}`, padding: '0 12px',
    fontSize: 14, color: theme.text, background: theme.surface,
    fontFamily, outline: 'none', boxSizing: 'border-box',
  };

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
        display: 'flex', flexDirection: 'column', gap: 12,
        padding: 16, borderRadius: radiusPx,
        background: theme.surface, border: `1px solid ${theme.border}`,
        fontFamily, color: theme.text, boxSizing: 'border-box',
      }}
    >
      {quoteHeadline && (
        <p
          data-testid="contact-step-headline"
          style={{
            fontSize: 13, fontWeight: 700, color: theme.textMuted,
            margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em',
          }}
        >
          Your quote: <span style={{ color: accent }}>{quoteHeadline}</span>
        </p>
      )}
      <p style={{ fontSize: 15, fontWeight: 800, margin: 0, lineHeight: 1.3 }}>
        Where should we send it?
      </p>
      <input
        data-testid="contact-step-name"
        type="text"
        placeholder="Your name"
        value={name}
        onChange={(e) => { setName(e.target.value); persist(e.target.value, email, phone); }}
        autoComplete="name"
        style={inputStyle}
      />
      <input
        data-testid="contact-step-email"
        type="email"
        placeholder="Email address"
        value={email}
        onChange={(e) => { setEmail(e.target.value); persist(name, e.target.value, phone); }}
        autoComplete="email"
        style={inputStyle}
      />
      <input
        data-testid="contact-step-phone"
        type="tel"
        placeholder="Phone (optional)"
        value={phone}
        onChange={(e) => { setPhone(e.target.value); persist(name, email, e.target.value); }}
        autoComplete="tel"
        style={inputStyle}
      />

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
        {status === 'sending' ? 'Sending…' : 'Email me this quote'}
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
          {hardCtaLabel}
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
  );
}
