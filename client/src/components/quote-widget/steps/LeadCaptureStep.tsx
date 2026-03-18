import { useState, useMemo } from 'react';
import { Send, CheckCircle2, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { calculateEstimate } from '@shared/calculateEstimate';
import { useWidgetState } from '../useWidgetState';
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

  const smsConsent = state.lead.smsConsent;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || leadSubmitted) return;

    // Basic client-side validation
    if (!leadData.name.trim() && !leadData.email.trim() && !leadData.phone.trim()) {
      setError('Please fill in at least one contact field.');
      return;
    }

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
      <div className="space-y-4 text-center py-4">
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: accentColor ? `${accentColor}15` : '#f0fdf4' }}
        >
          <CheckCircle2 className="h-7 w-7" style={{ color: accentColor || '#22c55e' }} />
        </div>
        <h3 className="text-lg font-semibold">
          {config.calculator.lead_thank_you_message || 'Thank you!'}
        </h3>
        <p className="text-sm text-muted-foreground">
          We've received your information and will be in touch soon.
        </p>
      </div>
    );
  }

  // ─── Form ───
  return (
    <div className="space-y-4">
      {step.title && <h3 className="text-lg font-semibold">{step.title}</h3>}
      {step.subtitle && <p className="text-sm text-muted-foreground">{step.subtitle}</p>}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="lead-name">Name</Label>
          <Input
            id="lead-name"
            type="text"
            placeholder="Your name"
            value={leadData.name}
            onChange={(e) => updateLead('name', e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lead-email">Email</Label>
          <Input
            id="lead-email"
            type="email"
            placeholder="you@example.com"
            value={leadData.email}
            onChange={(e) => updateLead('email', e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lead-phone">Phone</Label>
          <Input
            id="lead-phone"
            type="tel"
            placeholder="(555) 123-4567"
            value={leadData.phone}
            onChange={(e) => updateLead('phone', e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lead-company">Company (optional)</Label>
          <Input
            id="lead-company"
            type="text"
            placeholder="Company name"
            value={leadData.company}
            onChange={(e) => updateLead('company', e.target.value)}
          />
        </div>

        {/* SMS consent */}
        <label className="flex items-start gap-3 pt-1 cursor-pointer">
          <Checkbox
            checked={smsConsent}
            onCheckedChange={(checked) =>
              dispatch({ type: 'SET_SMS_CONSENT', value: !!checked })
            }
            className="mt-0.5"
          />
          <span className="text-xs text-muted-foreground leading-relaxed">
            I agree to receive text messages about my quote from this business.
            Message &amp; data rates may apply.
          </span>
        </label>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
          style={{ background: accentColor ? `linear-gradient(135deg, ${accentColor}, ${accentColor}dd)` : '#6366f1' }}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {config.calculator.cta_button_text || 'Get My Quote'}
        </button>
      </form>
    </div>
  );
}
