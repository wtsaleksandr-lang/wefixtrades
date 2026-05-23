import { useMemo, useEffect, useRef, useState } from 'react';
import { Phone, Shield, CreditCard, Share2, Copy, Check, X, Mail, MessageCircle } from 'lucide-react';
import HelpTip from '../HelpTip';
import { trackEvent } from '@/lib/trackEvent';
import { useWidgetState } from '../useWidgetState';
import { calculateEstimate, type EstimateResult } from '@shared/calculateEstimate';
import { eff, stepTitleStyle, primaryButtonStyle } from '../designTokens';
import type { StepDefinition } from '@shared/wizardSchema';
import { OWNER_EDIT_TOKEN_KEY_PREFIX } from '@shared/quoteSnapshot';
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

  // Owner-configured typical-range gauge (conversion.context_range).
  const cr = (config.calculator.calculator_settings as any)?.conversion?.context_range;
  const contextRange = cr?.enabled && cr.high > cr.low ? { low: cr.low, high: cr.high } : null;

  const trackedRef = useRef(false);
  useEffect(() => {
    if (!trackedRef.current && config.calculator.id === 0) {
      trackedRef.current = true;
      trackEvent("demo_price_seen", { trade: (config.calculator.slug || "").replace("demo-", ""), total: estimate?.total ?? null });
    }
  }, []);

  return (
    <div data-theme="light" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
          contextRange={contextRange}
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

      {/* Wave R3 — Save + share this quote (live shareable URL). */}
      {estimate && estimate.type !== 'call_for_quote' && (
        <ShareQuoteButton estimate={estimate} />
      )}
    </div>
  );
}

/* ─── Sub-blocks ─── */

/**
 * Segmented cost-breakdown bar — a single pill split into shares proportional
 * to each line item. Minimal, single-accent, no axes (design-lock data-viz).
 */
function BreakdownBar({
  breakdown,
  colors,
}: {
  breakdown: Array<{ label: string; amount: number }>;
  colors: string[];
}) {
  const segs = breakdown
    .map((line, i) => ({ amount: line.amount, color: colors[i] }))
    .filter((s) => s.amount > 0);
  const total = segs.reduce((sum, s) => sum + s.amount, 0);
  if (segs.length < 2 || total <= 0) return null;
  return (
    <div style={{
      display: 'flex', gap: '2px', height: '10px', marginTop: '14px',
      borderRadius: eff.radiusXl, overflow: 'hidden', background: eff.chartTrack,
    }}>
      {segs.map((s, i) => (
        <div key={i} style={{
          flexGrow: s.amount, flexBasis: 0, minWidth: '4px', background: s.color,
        }} />
      ))}
    </div>
  );
}

/**
 * Estimate context gauge — plots the quote on the owner-provided typical
 * low–high band. Real data only: the band is owner-configured, not derived.
 */
