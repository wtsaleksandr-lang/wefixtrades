import { useState, useMemo } from 'react';
import { Send, CheckCircle2, Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { calculateEstimate } from '@shared/calculateEstimate';
import { useWidgetState } from '../useWidgetState';
import { eff, stepTitleStyle, stepSubtitleStyle, inputStyle, primaryButtonStyle } from '../designTokens';
import type { StepDefinition } from '@shared/wizardSchema';

interface LeadCaptureStepProps {
  step: StepDefinition;
  accentColor?: string;
}

/**
 * Collects lead information and submits to POST /api/leads.
 * Reads/writes through widget state (leadData, smsConsent, leadSubmitted).
 * Does NOT handle coupons or expiration — those are separate concerns.
 */
export default function LeadCaptureStep({ step, accentColor }: LeadCaptureStepProps) {
  const {
    config,
    state,
    dispatch,
    leadData,
    leadSubmitted,
    updateLead,
    estimateInputs,
    answers,
  } = useWidgetState();

  // Derive current estimate for quote_amount (same pattern as PriceRevealStep)
  const estimate = useMemo(
    () => calculateEstimate(config.pricingConfig, estimateInputs),
    [config.pricingConfig, estimateInputs],
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; phone?: string }>({});

  const smsConsent = state.lead.smsConsent;

  function validateFields(): boolean {
    const email = leadData.email.trim();
    const phone = leadData.phone.trim();
    const errs: { email?: string; phone?: string } = {};

    // Require at least email or phone
    if (!email && !phone) {
      setError('Please provide your email or phone number.');
      return false;
    }

    // Validate email format if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = 'Please enter a valid email address.';
    }

    // Validate phone has at least 7 digits if provided
    if (phone && phone.replace(/\D/g, '').length < 7) {
      errs.phone = 'Please enter a valid phone number.';
    }

    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return false;

    setError(null);
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || leadSubmitted) return;

    if (!validateFields()) return;

    setSubmitting(true);
    setError(null);

    try {
      const body = {
        calculator_id: config.calculator.id,
        name: leadData.name || null,
        email: leadData.email || null,
        phone: leadData.phone || null,
        company: leadData.company || null,
        quote_amount: estimate?.total ?? null,
        answers: answers,
        sms_consent: smsConsent,
        consent_timestamp: smsConsent ? new Date().toISOString() : null,
      };

      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to submit. Please try again.');
      }

      dispatch({ type: 'MARK_LEAD_SUBMITTED' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Already submitted state ───
  if (leadSubmitted) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: eff.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <CheckCircle2 style={{ width: 28, height: 28, color: eff.buttonBg }} />
        </div>
        <h3 style={{ ...stepTitleStyle, textAlign: 'center' }}>
          {config.calculator.lead_thank_you_message || 'Thank you!'}
        </h3>
        <p style={{ ...stepSubtitleStyle, textAlign: 'center' }}>
          We've received your information and will be in touch soon.
        </p>
      </div>
    );
  }

  // ─── Form ───
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {step.title && <h3 style={stepTitleStyle}>{step.title}</h3>}
      {step.subtitle && <p style={stepSubtitleStyle}>{step.subtitle}</p>}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={{ fontSize: '13px', fontWeight: 600, color: eff.text, display: 'block', marginBottom: '6px' }}>
            Name
          </label>
          <input
            type="text"
            placeholder="Your name"
            value={leadData.name}
            onChange={(e) => updateLead('name', e.target.value)}
            style={inputStyle}
            onFocus={(e) => { e.currentTarget.style.borderColor = eff.buttonBg; e.currentTarget.style.boxShadow = `0 0 0 3px ${eff.buttonBorder}`; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = eff.buttonBorder; e.currentTarget.style.boxShadow = 'none'; }}
          />
        </div>

        <div>
          <label style={{ fontSize: '13px', fontWeight: 600, color: eff.text, display: 'block', marginBottom: '6px' }}>
            Email
          </label>
          <input
            type="email"
            placeholder="you@example.com"
            value={leadData.email}
            onChange={(e) => { updateLead('email', e.target.value); setFieldErrors(p => ({ ...p, email: undefined })); setError(null); }}
            style={{
              ...inputStyle,
              ...(fieldErrors.email ? { borderColor: '#dc2626' } : {}),
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = fieldErrors.email ? '#dc2626' : eff.buttonBg; e.currentTarget.style.boxShadow = `0 0 0 3px ${eff.buttonBorder}`; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = fieldErrors.email ? '#dc2626' : eff.buttonBorder; e.currentTarget.style.boxShadow = 'none'; }}
          />
          {fieldErrors.email && (
            <p style={{ fontSize: '12px', color: '#dc2626', margin: '4px 0 0' }}>{fieldErrors.email}</p>
          )}
        </div>

        <div>
          <label style={{ fontSize: '13px', fontWeight: 600, color: eff.text, display: 'block', marginBottom: '6px' }}>
            Phone
          </label>
          <input
            type="tel"
            placeholder="(555) 123-4567"
            value={leadData.phone}
            onChange={(e) => { updateLead('phone', e.target.value); setFieldErrors(p => ({ ...p, phone: undefined })); setError(null); }}
            style={{
              ...inputStyle,
              ...(fieldErrors.phone ? { borderColor: '#dc2626' } : {}),
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = fieldErrors.phone ? '#dc2626' : eff.buttonBg; e.currentTarget.style.boxShadow = `0 0 0 3px ${eff.buttonBorder}`; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = fieldErrors.phone ? '#dc2626' : eff.buttonBorder; e.currentTarget.style.boxShadow = 'none'; }}
          />
          {fieldErrors.phone && (
            <p style={{ fontSize: '12px', color: '#dc2626', margin: '4px 0 0' }}>{fieldErrors.phone}</p>
          )}
        </div>

        <div>
          <label style={{ fontSize: '13px', fontWeight: 600, color: eff.text, display: 'block', marginBottom: '6px' }}>
            Company <span style={{ fontWeight: 400, color: eff.textBody }}>(optional)</span>
          </label>
          <input
            type="text"
            placeholder="Company name"
            value={leadData.company}
            onChange={(e) => updateLead('company', e.target.value)}
            style={inputStyle}
            onFocus={(e) => { e.currentTarget.style.borderColor = eff.buttonBg; e.currentTarget.style.boxShadow = `0 0 0 3px ${eff.buttonBorder}`; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = eff.buttonBorder; e.currentTarget.style.boxShadow = 'none'; }}
          />
        </div>

        {/* SMS consent */}
        <label style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          padding: '8px 0',
          cursor: 'pointer',
        }}>
          <Checkbox
            checked={smsConsent}
            onCheckedChange={(checked) =>
              dispatch({ type: 'SET_SMS_CONSENT', value: !!checked })
            }
            className="h-5 w-5 rounded border-[#d5e1e7] data-[state=checked]:bg-[#394247] data-[state=checked]:border-[#394247] data-[state=checked]:text-[#e4edf1] focus-visible:ring-[#d5e1e7]"
            style={{ marginTop: '2px' }}
          />
          <span style={{ fontSize: '12px', color: eff.textBody, lineHeight: 1.6 }}>
            I agree to receive text messages about my quote from this business.
            Message &amp; data rates may apply.
          </span>
        </label>

        {error && (
          <p style={{ fontSize: '14px', color: '#dc2626', margin: 0 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{
            ...primaryButtonStyle,
            opacity: submitting ? 0.6 : 1,
          }}
          onMouseEnter={(e) => { if (!submitting) e.currentTarget.style.background = eff.buttonBgHover; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = eff.buttonBg; }}
          onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
          onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          {submitting ? (
            <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
          ) : (
            <Send style={{ width: 16, height: 16 }} />
          )}
          {config.calculator.cta_button_text || 'Get My Quote'}
        </button>
      </form>
    </div>
  );
}
