import { useMemo, useEffect, useRef } from 'react';
import { Phone, Shield } from 'lucide-react';
import { trackEvent } from '@/lib/trackEvent';
import { useWidgetState } from '../useWidgetState';
import { calculateEstimate } from '@shared/calculateEstimate';
import { eff, stepTitleStyle, stepSubtitleStyle } from '../designTokens';
import type { StepDefinition } from '@shared/wizardSchema';

interface PriceRevealStepProps {
  step: StepDefinition;
  accentColor?: string;
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
            Instant estimate based on your inputs. Final pricing may vary based on your specific project. No obligation.
          </span>
        </div>
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
  return (
    <div style={{
      borderRadius: eff.radiusXl,
      border: `1px solid ${eff.buttonBorder}`,
      background: eff.bgSecondary,
      padding: '32px 24px',
    }}>
      <div style={{ textAlign: 'center', marginBottom: breakdown.length > 0 ? '24px' : 0 }}>
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
          ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
  return (
    <div style={{
      borderRadius: eff.radiusXl,
      border: `1px solid ${eff.buttonBorder}`,
      background: eff.bgSecondary,
      padding: '32px 24px',
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
        ${rangeMin.toLocaleString()} &ndash; ${rangeMax.toLocaleString()}
      </p>
      <p style={{ fontSize: '14px', color: eff.textBody, margin: 0, lineHeight: 1.5 }}>
        Contact us for an exact quote tailored to your needs.
      </p>
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
      padding: '40px 24px',
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
