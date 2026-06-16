// SettingsTab — Build > Settings panel (Wave H6).
//
// Surfaces the user-editable, calculator-LEVEL knobs that don't fit into Build
// (per-calculator fields) or Style (per-template look).
//
// Layout (re-grouped 2026-06-13 per owner feedback "the Settings tab is too
// empty"): the PRIMARY calculator-level settings now sit on the DEFAULT
// surface so the tab reads populated, with only the genuinely advanced detail
// tucked behind the "More settings" fold.
//
//   Default surface:
//     1. Number formatting — thousands sep + decimal sep + ISO currency code.
//     2. Pricing model     — segmented `hourly / fixed / custom`; per-mode value.
//     3. Branding          — "Powered by WeFixTrades" badge toggle (real
//                            pricing model: Free keeps it; Pro / Business hide it).
//   "More settings" fold:
//     4. Business location — distance-based-pricing anchor address.
//     5. Business profile  — inline trust signals (rating, license, insured).
//
// Lead-form CTA, success copy, spam protection, email-notification recipient,
// the action mode, AND the Deposit + Online-booking config live in the ACTION
// tab (post-quote / lead-flow concerns). The AI chat visibility toggle lives
// in this tab (behavior). Embed language + slug + hosted-page chrome + the
// floating launcher live in the INSTALL tab. Webhooks / integrations remain
// in the Action tab's Advanced area.
//
// Layout mirrors StyleTab's `qq-style-*` classes so the visual rhythm of the
// editor stays consistent across tabs.

import { useCallback, useRef, useState } from 'react';
import { platformTheme } from '@/theme/platformTheme';
import {
  DEFAULT_SHELL_NUMBER_FORMAT,
  type ShellSettings,
  type ShellStyle,
  type ShellPricing,
  type ShellPricingMode,
  type ShellNumberFormat,
  type ShellThousandsSep,
  type ShellDecimalSep,
} from './types';
import type { BusinessProfile } from '@shared/templatePresets';
import FloatField from './FloatField';
import InfoCue from './InfoCue';
import AdvancedSection from './AdvancedSection';
import { useFoldablePanels } from './useFoldablePanels';
import { useLayoutGuard } from '@/lib/layoutGuard';
import { HelpCueRow } from '@/components/primitives';

const p = platformTheme;

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
  /** Wave R-pre D — the calculator owner's plan_tier. Free disables the
   *  brand-badge toggle (server gate still strips it on PATCH if a free
   *  user manages to bypass the client); Pro / Business enables it. */
  planTier?: string;
  /** AI chat visibility lives in `style.aiChatVisibility` (a persisted style
   *  key). It is a BEHAVIOR control, so its editor moved here from Style —
   *  the state key is unchanged, so Settings needs read/write access to the
   *  style slot just for this one toggle. */
  style?: ShellStyle;
  onStyleChange?: (next: ShellStyle) => void;
}

