// SettingsTab — Build > Settings panel (Wave H6).
//
// Surfaces the user-editable knobs that don't fit into Build (per-calculator
// fields) or Style (per-template look). Sections, in order:
//
//   1. Trade               — searchable select against `client/src/data/trades.ts`.
//   2. Lead notification   — single recipient email (basic format check).
//   3. Pricing model       — segmented `hourly / fixed / custom`; per-mode value.
//   4. Number formatting   — thousands sep + decimal sep + ISO currency code.
//   5. Custom CTA label    — overrides `results.cta_label` in the preview.
//
// Webhooks / integrations are deliberately out of scope (they need real
// account hookup — Alex-gated; Wave H7+ at the earliest).
//
// Layout mirrors StyleTab's `qq-style-*` classes so the visual rhythm of the
// editor stays consistent across tabs.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { platformTheme } from '@/theme/platformTheme';
import { TRADES, CATEGORIES, type Trade } from '@/data/trades';
import {
  DEFAULT_SHELL_NUMBER_FORMAT,
  DEFAULT_SHELL_SCHEDULING,
  type ShellSettings,
  type ShellPricing,
  type ShellPricingMode,
  type ShellNumberFormat,
  type ShellThousandsSep,
  type ShellDecimalSep,
  type ShellDeposit,
  type ShellSchedulingSettings,
  type ShellSlotDurationMinutes,
  type ShellBufferMinutes,
  type ShellWorkingDay,
} from './types';
import FloatField from './FloatField';
import InfoCue from './InfoCue';

const p = platformTheme;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

const THOUSANDS_OPTIONS: ReadonlyArray<{ value: ShellThousandsSep; label: string }> = [
  { value: 'comma', label: 'Comma (1,234)' },
  { value: 'space', label: 'Space (1 234)' },
  { value: 'none',  label: 'None (1234)' },
];

const DECIMAL_OPTIONS: ReadonlyArray<{ value: ShellDecimalSep; label: string }> = [
  { value: 'dot',   label: 'Dot (.)' },
  { value: 'comma', label: 'Comma (,)' },
];

/* Wave R-1 — Booking section constants. Mon-Sun in calendar order; we store
   0=Sun..6=Sat under the hood (matches JS Date.getDay()), so the UI flips
   the index but the persisted value is always the standard JS day index. */
const SCHEDULING_DAYS: ReadonlyArray<{ value: ShellWorkingDay; label: string }> = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

const SLOT_DURATION_OPTIONS: ReadonlyArray<{ value: ShellSlotDurationMinutes; label: string }> = [
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 45, label: '45 minutes' },
  { value: 60, label: '60 minutes' },
];

const BUFFER_OPTIONS: ReadonlyArray<{ value: ShellBufferMinutes; label: string }> = [
  { value: 0,  label: 'No buffer' },
  { value: 5,  label: '5 minutes' },
  { value: 10, label: '10 minutes' },
  { value: 15, label: '15 minutes' },
];

interface Props {
  settings: ShellSettings;
  onChange: (next: ShellSettings) => void;
  /** Wave R-pre D — the calculator owner's plan_tier. Free disables the
   *  brand-badge toggle (server gate still strips it on PATCH if a free
   *  user manages to bypass the client); Pro / Business enables it. */
  planTier?: string;
}

