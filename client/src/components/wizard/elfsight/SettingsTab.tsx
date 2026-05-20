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

import { useCallback, useMemo, useState } from 'react';
import { platformTheme } from '@/theme/platformTheme';
import { TRADES, type Trade } from '@/data/trades';
import {
  DEFAULT_SHELL_NUMBER_FORMAT,
  type ShellSettings,
  type ShellPricing,
  type ShellPricingMode,
  type ShellNumberFormat,
  type ShellThousandsSep,
  type ShellDecimalSep,
} from './types';

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

interface Props {
  settings: ShellSettings;
  onChange: (next: ShellSettings) => void;
}

export default function SettingsTab({ settings, onChange }: Props) {
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
        <legend className="qq-style-legend">Lead notification email</legend>
        <p className="qq-style-sub">
          Where customer leads are sent when someone hits the CTA. Single
          email; team forwarding is configured upstream.
        </p>
        <label className="qq-style-label" htmlFor="qq-settings-leademail">
          Email
        </label>
        <input
          id="qq-settings-leademail"
          type="email"
          className="qq-style-hex"
          style={{ width: '100%' }}
          value={leadEmail}
          placeholder="you@yourbusiness.com"
          onChange={(e) => patch({ leadEmail: e.target.value })}
          data-testid="settings-input-lead-email"
          aria-invalid={
            leadEmail.trim() !== '' && !EMAIL_RE.test(leadEmail.trim()) ? 'true' : 'false'
          }
        />
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
      <fieldset className="qq-style-group" data-testid="settings-group-pricing">
        <legend className="qq-style-legend">Pricing model</legend>
        <p className="qq-style-sub">
          The shape of your price. Saved alongside the calculator config —
          the renderer's pricing engine will pick this up downstream.
        </p>
        <label className="qq-style-label">Mode</label>
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
            <label className="qq-style-label" htmlFor="qq-settings-rate">
              Rate per hour ($)
            </label>
            <input
              id="qq-settings-rate"
              type="number"
              min={0}
              step={1}
              className="qq-style-hex"
              style={{ width: '100%' }}
              value={pricing.rate ?? ''}
              onChange={(e) => patchPricing({ rate: numOrUndef(e.target.value) })}
              data-testid="settings-input-pricing-rate"
              placeholder="75"
            />
          </div>
        )}

        {pricing.mode === 'fixed' && (
          <div className="qq-settings-row" data-testid="settings-pricing-fixed">
            <label className="qq-style-label" htmlFor="qq-settings-value">
              Fixed price ($)
            </label>
            <input
              id="qq-settings-value"
              type="number"
              min={0}
              step={1}
              className="qq-style-hex"
              style={{ width: '100%' }}
              value={pricing.value ?? ''}
              onChange={(e) => patchPricing({ value: numOrUndef(e.target.value) })}
              data-testid="settings-input-pricing-value"
              placeholder="350"
            />
          </div>
        )}

        {pricing.mode === 'custom' && (
          <div className="qq-settings-row" data-testid="settings-pricing-custom">
            <label className="qq-style-label" htmlFor="qq-settings-custom-label">
              Unit-rate label
            </label>
            <input
              id="qq-settings-custom-label"
              type="text"
              className="qq-style-hex"
              style={{ width: '100%' }}
              value={pricing.label ?? ''}
              onChange={(e) => patchPricing({ label: e.target.value })}
              data-testid="settings-input-pricing-label"
              placeholder="sq ft"
            />
            <label className="qq-style-label" htmlFor="qq-settings-custom-rate" style={{ marginTop: 10 }}>
              Rate per unit ($)
            </label>
            <input
              id="qq-settings-custom-rate"
              type="number"
              min={0}
              step={1}
              className="qq-style-hex"
              style={{ width: '100%' }}
              value={pricing.rate ?? ''}
              onChange={(e) => patchPricing({ rate: numOrUndef(e.target.value) })}
              data-testid="settings-input-pricing-custom-rate"
              placeholder="6"
            />
          </div>
        )}
      </fieldset>

      {/* ── Number formatting ───────────────────────────────────── */}
      <fieldset className="qq-style-group" data-testid="settings-group-numberformat">
        <legend className="qq-style-legend">Number formatting</legend>
        <p className="qq-style-sub">
          How prices display in the calculator. Currency is a 3-letter ISO
          code (USD / EUR / GBP / …).
        </p>
        <div className="qq-style-grid">
          <div>
            <label className="qq-style-label" htmlFor="qq-settings-thousands">
              Thousands separator
            </label>
            <select
              id="qq-settings-thousands"
              className="qq-style-select"
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
          </div>
          <div>
            <label className="qq-style-label" htmlFor="qq-settings-decimal">
              Decimal separator
            </label>
            <select
              id="qq-settings-decimal"
              className="qq-style-select"
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
          </div>
        </div>
        <label className="qq-style-label" htmlFor="qq-settings-currency" style={{ marginTop: 12 }}>
          Currency code
        </label>
        <input
          id="qq-settings-currency"
          type="text"
          maxLength={3}
          className="qq-style-hex"
          style={{ width: '100%', textTransform: 'uppercase' }}
          value={numberFormat.currency}
          onChange={(e) =>
            patchNumberFormat({ currency: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })
          }
          data-testid="settings-input-currency"
          placeholder="USD"
          aria-invalid={!CURRENCY_RE.test(numberFormat.currency) ? 'true' : 'false'}
        />
      </fieldset>

      {/* ── Custom CTA label ────────────────────────────────────── */}
      <fieldset className="qq-style-group" data-testid="settings-group-cta">
        <legend className="qq-style-legend">Custom CTA label</legend>
        <p className="qq-style-sub">
          Overrides the result-panel button text. Leave blank to keep the
          default (“Get My Quote”).
        </p>
        <label className="qq-style-label" htmlFor="qq-settings-cta-label">
          CTA label
        </label>
        <input
          id="qq-settings-cta-label"
          type="text"
          className="qq-style-hex"
          style={{ width: '100%' }}
          value={ctaLabel}
          onChange={(e) => patch({ ctaLabel: e.target.value })}
          data-testid="settings-input-cta-label"
          placeholder="Get My Quote"
        />
      </fieldset>

      <style>{`
        /* Reuse the Style tab's spacing rhythm — see StyleTab.tsx for the
           canonical .qq-style-* class definitions. The few overrides below
           handle settings-only details (the row helper, the trade picker). */
        .qq-settings-panel {
          display: flex; flex-direction: column; gap: 18px;
        }
        .qq-style-group {
          border: 1px solid ${p.colors.borderLight};
          border-radius: 12px;
          padding: 14px 14px 16px;
          background: #fff;
          margin: 0;
        }
        .qq-style-legend {
          font-size: 13px; font-weight: 800;
          color: ${p.colors.heading};
          padding: 0 6px;
          letter-spacing: -0.005em;
        }
        .qq-style-sub {
          font-size: 12px; color: ${p.colors.muted};
          margin: 0 0 12px; line-height: 1.5;
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
      `}</style>
    </section>
  );
}

