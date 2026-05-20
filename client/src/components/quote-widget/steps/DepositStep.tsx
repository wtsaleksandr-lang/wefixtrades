// Wave R-2 — DepositStep.
//
// Post-quote "Secure your slot" panel. Calls
// POST /api/widget-deposit/create-session with the customer's quote total
// and redirects them to Stripe Checkout. Stripe Connect routes the funds
// to the calculator owner; the platform takes a small application fee.
//
// The deposit amount displayed here is computed client-side from the
// stored deposit config + the customer's estimate. The server recomputes
// authoritatively when it creates the Checkout session — this is purely
// for display. Skip is allowed unless the calculator owner marked the
// step required (config.can_skip === false).

import { useState, useCallback, useMemo } from 'react';
import { Lock, Loader2, ShieldCheck } from 'lucide-react';
import HelpTip from '../HelpTip';
import { useWidgetState } from '../useWidgetState';
import {
  eff,
  stepTitleStyle,
  stepSubtitleStyle,
  primaryButtonStyle,
} from '../designTokens';
import type { StepDefinition } from '@shared/wizardSchema';

interface DepositStepProps {
  step: StepDefinition;
  accentColor?: string;
}

interface DepositConfig {
  enabled?: boolean;
  mode?: 'percent' | 'fixed';
  value?: number;
  label?: string;
  required?: boolean;
}

export default function DepositStep({ step }: DepositStepProps) {
  const { config, state, nextStep } = useWidgetState();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calcSettings = (config.calculator.calculator_settings ||
    {}) as Record<string, any>;
  const depositCfg: DepositConfig =
    calcSettings.appearance?.deposit || {};

  const quoteTotalCents = useMemo(() => {
    const total = state.estimate?.total;
    if (typeof total === 'number' && Number.isFinite(total)) {
      return Math.max(0, Math.round(total * 100));
    }
    return 0;
  }, [state.estimate]);

  const depositCents = useMemo(() => {
    const value = Number(depositCfg.value) || 0;
    if (depositCfg.mode === 'fixed') {
      return Math.round(value * 100);
    }
    return Math.round((quoteTotalCents * value) / 100);
  }, [depositCfg.mode, depositCfg.value, quoteTotalCents]);

  const depositLabel = useMemo(() => {
    if (depositCfg.label && depositCfg.label.trim()) return depositCfg.label;
    const dollars = (depositCents / 100).toFixed(
      depositCents % 100 === 0 ? 0 : 2,
    );
    if (depositCfg.mode === 'percent' && depositCfg.value) {
      return `Secure your slot with a ${depositCfg.value}% deposit ($${dollars})`;
    }
    return `Secure your slot with a $${dollars} deposit`;
  }, [depositCfg, depositCents]);

  const canSkip = step.config?.can_skip !== false;

  const handlePay = useCallback(async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      // Preview mode (negative calculator id): skip the network call and
      // just advance so the wizard preview shows the success state.
      if (config.calculator.id < 0) {
        nextStep();
        return;
      }

      if (!quoteTotalCents) {
        setError('Quote amount is required before paying a deposit.');
        setSubmitting(false);
        return;
      }

      const res = await fetch('/api/widget-deposit/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: config.calculator.slug,
          quote_amount_cents: quoteTotalCents,
          customer_email: state.lead?.data?.email?.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.checkout_url) {
        setError(data?.error || 'Could not start checkout. Please try again.');
        setSubmitting(false);
        return;
      }
      // Hand off to Stripe Checkout. The success redirect comes back to
      // /q/<slug>?deposit=success which the hosted page can react to.
      window.location.assign(data.checkout_url);
    } catch {
      setError('Network error. Please try again.');
      setSubmitting(false);
    }
  }, [
    submitting,
    config.calculator.id,
    config.calculator.slug,
    quoteTotalCents,
    state.lead,
    nextStep,
  ]);

  const handleSkip = useCallback(() => {
    if (submitting) return;
    nextStep();
  }, [submitting, nextStep]);

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
      data-testid="widget-deposit-step"
    >
      <div>
        <h3 style={stepTitleStyle}>
          {depositLabel}
          <HelpTip text="A deposit reserves your spot on the provider's calendar. The remaining balance is due after the job is complete." />
        </h3>
        <p style={{ ...stepSubtitleStyle, margin: '4px 0 0' }}>
          Charged to your card now; the rest is due after the job.
        </p>
      </div>

      {/* Deposit summary card */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 18px',
          borderRadius: eff.radiusLg,
          border: `1px solid ${eff.buttonBorder}`,
          background: eff.bgSecondary,
        }}
        data-testid="widget-deposit-amount"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: eff.textBody,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Deposit due now
          </span>
          <span
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: eff.text,
              letterSpacing: '-0.01em',
            }}
          >
            ${(depositCents / 100).toFixed(depositCents % 100 === 0 ? 0 : 2)}
          </span>
        </div>
        <ShieldCheck
          style={{ width: 26, height: 26, color: eff.buttonBg }}
          aria-hidden="true"
        />
      </div>

      {/* Trust copy */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12.5,
          color: eff.textBody,
        }}
      >
        <Lock style={{ width: 14, height: 14 }} aria-hidden="true" />
        Payment is processed securely by Stripe — we never see your card details.
      </div>

      {error && (
        <p
          style={{ fontSize: 13, color: eff.error, margin: 0 }}
          data-testid="widget-deposit-error"
        >
          {error}
        </p>
      )}

      {/* CTAs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          type="button"
          onClick={handlePay}
          disabled={submitting || depositCents <= 0}
          style={{
            ...primaryButtonStyle,
            opacity: submitting || depositCents <= 0 ? 0.55 : 1,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = eff.buttonBgHover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = eff.buttonBg;
          }}
          data-testid="widget-deposit-pay"
        >
          {submitting ? (
            <>
              <Loader2
                style={{
                  width: 16,
                  height: 16,
                  animation: 'spin 1s linear infinite',
                }}
              />
              Redirecting to Stripe…
            </>
          ) : (
            <>Pay Deposit →</>
          )}
        </button>

        {canSkip && (
          <button
            type="button"
            onClick={handleSkip}
            disabled={submitting}
            style={{
              background: 'transparent',
              border: 'none',
              color: eff.textBody,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: eff.font,
              padding: '8px 12px',
              cursor: submitting ? 'default' : 'pointer',
              textDecoration: 'underline',
              textDecorationColor: eff.buttonBorder,
              textUnderlineOffset: '3px',
            }}
            data-testid="widget-deposit-skip"
          >
            Skip — pay later
          </button>
        )}
      </div>
    </div>
  );
}
