// ActionTab — Build > Action panel.
//
// Replicates the LAYOUT structure of a generic embed-builder "Action" panel
// (mode selector at the top, then a rich Lead-form configuration with a CTA
// card, the captured fields list, and drill-in sub-sections for the heavier
// features) but is populated entirely with OUR features and OUR copy.
//
// State ownership (relocated here — same keys, no new state except actionMode,
// ctaHeading, ctaCaption, redirectUrl):
//   - settings.actionMode  (NEW — 'redirect' | 'lead-form' | 'no-action')
//   - settings.ctaHeading  (NEW — lead-form CTA card heading)
//   - settings.ctaCaption  (NEW — lead-form CTA card caption)
//   - settings.ctaLabel    (MOVED from SettingsTab — open-form button text)
//   - settings.leadEmail   (MOVED from SettingsTab — Email-notifications sub-row)
//   - settings.redirectUrl (NEW — redirect destination URL)
//   - style.deposit        (MOVED from StyleTab — Payment sub-row, AdvDeposit)
//   - style.booking        (MOVED from StyleTab — Online-booking sub-row, AdvBooking)
//
// Surfaces we don't have yet (configurable lead fields, Submit-button config,
// Integrations, Spam protection) are rendered as disabled rows with a small
// "Coming soon" hint so the LAYOUT matches without faking functionality.

import { useCallback } from 'react';
import {
  User, Mail, Phone, Plus,
  CreditCard, BellRing, CalendarDays,
  MousePointerClick, Plug, ShieldCheck,
  Lock, Shield, Check, CheckCircle, Calendar, Clock, BadgeCheck, FileCheck, Award,
  type LucideIcon,
} from 'lucide-react';
import { AE } from './appleEditor';
import type {
  ShellSettings,
  ShellStyle,
} from './types';
import type {
  AdvDeposit, AdvDepositIconName, AdvBooking, AdvBookingSource,
} from '@shared/templatePresets';
import FloatField from './FloatField';
import InfoCue from './InfoCue';
import RichTextField from './RichTextField';
import AdvancedSection from './AdvancedSection';
import { StyledSelect } from './StyledSelect';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** ShellStyle is an alias of AdvStyle; the data contract names it AdvStyle. */
type AdvStyle = ShellStyle;

type ActionMode = 'redirect' | 'lead-form' | 'no-action';

const MODE_OPTIONS: ReadonlyArray<{ value: ActionMode; label: string; hint: string }> = [
  { value: 'redirect',  label: 'Redirect',  hint: 'Send the customer to a URL.' },
  { value: 'lead-form', label: 'Lead form', hint: 'Collect their details and notify you.' },
  { value: 'no-action', label: 'No action', hint: 'Just show the result.' },
];

/* The fields our lead capture collects today. The form isn't field-configurable
   yet — this list is presentational (type-icon + name rows) so the LAYOUT
   matches; the "Add field" affordance is disabled with a Pro hint. */
const LEAD_FIELDS: ReadonlyArray<{ icon: LucideIcon; name: string; type: string }> = [
  { icon: User,  name: 'Name',  type: 'Text' },
  { icon: Mail,  name: 'Email', type: 'Email' },
  { icon: Phone, name: 'Phone', type: 'Phone' },
];

/* P2 UX — deposit-badge icon picker. Mirrors the whitelist used elsewhere so a
   saved name resolves back to its lucide component. */
const DEPOSIT_ICON_OPTIONS: ReadonlyArray<{ name: AdvDepositIconName; Icon: LucideIcon; label: string }> = [
  { name: 'Lock',        Icon: Lock,        label: 'Lock' },
  { name: 'Shield',      Icon: Shield,      label: 'Shield' },
  { name: 'ShieldCheck', Icon: ShieldCheck, label: 'Shield + check' },
  { name: 'Check',       Icon: Check,       label: 'Check' },
  { name: 'CheckCircle', Icon: CheckCircle, label: 'Check circle' },
  { name: 'Calendar',    Icon: Calendar,    label: 'Calendar' },
  { name: 'Clock',       Icon: Clock,       label: 'Clock' },
  { name: 'BadgeCheck',  Icon: BadgeCheck,  label: 'Badge check' },
  { name: 'FileCheck',   Icon: FileCheck,   label: 'File check' },
  { name: 'Award',       Icon: Award,       label: 'Award' },
];

