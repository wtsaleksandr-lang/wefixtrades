import { useMemo, useEffect, useRef, useState } from 'react';
import { Phone, Shield, CreditCard } from 'lucide-react';
import HelpTip from '../HelpTip';
import { trackEvent } from '@/lib/trackEvent';
import { useWidgetState } from '../useWidgetState';
import { calculateEstimate } from '@shared/calculateEstimate';
import { eff, stepTitleStyle, primaryButtonStyle } from '../designTokens';
import type { StepDefinition } from '@shared/wizardSchema';
import BookNowInlineWidget from './BookNowInlineWidget';

interface PriceRevealStepProps {
  step: StepDefinition;
  accentColor?: string; // Reserved for future theme integration
}

/**
 * Animated count-up — eases a number from 0 on first reveal up to its target,
 * and from the current displayed value to a new target whenever inputs change.
 * easeOutCubic; respects prefers-reduced-motion by snapping instantly.
 */
function useCountUp(target: number, durationMs = 680): number {
  const reduceMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [value, setValue] = useState(reduceMotion ? target : 0);
  const valueRef = useRef(value);
  valueRef.current = value;
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (reduceMotion) { setValue(target); return; }
    const from = valueRef.current;
    if (Math.abs(from - target) < 0.005) { setValue(target); return; }
    const start = performance.now();
    const animate = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(animate);
      else setValue(target);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, durationMs, reduceMotion]);
  return value;
}

/**
 * Calculates and displays the estimate. Derives the result
 * synchronously from estimateInputs — no stale-dependency risk.
 * Zero changes to calculateEstimate.ts.
 */
export default function PriceRevealStep({ step, accentColor }: PriceRevealStepProps) {
  const { estimateInputs, config } = useWidgetState();

  // Derive estimate directly from current inputs. useMemo ensures
  // recalculation only when inputs or pricing config actually change,
  // and avoids the stale-dependency bug of useEffect + recalculate().
  const estimate = useMemo(() => {
    const result = calculateEstimate(config.pricingConfig, estimateInputs);
    // Guard: ensure total is never NaN for display
    if (!Number.isFinite(result.total)) {
      return { ...result, total: 0 };
    }
    return result;
  }, [config.pricingConfig, estimateInputs]);

  // Post-quote action: 'redirect' mode shows a CTA button instead of a lead form.
  const action = (config.calculator.calculator_settings as any)?.action;
  const redirect = action?.mode === 'redirect' ? action?.redirect : null;
  const showRedirect = !!(redirect && redirect.button_url);

  const trackedRef = useRef(false);
  useEffect(() => {
    if (!trackedRef.current && config.calculator.id === 0) {
      trackedRef.current = true;
      trackEvent("demo_price_seen", { trade: (config.calculator.slug || "").replace("demo-", ""), total: estimate?.total ?? null });
    }
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {step.title && <h3 style={stepTitleStyle}>{step.title}</h3>}

      {!estimate && (
        <div style={{
          borderRadius: eff.radiusLg,
          border: `1px solid ${eff.buttonBorder}`,
          padding: '40px 24px',
          textAlign: 'center',
          color: eff.textBody,
          fontSize: '14px',
        }}>
          Calculating...
        </div>
      )}

      {estimate?.type === 'call_for_quote' && (
        <CallForQuoteBlock message={estimate.message} />
      )}

      {estimate?.type === 'range' && (
        <RangeBlock rangeMin={estimate.rangeMin!} rangeMax={estimate.rangeMax!} />
      )}

      {estimate?.type === 'exact' && (
        <ExactPriceBlock
          total={estimate.total}
          breakdown={estimate.breakdown}
          callUs={estimate.callUs}
        />
      )}

      {/* Redirect CTA — shown when action.mode is 'redirect' */}
      {showRedirect && estimate && (
        <RedirectCtaBlock redirect={redirect} />
      )}

      {/* Trust microcopy */}
      {estimate && estimate.type !== 'call_for_quote' && (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
          fontSize: '13px',
          color: eff.textBody,
          lineHeight: 1.5,
        }}>
          <Shield style={{ width: 14, height: 14, flexShrink: 0, marginTop: '2px', opacity: 0.7 }} />
          <span>
            Instant estimate based on your inputs. No obligation.
            <HelpTip text="This price is calculated from the rates set by this business. The final amount may differ slightly after an on-site review of your specific project." />
          </span>
        </div>
      )}

      {/* Book Now inline — only when booking is configured for this calculator */}
      {estimate && estimate.type !== 'call_for_quote' && (
        <BookNowInlineWidget
          calculatorId={config.calculator.id}
          quoteAmount={estimate.total}
        />
      )}

      {/* Pay Deposit / Pay Now — only when payments are enabled */}
      {estimate && estimate.type !== 'call_for_quote' && (
        <PayDepositButton
          calculatorId={config.calculator.id}
          calculatorSettings={config.calculator.calculator_settings}
          totalDollars={estimate.total}
        />
      )}
    </div>
  );
}