function RangeGauge({ low, high, value }: { low: number; high: number; value: number }) {
  const span = high - low;
  if (span <= 0) return null;
  const pct = Math.max(0, Math.min(1, (value - low) / span));
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
  return (
    <div style={{ marginTop: '18px' }}>
      <p style={{
        fontSize: '12px', fontWeight: 600, color: eff.textBody,
        textTransform: 'uppercase', letterSpacing: '0.04em',
        margin: '0 0 10px', fontFamily: eff.font,
      }}>
        How your estimate compares
      </p>
      <div style={{
        position: 'relative', height: '8px',
        borderRadius: eff.radiusXl, background: eff.chartTrack,
      }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pct * 100}%`, background: eff.accent, borderRadius: eff.radiusXl,
        }} />
        <div style={{
          position: 'absolute', left: `${pct * 100}%`, top: '50%',
          transform: 'translate(-50%, -50%)',
          width: '16px', height: '16px', borderRadius: '50%',
          background: '#fff', border: `3px solid ${eff.accent}`, boxShadow: eff.shadowCard,
        }} />
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginTop: '7px',
        fontSize: '12px', color: eff.textBody, fontFamily: eff.fontMono,
      }}>
        <span>{fmt(low)}</span>
        <span>{fmt(high)}</span>
      </div>
    </div>
  );
}

function ExactPriceBlock({
  total,
  breakdown,
  callUs,
  contextRange,
}: {
  total: number;
  breakdown: Array<{ label: string; amount: number }>;
  callUs: boolean;
  contextRange?: { low: number; high: number } | null;
}) {
  const shownTotal = useCountUp(total);

  // Per-line segment colours — positive line items get the accent ramp in
  // order; the bar + line swatches only appear with 2+ positive shares.
  let segCursor = 0;
  const segColors = breakdown.map((line) =>
    line.amount > 0 ? eff.chartSeg[segCursor++ % eff.chartSeg.length] : eff.textMuted,
  );
  const showBreakdownBar = breakdown.filter((b) => b.amount > 0).length >= 2;
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

      {showBreakdownBar && <BreakdownBar breakdown={breakdown} colors={segColors} />}

      {breakdown.length > 0 && (
        <div style={{
          borderTop: showBreakdownBar ? 'none' : `1px solid ${eff.buttonBorder}`,
          paddingTop: showBreakdownBar ? 0 : '16px',
          marginTop: showBreakdownBar ? '12px' : 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          {breakdown.map((line, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '14px',
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '7px', color: eff.textBody }}>
                {showBreakdownBar && (
                  <span style={{
                    width: '8px', height: '8px', borderRadius: '2px',
                    background: segColors[i], flexShrink: 0,
                  }} />
                )}
                {line.label}
              </span>
              <span style={{ fontWeight: 600, color: eff.text, fontFamily: eff.fontMono }}>
                ${line.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          ))}
        </div>
      )}

      {contextRange && (
        <RangeGauge low={contextRange.low} high={contextRange.high} value={total} />
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

/**
 * Wave R3 — "Save + share this quote" button + modal.
 *
 * Posts the current widget state to /api/q/create and surfaces a modal
 * with the resulting public URL. The owner_edit_token returned by the
 * server is stored in localStorage so the creating device can edit the
 * snapshot later via the public viewer's "Edit values" panel.
 *
 * Hidden for demo calculators (id <= 0) — snapshots there would orphan
 * because the calculator isn't persisted.
 */
function ShareQuoteButton({ estimate }: { estimate: EstimateResult }) {
  const { config, estimateInputs, answers, leadData } = useWidgetState();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Demo / preview calculators don't get persistent snapshots — the
  // server would reject the create call and we'd surface an error to a
  // user who can't fix it. Just hide the button.
  if (!config.calculator.slug || config.calculator.id <= 0) return null;

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/q/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: config.calculator.slug,
          inputs: { estimateInputs, answers },
          computed: estimate,
          customer_name: leadData?.name || null,
          customer_email: leadData?.email || null,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(json.error || 'Failed to create shareable link');
      }
      const json = await res.json() as {
        url: string;
        snapshot_slug: string;
        owner_edit_token: string;
      };
      // Persist owner token to localStorage so this device can edit later.
      try {
        localStorage.setItem(OWNER_EDIT_TOKEN_KEY_PREFIX + json.snapshot_slug, json.owner_edit_token);
      } catch { /* ignore quota / private mode */ }
      const fullUrl = typeof window !== 'undefined'
        ? `${window.location.origin}${json.url}`
        : json.url;
      setShareUrl(fullUrl);
      trackEvent('quote_snapshot_created', { snapshot_slug: json.snapshot_slug });
    } catch (err: any) {
      setError(err?.message || 'Could not create link');
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    setOpen(true);
    if (!shareUrl) handleCreate();
  }

  function handleClose() {
    setOpen(false);
    setError(null);
    setCopied(false);
  }

  async function handleCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Copy failed — please select and copy manually');
    }
  }

  const messageBody = shareUrl
    ? `Here's your quote from ${config.calculator.business_name}: ${shareUrl}`
    : '';
  const smsHref = shareUrl ? `sms:?body=${encodeURIComponent(messageBody)}` : '#';
  const whatsappHref = shareUrl ? `https://wa.me/?text=${encodeURIComponent(messageBody)}` : '#';
  const emailHref = shareUrl
    ? `mailto:?subject=${encodeURIComponent(`Your quote from ${config.calculator.business_name}`)}&body=${encodeURIComponent(messageBody)}`
    : '#';

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        data-testid="share-quote-button"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontSize: 14, fontWeight: 600, color: eff.text,
          background: 'transparent',
          border: `1px solid ${eff.buttonBorder}`,
          borderRadius: eff.radiusXl,
          padding: '12px 18px',
          cursor: 'pointer', fontFamily: eff.font,
          transition: 'background 0.15s, border-color 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = eff.bgSecondary; e.currentTarget.style.borderColor = eff.textMuted; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = eff.buttonBorder; }}
      >
        <Share2 style={{ width: 16, height: 16 }} />
        Save + share this quote
      </button>

      {open && (
        <div
          data-testid="share-quote-modal"
          onClick={handleClose}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(15,23,42,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16, zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: eff.radius2xl,
              boxShadow: eff.shadowCard,
              maxWidth: 460, width: '100%',
              padding: '24px',
              fontFamily: eff.font, color: eff.text,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
              <div>
                <p style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px' }}>
                  Your shareable quote link
                </p>
                <p style={{ fontSize: 13, color: eff.textBody, margin: 0, lineHeight: 1.5 }}>
                  Send it to your customer — they can revisit it any time. You can edit the values later from the same link on this device.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close"
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  padding: 4, color: eff.textBody, borderRadius: eff.radiusSm,
                  display: 'flex',
                }}
              >
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>

            {loading && (
              <div style={{
                background: eff.bgSecondary,
                borderRadius: eff.radiusMd,
                padding: '14px 16px',
                fontSize: 13, color: eff.textBody,
                textAlign: 'center',
              }}>
                Creating link…
              </div>
            )}

            {error && !loading && (
              <div style={{
                background: '#fef2f2', borderRadius: eff.radiusMd,
                padding: '14px 16px', fontSize: 13, color: eff.error,
              }}>
                {error}
              </div>
            )}

            {shareUrl && !loading && (
              <>
                <div style={{
                  display: 'flex', gap: 8, alignItems: 'stretch',
                  border: `1px solid ${eff.buttonBorder}`,
                  borderRadius: eff.radiusMd, padding: '4px 4px 4px 12px',
                  background: eff.bgSecondary,
                }}>
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    data-testid="share-quote-url"
                    style={{
                      flex: 1, border: 'none', background: 'transparent',
                      fontSize: 13, fontFamily: eff.fontMono, color: eff.text,
                      outline: 'none', minWidth: 0,
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    data-testid="share-quote-copy"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontSize: 13, fontWeight: 700, color: eff.buttonText,
                      background: eff.buttonBg,
                      border: 'none', borderRadius: eff.radiusSm,
                      padding: '8px 14px', cursor: 'pointer', fontFamily: eff.font,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = eff.buttonBgHover; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = eff.buttonBg; }}
                  >
                    {copied ? <Check style={{ width: 14, height: 14 }} /> : <Copy style={{ width: 14, height: 14 }} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
                  marginTop: 14,
                }}>
                  <ShareIntentLink href={smsHref} label="SMS" testid="share-intent-sms" icon={<MessageCircle style={{ width: 14, height: 14 }} />} />
                  <ShareIntentLink href={whatsappHref} label="WhatsApp" testid="share-intent-whatsapp" icon={<MessageCircle style={{ width: 14, height: 14 }} />} />
                  <ShareIntentLink href={emailHref} label="Email" testid="share-intent-email" icon={<Mail style={{ width: 14, height: 14 }} />} />
                </div>

                <p style={{ fontSize: 12, color: eff.textMuted, margin: '14px 0 0', lineHeight: 1.5 }}>
                  Tip: bookmark this link on your phone so you can pull it up for your customer later.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function ShareIntentLink({
  href, label, icon, testid,
}: { href: string; label: string; icon: React.ReactNode; testid: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      data-testid={testid}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        fontSize: 13, fontWeight: 600, color: eff.text,
        background: '#fff',
        border: `1px solid ${eff.buttonBorder}`,
        borderRadius: eff.radiusMd,
        padding: '10px 8px',
        textDecoration: 'none',
        fontFamily: eff.font,
      }}
    >
      {icon}
      {label}
    </a>
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