interface Props {
  settings: ShellSettings;
  onChange: (next: ShellSettings) => void;
  style: AdvStyle;
  onStyleChange: (next: AdvStyle) => void;
  /** Owner plan tier — drives the "Pro" hint on coming-soon rows. */
  planTier?: string;
}

export default function ActionTab({
  settings, onChange, style, onStyleChange,
}: Props) {
  const patch = useCallback(
    (next: Partial<ShellSettings>) => onChange({ ...settings, ...next }),
    [settings, onChange],
  );
  const patchStyle = useCallback(
    (next: Partial<AdvStyle>) => onStyleChange({ ...style, ...next }),
    [style, onStyleChange],
  );

  const actionMode: ActionMode = settings.actionMode ?? 'lead-form';
  const ctaHeading = settings.ctaHeading ?? '';
  const ctaCaption = settings.ctaCaption ?? '';
  const ctaLabel = settings.ctaLabel ?? '';
  const leadEmail = settings.leadEmail ?? '';
  const redirectUrl = settings.redirectUrl ?? '';

  // ── Payment (relocated from StyleTab — style.deposit, AdvDeposit) ──
  const deposit: AdvDeposit = style.deposit ?? { enabled: false, amount: 200 };
  const depositEnabled = deposit.enabled === true;
  const depositAmount = (() => {
    const raw = deposit.amount;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return 200;
    return Math.max(1, Math.min(100000, Math.round(raw)));
  })();
  const depositLabel = typeof deposit.label === 'string' ? deposit.label : '';
  const depositIconName: AdvDepositIconName = (
    DEPOSIT_ICON_OPTIONS.some((o) => o.name === deposit.iconName)
      ? (deposit.iconName as AdvDepositIconName)
      : 'Lock'
  );
  const setDeposit = (next: Partial<AdvDeposit>) => {
    patchStyle({
      deposit: {
        enabled: depositEnabled,
        amount: depositAmount,
        ...(depositLabel ? { label: depositLabel } : null),
        ...(style.deposit ?? {}),
        ...next,
      },
    });
  };

  // ── Online booking (relocated from StyleTab — style.booking, AdvBooking) ──
  const booking: AdvBooking = style.booking ?? { enabled: false, source: 'wefixtrades-default' };
  const bookingEnabled = booking.enabled === true;
  const bookingSource: AdvBookingSource = booking.source ?? 'wefixtrades-default';
  const bookingUrl = typeof booking.url === 'string' ? booking.url : '';
  const setBooking = (next: Partial<AdvBooking>) => {
    patchStyle({
      booking: {
        enabled: bookingEnabled,
        source: bookingSource,
        ...(bookingUrl ? { url: bookingUrl } : null),
        ...(style.booking ?? {}),
        ...next,
      },
    });
  };

  const leadEmailInvalid = leadEmail.trim() !== '' && !EMAIL_RE.test(leadEmail.trim());

  return (
    <section
      data-theme="light"
      className="qq-action-panel"
      data-testid="editor-tabpanel-action"
      aria-label="Action"
      role="tabpanel"
    >
      {/* ── 1. Mode segmented control ─────────────────────────────── */}
      <div className="qq-action-card" data-testid="action-group-mode">
        <div className="qq-action-card-head">
          <span className="qq-action-card-title">When the quote is ready</span>
          <InfoCue
            testid="action-section-mode"
            region="sticky-footer"
            text="What happens after the customer sees their quote. Lead form collects their details; Redirect sends them to a URL; No action just shows the result."
          />
        </div>
        <div className="qq-action-card-body">
          <div
            className="qq-action-seg"
            role="radiogroup"
            aria-label="Action mode"
            data-testid="action-segmented-mode"
          >
            {MODE_OPTIONS.map((o) => {
              const selected = actionMode === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`qq-action-seg-btn${selected ? ' is-active' : ''}`}
                  data-testid={`action-mode-${o.value}`}
                  onClick={() => patch({ actionMode: o.value })}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          <p className="qq-action-seg-hint" data-testid="action-mode-hint">
            {MODE_OPTIONS.find((o) => o.value === actionMode)?.hint}
          </p>
        </div>
      </div>

      {/* ── 2. Lead form (rich case) ──────────────────────────────── */}
      {actionMode === 'lead-form' && (
        <>
          {/* 2a. CTA card */}
          <div className="qq-action-card" data-testid="action-group-cta">
            <div className="qq-action-card-head">
              <span className="qq-action-card-title">Call to action</span>
              <InfoCue
                testid="action-section-cta"
                region="sticky-footer"
                text="The heading, caption and button that invite the customer to share their details after the quote."
              />
            </div>
            <div className="qq-action-card-body">
              <FloatField
                label="Heading"
                htmlFor="qq-action-cta-heading"
                infoText="Short heading above the lead form (e.g. a prompt to get a callback). Leave blank to use the default."
                infoTestid="action-cta-heading"
              >
                <input
                  id="qq-action-cta-heading"
                  type="text"
                  className="premium-input"
                  placeholder=" "
                  value={ctaHeading}
                  onChange={(e) => patch({ ctaHeading: e.target.value })}
                  data-testid="action-input-cta-heading"
                />
              </FloatField>
              <div style={{ marginTop: 12 }}>
                <FloatField
                  label="Caption"
                  htmlFor="qq-action-cta-caption"
                  infoText="Supporting line under the heading. Reassure the customer about what happens next."
                  infoTestid="action-cta-caption"
                >
                  <input
                    id="qq-action-cta-caption"
                    type="text"
                    className="premium-input"
                    placeholder=" "
                    value={ctaCaption}
                    onChange={(e) => patch({ ctaCaption: e.target.value })}
                    data-testid="action-input-cta-caption"
                  />
                </FloatField>
              </div>
              <div style={{ marginTop: 12 }}>
                {/* MOVED from SettingsTab (settings-input-cta-label) — same
                    key (settings.ctaLabel), same rich-text control. */}
                <RichTextField
                  label="Open form button text"
                  htmlFor="qq-action-cta-label"
                  value={ctaLabel}
                  onChange={(next) => patch({ ctaLabel: next })}
                  placeholder='Click to override (default: "Get My Quote")'
                  infoText='Overrides the result-panel button text. Leave blank to keep the default ("Get My Quote").'
                  infoTestid="action-cta"
                  infoRegion="sticky-footer"
                  testid="settings-input-cta-label"
                  expansionMode="inline"
                />
              </div>
            </div>
          </div>

          {/* 2b. Lead form fields */}
          <div className="qq-action-card" data-testid="action-group-fields">
            <div className="qq-action-card-head">
              <span className="qq-action-card-title">Lead form fields</span>
              <InfoCue
                testid="action-section-fields"
                text="The details we collect from the customer. Field configuration is on the roadmap — today we capture name, email and phone."
              />
            </div>
            <div className="qq-action-card-body">
              <ul className="qq-action-fieldlist" data-testid="action-fieldlist">
                {LEAD_FIELDS.map((f) => {
                  const Icon = f.icon;
                  return (
                    <li
                      key={f.name}
                      className="qq-action-fieldrow"
                      data-testid={`action-field-${f.name.toLowerCase()}`}
                    >
                      <span className="qq-action-fieldicon" aria-hidden="true">
                        <Icon size={16} />
                      </span>
                      <span className="qq-action-fieldname">{f.name}</span>
                      <span className="qq-action-fieldtype">{f.type}</span>
                    </li>
                  );
                })}
              </ul>
              {/* "+ Add field" — disabled; field config isn't shipped yet. */}
              <button
                type="button"
                className="qq-action-addfield"
                data-testid="action-add-field"
                disabled
                aria-disabled="true"
                title="Configurable lead fields are coming soon"
              >
                <Plus size={15} aria-hidden="true" />
                <span>Add field</span>
                <span className="qq-action-soon">Coming soon</span>
              </button>
            </div>
          </div>

          {/* 2c. Drill-in sub rows */}
          <AdvancedSection
            id="action-advanced"
            label="Advanced settings"
            hint="payment, email notifications, booking & more"
          >
            {/* Payment — relocated style.deposit */}
            <div className="qq-action-card" data-testid="action-group-payment">
              <div className="qq-action-card-head">
                <span className="qq-action-card-headicon" aria-hidden="true">
                  <CreditCard size={15} />
                </span>
                <span className="qq-action-card-title">Payment</span>
                <InfoCue
                  testid="action-section-payment"
                  region="result"
                  text="Show a deposit badge on the result step so customers can secure their slot. The actual checkout is wired to Stripe separately — the preview never charges money."
                />
              </div>
              <div className="qq-action-card-body">
                <label className="qq-action-toggle">
                  <input
                    type="checkbox"
                    checked={depositEnabled}
                    onChange={(e) => setDeposit({ enabled: e.target.checked })}
                    data-testid="style-deposit-enabled"
                    aria-label="Require deposit to schedule"
                  />
                  <span className="qq-action-toggle-title">Require deposit to schedule</span>
                </label>

                {depositEnabled && (
                  <div className="qq-action-subfields" data-testid="style-deposit-sub-fields">
                    <FloatField label="Deposit amount" htmlFor="qq-action-deposit-amount">
                      <input
                        id="qq-action-deposit-amount"
                        type="number"
                        className="premium-input"
                        min={1}
                        max={100000}
                        step={1}
                        inputMode="numeric"
                        placeholder=" "
                        value={depositAmount}
                        data-testid="style-deposit-amount"
                        onChange={(e) => {
                          const raw = Number(e.target.value);
                          if (!Number.isFinite(raw)) return;
                          setDeposit({ amount: Math.max(1, Math.min(100000, Math.round(raw))) });
                        }}
                      />
                    </FloatField>
                    <FloatField label="Badge label (optional)" htmlFor="qq-action-deposit-label">
                      <input
                        id="qq-action-deposit-label"
                        type="text"
                        className="premium-input"
                        maxLength={120}
                        placeholder=" "
                        value={depositLabel}
                        data-testid="style-deposit-label"
                        onChange={(e) => setDeposit({ label: e.target.value })}
                      />
                    </FloatField>
                    <div className="qq-action-iconrow" data-testid="style-deposit-icon-row">
                      <div className="qq-action-iconrow-label" id="action-deposit-icon-label">
                        Badge icon
                      </div>
                      <div
                        className="qq-action-iconscroll"
                        role="radiogroup"
                        aria-labelledby="action-deposit-icon-label"
                      >
                        {DEPOSIT_ICON_OPTIONS.map(({ name, Icon, label }) => {
                          const selected = depositIconName === name;
                          return (
                            <button
                              key={name}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              aria-label={label}
                              title={label}
                              data-testid={`style-deposit-icon-${name}`}
                              className={`qq-action-iconbtn${selected ? ' is-selected' : ''}`}
                              onClick={() => setDeposit({ iconName: name })}
                            >
                              <Icon size={16} aria-hidden="true" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Email notifications — relocated settings.leadEmail */}
            <div className="qq-action-card" data-testid="action-group-email">
              <div className="qq-action-card-head">
                <span className="qq-action-card-headicon" aria-hidden="true">
                  <BellRing size={15} />
                </span>
                <span className="qq-action-card-title">Email notifications</span>
                <InfoCue
                  testid="action-section-email"
                  text="Where customer leads are sent when someone submits the form. Single recipient; message format is fixed."
                />
              </div>
              <div className="qq-action-card-body">
                <FloatField
                  label="Lead notification email"
                  htmlFor="qq-action-leademail"
                  infoText="Where customer leads are sent when someone hits the CTA. Single email; team forwarding is configured upstream."
                  infoTestid="settings-lead-email"
                >
                  <input
                    id="qq-action-leademail"
                    type="email"
                    className="premium-input"
                    placeholder=" "
                    value={leadEmail}
                    onChange={(e) => patch({ leadEmail: e.target.value })}
                    data-testid="settings-input-lead-email"
                    aria-invalid={leadEmailInvalid ? 'true' : 'false'}
                  />
                </FloatField>
                {leadEmailInvalid && (
                  <p
                    className="qq-action-error"
                    data-testid="settings-lead-email-error"
                  >
                    Enter a valid email address.
                  </p>
                )}
              </div>
            </div>

            {/* Online booking — relocated style.booking */}
            <div className="qq-action-card" data-testid="action-group-booking">
              <div className="qq-action-card-head">
                <span className="qq-action-card-headicon" aria-hidden="true">
                  <CalendarDays size={15} />
                </span>
                <span className="qq-action-card-title">Online booking</span>
                <InfoCue
                  testid="action-section-booking"
                  region="result"
                  text="Add a slot picker beneath the price on the result step. Use the built-in slots, or point it at a Cal.com or Calendly URL."
                />
              </div>
              <div className="qq-action-card-body">
                <label className="qq-action-toggle">
                  <input
                    type="checkbox"
                    checked={bookingEnabled}
                    onChange={(e) => setBooking({ enabled: e.target.checked })}
                    data-testid="style-booking-enabled"
                    aria-label="Show calendar in widget"
                  />
                  <span className="qq-action-toggle-title">Show calendar in widget</span>
                </label>

                {bookingEnabled && (
                  <div className="qq-action-subfields" data-testid="style-booking-sub-fields">
                    <FloatField label="Calendar source" htmlFor="qq-action-booking-source" variant="select">
                      <StyledSelect
                        value={bookingSource}
                        onChange={(next) => setBooking({ source: next as AdvBookingSource })}
                        options={[
                          { value: 'wefixtrades-default', label: 'WeFixTrades default (built-in slots)' },
                          { value: 'cal.com-url', label: 'Cal.com URL' },
                          { value: 'calendly-url', label: 'Calendly URL' },
                        ]}
                        title="Calendar source"
                        ariaLabel="Calendar source"
                        testId="style-booking-source"
                      />
                    </FloatField>
                    {(bookingSource === 'cal.com-url' || bookingSource === 'calendly-url') && (
                      <FloatField label="Scheduler URL" htmlFor="qq-action-booking-url">
                        <input
                          id="qq-action-booking-url"
                          type="url"
                          className="premium-input"
                          placeholder=" "
                          value={bookingUrl}
                          data-testid="style-booking-url"
                          onChange={(e) => setBooking({ url: e.target.value })}
                        />
                      </FloatField>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Coming-soon drill rows — layout parity only; not yet shipped. */}
            <div className="qq-action-soonrows" data-testid="action-group-soon">
              <ComingSoonRow icon={MousePointerClick} label="Submit button" testid="action-row-submit" />
              <ComingSoonRow icon={Plug} label="Integrations" testid="action-row-integrations" />
              <ComingSoonRow icon={ShieldCheck} label="Spam protection" testid="action-row-spam" />
            </div>
          </AdvancedSection>
        </>
      )}

      {/* ── 3. Redirect ───────────────────────────────────────────── */}
      {actionMode === 'redirect' && (
        <div className="qq-action-card" data-testid="action-group-redirect">
          <div className="qq-action-card-head">
            <span className="qq-action-card-title">Redirect</span>
            <InfoCue
              testid="action-section-redirect"
              text="Where the customer is sent once they reach their quote. Use a full URL including https://."
            />
          </div>
          <div className="qq-action-card-body">
            <FloatField
              label="Redirect URL"
              htmlFor="qq-action-redirect-url"
              infoText="The customer is sent here after the quote. Include the full URL (https://…)."
              infoTestid="action-redirect-url"
            >
              <input
                id="qq-action-redirect-url"
                type="url"
                className="premium-input"
                placeholder=" "
                value={redirectUrl}
                onChange={(e) => patch({ redirectUrl: e.target.value })}
                data-testid="action-input-redirect-url"
              />
            </FloatField>
          </div>
        </div>
      )}

      {/* ── 4. No action ──────────────────────────────────────────── */}
      {actionMode === 'no-action' && (
        <div className="qq-action-card" data-testid="action-group-no-action">
          <div className="qq-action-card-body">
            <p className="qq-action-noaction-help" data-testid="action-no-action-help">
              Customers just see their result; no follow-up step.
            </p>
          </div>
        </div>
      )}

      <style>{`
        .qq-action-panel {
          display: flex; flex-direction: column; gap: 10px;
          font-family: ${AE.font.family};
        }
        /* White cards on the light panel; hairline border, 10px radius. */
        .qq-action-card {
          background: ${AE.color.bg};
          border: 1px solid ${AE.color.hairline};
          border-radius: ${AE.radius.md};
          box-shadow: ${AE.shadow.card};
          overflow: clip;
        }
        .qq-action-card-head {
          display: flex; align-items: center; gap: 8px;
          padding: 12px 14px;
          border-bottom: 1px solid ${AE.color.hairline};
        }
        .qq-action-card-headicon {
          display: inline-flex; align-items: center; justify-content: center;
          color: ${AE.color.accent};
        }
        .qq-action-card-title {
          font-size: ${AE.type.caption.size};
          font-weight: 600;
          letter-spacing: ${AE.type.caption.tracking};
          text-transform: uppercase;
          color: ${AE.color.secondary};
        }
        .qq-action-card-body {
          padding: 12px 14px 14px;
        }
        /* Segmented mode control — selected = subtle tint + accent outline,
           NOT a bright fill (Rule 4). */
        .qq-action-seg {
          display: flex; gap: 6px;
        }
        .qq-action-seg-btn {
          flex: 1 1 0;
          font: inherit; cursor: pointer;
          padding: 9px 10px;
          font-size: 13px; font-weight: 500;
          color: ${AE.color.secondary};
          background: ${AE.color.surface};
          border: 1px solid ${AE.color.hairline};
          border-radius: ${AE.radius.sm};
          transition: background 0.12s ease, color 0.12s ease, box-shadow 0.12s ease;
        }
        .qq-action-seg-btn:hover:not(.is-active) {
          color: ${AE.color.text};
        }
        .qq-action-seg-btn.is-active {
          background: ${AE.color.accentTint};
          color: ${AE.color.accent};
          box-shadow: inset 0 0 0 1.5px ${AE.color.accent};
        }
        .qq-action-seg-btn:focus-visible {
          outline: none; box-shadow: ${AE.shadow.focus};
        }
        .qq-action-seg-hint {
          margin: 8px 0 0;
          font-size: ${AE.type.helper.size};
          color: ${AE.color.secondary};
          line-height: 1.45;
        }
        /* Lead-form fields list — type-icon + name rows. */
        .qq-action-fieldlist {
          list-style: none; margin: 0; padding: 0;
          display: flex; flex-direction: column; gap: 6px;
        }
        .qq-action-fieldrow {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 10px;
          background: ${AE.color.surface};
          border: 1px solid ${AE.color.hairline};
          border-radius: ${AE.radius.sm};
        }
        .qq-action-fieldicon {
          display: inline-flex; align-items: center; justify-content: center;
          width: 26px; height: 26px; flex: 0 0 auto;
          border-radius: ${AE.radius.sm};
          background: ${AE.color.bg};
          border: 1px solid ${AE.color.hairline};
          color: ${AE.color.accent};
        }
        .qq-action-fieldname {
          flex: 1 1 auto;
          font-size: ${AE.type.label.size};
          font-weight: 500;
          color: ${AE.color.text};
        }
        .qq-action-fieldtype {
          font-size: ${AE.type.helper.size};
          color: ${AE.color.secondary};
        }
        .qq-action-addfield {
          margin-top: 10px;
          width: 100%;
          display: flex; align-items: center; gap: 8px;
          padding: 9px 10px;
          font: inherit; font-size: 13px; font-weight: 500;
          color: ${AE.color.secondary};
          background: transparent;
          border: 1px dashed ${AE.color.hairlineStrong};
          border-radius: ${AE.radius.sm};
          cursor: not-allowed;
        }
        .qq-action-addfield .qq-action-soon { margin-left: auto; }
        .qq-action-soon {
          font-size: 11px; font-weight: 600;
          letter-spacing: 0.03em;
          color: ${AE.color.secondary};
          background: ${AE.color.surface};
          border: 1px solid ${AE.color.hairline};
          border-radius: ${AE.radius.pill};
          padding: 2px 8px;
        }
        /* Toggle rows (Payment / Booking enable). */
        .qq-action-toggle {
          display: flex; align-items: center; gap: 8px;
          cursor: pointer;
        }
        .qq-action-toggle input[type="checkbox"] {
          width: 16px; height: 16px;
          accent-color: ${AE.color.accent};
        }
        .qq-action-toggle-title {
          font-size: ${AE.type.label.size};
          font-weight: 600;
          color: ${AE.color.text};
        }
        .qq-action-subfields {
          margin-top: 10px;
          padding-left: 12px;
          border-left: 2px solid ${AE.color.hairline};
          display: flex; flex-direction: column; gap: 10px;
        }
        .qq-action-error {
          margin: 6px 0 0;
          font-size: 11.5px;
          color: ${AE.color.danger};
        }
        /* Deposit badge icon picker. */
        .qq-action-iconrow {
          display: flex; flex-direction: column; gap: 4px;
        }
        .qq-action-iconrow-label {
          font-size: 11px; font-weight: 600;
          letter-spacing: 0.04em; text-transform: uppercase;
          color: ${AE.color.secondary};
        }
        .qq-action-iconscroll {
          display: flex; gap: 6px;
          overflow-x: auto; padding: 2px 0 4px;
          scrollbar-width: thin;
        }
        .qq-action-iconbtn {
          flex: 0 0 auto;
          width: 32px; height: 32px;
          display: inline-flex; align-items: center; justify-content: center;
          background: ${AE.color.bg};
          border: 1px solid ${AE.color.hairline};
          border-radius: ${AE.radius.sm};
          color: ${AE.color.text};
          cursor: pointer;
          transition: border-color 0.12s ease, box-shadow 0.12s ease, color 0.12s ease;
        }
        .qq-action-iconbtn:hover { border-color: ${AE.color.hairlineStrong}; }
        .qq-action-iconbtn.is-selected {
          border-color: ${AE.color.accent};
          color: ${AE.color.accent};
          box-shadow: 0 0 0 2px ${AE.color.accentTint};
        }
        .qq-action-iconbtn:focus-visible {
          outline: 2px solid ${AE.color.accent};
          outline-offset: 1px;
        }
        /* Coming-soon drill rows. */
        .qq-action-soonrows {
          display: flex; flex-direction: column; gap: 6px;
        }
        .qq-action-soonrow {
          display: flex; align-items: center; gap: 10px;
          width: 100%;
          padding: 12px 14px;
          background: ${AE.color.bg};
          border: 1px solid ${AE.color.hairline};
          border-radius: ${AE.radius.md};
          color: ${AE.color.secondary};
          cursor: not-allowed;
          text-align: left;
          font: inherit;
        }
        .qq-action-soonrow-icon {
          display: inline-flex; align-items: center; justify-content: center;
          color: ${AE.color.secondary};
        }
        .qq-action-soonrow-label {
          flex: 1 1 auto;
          font-size: ${AE.type.label.size};
          font-weight: 500;
          color: ${AE.color.text};
        }
        .qq-action-soonrow-chevron {
          color: ${AE.color.hairlineStrong};
          font-size: 14px; line-height: 1;
        }
        .qq-action-noaction-help {
          margin: 0;
          font-size: ${AE.type.label.size};
          color: ${AE.color.secondary};
          line-height: 1.5;
        }
      `}</style>
    </section>
  );
}

/* A disabled drill-in row for a feature we don't have yet. Renders the
   icon + label + a "Coming soon" pill + a chevron so the panel LAYOUT
   matches a full Action panel without faking the feature. */
function ComingSoonRow({
  icon: Icon, label, testid,
}: { icon: LucideIcon; label: string; testid: string }) {
  return (
    <div
      className="qq-action-soonrow"
      data-testid={testid}
      aria-disabled="true"
      title={`${label} is coming soon`}
    >
      <span className="qq-action-soonrow-icon" aria-hidden="true">
        <Icon size={16} />
      </span>
      <span className="qq-action-soonrow-label">{label}</span>
      <span className="qq-action-soon">Coming soon</span>
      <span className="qq-action-soonrow-chevron" aria-hidden="true">›</span>
    </div>
  );
}