/* ─── Sub-blocks ─── */

function ExactPriceBlock({
  total,
  breakdown,
  callUs,
}: {
  total: number;
  breakdown: Array<{ label: string; amount: number }>;
  callUs: boolean;
}) {
  const shownTotal = useCountUp(total);
  return (
    <div style={{
      borderRadius: eff.radiusXl,
      border: `1px solid ${eff.buttonBorder}`,
      background: eff.bgSecondary,
      padding: '24px 20px',
    }}>
      <div style={{ textAlign: 'center', marginBottom: breakdown.length > 0 ? '16px' : 0 }}>
        <p style={{
          fontSize: '12px',
          fontWeight: 600,
          color: eff.textBody,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          margin: '0 0 6px',
          fontFamily: eff.font,
        }}>
          Your Estimate
        </p>
        <p style={{
          fontSize: 'clamp(28px, 8vw, 36px)',
          fontWeight: 800,
          color: eff.text,
          margin: 0,
          fontFamily: eff.fontMono,
          lineHeight: 1,
          letterSpacing: '-0.02em',
        }}>
          ${shownTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>

      {breakdown.length > 0 && (
        <div style={{
          borderTop: `1px solid ${eff.buttonBorder}`,
          paddingTop: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          {breakdown.map((line, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '14px',
            }}>
              <span style={{ color: eff.textBody }}>{line.label}</span>
              <span style={{ fontWeight: 600, color: eff.text, fontFamily: eff.fontMono }}>
                ${line.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          ))}
        </div>
      )}

      {callUs && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          borderRadius: eff.radiusMd,
          background: '#fff',
          border: `1px solid ${eff.buttonBorder}`,
          padding: '12px 16px',
          fontSize: '13px',
          color: eff.textBody,
          marginTop: '16px',
        }}>
          <Phone style={{ width: 16, height: 16, flexShrink: 0, color: eff.buttonBg }} />
          <span>For jobs this size, we recommend calling us for a custom quote.</span>
        </div>
      )}
    </div>
  );
}

function RangeBlock({
  rangeMin,
  rangeMax,
}: {
  rangeMin: number;
  rangeMax: number;
}) {
  const shownMin = useCountUp(rangeMin);
  const shownMax = useCountUp(rangeMax);
  return (
    <div style={{
      borderRadius: eff.radiusXl,
      border: `1px solid ${eff.buttonBorder}`,
      background: eff.bgSecondary,
      padding: '24px 20px',
      textAlign: 'center',
    }}>
      <p style={{
        fontSize: '12px',
        fontWeight: 600,
        color: eff.textBody,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        margin: '0 0 6px',
        fontFamily: eff.font,
      }}>
        Estimated Range
      </p>
      <p style={{
        fontSize: 'clamp(24px, 7vw, 32px)',
        fontWeight: 800,
        color: eff.text,
        margin: '0 0 8px',
        fontFamily: eff.fontMono,
        lineHeight: 1.1,
        letterSpacing: '-0.02em',
      }}>
        ${Math.round(shownMin).toLocaleString()} &ndash; ${Math.round(shownMax).toLocaleString()}
      </p>
      <p style={{ fontSize: '14px', color: eff.textBody, margin: 0, lineHeight: 1.5 }}>
        Contact us for an exact quote tailored to your needs.
      </p>
    </div>
  );
}