export default function SettingsTab({ settings, onChange, planTier = 'free' }: Props) {
  const isPaidTier = planTier === 'pro' || planTier === 'business' || planTier === 'starter';
  // brandBadge field maps to calculator_settings.appearance.show_powered_by
  // on save (wired in WizardShell). True = show; false = hide. Default
  // true for everyone; only paid users' false-values survive the server
  // gate (Wave Q-D).
  const showBrandBadge = settings.brandBadge !== false;
  const patch = useCallback(
    (next: Partial<ShellSettings>) => onChange({ ...settings, ...next }),
    [settings, onChange],
  );

  // Resolved values with defaults — keeps the controls predictable when a
  // partial `settings` object lands (older persisted state pre-H6).
  const tradeId = settings.tradeId ?? '';
  const leadEmail = settings.leadEmail ?? '';
  const pricing: ShellPricing = settings.pricing ?? { mode: 'hourly', rate: 75 };
  const numberFormat: ShellNumberFormat =
    settings.numberFormat ?? { ...DEFAULT_SHELL_NUMBER_FORMAT };
  const ctaLabel = settings.ctaLabel ?? '';
  const scheduling: ShellSchedulingSettings =
    settings.scheduling ?? { ...DEFAULT_SHELL_SCHEDULING };

  const patchPricing = useCallback(
    (next: Partial<ShellPricing>) =>
      patch({ pricing: { ...pricing, ...next } }),
    [patch, pricing],
  );
  const patchNumberFormat = useCallback(
    (next: Partial<ShellNumberFormat>) =>
      patch({ numberFormat: { ...numberFormat, ...next } }),
    [patch, numberFormat],
  );
  const patchScheduling = useCallback(
    (next: Partial<ShellSchedulingSettings>) =>
      patch({ scheduling: { ...scheduling, ...next } }),
    [patch, scheduling],
  );
  const toggleWorkingDay = useCallback(
    (day: ShellWorkingDay) => {
      const set = new Set<ShellWorkingDay>(scheduling.workingDays);
      if (set.has(day)) set.delete(day);
      else set.add(day);
      patchScheduling({ workingDays: Array.from(set).sort((a, b) => a - b) as ShellWorkingDay[] });
    },
    [patchScheduling, scheduling.workingDays],
  );

  // Wave R-2 — Stripe deposit step config (maps to
  // calculator_settings.appearance.deposit on save). The fieldset
  // disables itself when the underlying calculator has no connected
  // Stripe account (see WizardShell wiring).
  const deposit: ShellDeposit = settings.deposit ?? {
    enabled: false, mode: 'percent', value: 15, label: '', required: false,
  };
  const stripeConnected = settings.stripeConnected !== false;
  const patchDeposit = useCallback(
    (next: Partial<ShellDeposit>) => patch({ deposit: { ...deposit, ...next } }),
    [patch, deposit],
  );

  return (
    <section
      className="qq-settings-panel qq-style-panel"
      // `editor-tabpanel-settings` matches the H1 generic tab-switching test.
      data-testid="editor-tabpanel-settings"
      aria-label="Settings"
      role="tabpanel"
    >
      {/* ── Trade ────────────────────────────────────────────────── */}
      <TradeSection tradeId={tradeId} onChange={(id) => patch({ tradeId: id })} />

      {/* ── Lead notification email ─────────────────────────────── */}
      <fieldset className="qq-style-group" data-testid="settings-group-lead-email">
        <legend className="qq-style-legend">
          Lead notifications
          <InfoCue
            testid="settings-section-lead-email"
            text="How you'll be notified when someone submits a quote. Only the recipient changes — message format is fixed."
          />
        </legend>
        <FloatField
          label="Lead notification email"
          htmlFor="qq-settings-leademail"
          infoText="Where customer leads are sent when someone hits the CTA. Single email; team forwarding is configured upstream."
          infoTestid="settings-lead-email"
        >
          <input
            id="qq-settings-leademail"
            type="email"
            className="premium-input"
            placeholder=" "
            value={leadEmail}
            onChange={(e) => patch({ leadEmail: e.target.value })}
            data-testid="settings-input-lead-email"
            aria-invalid={
              leadEmail.trim() !== '' && !EMAIL_RE.test(leadEmail.trim()) ? 'true' : 'false'
            }
          />
        </FloatField>
        {leadEmail.trim() !== '' && !EMAIL_RE.test(leadEmail.trim()) && (
          <p
            className="qq-settings-error"
            data-testid="settings-lead-email-error"
            style={{ fontSize: 11.5, color: p.colors.danger, margin: '6px 0 0' }}
          >
            Enter a valid email address.
          </p>
        )}
      </fieldset>

      {/* ── Pricing model ───────────────────────────────────────── */}
      {/* W-AO-7 — restored section legend (top-left + InfoCue) per the
         help-cue placement audit. The segmented control still speaks for
         itself, but the legend gives the section a name screen readers
         and skimming users can latch onto. */}
      <fieldset className="qq-style-group" data-testid="settings-group-pricing">
        <legend className="qq-style-legend">
          Pricing model
          <InfoCue
            testid="settings-section-pricing"
            text="How quotes are priced. Hourly multiplies by hours; Fixed is a flat price; Custom lets you label the unit (per sqft, per door, per panel, etc.)."
          />
        </legend>
        <SegmentedControl<ShellPricingMode>
          name="pricing-mode"
          testid="settings-segmented-pricing"
          value={pricing.mode}
          options={[
            { value: 'hourly', label: 'Hourly' },
            { value: 'fixed',  label: 'Fixed' },
            { value: 'custom', label: 'Custom' },
          ]}
          onChange={(mode) => patchPricing({ mode })}
        />

        {pricing.mode === 'hourly' && (
          <div className="qq-settings-row" data-testid="settings-pricing-hourly">
            <FloatField label="Rate per hour ($)" htmlFor="qq-settings-rate">
              <input
                id="qq-settings-rate"
                type="number"
                min={0}
                step={1}
                className="premium-input"
                placeholder=" "
                value={pricing.rate ?? ''}
                onChange={(e) => patchPricing({ rate: numOrUndef(e.target.value) })}
                data-testid="settings-input-pricing-rate"
              />
            </FloatField>
          </div>
        )}

        {pricing.mode === 'fixed' && (
          <div className="qq-settings-row" data-testid="settings-pricing-fixed">
            <FloatField label="Fixed price ($)" htmlFor="qq-settings-value">
              <input
                id="qq-settings-value"
                type="number"
                min={0}
                step={1}
                className="premium-input"
                placeholder=" "
                value={pricing.value ?? ''}
                onChange={(e) => patchPricing({ value: numOrUndef(e.target.value) })}
                data-testid="settings-input-pricing-value"
              />
            </FloatField>
          </div>
        )}

        {pricing.mode === 'custom' && (
          <div className="qq-settings-row" data-testid="settings-pricing-custom">
            <FloatField label="Unit-rate label" htmlFor="qq-settings-custom-label">
              <input
                id="qq-settings-custom-label"
                type="text"
                className="premium-input"
                placeholder=" "
                value={pricing.label ?? ''}
                onChange={(e) => patchPricing({ label: e.target.value })}
                data-testid="settings-input-pricing-label"
              />
            </FloatField>
            <div style={{ marginTop: 10 }}>
              <FloatField label="Rate per unit ($)" htmlFor="qq-settings-custom-rate">
                <input
                  id="qq-settings-custom-rate"
                  type="number"
                  min={0}
                  step={1}
                  className="premium-input"
                  placeholder=" "
                  value={pricing.rate ?? ''}
                  onChange={(e) => patchPricing({ rate: numOrUndef(e.target.value) })}
                  data-testid="settings-input-pricing-custom-rate"
                />
              </FloatField>
            </div>
          </div>
        )}
      </fieldset>

      {/* ── Deposit (Wave R-2) ──────────────────────────────────── */}
      <fieldset
        className={`qq-style-group qq-settings-deposit${stripeConnected ? '' : ' is-disabled'}`}
        data-testid="settings-group-deposit"
        data-stripe-connected={stripeConnected ? 'true' : 'false'}
      >
        <legend className="qq-style-legend">
          Deposit
          <InfoCue
            testid="settings-section-deposit"
            text="Optionally collect a partial payment when customers book. Requires a connected Stripe account."
          />
        </legend>
        {!stripeConnected && (
          <p
            className="qq-settings-deposit-warning"
            data-testid="settings-deposit-no-stripe"
            style={{
              fontSize: 12,
              color: p.colors.muted,
              margin: '0 0 10px',
              lineHeight: 1.45,
            }}
          >
            Connect Stripe in your dashboard first to enable deposits.
          </p>
        )}

        <label
          className="qq-deposit-toggle"
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            cursor: stripeConnected ? 'pointer' : 'not-allowed',
            opacity: stripeConnected ? 1 : 0.55,
          }}
        >
          <input
            type="checkbox"
            checked={deposit.enabled === true}
            disabled={!stripeConnected}
            onChange={(e) => patchDeposit({ enabled: e.target.checked })}
            data-testid="settings-deposit-enabled"
            aria-label="Collect a deposit when customers book"
          />
          <span>
            <span style={{ fontWeight: 700, fontSize: 13, color: p.colors.heading, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              Collect a deposit when customers book
              <InfoCue
                testid="settings-deposit"
                text="Optionally collect a deposit at booking time. Stripe Connect routes the money to your account; WeFixTrades takes a small platform fee per transaction."
              />
            </span>
            <span style={{ display: 'block', fontSize: 12, color: p.colors.muted, marginTop: 2 }}>
              Adds a "Secure your slot" step after the quote. Money flows directly to your Stripe account.
            </span>
          </span>
        </label>

        {deposit.enabled && stripeConnected && (
          <div className="qq-settings-row" data-testid="settings-deposit-fields">
            <label className="qq-style-label" style={{ marginTop: 4 }}>Deposit type</label>
            <SegmentedControl<'percent' | 'fixed'>
              name="deposit-mode"
              testid="settings-segmented-deposit"
              value={deposit.mode === 'fixed' ? 'fixed' : 'percent'}
              options={[
                { value: 'percent', label: 'Percent (%)' },
                { value: 'fixed',   label: 'Fixed ($)' },
              ]}
              onChange={(mode) => patchDeposit({ mode })}
            />

            <div style={{ marginTop: 12 }}>
              <FloatField
                label={deposit.mode === 'fixed' ? 'Deposit amount ($)' : 'Deposit percentage (%)'}
                htmlFor="qq-settings-deposit-value"
                infoText={
                  deposit.mode === 'fixed'
                    ? 'Charged in dollars regardless of quote size. Stripe requires a $0.50 minimum.'
                    : 'Charged as a percentage of the customer\'s quote total. E.g. 15 → 15%.'
                }
                infoTestid="settings-deposit-value-info"
              >
                <input
                  id="qq-settings-deposit-value"
                  type="number"
                  min={0}
                  step={deposit.mode === 'fixed' ? 1 : 0.5}
                  className="premium-input"
                  placeholder=" "
                  value={deposit.value ?? ''}
                  onChange={(e) => patchDeposit({ value: numOrUndef(e.target.value) })}
                  data-testid="settings-input-deposit-value"
                  aria-invalid={
                    deposit.value !== undefined && Number(deposit.value) <= 0
                      ? 'true'
                      : 'false'
                  }
                />
              </FloatField>
              {deposit.value !== undefined && Number(deposit.value) <= 0 && (
                <p
                  className="qq-settings-error"
                  data-testid="settings-deposit-value-error"
                  style={{ fontSize: 11.5, color: p.colors.danger, margin: '6px 0 0' }}
                >
                  Enter a positive amount.
                </p>
              )}
            </div>

            <div style={{ marginTop: 12 }}>
              <FloatField
                label="Custom label (optional)"
                htmlFor="qq-settings-deposit-label"
                infoText='Overrides the deposit headline shown to customers. E.g. "Secure your slot — $50". Leave blank to use the default.'
                infoTestid="settings-deposit-label-info"
              >
                <input
                  id="qq-settings-deposit-label"
                  type="text"
                  className="premium-input"
                  placeholder=" "
                  value={deposit.label ?? ''}
                  onChange={(e) => patchDeposit({ label: e.target.value })}
                  data-testid="settings-input-deposit-label"
                />
              </FloatField>
            </div>

            <label
              className="qq-deposit-required"
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                marginTop: 12, cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={deposit.required === true}
                onChange={(e) => patchDeposit({ required: e.target.checked })}
                data-testid="settings-deposit-required"
                aria-label="Require the deposit before booking is confirmed"
              />
              <span>
                <span style={{ fontWeight: 700, fontSize: 12.5, color: p.colors.heading }}>
                  Require deposit to confirm booking
                </span>
                <span style={{ display: 'block', fontSize: 11.5, color: p.colors.muted, marginTop: 2 }}>
                  When off, customers can skip and arrange payment with you later.
                </span>
              </span>
            </label>
          </div>
        )}
      </fieldset>

      {/* ── Number formatting ───────────────────────────────────── */}
      <fieldset className="qq-style-group" data-testid="settings-group-numberformat">
        <legend className="qq-style-legend">
          Number formatting
          <InfoCue
            testid="settings-section-numberformat"
            text="Controls how prices display in the calculator. Currency is a 3-letter ISO code (USD / EUR / GBP / …)."
          />
        </legend>
        <div className="qq-style-grid">
          <FloatField
            label="Thousands separator"
            htmlFor="qq-settings-thousands"
            variant="select"
            infoText="How prices display in the calculator. Currency is a 3-letter ISO code (USD / EUR / GBP / …)."
            infoTestid="settings-numberformat"
          >
            <select
              id="qq-settings-thousands"
              className="premium-input"
              value={numberFormat.thousands}
              onChange={(e) =>
                patchNumberFormat({ thousands: e.target.value as ShellThousandsSep })
              }
              data-testid="settings-select-thousands"
            >
              {THOUSANDS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </FloatField>
          <FloatField label="Decimal separator" htmlFor="qq-settings-decimal" variant="select">
            <select
              id="qq-settings-decimal"
              className="premium-input"
              value={numberFormat.decimal}
              onChange={(e) =>
                patchNumberFormat({ decimal: e.target.value as ShellDecimalSep })
              }
              data-testid="settings-select-decimal"
            >
              {DECIMAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </FloatField>
        </div>
        <div style={{ marginTop: 12 }}>
          <FloatField label="Currency code" htmlFor="qq-settings-currency">
            <input
              id="qq-settings-currency"
              type="text"
              maxLength={3}
              className="premium-input"
              placeholder=" "
              style={{ textTransform: 'uppercase' }}
              value={numberFormat.currency}
              onChange={(e) =>
                patchNumberFormat({ currency: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })
              }
              data-testid="settings-input-currency"
              aria-invalid={!CURRENCY_RE.test(numberFormat.currency) ? 'true' : 'false'}
            />
          </FloatField>
        </div>
      </fieldset>

      {/* ── Custom CTA label ────────────────────────────────────── */}
      <fieldset className="qq-style-group" data-testid="settings-group-cta">
        <legend className="qq-style-legend">
          Call to action
          <InfoCue
            testid="settings-section-cta"
            text="The button text shown on the result panel after the quote is calculated."
          />
        </legend>
        <FloatField
          label="CTA label"
          htmlFor="qq-settings-cta-label"
          infoText='Overrides the result-panel button text. Leave blank to keep the default ("Get My Quote").'
          infoTestid="settings-cta"
        >
          <input
            id="qq-settings-cta-label"
            type="text"
            className="premium-input"
            placeholder=" "
            value={ctaLabel}
            onChange={(e) => patch({ ctaLabel: e.target.value })}
            data-testid="settings-input-cta-label"
          />
        </FloatField>
      </fieldset>

      {/* ── Online booking (Wave R-1) ───────────────────────────── */}
      {/* W-AO-7 — restored top-left legend with InfoCue so the section
          carries a discoverable title like the others. */}
      <fieldset className="qq-style-group" data-testid="settings-group-scheduling">
        <legend className="qq-style-legend">
          Online booking
          <InfoCue
            testid="settings-section-scheduling"
            text="Let customers pick a time slot after the quote. Slots are built from your working hours minus existing bookings."
          />
        </legend>
        <div className="qq-scheduling-toggle" data-testid="scheduling-toggle-row">
          <label className="qq-brand-badge-toggle">
            <input
              type="checkbox"
              checked={scheduling.enabled}
              onChange={(e) => patchScheduling({ enabled: e.target.checked })}
              data-testid="scheduling-enabled-input"
              aria-label="Enable online booking"
            />
            <span>
              <span className="qq-brand-badge-title">
                Let customers book a time on your calendar
                <InfoCue
                  testid="settings-online-booking"
                  text="Lets customers book a time on your calendar after the quote step. Slots fill from your working hours minus existing bookings."
                />
              </span>
              <span className="qq-brand-badge-sub">
                The widget shows a 14-day picker after the price reveal. Slots are local to your working hours.
              </span>
            </span>
          </label>
        </div>

        {scheduling.enabled && (
          <div className="qq-scheduling-body" data-testid="scheduling-body">
            <p className="qq-scheduling-sublabel">Working days</p>
            <div className="qq-scheduling-days" role="group" aria-label="Working days">
              {SCHEDULING_DAYS.map((d) => {
                const checked = scheduling.workingDays.includes(d.value);
                return (
                  <label
                    key={d.value}
                    className={`qq-scheduling-daychip${checked ? ' is-active' : ''}`}
                    data-testid={`scheduling-day-${d.value}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleWorkingDay(d.value)}
                      aria-label={`Working day ${d.label}`}
                    />
                    <span>{d.label}</span>
                  </label>
                );
              })}
            </div>

            <div className="qq-style-grid" style={{ marginTop: 12 }}>
              <FloatField label="Start time" htmlFor="qq-settings-sched-start">
                <input
                  id="qq-settings-sched-start"
                  type="time"
                  className="premium-input"
                  placeholder=" "
                  value={scheduling.workingHoursStart}
                  onChange={(e) => patchScheduling({ workingHoursStart: e.target.value })}
                  data-testid="scheduling-input-start"
                />
              </FloatField>
              <FloatField label="End time" htmlFor="qq-settings-sched-end">
                <input
                  id="qq-settings-sched-end"
                  type="time"
                  className="premium-input"
                  placeholder=" "
                  value={scheduling.workingHoursEnd}
                  onChange={(e) => patchScheduling({ workingHoursEnd: e.target.value })}
                  data-testid="scheduling-input-end"
                />
              </FloatField>
            </div>

            <div className="qq-style-grid" style={{ marginTop: 12 }}>
              <FloatField label="Slot duration" htmlFor="qq-settings-sched-duration" variant="select">
                <select
                  id="qq-settings-sched-duration"
                  className="premium-input"
                  value={scheduling.slotDurationMinutes}
                  onChange={(e) =>
                    patchScheduling({ slotDurationMinutes: Number(e.target.value) as ShellSlotDurationMinutes })
                  }
                  data-testid="scheduling-select-duration"
                >
                  {SLOT_DURATION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </FloatField>
              <FloatField label="Buffer between slots" htmlFor="qq-settings-sched-buffer" variant="select">
                <select
                  id="qq-settings-sched-buffer"
                  className="premium-input"
                  value={scheduling.bufferMinutes}
                  onChange={(e) =>
                    patchScheduling({ bufferMinutes: Number(e.target.value) as ShellBufferMinutes })
                  }
                  data-testid="scheduling-select-buffer"
                >
                  {BUFFER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </FloatField>
            </div>
          </div>
        )}
      </fieldset>

      {/* Wave Q-E — Brand badge toggle. Free users see the toggle as
       *  read-only with an "Upgrade to Pro" call-to-action; Pro / Business
       *  users can flip it. Client-side tier detection is not yet wired,
       *  so for now the toggle is permanently disabled with the upgrade
       *  link surfaced. The server-side gate (Wave Q-D) enforces this on
       *  save regardless of what the client sends. */}
      <fieldset className="qq-style-group" data-testid="settings-group-brand-badge">
        <legend className="qq-style-legend">
          Branding
          <InfoCue
            testid="settings-section-brand"
            text="Controls the WeFixTrades badge on the calculator. Free plan keeps it visible; Pro and Business plans can hide it."
          />
        </legend>
        <div
          className="qq-brand-badge-row"
          data-testid="settings-brand-badge-row"
          data-plan-tier={planTier}
          data-paid-tier={isPaidTier ? 'true' : 'false'}
        >
          <label className={`qq-brand-badge-toggle${isPaidTier ? '' : ' is-locked'}`}>
            <input
              type="checkbox"
              checked={isPaidTier ? showBrandBadge : true}
              disabled={!isPaidTier}
              onChange={(e) => {
                if (isPaidTier) patch({ brandBadge: e.target.checked });
              }}
              data-testid="settings-brand-badge-input"
              aria-label="Show WeFixTrades brand badge"
            />
            <span>
              <span className="qq-brand-badge-title">
                Show WeFixTrades branding on the widget
                <InfoCue
                  testid="settings-brand-badge"
                  text='Free plan calculators show a "QuoteQuick by WeFixTrades" badge on the hosted page and any embedded widgets. Pro and Business plans remove the badge.'
                />
              </span>
              <span className="qq-brand-badge-sub">
                {isPaidTier ? (
                  <>You're on the {planTier === 'business' ? 'Business' : 'Pro'} plan — toggle this off to hide the badge on the hosted page and embeds.</>
                ) : (
                  <>
                    Required on the Free plan.{' '}
                    <a
                      href="/pricing/quotequick"
                      className="qq-brand-badge-link"
                      data-testid="settings-brand-badge-upgrade"
                    >
                      Upgrade to Pro ($29/mo) to remove it →
                    </a>
                  </>
                )}
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <style>{`
        /* Reuse the Style tab's spacing rhythm — see StyleTab.tsx for the
           canonical .qq-style-* class definitions. The few overrides below
           handle settings-only details (the row helper, the trade picker). */
        /* W-AO-9 — container gap tightened 18px → 2px. The 1px hairline
         * border around each .qq-style-group still provides a clear
         * visual seam between sections; the bulky vertical air was making
         * the wizard feel too spaced-out on both mobile and desktop. */
        .qq-settings-panel {
          display: flex; flex-direction: column; gap: 2px;
        }
        .qq-style-group {
          border: 1px solid ${p.colors.borderLight};
          border-radius: 12px;
          padding: 14px 14px 16px;
          background: #fff;
          margin: 0;
        }
        /* W-SETTINGS-STYLE — subtle all-caps section label, matches the
         * Build tab treatment landed by W-SECTIONS. Sits flush above the
         * first input rather than reading as a bold heading.
         *
         * W-AO-7 — legend is now an inline-flex container so the InfoCue
         * trigger (sibling element after the label text) lays out
         * immediately to the right of the title text — top-left of the
         * fieldset by virtue of being the first child. */
        .qq-style-legend {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px; font-weight: 600;
          color: ${p.colors.muted};
          text-transform: uppercase; letter-spacing: 0.04em;
          margin: 0 0 6px;
          padding: 0;
        }
        /* Section-level help that used to live in an InfoCue beside the
         * legend. Same muted styling, sits under the legend as a body
         * line so it reads like a caption, not a heading. */
        .qq-style-sectionhint {
          margin: 0 0 8px;
          font-size: 11.5px; line-height: 1.5;
          color: ${p.colors.subtle};
        }
        .qq-style-grid {
          display: grid; gap: 10px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        @media (max-width: 480px) {
          .qq-style-grid { grid-template-columns: 1fr; }
        }
        .qq-style-label {
          display: flex; align-items: center; justify-content: space-between;
          font-size: 12px; font-weight: 700;
          color: ${p.colors.heading};
          margin-bottom: 6px;
        }
        /* W-AF-2 — label-text wrapper so InfoCue sits inline with the
         * label text instead of being pushed to the far right by
         * justify-content: space-between on the parent label. */
        .qq-style-label-text {
          display: inline-flex; align-items: center; gap: 6px;
        }
        .qq-style-select {
          width: 100%; padding: 8px 10px;
          font-size: 13px; color: ${p.colors.body};
          background: #fff;
          border: 1px solid ${p.colors.border};
          border-radius: 8px;
          outline: none;
        }
        .qq-style-hex {
          flex: 1; min-width: 0;
          height: 34px;
          padding: 0 10px;
          font-size: 12.5px;
          color: ${p.colors.body};
          background: #fff;
          border: 1px solid ${p.colors.border};
          border-radius: 8px;
          outline: none;
          box-sizing: border-box;
        }
        .qq-style-hex:focus {
          border-color: ${p.colors.accent};
          box-shadow: 0 0 0 3px ${p.colors.accentLighter};
        }
        .qq-style-seg {
          display: inline-flex;
          padding: 3px;
          gap: 2px;
          background: #f4f6f9;
          border: 1px solid ${p.colors.border};
          border-radius: 10px;
        }
        .qq-style-seg-btn {
          font: inherit; cursor: pointer;
          background: transparent; border: none;
          padding: 7px 14px;
          font-size: 12.5px; font-weight: 600;
          color: ${p.colors.muted};
          border-radius: 7px;
          transition: background 0.12s ease, color 0.12s ease;
        }
        .qq-style-seg-btn:hover { color: ${p.colors.heading}; }
        .qq-style-seg-btn[aria-checked="true"] {
          background: #fff;
          color: ${p.colors.heading};
          box-shadow: 0 1px 2px rgba(15,23,42,0.08);
        }
        .qq-settings-row {
          margin-top: 12px;
        }
        .qq-trade-results {
          margin-top: 8px;
          max-height: 240px; overflow-y: auto;
          border: 1px solid ${p.colors.borderLight};
          border-radius: 10px;
          background: #fff;
        }
        .qq-trade-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 8px 12px; cursor: pointer;
          font-size: 12.5px; color: ${p.colors.body};
          border: none; background: transparent;
          width: 100%; text-align: left;
        }
        .qq-trade-row:hover { background: ${p.colors.surfaceRaised}; }
        .qq-trade-row[aria-pressed="true"] {
          background: ${p.colors.accentLighter};
          color: ${p.colors.accentDark};
          font-weight: 700;
        }
        .qq-trade-current {
          font-size: 11.5px; color: ${p.colors.muted};
          margin: 4px 0 0;
        }
        /* Wave AO-8 — trade picker trigger + popup */
        .qq-trade-trigger {
          display: flex; align-items: center; justify-content: space-between;
          width: 100%;
          gap: 8px;
          text-align: left;
          cursor: pointer;
        }
        .qq-trade-trigger-label {
          flex: 1 1 auto;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: ${p.colors.heading};
        }
        .qq-trade-trigger-caret {
          flex: 0 0 auto;
          color: ${p.colors.muted};
          font-size: 12px;
          line-height: 1;
        }
        .qq-trade-backdrop {
          position: fixed; inset: 0;
          background: rgba(15, 23, 42, 0.42);
          z-index: 1000;
          display: flex; align-items: center; justify-content: center;
          padding: 16px;
        }
        .qq-trade-popup {
          position: relative;
          width: 100%; max-width: 420px;
          /* 120px breathing room at top so the wizard's tab bar stays visible. */
          max-height: min(70vh, calc(100vh - 120px));
          background: #fff;
          border: 1px solid ${p.colors.borderLight};
          border-radius: 14px;
          box-shadow: 0 18px 48px rgba(15, 23, 42, 0.24);
          display: flex; flex-direction: column;
          overflow: hidden;
        }
        .qq-trade-popup-head {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 10px 10px 12px;
          border-bottom: 1px solid ${p.colors.borderLight};
          background: #fff;
        }
        .qq-trade-popup-search {
          flex: 1 1 auto;
          min-width: 0;
        }
        .qq-trade-popup-close {
          flex: 0 0 auto;
          width: 32px; height: 32px;
          display: inline-flex; align-items: center; justify-content: center;
          border: 1px solid ${p.colors.borderLight};
          background: #fff;
          border-radius: 8px;
          cursor: pointer;
          color: ${p.colors.body};
        }
        .qq-trade-popup-close:hover {
          background: ${p.colors.surfaceRaised};
          color: ${p.colors.heading};
        }
        .qq-trade-popup-body {
          flex: 1 1 auto;
          overflow-y: auto;
          padding: 6px 6px 10px;
          -webkit-overflow-scrolling: touch;
        }
        .qq-trade-popup-group {
          padding: 6px 0;
        }
        .qq-trade-popup-grouplabel {
          padding: 6px 10px 4px;
          font-size: 10.5px; font-weight: 700;
          color: ${p.colors.muted};
          text-transform: uppercase; letter-spacing: 0.06em;
        }
        .qq-trade-popup-row {
          display: block; width: 100%;
          padding: 10px 12px;
          font-size: 13px;
          color: ${p.colors.body};
          text-align: left;
          background: transparent;
          border: none;
          border-radius: 8px;
          cursor: pointer;
        }
        .qq-trade-popup-row:hover { background: ${p.colors.surfaceRaised}; }
        .qq-trade-popup-row[aria-pressed="true"] {
          background: ${p.colors.accentLighter};
          color: ${p.colors.accentDark};
          font-weight: 700;
        }
        @media (max-width: 480px) {
          .qq-trade-backdrop {
            align-items: flex-start;
            padding: 120px 12px 12px;
          }
          .qq-trade-popup { max-width: 100%; }
        }
        /* Wave Q-E — brand badge toggle */
        .qq-brand-badge-row {
          padding: 12px 14px;
          background: ${p.colors.surfaceRaised};
          border: 1px solid ${p.colors.borderLight};
          border-radius: 10px;
        }
        .qq-brand-badge-toggle {
          display: grid; grid-template-columns: 18px 1fr;
          gap: 10px; align-items: flex-start;
          cursor: pointer;
        }
        .qq-brand-badge-toggle.is-locked { cursor: not-allowed; }
        .qq-brand-badge-toggle input[type="checkbox"] {
          margin-top: 2px; width: 16px; height: 16px;
          accent-color: ${p.colors.accent};
        }
        .qq-brand-badge-toggle.is-locked input[type="checkbox"] { opacity: 0.55; }
        .qq-brand-badge-title {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 12.5px; font-weight: 700;
          color: ${p.colors.heading};
        }
        .qq-brand-badge-sub {
          display: block;
          font-size: 11.5px; color: ${p.colors.muted};
          line-height: 1.5; margin-top: 4px;
        }
        .qq-brand-badge-link {
          color: ${p.colors.accent}; font-weight: 700;
          text-decoration: none;
        }
        .qq-brand-badge-link:hover { text-decoration: underline; }
        /* Wave R-1 — Online booking */
        .qq-scheduling-toggle {
          padding: 12px 14px;
          background: ${p.colors.surfaceRaised};
          border: 1px solid ${p.colors.borderLight};
          border-radius: 10px;
        }
        .qq-scheduling-body {
          margin-top: 14px;
          display: flex; flex-direction: column;
        }
        .qq-scheduling-sublabel {
          font-size: 11px; font-weight: 700;
          color: ${p.colors.muted};
          text-transform: uppercase; letter-spacing: 0.06em;
          margin: 0 0 8px;
        }
        .qq-scheduling-days {
          display: grid; gap: 6px;
          grid-template-columns: repeat(7, minmax(0, 1fr));
        }
        @media (max-width: 480px) {
          .qq-scheduling-days { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        }
        .qq-scheduling-daychip {
          display: flex; align-items: center; justify-content: center;
          padding: 6px 2px;
          font-size: 12.5px; font-weight: 600;
          border-radius: 8px;
          background: #fff;
          border: 1px solid ${p.colors.border};
          color: ${p.colors.body};
          cursor: pointer;
          user-select: none;
          transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
        }
        .qq-scheduling-daychip:hover { border-color: ${p.colors.accent}; }
        .qq-scheduling-daychip input[type="checkbox"] {
          /* Hide the native checkbox — the chip itself is the affordance. */
          position: absolute; opacity: 0; pointer-events: none;
        }
        .qq-scheduling-daychip.is-active {
          background: ${p.colors.accentLighter};
          border-color: ${p.colors.accent};
          color: ${p.colors.accentDark};
        }
      `}</style>
    </section>
  );
}

/* ─── Trade picker — Wave X #13 → Wave AO-8.
 *
 * Was (X #13): a native <select> with <optgroup> per category. On mobile
 * (390×844) the browser's native option sheet ballooned to nearly full
 * viewport height, covered the wizard's top tab bar, and offered no
 * close affordance — users on iOS Safari in particular had to scroll
 * back up through 107 options or refresh the page.
 *
 * Now (AO-8): a custom popup. A button shows the current selection and
 * opens an in-flow popup with the 107 trades grouped by category. The
 * popup is bounded (max-height: min(70vh, calc(100vh - 120px))), has a
 * visible close (X) button at the top-right, dismisses on Esc, on
 * backdrop click, and on selection. Focus moves into the search input
 * when the popup opens. The 107 trades scroll inside the popup, not the
 * viewport — so the wizard chrome stays visible.
 *
 * For Playwright / form semantics we keep a *hidden* native <select>
 * (with the original `settings-input-trade-select` testid) mirroring
 * the value, so existing audits that call `selectOption('house_cleaning')`
 * still work without test churn.
 */
function TradeSection({
  tradeId, onChange,
}: { tradeId: string; onChange: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const current = useMemo(
    () => TRADES.find((t) => t.id === tradeId),
    [tradeId],
  );

  // Group trades by category. CATEGORIES defines the display order;
  // the "custom" category is skipped here because it's a placeholder
  // (My trade isn't listed) not an actual trade.
  const tradesByCategory = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (t: Trade) => q === '' || t.label.toLowerCase().includes(q);
    return CATEGORIES
      .filter((c) => c.id !== 'custom')
      .map((c) => ({
        category: c,
        trades: TRADES.filter((t) => t.categoryId === c.id && match(t)),
      }))
      .filter((g) => g.trades.length > 0);
  }, [query]);

  const closePopup = useCallback(() => {
    setOpen(false);
    // Return focus to the trigger so keyboard users don't lose place.
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const selectTrade = useCallback((id: string) => {
    onChange(id);
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, [onChange]);

  // Esc-to-close + simple focus trap inside the popup while open.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closePopup();
        return;
      }
      if (e.key === 'Tab' && popupRef.current) {
        const focusables = popupRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, closePopup]);

  // Move focus into the search input when the popup opens.
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    } else {
      // Reset query so re-opening starts from a clean state.
      setQuery('');
    }
  }, [open]);

  const triggerLabel = current ? current.label : 'Select a trade';

  return (
    <fieldset className="qq-style-group" data-testid="settings-group-trade">
      <legend className="qq-style-legend">
        Trade
        <InfoCue
          testid="settings-section-trade"
          text="Which trade this calculator is for. Drives template suggestions and downstream copy."
        />
      </legend>
      {/* Hidden native <select> — preserves Playwright `selectOption`
          compatibility and gives us a real form control fallback. The
          visible UI is the custom button + popup below. */}
      <select
        value={tradeId}
        onChange={(e) => onChange(e.target.value)}
        data-testid="settings-input-trade-select"
        aria-hidden="true"
        tabIndex={-1}
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        <option value="">— Select a trade —</option>
        {CATEGORIES.filter((c) => c.id !== 'custom').map((c) => (
          <optgroup key={c.id} label={c.label}>
            {TRADES.filter((t) => t.categoryId === c.id).map((t) => (
              <option key={t.id} value={t.id} data-testid={`settings-trade-option-${t.id}`}>
                {t.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <FloatField label="Trade" htmlFor="qq-settings-trade-trigger">
        <button
          ref={triggerRef}
          id="qq-settings-trade-trigger"
          type="button"
          className="premium-input qq-trade-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Choose trade"
          data-testid="settings-trade-trigger"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="qq-trade-trigger-label">{triggerLabel}</span>
          <span className="qq-trade-trigger-caret" aria-hidden="true">▾</span>
        </button>
      </FloatField>

      {open && (
        <div
          className="qq-trade-backdrop"
          data-testid="settings-trade-backdrop"
          onClick={closePopup}
        >
          <div
            ref={popupRef}
            className="qq-trade-popup"
            role="dialog"
            aria-modal="true"
            aria-label="Choose a trade"
            data-testid="settings-trade-popup"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="qq-trade-popup-head">
              <input
                ref={searchInputRef}
                type="text"
                className="premium-input qq-trade-popup-search"
                placeholder="Filter trades by name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                data-testid="settings-input-trade-search"
                aria-label="Filter trades by name"
              />
              <button
                ref={closeBtnRef}
                type="button"
                className="qq-trade-popup-close"
                aria-label="Close trade picker"
                data-testid="settings-trade-close"
                onClick={closePopup}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M3 3 L13 13 M13 3 L3 13"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <div className="qq-trade-popup-body">
              {tradesByCategory.map(({ category, trades }) => (
                <div key={category.id} className="qq-trade-popup-group">
                  <div className="qq-trade-popup-grouplabel">{category.label}</div>
                  {trades.map((t) => {
                    const isCurrent = t.id === tradeId;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className="qq-trade-popup-row"
                        aria-pressed={isCurrent}
                        data-testid={`settings-trade-popup-option-${t.id}`}
                        onClick={() => selectTrade(t.id)}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              ))}
              {tradesByCategory.length === 0 && (
                <p
                  data-testid="settings-trade-empty"
                  style={{ padding: '12px 4px', fontSize: 12, color: p.colors.muted, margin: 0 }}
                >
                  No matching trades.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {current && (
        <p className="qq-trade-current" data-testid="settings-current-trade">
          Selected: <strong style={{ color: p.colors.heading }}>{current.label}</strong>
        </p>
      )}
    </fieldset>
  );
}

/* ─── SegmentedControl — same shape as StyleTab's. Kept local rather than
       extracted to avoid a new shared module and the import cycle risk. ─── */
function SegmentedControl<T extends string>({
  name, value, options, onChange, testid,
}: {
  name: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
  testid: string;
}) {
  return (
    <div
      className="qq-style-seg"
      role="radiogroup"
      aria-label={name}
      data-testid={testid}
    >
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            className="qq-style-seg-btn"
            data-testid={`${testid}-${o.value}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Parse a number input — blank string returns `undefined` so the field
 *  doesn't get pinned to `0` when the user clears it. */
function numOrUndef(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}