export default function SettingsTab({
  settings, onChange, planTier = 'free', style, onStyleChange,
}: Props) {
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
  // settings.leadEmail + settings.ctaLabel are now owned by ActionTab.
  // NOTE: settings.tradeId is deliberately retained in state + the save
  // path (→ trade_type in WizardShell). The broken Settings UI control was
  // removed (2026-06-12); trade filtering now lives in Browse-all templates.
  const pricing: ShellPricing = settings.pricing ?? { mode: 'hourly', rate: 75 };
  const numberFormat: ShellNumberFormat =
    settings.numberFormat ?? { ...DEFAULT_SHELL_NUMBER_FORMAT };

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

  // Deposit (settings.deposit) + Online booking (settings.scheduling) — the
  // PERSISTED Stripe deposit + built-in scheduler — moved to the Action tab.
  // Same state keys + save mapping; only the editing UI relocated.

  // BD-3g Item 2 — wire fold/unfold onto every <fieldset.qq-style-group>
  // in this panel. Persists per-panel state in sessionStorage keyed by
  // `qq-wizard-panel-settings-${panelId}`.
  const settingsPanelRef = useRef<HTMLElement | null>(null);
  useFoldablePanels(settingsPanelRef, 'settings');
  // LAYOUT-1 — dev-only overlap/crumple detector. Settings is also a
  // section-level stack of fieldsets so we use the loose 24px gap.
  useLayoutGuard(settingsPanelRef, { maxGapPx: 24, label: 'editor-tabpanel-settings' });

  return (
    <section
      ref={settingsPanelRef}
      data-theme="light"
      className="qq-settings-panel qq-style-panel"
      // `editor-tabpanel-settings` matches the H1 generic tab-switching test.
      data-testid="editor-tabpanel-settings"
      data-section
      aria-label="Settings"
      role="tabpanel"
      /* Panel-level container: each fieldset below is its own surface with a
         single help cue in its legend. The escape hatch applies here so the
         outer section isn't flagged for aggregating its children's lone cues
         (matches ActionTab). Promoting Pricing + Branding out of the fold
         raised the section's aggregate cue count past the rule-b threshold;
         the per-fieldset single-cue rule is still honored within each. */
      data-cue-allowed-multiple
    >
      {/* ── CORE: Number formatting ─────────────────────────────── */}
      <fieldset className="qq-style-group" data-testid="settings-group-numberformat">
        <legend className="qq-style-legend">
          {/* Rule 5 — help cue anchored top-left via <HelpCueRow>. */}
          <HelpCueRow
            className="!mb-0"
            cue={
              <>
                <InfoCue
                  testid="settings-section-numberformat"
                  region="result"
                  text="Controls how prices display in the calculator. Currency is a 3-letter ISO code (USD / EUR / GBP / …)."
                />
                <span style={{ marginLeft: 6 }}>Number formatting</span>
              </>
            }
          />
        </legend>
        <div className="qq-style-group-body">
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
        </div>
      </fieldset>

      {/* ── Pricing model ─────────────────────────────────────────
       *  Owner feedback (2026-06-13): the Settings tab read near-empty
       *  because everything but Number formatting was buried in one
       *  "Advanced settings" fold. Pricing model is a PRIMARY
       *  calculator-level setting, so it now sits on the default surface
       *  alongside Number formatting and Branding. Only the genuinely
       *  advanced detail (deposit, booking, business address/profile)
       *  stays behind the fold below. */}
      {/* W-AO-7 — restored section legend (top-left + InfoCue) per the
         help-cue placement audit. The segmented control still speaks for
         itself, but the legend gives the section a name screen readers
         and skimming users can latch onto. */}
      <fieldset className="qq-style-group" data-testid="settings-group-pricing">
        <legend className="qq-style-legend">
          {/* Rule 5 — help cue anchored top-left via <HelpCueRow>. */}
          <HelpCueRow
            className="!mb-0"
            cue={
              <>
                <InfoCue
                  testid="settings-section-pricing"
                  region="result"
                  text="How quotes are priced. Hourly multiplies by hours; Fixed is a flat price; Custom lets you label the unit (per sqft, per door, per panel, etc.)."
                />
                <span style={{ marginLeft: 6 }}>Pricing model</span>
              </>
            }
          />
        </legend>
        <div className="qq-style-group-body">
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
        </div>
      </fieldset>

      {/* ── CTA label + Lead notification email — RELOCATED to ActionTab.
       *  settings.ctaLabel (now the Action tab's "Open form button text"
       *  inside the Lead-form CTA card) and settings.leadEmail (the Action
       *  tab's Email-notifications sub-row) moved out of Settings. Same
       *  state keys + testids, no duplication. */}

      {/* Wave Q-E — Brand badge toggle (PROMOTED to default surface
       *  2026-06-13). Branding is a primary calculator-level decision, so
       *  it sits on the default Settings surface beside Number formatting
       *  and Pricing rather than buried in the fold. Free users see the
       *  toggle as read-only with an "Upgrade to Pro" call-to-action; Pro /
       *  Business users can flip it. The server-side gate (Wave Q-D)
       *  enforces this on save regardless of what the client sends. */}
      <fieldset className="qq-style-group" data-testid="settings-group-brand-badge">
        <legend className="qq-style-legend">
          {/* Rule 5 — help cue anchored top-left via <HelpCueRow>. */}
          <HelpCueRow
            className="!mb-0"
            cue={
              <>
                <InfoCue
                  testid="settings-section-brand"
                  region="trust-block"
                  text="Controls the WeFixTrades badge on the calculator. Free plan keeps it visible; Pro and Business plans can hide it."
                />
                <span style={{ marginLeft: 6 }}>Branding</span>
              </>
            }
          />
        </legend>
        <div className="qq-style-group-body">
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
                  region="trust-block"
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
        </div>
      </fieldset>

      {/* ── AI chat visibility (RELOCATED from StyleTab) ───────────────
       *  Behavior control (not appearance), so it lives in Settings.
       *  Writes the SAME persisted key as before — style.aiChatVisibility.
       *  Only rendered when the style slot is plumbed in. */}
      {onStyleChange && style && (
        <fieldset className="qq-style-group" data-testid="settings-group-ai-chat">
          <legend className="qq-style-legend">
            <HelpCueRow
              className="!mb-0"
              cue={
                <>
                  <InfoCue
                    testid="style-ai-chat-visibility-info"
                    region="chat-bubble"
                    text="Should the AI chat assistant appear, and how? Off hides it entirely. Smart timing (recommended) keeps it out of the way as a small 'Need help?' pill and pops up only when a visitor seems stuck — idle for 30 seconds, deep into the form, or after tapping a help icon. Always visible puts the full chat button in the corner from page load. Smart timing gets more visitors to finish the form and use the chat."
                  />
                  <span style={{ marginLeft: 6 }}>AI chat visibility</span>
                </>
              }
            />
          </legend>
          <div className="qq-style-group-body" data-testid="style-ai-chat-visibility">
            <SegmentedControl<'off' | 'rescue' | 'always'>
              name="ai-chat-visibility"
              testid="style-segmented-ai-chat-visibility"
              value={(style.aiChatVisibility as 'off' | 'rescue' | 'always') ?? 'rescue'}
              options={[
                { value: 'off', label: 'Off' },
                { value: 'rescue', label: 'Smart timing' },
                { value: 'always', label: 'Always visible' },
              ]}
              onChange={(v) => onStyleChange({ ...style, aiChatVisibility: v })}
            />
            <p
              style={{
                fontSize: 11, color: p.colors.subtle,
                margin: '6px 0 0', lineHeight: 1.4,
              }}
            >
              Controls the AI assistant launcher on your published calculator
              and in this preview. Off hides it entirely; Smart timing shows a
              small "Need help?" pill that opens when a visitor seems stuck;
              Always visible shows the full chat button from the start. Free
              calculators use Smart timing; paid plans can choose Always
              visible.
            </p>
          </div>
        </fieldset>
      )}

      {/* ── Progressive disclosure: the genuinely advanced calculator
       *  settings (business address + profile) live here, collapsed by
       *  default so the default Settings surface reads clean. Labelled
       *  "More settings" — distinct from the other tabs' context-specific
       *  "Advanced build / action / style" folds, since this IS the
       *  settings tab. Nothing is removed; every fieldset keeps its
       *  testids + wiring. */}
      <AdvancedSection
        id="settings-advanced"
        label="More settings"
        hint="business location & profile details"
      >
      {/* ── Deposit + Online booking RELOCATED to the Action tab ──────
       *  Both the PERSISTED Stripe deposit (settings.deposit) and the
       *  built-in scheduler (settings.scheduling) now live in the Action
       *  tab's "Advanced action" area, since they govern what happens after
       *  the quote. Same state keys + save mapping — only the editing UI
       *  moved. */}

      {/* ── PRICING-MODELS (U3) — Business location ───────────────────
       *  Single anchor address for `address_distance` fields. Writes
       *  settings.origin.address; typing a new address drops any stale
       *  lat/lng — the server re-geocodes once on save (other unit), so the
       *  coordinates always belong to the address shown here. Compact card:
       *  one input, BP 2px-gap conventions, one help cue (Rule 5). */}
      <fieldset className="qq-style-group" data-testid="settings-group-business-location">
        <legend className="qq-style-legend">
          {/* The card's single help cue rides the FloatField below (infoText)
           *  — one cue per block, matching the in-field cue pattern the
           *  deposit / number-format fields already use. */}
          <span>Business location</span>
        </legend>
        <div className="qq-style-group-body">
          <div className="qq-bp-fieldlist">
            <FloatField
              label="Business address"
              htmlFor="qq-settings-origin-address"
              infoText="Used to calculate distance-based pricing — we measure driving distance from here to the customer's address. Required for any Distance field; never shown to customers."
              infoTestid="settings-origin-address-info"
            >
              <input
                id="qq-settings-origin-address"
                type="text"
                className="premium-input"
                placeholder=" "
                value={settings.origin?.address ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  // Blank clears the anchor entirely; any edit invalidates the
                  // previously geocoded lat/lng (server re-geocodes on save).
                  patch({ origin: v.trim() === '' ? undefined : { address: v } });
                }}
                data-testid="settings-input-origin-address"
              />
            </FloatField>
            <p
              style={{
                fontSize: 11, color: p.colors.subtle, margin: 0,
                lineHeight: 1.4,
              }}
            >
              Add a Distance field in Build to charge by the mile — quotes
              measure from this address to the customer's. We look up the
              coordinates once when you save.
            </p>
          </div>
        </div>
      </fieldset>

      {/* ── Business profile (trust signals) ─────────────────────── */}
      <BusinessProfileSection
        profile={settings.businessProfile}
        onChange={(next) => patch({ businessProfile: next })}
      />
      </AdvancedSection>

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
        /* BG-6 — Settings tab section-title-in-container pattern: title
         * sits INSIDE the fieldset as a flush header row, hairline
         * divider, then the body wrapper picks up the 12/14 px padding.
         * Mirrors StyleTab's BD-3f pattern so the two tabs share visual
         * rhythm. */
        .qq-style-group {
          border: 1px solid ${p.colors.borderLight};
          border-radius: 12px;
          padding: 0;
          background: #fff;
          margin: 0;
        }
        /* BG-6 — header row sits flush at the top of the fieldset. The
         * float-left opts out of the default legend positioning so the
         * row spans the full fieldset width; the body wrapper below
         * clears the float to keep content on its own row. */
        .qq-style-legend {
          display: flex;
          align-items: center;
          gap: 6px;
          width: 100%;
          box-sizing: border-box;
          padding: 12px 14px;
          font-size: 11.5px; font-weight: 600;
          color: ${p.colors.muted};
          text-transform: uppercase; letter-spacing: 0.04em;
          margin: 0;
          border-bottom: 1px solid ${p.colors.borderLight};
          float: left;
        }
        /* BG-6 — body wrapper inside every group. Sits below the header
         * divider with its own 12/14 px padding so titles never touch
         * the content. */
        .qq-style-group-body {
          clear: both;
          padding: 12px 14px 14px;
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
        /* W2 #12 — Deposit + Online booking on one row. Two equal columns
         * aligned to the top so the cards sit shoulder-to-shoulder; collapses
         * to a single stacked column on the narrow mobile sheet so neither
         * card is crushed. Matches the .qq-style-grid breakpoint pattern. */
        .qq-settings-pair {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          /* Audit W4 — 2px read as the two cards touching; 14px gives a clear
             column separation while still fitting both on one row. */
          gap: 14px;
          align-items: start;
        }
        .qq-settings-pair > .qq-style-group { margin: 0; }
        @media (max-width: 640px) {
          .qq-settings-pair { grid-template-columns: 1fr; }
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
        .qq-style-seg-btn:hover:not([aria-checked="true"]) {
          color: ${p.colors.heading};
          background: rgba(13, 60, 252, 0.04);
        }
        /* CRITICAL FIX — Rule 4 / BH-4: SettingsTab segmented active state was
         * a near-white pill on a white card, making the active option invisible
         * against the surrounding fieldset. Canonical pattern: subtle 10% accent
         * tint + 1.5px accent outline + accent-dark text. Matches CalculationRow
         * .qq-calc-seg-btn.is-active. */
        .qq-style-seg-btn[aria-checked="true"] {
          background: ${p.colors.accentLighter};
          color: ${p.colors.accentDark};
          box-shadow: inset 0 0 0 1.5px ${p.colors.accent};
        }
        .qq-settings-row {
          margin-top: 12px;
        }
        /* CRITICAL FIX — Business profile rows: each contains two FloatFields
         * (rating/reviews, years/area). They were stacking because the row
         * helper only set margin. Two-column grid on desktop (>= 720px),
         * single column on phone — matches qq-style-grid breakpoint.
         *
         * 13a — UNIFORM GAPS: the column gap here is locked to the SAME 2px
         * the vertical field stack uses (var below), so the horizontal pair
         * gap and the vertical stack gap read identically. Previously the
         * pairs used a 10px column gap while the stack used 2px, which made
         * the business-profile fields look unevenly spaced (the reported
         * "unequal gaps"). The title-in-field FloatFields are designed to sit
         * tight, so a single 2px gap is consistent on both axes. */
        .qq-settings-row[data-testid="settings-bp-row-rating"],
        .qq-settings-row[data-testid="settings-bp-row-years"] {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--qq-bp-gap, 2px);
        }
        @media (max-width: 480px) {
          .qq-settings-row[data-testid="settings-bp-row-rating"],
          .qq-settings-row[data-testid="settings-bp-row-years"] {
            grid-template-columns: 1fr;
          }
        }
        /* Business Profile field list — uniform 2px inter-field gaps
         * (hard input-field-rule), applied on BOTH axes via --qq-bp-gap so the
         * vertical stack and the horizontal pairs share one spacing value with
         * no mixed margins. Scoped to this wrapper so it does NOT affect the
         * generic .qq-settings-row used elsewhere (e.g. pricing custom mode).
         * The flex gap is the single source of vertical spacing; ad-hoc
         * margins inside are neutralized here. */
        .qq-bp-fieldlist {
          --qq-bp-gap: 2px;
          display: flex;
          flex-direction: column;
          gap: var(--qq-bp-gap);
        }
        .qq-bp-fieldlist .qq-settings-row {
          margin-top: 0;
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
        /* AUDIT dm3 — deposit-card heading. The inline color is
         * p.colors.heading (light-theme dark slate), which renders muddy on
         * the dark deposit card (.qq-style-group → #0f172a in dark mode). The
         * inline style wins over plain CSS, so override with !important under
         * the dark shell only. Light mode keeps the inline heading colour. */
        .qq-editor-shell[data-theme="dark"] .qq-deposit-toggle-title {
          color: #f5f7fa !important;
        }
      `}</style>
    </section>
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

/* ─── BD-2b — Business profile section ───────────────────────────────
 *
 * Surfaces the inline-trust fields driving the widget's TrustStripHeader
 * (above-the-fold Google rating + Licensed/Insured pill) and the
 * TrustBlockUnderCTA (license #, insured-up-to, no-obligation microcopy).
 *
 * Every field is optional. The renderer hides the trust UI entirely when
 * the whole object is undefined or all fields are empty — so a fresh
 * wizard state still produces a clean widget.
 *
 * Layout follows the same `qq-style-group` fieldset rhythm + FloatField
 * pattern as the other Settings sections, with `qq-settings-row` flex
 * helpers to pair two short inputs side-by-side (rating + review count,
 * years + service area).
 */
function BusinessProfileSection({
  profile, onChange,
}: {
  profile?: BusinessProfile;
  onChange: (next: BusinessProfile | undefined) => void;
}) {
  const p0 = profile ?? {};
  const patch = (next: Partial<BusinessProfile>) => {
    const merged: BusinessProfile = { ...p0, ...next };
    // Strip empty strings + non-finite numbers so the renderer's
    // "is any field populated?" check stays accurate.
    const cleaned: BusinessProfile = {};
    if (typeof merged.googleRating === 'number' && Number.isFinite(merged.googleRating) && merged.googleRating > 0) {
      cleaned.googleRating = merged.googleRating;
    }
    if (typeof merged.googleReviewCount === 'number' && Number.isFinite(merged.googleReviewCount) && merged.googleReviewCount > 0) {
      cleaned.googleReviewCount = merged.googleReviewCount;
    }
    if (typeof merged.yearsInBusiness === 'number' && Number.isFinite(merged.yearsInBusiness) && merged.yearsInBusiness > 0) {
      cleaned.yearsInBusiness = merged.yearsInBusiness;
    }
    if (merged.licenseNumber && merged.licenseNumber.trim() !== '') {
      cleaned.licenseNumber = merged.licenseNumber.trim();
    }
    if (merged.insuredAmount && merged.insuredAmount.trim() !== '') {
      cleaned.insuredAmount = merged.insuredAmount.trim();
    }
    if (merged.serviceArea && merged.serviceArea.trim() !== '') {
      cleaned.serviceArea = merged.serviceArea.trim();
    }
    if (merged.bbbRating && merged.bbbRating.trim() !== '') {
      cleaned.bbbRating = merged.bbbRating.trim();
    }
    onChange(Object.keys(cleaned).length === 0 ? undefined : cleaned);
  };

  return (
    <fieldset className="qq-style-group" data-testid="settings-group-business-profile">
      <legend className="qq-style-legend">
        {/* Rule 5 — help cue anchored top-left via <HelpCueRow>. */}
        <HelpCueRow
          className="!mb-0"
          cue={
            <>
              <InfoCue
                testid="settings-section-business-profile"
                region="trust-strip"
                text="Drives inline trust signals on the widget: aggregate Google rating in the header strip, license # and insured-up-to below the CTA. Empty fields are hidden — no placeholder copy."
              />
              <span style={{ marginLeft: 6 }}>Business profile</span>
            </>
          }
        />
      </legend>
      <div className="qq-style-group-body">

      <div className="qq-bp-fieldlist">
      <div className="qq-settings-row" data-testid="settings-bp-row-rating">
        <FloatField label="Google rating (0-5)" htmlFor="qq-settings-bp-rating">
          <input
            id="qq-settings-bp-rating"
            type="number"
            min={0}
            max={5}
            step={0.1}
            className="premium-input"
            placeholder=" "
            value={typeof p0.googleRating === 'number' ? p0.googleRating : ''}
            onChange={(e) => patch({ googleRating: numOrUndef(e.target.value) })}
            data-testid="settings-input-bp-google-rating"
          />
        </FloatField>
        <FloatField label="Review count" htmlFor="qq-settings-bp-reviews">
          <input
            id="qq-settings-bp-reviews"
            type="number"
            min={0}
            step={1}
            className="premium-input"
            placeholder=" "
            value={typeof p0.googleReviewCount === 'number' ? p0.googleReviewCount : ''}
            onChange={(e) => patch({ googleReviewCount: numOrUndef(e.target.value) })}
            data-testid="settings-input-bp-review-count"
          />
        </FloatField>
      </div>

      <FloatField label="License number" htmlFor="qq-settings-bp-license">
        <input
          id="qq-settings-bp-license"
          type="text"
          className="premium-input"
          placeholder=" "
          value={p0.licenseNumber ?? ''}
          onChange={(e) => patch({ licenseNumber: e.target.value })}
          data-testid="settings-input-bp-license"
        />
      </FloatField>

      <FloatField label="Insured up to (e.g. $2M)" htmlFor="qq-settings-bp-insured">
        <input
          id="qq-settings-bp-insured"
          type="text"
          className="premium-input"
          placeholder=" "
          value={p0.insuredAmount ?? ''}
          onChange={(e) => patch({ insuredAmount: e.target.value })}
          data-testid="settings-input-bp-insured"
        />
      </FloatField>

      <div className="qq-settings-row" data-testid="settings-bp-row-years">
        <FloatField label="Years in business" htmlFor="qq-settings-bp-years">
          <input
            id="qq-settings-bp-years"
            type="number"
            min={0}
            step={1}
            className="premium-input"
            placeholder=" "
            value={typeof p0.yearsInBusiness === 'number' ? p0.yearsInBusiness : ''}
            onChange={(e) => patch({ yearsInBusiness: numOrUndef(e.target.value) })}
            data-testid="settings-input-bp-years"
          />
        </FloatField>
        <FloatField label="Service area" htmlFor="qq-settings-bp-area">
          <input
            id="qq-settings-bp-area"
            type="text"
            className="premium-input"
            placeholder=" "
            value={p0.serviceArea ?? ''}
            onChange={(e) => patch({ serviceArea: e.target.value })}
            data-testid="settings-input-bp-area"
          />
        </FloatField>
      </div>

      <FloatField label="BBB rating (e.g. A+)" htmlFor="qq-settings-bp-bbb">
        <input
          id="qq-settings-bp-bbb"
          type="text"
          className="premium-input"
          placeholder=" "
          value={p0.bbbRating ?? ''}
          onChange={(e) => patch({ bbbRating: e.target.value })}
          data-testid="settings-input-bp-bbb"
        />
      </FloatField>

      <p
        style={{
          fontSize: 11, color: p.colors.subtle, margin: 0,
          lineHeight: 1.4,
        }}
      >
        These fields drive the inline trust signals at the top of the widget
        and below the CTA. Leave any field blank to hide that signal —
        nothing renders as a placeholder.
      </p>
      </div>
      </div>
    </fieldset>
  );
}