/** Pay Deposit / Pay Now button — shown when calculator has accept_payments enabled */
function PayDepositButton({
  calculatorId,
  calculatorSettings,
  totalDollars,
}: {
  calculatorId: number;
  calculatorSettings?: Record<string, unknown>;
  totalDollars: number;
}) {
  const [paying, setPaying] = useState(false);

  const bookingSettings = (calculatorSettings as any)?.booking_settings;
  if (!bookingSettings?.accept_payments || !bookingSettings?.stripe_account_id) return null;
  if (calculatorId === 0) return null; // demo mode

  const depositPercent = bookingSettings.deposit_percent || 100;
  const totalCents = Math.round(totalDollars * 100);
  const depositCents = Math.round(totalCents * depositPercent / 100);
  const depositDollars = (depositCents / 100).toFixed(2);

  const label = depositPercent < 100
    ? `Pay $${depositDollars} Deposit (${depositPercent}%)`
    : `Pay $${depositDollars} Now`;

  async function handlePay() {
    setPaying(true);
    try {
      const res = await fetch(`/api/calculators/${calculatorId}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_cents: totalCents,
          customer_name: 'Customer',
          quote_details: { total_dollars: totalDollars },
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setPaying(false);
      }
    } catch {
      setPaying(false);
    }
  }

  return (
    <button
      onClick={handlePay}
      disabled={paying}
      style={{
        ...primaryButtonStyle,
        opacity: paying ? 0.6 : 1,
        pointerEvents: paying ? 'none' : 'auto',
        gap: '8px',
      }}
      onMouseOver={(e) => (e.currentTarget.style.background = eff.buttonBgHover)}
      onMouseOut={(e) => (e.currentTarget.style.background = eff.buttonBg)}
    >
      <CreditCard style={{ width: 16, height: 16 }} />
      {paying ? 'Redirecting to payment...' : label}
    </button>
  );
}

/** Redirect CTA — heading + caption + button, shown when action.mode is 'redirect'. */
function RedirectCtaBlock({
  redirect,
}: {
  redirect: { heading?: string; caption?: string; button_text?: string; button_url?: string };
}) {
  const go = () => {
    if (redirect.button_url) window.open(redirect.button_url, '_blank', 'noopener');
  };
  return (
    <div style={{
      borderRadius: eff.radiusXl,
      border: `1px solid ${eff.buttonBorder}`,
      background: eff.bgSecondary,
      padding: '24px 20px',
      textAlign: 'center',
    }}>
      <p style={{ fontSize: '18px', fontWeight: 700, color: eff.text, margin: '0 0 6px' }}>
        {redirect.heading || 'Thanks for your interest!'}
      </p>
      {redirect.caption && (
        <p style={{ fontSize: '14px', color: eff.textBody, margin: '0 0 16px', lineHeight: 1.5 }}>
          {redirect.caption}
        </p>
      )}
      <button
        type="button"
        onClick={go}
        style={{ ...primaryButtonStyle, ...(redirect.caption ? {} : { marginTop: '12px' }) }}
        onMouseOver={(e) => (e.currentTarget.style.background = eff.buttonBgHover)}
        onMouseOut={(e) => (e.currentTarget.style.background = eff.buttonBg)}
      >
        {redirect.button_text || 'Continue'}
      </button>
    </div>
  );
}

function CallForQuoteBlock({
  message,
}: {
  message?: string;
}) {
  return (
    <div style={{
      borderRadius: eff.radiusXl,
      border: `1px solid ${eff.buttonBorder}`,
      background: eff.bgSecondary,
      padding: '28px 20px',
      textAlign: 'center',
    }}>
      <div style={{
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        background: eff.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 16px',
      }}>
        <Phone style={{ width: 24, height: 24, color: eff.buttonBg }} />
      </div>
      <p style={{ fontSize: '18px', fontWeight: 700, color: eff.text, margin: '0 0 8px' }}>
        {message || 'Request a Quote'}
      </p>
      <p style={{ fontSize: '14px', color: eff.textBody, margin: 0, lineHeight: 1.5 }}>
        Fill in your details below and we'll get back to you with a custom quote.
      </p>
    </div>
  );
}