/* ─── Trade picker — searchable list ─── */
function TradeSection({
  tradeId, onChange,
}: { tradeId: string; onChange: (id: string) => void }) {
  const [query, setQuery] = useState('');

  const current = useMemo(
    () => TRADES.find((t) => t.id === tradeId),
    [tradeId],
  );

  const matches = useMemo<Trade[]>(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return TRADES.slice(0, 14);
    return TRADES.filter((t) => t.label.toLowerCase().includes(q)).slice(0, 30);
  }, [query]);

  return (
    <fieldset className="qq-style-group" data-testid="settings-group-trade">
      <legend className="qq-style-legend">Trade</legend>
      <p className="qq-style-sub">
        Which trade this calculator is for. Drives template suggestions and
        downstream copy. Search the list below.
      </p>
      <label className="qq-style-label" htmlFor="qq-settings-trade-search">
        Search trades
      </label>
      <input
        id="qq-settings-trade-search"
        type="text"
        className="qq-style-hex"
        style={{ width: '100%' }}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={current?.label ?? 'e.g. plumbing, roofing, …'}
        data-testid="settings-input-trade-search"
      />
      <p className="qq-trade-current" data-testid="settings-current-trade">
        Selected:{' '}
        <strong style={{ color: p.colors.heading }}>
          {current?.label ?? 'None'}
        </strong>
      </p>
      <div className="qq-trade-results" role="listbox" aria-label="Trades">
        {matches.map((t) => (
          <button
            key={t.id}
            type="button"
            className="qq-trade-row"
            role="option"
            aria-pressed={t.id === tradeId}
            aria-selected={t.id === tradeId}
            data-testid={`settings-trade-option-${t.id}`}
            onClick={() => onChange(t.id)}
          >
            <span>{t.label}</span>
            {t.id === tradeId && <span aria-hidden="true">✓</span>}
          </button>
        ))}
        {matches.length === 0 && (
          <p
            data-testid="settings-trade-empty"
            style={{ padding: '12px', fontSize: 12, color: p.colors.muted, margin: 0 }}
          >
            No matching trades.
          </p>
        )}
      </div>
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
