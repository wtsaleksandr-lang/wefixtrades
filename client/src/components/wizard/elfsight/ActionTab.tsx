// ActionTab — Build > Action panel.
//
// Replicates the LAYOUT structure of a generic embed-builder "Action" panel
// (mode selector at the top, then a rich Lead-form configuration with a CTA
// card, the captured fields list, and drill-in sub-sections for the heavier
// features) but is populated entirely with OUR features and OUR copy.
//
// State ownership (relocated here — same keys, no renamed persisted state):
//   - settings.actionMode  ('redirect' | 'lead-form' | 'no-action')
//   - settings.ctaHeading  (lead-form CTA card heading)
//   - settings.ctaCaption  (lead-form CTA card caption)
//   - settings.ctaLabel    (MOVED from SettingsTab — open-form button text)
//   - settings.leadEmail   (MOVED from SettingsTab — Email-notifications sub-row)
//   - settings.redirectUrl (redirect destination URL)
//   - settings.deposit     (MOVED from SettingsTab — Payment sub-row. This is the
//                           PERSISTED Stripe deposit → appearance.deposit on save.
//                           The old non-persisting style.deposit control was removed.)
//   - settings.scheduling  (MOVED from SettingsTab — Online-booking sub-row. The
//                           PERSISTED built-in scheduler → appearance.scheduling on
//                           save. The old non-persisting style.booking was removed.)

import { useCallback, useEffect, useState } from 'react';
import {
  User, Mail, Phone, Plus,
  CreditCard, BellRing, CalendarDays,
  MousePointerClick, Plug, ShieldCheck,
  Copy, RefreshCw, Send, ExternalLink, Trash2,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react';
import { AE } from './appleEditor';
import type {
  ShellSettings,
  LeadCustomField,
  LeadFieldType,
  ShellDeposit,
  ShellSchedulingSettings,
  ShellSlotDurationMinutes,
  ShellBufferMinutes,
  ShellWorkingDay,
} from './types';
import {
  LEAD_FIELD_TYPE_OPTIONS,
  DEFAULT_SHELL_SCHEDULING,
} from './types';
import FloatField from './FloatField';
import InfoCue from './InfoCue';
import RichTextField from './RichTextField';
import AdvancedSection from './AdvancedSection';
import { StyledSelect } from './StyledSelect';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ActionMode = 'redirect' | 'lead-form' | 'no-action';

const MODE_OPTIONS: ReadonlyArray<{ value: ActionMode; label: string; hint: string }> = [
  { value: 'redirect',  label: 'Redirect',  hint: 'Send the customer to a URL.' },
  { value: 'lead-form', label: 'Lead form', hint: 'Collect their details and notify you.' },
  { value: 'no-action', label: 'No action', hint: 'Just show the result.' },
];

/* The always-on standard fields every lead form collects. These are fixed
   (the widget renders Email / Phone / Name unconditionally) — they're shown
   here as locked rows so the owner sees the baseline before their custom
   fields. Custom fields (settings.leadFields) render below and ARE editable. */
const STANDARD_LEAD_FIELDS: ReadonlyArray<{ icon: LucideIcon; name: string; type: string }> = [
  { icon: User,  name: 'Name',  type: 'Text' },
  { icon: Mail,  name: 'Email', type: 'Email' },
  { icon: Phone, name: 'Phone', type: 'Phone' },
];

/** Short, collision-resistant id for a new custom lead field. */
function newLeadFieldId(): string {
  return `lf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Parse a number input — blank string returns `undefined` so the field
 *  doesn't get pinned to `0` when the user clears it. (Relocated alongside
 *  the deposit config from SettingsTab.) */
function numOrUndef(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/* Wave R-1 — Online booking constants (RELOCATED from SettingsTab). Mon-Sun in
   calendar order; we store 0=Sun..6=Sat under the hood (matches JS
   Date.getDay()), so the UI flips the index but the persisted value is always
   the standard JS day index. */
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
  /** Owner plan tier — drives the "Pro" hint on coming-soon rows. */
  planTier?: string;
  /** Calculator edit token — the Integrations panel uses it to read/save its
   *  outbound-webhook config. Empty in the pre-save create flow. */
  editToken?: string;
  /**
   * ROOF-WIDGET — the 3D visualizer owns its own multi-step lead form, soft
   * gate, qualification and submit flow (it POSTs to /api/roofquote/lead), so
   * the calculator's action-mode / lead-form-fields / deposit / booking cards
   * don't apply. The ONE thing that still matters is WHERE those leads are
   * sent — so roof mode shows only the lead-notification-email card.
   */
  isRoofWidget?: boolean;
}

export default function ActionTab({
  settings, onChange, editToken = '', isRoofWidget = false,
}: Props) {
  const patch = useCallback(
    (next: Partial<ShellSettings>) => onChange({ ...settings, ...next }),
    [settings, onChange],
  );

  const actionMode: ActionMode = settings.actionMode ?? 'lead-form';
  const ctaHeading = settings.ctaHeading ?? '';
  const ctaCaption = settings.ctaCaption ?? '';
  const ctaLabel = settings.ctaLabel ?? '';
  const leadEmail = settings.leadEmail ?? '';
  const redirectUrl = settings.redirectUrl ?? '';
  // Action tab — Submit button success line + Spam protection (default ON:
  // absent honeypot flag is treated as enabled).
  const submitSuccessText = settings.submitSuccessText ?? '';
  const spamProtection = settings.spamProtection !== false;

  // ── LEAD-FORM-FIELDS — owner-defined custom lead fields ──────────────
  const leadFields: LeadCustomField[] = Array.isArray(settings.leadFields)
    ? settings.leadFields
    : [];
  const setLeadFields = useCallback(
    (next: LeadCustomField[]) => patch({ leadFields: next }),
    [patch],
  );
  const addLeadField = useCallback(() => {
    setLeadFields([
      ...leadFields,
      { id: newLeadFieldId(), type: 'text', label: '', required: false, options: [] },
    ]);
  }, [leadFields, setLeadFields]);
  const updateLeadField = useCallback(
    (id: string, next: Partial<LeadCustomField>) => {
      setLeadFields(leadFields.map((f) => (f.id === id ? { ...f, ...next } : f)));
    },
    [leadFields, setLeadFields],
  );
  const removeLeadField = useCallback(
    (id: string) => setLeadFields(leadFields.filter((f) => f.id !== id)),
    [leadFields, setLeadFields],
  );

  // ── Deposit (RELOCATED from SettingsTab — settings.deposit, the
  //    PERSISTED Stripe deposit that maps to appearance.deposit on save).
  //    Replaces the old non-persisting style.deposit control. ──
  const deposit: ShellDeposit = settings.deposit ?? {
    enabled: false, mode: 'percent', value: 15, label: '', required: false,
  };
  const stripeConnected = settings.stripeConnected !== false;
  const patchDeposit = useCallback(
    (next: Partial<ShellDeposit>) => patch({ deposit: { ...deposit, ...next } }),
    [patch, deposit],
  );

  // ── Online booking (RELOCATED from SettingsTab — settings.scheduling,
  //    the PERSISTED built-in scheduler that maps to appearance.scheduling
  //    on save). Replaces the old non-persisting style.booking control. ──
  const scheduling: ShellSchedulingSettings =
    settings.scheduling ?? { ...DEFAULT_SHELL_SCHEDULING };
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

  const leadEmailInvalid = leadEmail.trim() !== '' && !EMAIL_RE.test(leadEmail.trim());

  // ── Owner-SMS lead notification (settings.leadSmsEnabled / leadSmsPhone).
  //    Persisted on save as the top-level `owner_phone` column +
  //    followup.notifications.sms_enabled, which the lead pipeline reads to text
  //    the owner on every new lead. Surfaced on BOTH the generic Action tab and
  //    the roof widget so contractors get SMS lead delivery either way. ──
  const leadSmsEnabled = settings.leadSmsEnabled === true;
  const leadSmsPhone = settings.leadSmsPhone ?? '';
  const leadSmsPhoneInvalid =
    leadSmsEnabled &&
    leadSmsPhone.trim() !== '' &&
    leadSmsPhone.replace(/\D/g, '').length < 10;

  // ROOF-WIDGET — the visualizer runs its own lead capture + qualification +
  // submit flow, so the only Action setting that still applies is the lead
  // notification recipient. Render just that card (same testids/wiring as the
  // full tab's Email-notifications card so saved state + the InfoCue/help-cue
  // rules carry over).
  if (isRoofWidget) {
    return (
      <section
        data-theme="light"
        className="qq-action-panel"
        data-testid="editor-tabpanel-action"
        aria-label="Action"
        data-section
        role="tabpanel"
      >
        <div className="qq-action-card" data-testid="action-group-email">
          <div className="qq-action-card-head">
            <span className="qq-action-card-headicon" aria-hidden="true">
              <BellRing size={16} />
            </span>
            <span className="qq-action-card-title">Email notifications</span>
            <InfoCue
              testid="action-section-email"
              text="Where leads from the 3D roof & solar widget are sent when a visitor submits their details. Single recipient; the widget collects and qualifies the lead itself."
            />
          </div>
          <div className="qq-action-card-body">
            <FloatField
              label="Lead notification email"
              htmlFor="qq-action-leademail-roof"
              infoText="Where leads from this widget are sent. Single email; team forwarding is configured upstream."
              infoTestid="settings-lead-email"
            >
              <input
                id="qq-action-leademail-roof"
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
              <p className="qq-action-error" data-testid="settings-lead-email-error">
                Enter a valid email address.
              </p>
            )}
          </div>
        </div>

        {/* Owner-SMS lead notification — text the owner on every new roof/solar
            lead. Same control + persisted keys as the generic Action tab. */}
        <OwnerSmsCard
          enabled={leadSmsEnabled}
          phone={leadSmsPhone}
          invalid={leadSmsPhoneInvalid}
          onToggle={(next) => patch({ leadSmsEnabled: next })}
          onPhoneChange={(next) => patch({ leadSmsPhone: next })}
        />

        {/* Integrations — outbound lead webhook (Zapier / Make / HubSpot /
            Google Sheets / Slack / custom). The roof widget POSTs leads to
            /api/roofquote/lead, which now fires this SAME signed webhook — so
            CRM/Zapier delivery works for the 3D widget exactly as it does for a
            generic calculator. Reuses the generic tab's IntegrationsPanel. */}
        <IntegrationsPanel editToken={editToken} />

        <style>{`
          .qq-action-panel {
            display: flex; flex-direction: column; gap: 12px;
            font-family: ${AE.font.family};
          }
          /* Integrations / owner-SMS panel styling — the roof branch reuses the
             generic Action panel's card chrome (the full tab's <style> isn't
             mounted here), so the shared selectors are duplicated below scoped
             to this section's cards. */
          .qq-action-toggle {
            display: flex; align-items: center; gap: 8px; cursor: pointer;
          }
          .qq-action-toggle input[type="checkbox"] {
            width: 16px; height: 16px; accent-color: ${AE.color.accent};
          }
          .qq-action-toggle-title {
            font-size: ${AE.type.label.size}; font-weight: 600; color: ${AE.color.text};
          }
          .qq-action-seg-hint {
            margin: 8px 0 0; font-size: ${AE.type.helper.size};
            color: ${AE.color.secondary}; line-height: 1.45;
          }
          .qq-integ .qq-action-card-body { display: flex; flex-direction: column; gap: 12px; }
          .qq-integ-hint {
            margin: 0; font-size: ${AE.type.helper.size};
            color: ${AE.color.secondary}; line-height: 1.5;
          }
          .qq-integ-error {
            margin: -4px 0 0; font-size: ${AE.type.helper.size};
            color: ${AE.color.danger}; line-height: 1.4;
          }
          .qq-integ-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
          .qq-integ-btn {
            display: inline-flex; align-items: center; gap: 8px; min-height: 44px;
            padding: 0 16px; background: ${AE.color.accent}; color: ${AE.color.publishText};
            border: none; border-radius: ${AE.radius.md};
            font: inherit; font-size: ${AE.type.label.size}; font-weight: 600; cursor: pointer;
            transition: background 0.12s ease, opacity 0.12s ease;
          }
          .qq-integ-btn:hover:not(:disabled) { background: ${AE.color.accentHover}; }
          .qq-integ-btn:disabled { opacity: 0.5; cursor: not-allowed; }
          .qq-integ-btn:focus-visible { outline: 2px solid ${AE.color.accent}; outline-offset: 2px; }
          .qq-integ-testresult { font-size: ${AE.type.helper.size}; font-weight: 500; line-height: 1.4; }
          .qq-integ-testresult.is-ok { color: ${AE.color.success}; }
          .qq-integ-testresult.is-err { color: ${AE.color.danger}; }
          .qq-integ-secret {
            display: flex; flex-direction: column; gap: 6px; padding: 12px;
            background: ${AE.color.surface}; border: 1px solid ${AE.color.hairline};
            border-radius: ${AE.radius.md};
          }
          .qq-integ-secret-label {
            font-size: ${AE.type.caption.size}; font-weight: 600;
            letter-spacing: ${AE.type.caption.tracking}; text-transform: uppercase;
            color: ${AE.color.secondary};
          }
          .qq-integ-secret-row { display: flex; align-items: center; gap: 8px; }
          .qq-integ-secret-value {
            flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12px;
            color: ${AE.color.text}; background: ${AE.color.bg};
            border: 1px solid ${AE.color.hairline}; border-radius: ${AE.radius.sm}; padding: 8px 10px;
          }
          .qq-integ-iconbtn {
            display: inline-flex; align-items: center; justify-content: center;
            width: 44px; height: 44px; flex: 0 0 auto; background: ${AE.color.bg};
            border: 1px solid ${AE.color.hairline}; border-radius: ${AE.radius.md};
            color: ${AE.color.secondary}; cursor: pointer;
            transition: border-color 0.12s ease, color 0.12s ease;
          }
          .qq-integ-iconbtn:hover:not(:disabled) { border-color: ${AE.color.hairlineStrong}; color: ${AE.color.text}; }
          .qq-integ-iconbtn:disabled { opacity: 0.5; cursor: not-allowed; }
          .qq-integ-iconbtn:focus-visible { outline: 2px solid ${AE.color.accent}; outline-offset: 1px; }
          .qq-integ-link {
            display: inline-flex; align-items: center; gap: 4px;
            color: ${AE.color.accent}; font-weight: 500; text-decoration: none;
          }
          .qq-integ-link:hover { text-decoration: underline; }
          .qq-action-card-headicon {
            display: inline-flex; align-items: center; justify-content: center;
            width: 18px; height: 18px; flex: 0 0 auto; line-height: 0; color: ${AE.color.accent};
          }
          .qq-action-card {
            background: ${AE.color.bg};
            border: 1px solid ${AE.color.hairline};
            border-radius: ${AE.radius.md};
            box-shadow: ${AE.shadow.card};
            padding: 14px 16px;
            display: flex; flex-direction: column; gap: 10px;
          }
          .qq-action-card-head {
            display: flex; align-items: center; gap: 8px;
          }
          .qq-action-card-headicon {
            display: inline-flex; align-items: center; justify-content: center;
            color: ${AE.color.accent};
          }
          .qq-action-card-title {
            font-size: ${AE.type.title.size}; font-weight: 600;
            color: ${AE.color.text};
          }
          .qq-action-card-body { display: flex; flex-direction: column; gap: 8px; }
          .qq-action-error {
            margin: 0; font-size: ${AE.type.helper.size};
            color: ${AE.color.danger}; line-height: 1.4;
          }
        `}</style>
      </section>
    );
  }

  return (
    <section
      data-theme="light"
      className="qq-action-panel"
      data-testid="editor-tabpanel-action"
      aria-label="Action"
      role="tabpanel"
      /* Panel-level container: each card below is its own surface with a
         single cue in its head. The escape hatch applies here so the outer
         section isn't flagged for aggregating its children's lone cues. */
      data-cue-allowed-multiple
    >
      {/* ── 1. Mode segmented control ─────────────────────────────── */}
      <div className="qq-action-card" data-testid="action-group-mode" data-edit-key="action">
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
          {/* Email notifications — PROMOTED to the default surface (was buried
              in the "Advanced action" fold). Where a lead is sent is the single
              most-edited action setting, so it sits directly under the mode
              selector. Same key (settings.leadEmail) + testids, unchanged wiring. */}
          <div className="qq-action-card" data-testid="action-group-email">
            <div className="qq-action-card-head">
              <span className="qq-action-card-headicon" aria-hidden="true">
                <BellRing size={16} />
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
                text="The details we collect from the customer. Name, email and phone are always collected; add your own fields below (e.g. budget, preferred timeframe) and they'll appear on the customer's form and arrive with every lead."
              />
            </div>
            <div className="qq-action-card-body">
              {/* Standard, always-on fields — locked rows. */}
              <ul className="qq-action-fieldlist" data-testid="action-fieldlist">
                {STANDARD_LEAD_FIELDS.map((f) => {
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

              {/* Custom owner-defined fields — fully editable. */}
              {leadFields.length > 0 && (
                <div className="qq-leadfield-list" data-testid="action-custom-fieldlist">
                  {leadFields.map((f, i) => (
                    <LeadFieldEditor
                      key={f.id}
                      field={f}
                      index={i}
                      onChange={(next) => updateLeadField(f.id, next)}
                      onRemove={() => removeLeadField(f.id)}
                    />
                  ))}
                </div>
              )}

              {/* "+ Add field" — functional. */}
              <button
                type="button"
                className="qq-action-addfield is-enabled"
                data-testid="action-add-field"
                onClick={addLeadField}
              >
                <Plus size={16} aria-hidden="true" />
                <span>Add field</span>
              </button>
            </div>
          </div>

          {/* 2c. Drill-in sub rows */}
          <AdvancedSection
            id="action-advanced"
            label="Advanced action"
            hint="payment, text alerts, booking, submit copy, spam & more"
          >
            {/* Payment — RELOCATED from SettingsTab. The PERSISTED Stripe
                deposit (settings.deposit → appearance.deposit on save).
                Disables itself when no Stripe account is connected. Testids
                preserved from SettingsTab so existing tests resolve here. */}
            <div
              className={`qq-action-card${stripeConnected ? '' : ' is-disabled'}`}
              data-testid="settings-group-deposit"
              data-stripe-connected={stripeConnected ? 'true' : 'false'}
              /* Click-to-edit anchor — a tap on the preview deposit badge
                 (data-component-type="deposit") resolves here. Mirrors the
                 online-booking card below. */
              data-edit-key="deposit"
            >
              <div className="qq-action-card-head">
                <span className="qq-action-card-headicon" aria-hidden="true">
                  <CreditCard size={16} />
                </span>
                <span className="qq-action-card-title">Deposit</span>
                <InfoCue
                  testid="settings-section-deposit"
                  region="step-content"
                  text="Optionally collect a partial payment when customers book. Requires a connected Stripe account."
                />
              </div>
              <div className="qq-action-card-body">
                {!stripeConnected && (
                  <p
                    className="qq-action-seg-hint"
                    data-testid="settings-deposit-no-stripe"
                    style={{ margin: '0 0 10px' }}
                  >
                    Connect Stripe in your dashboard first to enable deposits.
                  </p>
                )}

                <label
                  className="qq-action-toggle"
                  style={{ cursor: stripeConnected ? 'pointer' : 'not-allowed', opacity: stripeConnected ? 1 : 0.55 }}
                >
                  <input
                    type="checkbox"
                    checked={deposit.enabled === true}
                    disabled={!stripeConnected}
                    onChange={(e) => patchDeposit({ enabled: e.target.checked })}
                    data-testid="settings-deposit-enabled"
                    aria-label="Collect a deposit when customers book"
                  />
                  <span className="qq-action-toggle-title">Collect a deposit when customers book</span>
                </label>
                <p className="qq-action-seg-hint" data-testid="settings-deposit-hint">
                  Adds a "Secure your slot" step after the quote. Money flows directly to your Stripe account.
                </p>

                {deposit.enabled && stripeConnected && (
                  <div className="qq-action-subfields" data-testid="settings-deposit-fields">
                    <div
                      className="qq-action-seg"
                      role="radiogroup"
                      aria-label="Deposit type"
                      data-testid="settings-segmented-deposit"
                    >
                      {([
                        { value: 'percent' as const, label: 'Percent (%)' },
                        { value: 'fixed' as const,   label: 'Fixed ($)' },
                      ]).map((o) => {
                        const selected = (deposit.mode === 'fixed' ? 'fixed' : 'percent') === o.value;
                        return (
                          <button
                            key={o.value}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            className={`qq-action-seg-btn${selected ? ' is-active' : ''}`}
                            data-testid={`settings-segmented-deposit-${o.value}`}
                            onClick={() => patchDeposit({ mode: o.value })}
                          >
                            {o.label}
                          </button>
                        );
                      })}
                    </div>

                    <FloatField
                      label={deposit.mode === 'fixed' ? 'Deposit amount ($)' : 'Deposit percentage (%)'}
                      htmlFor="qq-action-deposit-value"
                      infoText={
                        deposit.mode === 'fixed'
                          ? 'Charged in dollars regardless of quote size. Stripe requires a $0.50 minimum.'
                          : "Charged as a percentage of the customer's quote total. E.g. 15 → 15%."
                      }
                      infoTestid="settings-deposit-value-info"
                    >
                      <input
                        id="qq-action-deposit-value"
                        type="number"
                        min={0}
                        step={deposit.mode === 'fixed' ? 1 : 0.5}
                        className="premium-input"
                        placeholder=" "
                        value={deposit.value ?? ''}
                        onChange={(e) => patchDeposit({ value: numOrUndef(e.target.value) })}
                        data-testid="settings-input-deposit-value"
                        aria-invalid={
                          deposit.value !== undefined && Number(deposit.value) <= 0 ? 'true' : 'false'
                        }
                      />
                    </FloatField>
                    {deposit.value !== undefined && Number(deposit.value) <= 0 && (
                      <p className="qq-action-error" data-testid="settings-deposit-value-error">
                        Enter a positive amount.
                      </p>
                    )}

                    <FloatField
                      label="Custom label (optional)"
                      htmlFor="qq-action-deposit-label"
                      infoText='Overrides the deposit headline shown to customers. E.g. "Secure your slot — $50". Leave blank to use the default.'
                      infoTestid="settings-deposit-label-info"
                    >
                      <input
                        id="qq-action-deposit-label"
                        type="text"
                        className="premium-input"
                        placeholder=" "
                        value={deposit.label ?? ''}
                        onChange={(e) => patchDeposit({ label: e.target.value })}
                        data-testid="settings-input-deposit-label"
                      />
                    </FloatField>

                    <label className="qq-action-toggle">
                      <input
                        type="checkbox"
                        checked={deposit.required === true}
                        onChange={(e) => patchDeposit({ required: e.target.checked })}
                        data-testid="settings-deposit-required"
                        aria-label="Require the deposit before booking is confirmed"
                      />
                      <span className="qq-action-toggle-title">Require deposit to confirm booking</span>
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* Text notifications — owner-SMS lead alert. Same shared card the
                roof widget surfaces; writes settings.leadSmsEnabled /
                leadSmsPhone → owner_phone + followup.notifications.sms_enabled. */}
            <OwnerSmsCard
              enabled={leadSmsEnabled}
              phone={leadSmsPhone}
              invalid={leadSmsPhoneInvalid}
              onToggle={(next) => patch({ leadSmsEnabled: next })}
              onPhoneChange={(next) => patch({ leadSmsPhone: next })}
            />

            {/* Online booking — RELOCATED from SettingsTab. The PERSISTED
                built-in scheduler (settings.scheduling → appearance.scheduling
                on save). Testids preserved from SettingsTab. */}
            <div
              className="qq-action-card"
              data-testid="settings-group-scheduling"
              data-edit-key="online-booking"
            >
              <div className="qq-action-card-head">
                <span className="qq-action-card-headicon" aria-hidden="true">
                  <CalendarDays size={16} />
                </span>
                <span className="qq-action-card-title">Online booking</span>
                <InfoCue
                  testid="settings-section-scheduling"
                  region="step-content"
                  text="Let customers pick a time slot after the quote. Slots are built from your working hours minus existing bookings."
                />
              </div>
              <div className="qq-action-card-body">
                <div data-testid="scheduling-toggle-row">
                  <label className="qq-action-toggle">
                    <input
                      type="checkbox"
                      checked={scheduling.enabled}
                      onChange={(e) => patchScheduling({ enabled: e.target.checked })}
                      data-testid="scheduling-enabled-input"
                      aria-label="Enable online booking"
                    />
                    <span className="qq-action-toggle-title">Let customers book a time on your calendar</span>
                  </label>
                  <p className="qq-action-seg-hint">
                    The widget shows a 14-day picker after the price reveal. Slots are local to your working hours.
                  </p>
                </div>

                {scheduling.enabled && (
                  <div className="qq-action-subfields" data-testid="scheduling-body">
                    <div className="qq-action-iconrow-label">Working days</div>
                    <div className="qq-sched-days" role="group" aria-label="Working days">
                      {SCHEDULING_DAYS.map((d) => {
                        const checked = scheduling.workingDays.includes(d.value);
                        return (
                          <label
                            key={d.value}
                            className={`qq-sched-daychip${checked ? ' is-active' : ''}`}
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

                    <div className="qq-sched-grid">
                      <FloatField label="Start time" htmlFor="qq-action-sched-start">
                        <input
                          id="qq-action-sched-start"
                          type="time"
                          className="premium-input"
                          placeholder=" "
                          value={scheduling.workingHoursStart}
                          onChange={(e) => patchScheduling({ workingHoursStart: e.target.value })}
                          data-testid="scheduling-input-start"
                        />
                      </FloatField>
                      <FloatField label="End time" htmlFor="qq-action-sched-end">
                        <input
                          id="qq-action-sched-end"
                          type="time"
                          className="premium-input"
                          placeholder=" "
                          value={scheduling.workingHoursEnd}
                          onChange={(e) => patchScheduling({ workingHoursEnd: e.target.value })}
                          data-testid="scheduling-input-end"
                        />
                      </FloatField>
                    </div>

                    <div className="qq-sched-grid">
                      <FloatField label="Slot duration" htmlFor="qq-action-sched-duration" variant="select">
                        <StyledSelect
                          value={String(scheduling.slotDurationMinutes)}
                          onChange={(next) => patchScheduling({ slotDurationMinutes: Number(next) as ShellSlotDurationMinutes })}
                          options={SLOT_DURATION_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
                          title="Slot duration"
                          ariaLabel="Slot duration"
                          testId="scheduling-select-duration"
                        />
                      </FloatField>
                      <FloatField label="Buffer between slots" htmlFor="qq-action-sched-buffer" variant="select">
                        <StyledSelect
                          value={String(scheduling.bufferMinutes)}
                          onChange={(next) => patchScheduling({ bufferMinutes: Number(next) as ShellBufferMinutes })}
                          options={BUFFER_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
                          title="Buffer between slots"
                          ariaLabel="Buffer between slots"
                          testId="scheduling-select-buffer"
                        />
                      </FloatField>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Submit button — real config (reuses settings.ctaLabel; adds
                the post-submit success line). */}
            <div className="qq-action-card" data-testid="action-group-submit">
              <div className="qq-action-card-head">
                <span className="qq-action-card-headicon" aria-hidden="true">
                  <MousePointerClick size={16} />
                </span>
                <span className="qq-action-card-title">Submit button</span>
                <InfoCue
                  testid="action-section-submit"
                  region="result"
                  text="Customise the lead form's submit step. The button text reuses the call-to-action label above; the success message shows once the customer submits their details."
                />
              </div>
              <div className="qq-action-card-body">
                {/* Button text — wired to the SAME key the result CTA uses
                    (settings.ctaLabel). No duplicate state. */}
                <RichTextField
                  label="Submit button text"
                  htmlFor="qq-action-submit-label"
                  value={ctaLabel}
                  onChange={(next) => patch({ ctaLabel: next })}
                  placeholder='Click to override (default: "Get My Quote")'
                  infoText='The lead form / result button text. Shared with the call-to-action label — editing it here updates it everywhere. Leave blank for the default ("Get My Quote").'
                  infoTestid="action-submit-label"
                  infoRegion="sticky-footer"
                  testid="action-input-submit-label"
                  expansionMode="inline"
                  /* The card title above ("Submit button") already names this
                     field, so the field's own "Submit button text" eyebrow is a
                     duplicate. Hide it; the ? cue + placeholder remain. */
                  hideFloatingLabel
                />
                <div style={{ marginTop: 12 }}>
                  <FloatField
                    label="Success message"
                    htmlFor="qq-action-submit-success"
                    infoText="Shown after the customer submits the lead form. Leave blank to use the default (“Thanks — we'll be in touch shortly.”)."
                    infoTestid="action-submit-success"
                  >
                    <input
                      id="qq-action-submit-success"
                      type="text"
                      className="premium-input"
                      maxLength={160}
                      placeholder=" "
                      value={submitSuccessText}
                      onChange={(e) => patch({ submitSuccessText: e.target.value })}
                      data-testid="action-input-submit-success"
                    />
                  </FloatField>
                </div>
              </div>
            </div>

            {/* Spam protection — real client-side honeypot (no backend). */}
            <div className="qq-action-card" data-testid="action-group-spam">
              <div className="qq-action-card-head">
                <span className="qq-action-card-headicon" aria-hidden="true">
                  <ShieldCheck size={16} />
                </span>
                <span className="qq-action-card-title">Spam protection</span>
                <InfoCue
                  testid="action-section-spam"
                  region="result"
                  text="Blocks spam bots with an invisible honeypot field — no captcha, no friction for real customers. Bots that auto-fill the hidden field are silently dropped; genuine submissions are never affected."
                />
              </div>
              <div className="qq-action-card-body">
                <label className="qq-action-toggle">
                  <input
                    type="checkbox"
                    checked={spamProtection}
                    onChange={(e) => patch({ spamProtection: e.target.checked })}
                    data-testid="action-spam-enabled"
                    aria-label="Enable spam protection"
                  />
                  <span className="qq-action-toggle-title">Block spam bots (honeypot)</span>
                </label>
                <p className="qq-action-seg-hint" data-testid="action-spam-hint">
                  Adds an invisible field your customers never see. Bots fill it
                  in and get silently dropped — no captcha, no extra step.
                </p>
              </div>
            </div>

            {/* Integrations — real outbound lead webhook (Zapier / Make /
                HubSpot / Google Sheets / Slack / custom). Free for all tiers. */}
            <IntegrationsPanel editToken={editToken} />
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
            {/* Coherence — "no action" governs the LEAD-CAPTURE follow-up only.
                If online booking is on, customers still get a booking step, so
                the two settings don't actually contradict. Spell that out here
                so the owner isn't confused by picking "no action" with booking
                enabled (and the renderer's result panel mirrors this). */}
            <p className="qq-action-noaction-help" data-testid="action-no-action-help">
              {scheduling.enabled
                ? 'Online booking is on, so customers still book a time after their quote — "no action" just means no lead-capture form.'
                : 'Customers just see their result; no follow-up step.'}
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
          /* W5 FIX 3 — fixed min-height so EVERY action-card head (Payment /
             Email / Online booking / Submit / Spam …) is the exact same
             height regardless of the head icon's intrinsic optical box. This
             pins the Deposit + Online-booking pair (and all siblings) to a
             tidy matched row instead of leaving alignment to incidental
             icon metrics. */
          min-height: 44px;
          padding: 12px 14px;
          border-bottom: 1px solid ${AE.color.hairline};
        }
        .qq-action-card-headicon {
          display: inline-flex; align-items: center; justify-content: center;
          /* W5 FIX 3 — fixed 18px square so the icon glyph is centred in a
             constant box; different lucide icons (CreditCard vs CalendarDays
             vs BellRing) otherwise sit a hair higher/lower and make adjacent
             card heads read as misaligned. */
          width: 18px; height: 18px; flex: 0 0 auto;
          line-height: 0;
          color: ${AE.color.accent};
        }
        .qq-action-card-title {
          font-size: ${AE.type.caption.size};
          font-weight: 600;
          line-height: 1.2;
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
        .qq-action-addfield.is-enabled {
          cursor: pointer;
          color: ${AE.color.accent};
          transition: background 0.12s ease, border-color 0.12s ease;
        }
        .qq-action-addfield.is-enabled:hover {
          background: ${AE.color.accentTint};
          border-color: ${AE.color.accent};
        }
        .qq-action-addfield.is-enabled:focus-visible {
          outline: none; box-shadow: ${AE.shadow.focus};
        }
        .qq-action-addfield .qq-action-soon { margin-left: auto; }

        /* Custom lead-field editor rows. */
        .qq-leadfield-list {
          margin-top: 10px;
          display: flex; flex-direction: column; gap: 8px;
        }
        .qq-leadfield {
          background: ${AE.color.surface};
          border: 1px solid ${AE.color.hairline};
          border-radius: ${AE.radius.md};
          overflow: clip;
        }
        .qq-leadfield-head {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 10px;
          border-bottom: 1px solid ${AE.color.hairline};
        }
        .qq-leadfield-num {
          display: inline-flex; align-items: center; justify-content: center;
          width: 20px; height: 20px; flex: 0 0 auto;
          font-size: 11px; font-weight: 700;
          color: ${AE.color.accent};
          background: ${AE.color.accentTint};
          border-radius: ${AE.radius.pill};
        }
        .qq-leadfield-headlabel {
          flex: 1 1 auto; min-width: 0;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          font-size: ${AE.type.label.size};
          font-weight: 600;
          color: ${AE.color.text};
        }
        .qq-leadfield-remove {
          display: inline-flex; align-items: center; justify-content: center;
          width: 30px; height: 30px; flex: 0 0 auto;
          background: transparent; border: none;
          border-radius: ${AE.radius.sm};
          color: ${AE.color.secondary};
          cursor: pointer;
          transition: background 0.12s ease, color 0.12s ease;
        }
        .qq-leadfield-remove:hover {
          background: ${AE.color.bg};
          color: ${AE.color.danger};
        }
        .qq-leadfield-remove:focus-visible {
          outline: 2px solid ${AE.color.accent}; outline-offset: 1px;
        }
        .qq-leadfield-body {
          padding: 12px 12px 14px;
          display: flex; flex-direction: column; gap: 12px;
        }
        .qq-leadfield-required { margin-top: 2px; }
        .qq-editor-shell[data-theme="dark"] .qq-leadfield,
        .qq-editor-shell[data-theme="dark"] .qq-leadfield-num {
          background: rgba(255, 255, 255, 0.04);
          border-color: var(--qq-border);
        }
        .qq-editor-shell[data-theme="dark"] .qq-leadfield-head {
          border-bottom-color: var(--qq-border);
        }
        .qq-editor-shell[data-theme="dark"] .qq-leadfield-headlabel {
          color: var(--qq-text);
        }
        .qq-editor-shell[data-theme="dark"] .qq-leadfield-remove:hover {
          background: rgba(255, 255, 255, 0.06);
        }
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
        /* Online-booking scheduler (relocated from SettingsTab). Day chips +
           two-up time/duration grids, matched to the Action panel surfaces. */
        .qq-sched-days {
          display: grid; gap: 6px;
          grid-template-columns: repeat(7, minmax(0, 1fr));
        }
        @media (max-width: 480px) {
          .qq-sched-days { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        }
        .qq-sched-daychip {
          display: flex; align-items: center; justify-content: center;
          padding: 6px 2px;
          font-size: 12.5px; font-weight: 600;
          border-radius: ${AE.radius.sm};
          background: ${AE.color.bg};
          border: 1px solid ${AE.color.hairline};
          color: ${AE.color.text};
          cursor: pointer; user-select: none;
          transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
        }
        .qq-sched-daychip:hover { border-color: ${AE.color.accent}; }
        .qq-sched-daychip input[type="checkbox"] {
          position: absolute; opacity: 0; pointer-events: none;
        }
        .qq-sched-daychip.is-active {
          background: ${AE.color.accentTint};
          border-color: ${AE.color.accent};
          color: ${AE.color.accent};
        }
        .qq-sched-grid {
          display: grid; gap: 10px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        @media (max-width: 480px) {
          .qq-sched-grid { grid-template-columns: 1fr; }
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
        /* Integrations panel. */
        .qq-integ .qq-action-card-body {
          display: flex; flex-direction: column; gap: 12px;
        }
        .qq-integ-hint {
          margin: 0;
          font-size: ${AE.type.helper.size};
          color: ${AE.color.secondary};
          line-height: 1.5;
        }
        .qq-integ-error {
          margin: -4px 0 0;
          font-size: ${AE.type.helper.size};
          color: ${AE.color.danger};
          line-height: 1.4;
        }
        .qq-integ-row {
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
        }
        .qq-integ-btn {
          display: inline-flex; align-items: center; gap: 8px;
          min-height: 44px;
          padding: 0 16px;
          background: ${AE.color.accent};
          color: ${AE.color.publishText};
          border: none;
          border-radius: ${AE.radius.md};
          font: inherit; font-size: ${AE.type.label.size}; font-weight: 600;
          cursor: pointer;
          transition: background 0.12s ease, opacity 0.12s ease;
        }
        .qq-integ-btn:hover:not(:disabled) { background: ${AE.color.accentHover}; }
        .qq-integ-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .qq-integ-btn:focus-visible {
          outline: 2px solid ${AE.color.accent}; outline-offset: 2px;
        }
        .qq-integ-testresult {
          font-size: ${AE.type.helper.size};
          font-weight: 500;
          line-height: 1.4;
        }
        .qq-integ-testresult.is-ok { color: ${AE.color.success}; }
        .qq-integ-testresult.is-err { color: ${AE.color.danger}; }
        .qq-integ-secret {
          display: flex; flex-direction: column; gap: 6px;
          padding: 12px;
          background: ${AE.color.surface};
          border: 1px solid ${AE.color.hairline};
          border-radius: ${AE.radius.md};
        }
        .qq-integ-secret-label {
          font-size: ${AE.type.caption.size};
          font-weight: 600;
          letter-spacing: ${AE.type.caption.tracking};
          text-transform: uppercase;
          color: ${AE.color.secondary};
        }
        .qq-integ-secret-row {
          display: flex; align-items: center; gap: 8px;
        }
        .qq-integ-secret-value {
          flex: 1 1 auto; min-width: 0;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          font-family: ui-monospace, 'SF Mono', Menlo, monospace;
          font-size: 12px;
          color: ${AE.color.text};
          background: ${AE.color.bg};
          border: 1px solid ${AE.color.hairline};
          border-radius: ${AE.radius.sm};
          padding: 8px 10px;
        }
        .qq-integ-iconbtn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 44px; height: 44px;
          flex: 0 0 auto;
          background: ${AE.color.bg};
          border: 1px solid ${AE.color.hairline};
          border-radius: ${AE.radius.md};
          color: ${AE.color.secondary};
          cursor: pointer;
          transition: border-color 0.12s ease, color 0.12s ease;
        }
        .qq-integ-iconbtn:hover:not(:disabled) {
          border-color: ${AE.color.hairlineStrong};
          color: ${AE.color.text};
        }
        .qq-integ-iconbtn:disabled { opacity: 0.5; cursor: not-allowed; }
        .qq-integ-iconbtn:focus-visible {
          outline: 2px solid ${AE.color.accent}; outline-offset: 1px;
        }
        .qq-integ-link {
          display: inline-flex; align-items: center; gap: 4px;
          color: ${AE.color.accent};
          font-weight: 500;
          text-decoration: none;
        }
        .qq-integ-link:hover { text-decoration: underline; }

        /* ── Dark editor theme ──────────────────────────────────────────────
         * The Action panel's own surfaces were authored light-only, so in the
         * editor's dark mode the cards rendered as a white island. These rules
         * flip the surfaces using the editor shell's CSS vars (--qq-surface /
         * --qq-text / --qq-border / --qq-muted), matching the StyleTab pattern.
         * Scoped under .qq-editor-shell[data-theme=dark] so they ONLY apply
         * in dark mode — light mode is unchanged. On mobile the sheet portals
         * outside the shell, but MobileBottomSheet wraps the portal in a
         * qq-editor-shell carrying the mirrored theme, so this selector matches
         * there too. (The local section's data-theme=light doesn't block these
         * — they key off the shell ancestor, not the immediate parent.) */
        .qq-editor-shell[data-theme="dark"] .qq-action-card {
          background: var(--qq-surface);
          border-color: var(--qq-border);
          box-shadow: none;
        }
        .qq-editor-shell[data-theme="dark"] .qq-action-card-head {
          border-bottom-color: var(--qq-border);
        }
        .qq-editor-shell[data-theme="dark"] .qq-action-card-title,
        .qq-editor-shell[data-theme="dark"] .qq-action-iconrow-label,
        .qq-editor-shell[data-theme="dark"] .qq-action-seg-hint,
        .qq-editor-shell[data-theme="dark"] .qq-action-fieldtype,
        .qq-editor-shell[data-theme="dark"] .qq-action-noaction-help,
        .qq-editor-shell[data-theme="dark"] .qq-integ-hint,
        .qq-editor-shell[data-theme="dark"] .qq-integ-secret-label {
          color: var(--qq-muted);
        }
        .qq-editor-shell[data-theme="dark"] .qq-action-fieldname,
        .qq-editor-shell[data-theme="dark"] .qq-action-toggle-title,
        .qq-editor-shell[data-theme="dark"] .qq-action-soonrow-label,
        .qq-editor-shell[data-theme="dark"] .qq-integ-secret-value {
          color: var(--qq-text);
        }
        .qq-editor-shell[data-theme="dark"] .qq-action-seg-btn,
        .qq-editor-shell[data-theme="dark"] .qq-action-fieldrow,
        .qq-editor-shell[data-theme="dark"] .qq-action-soon,
        .qq-editor-shell[data-theme="dark"] .qq-action-soonrow,
        .qq-editor-shell[data-theme="dark"] .qq-action-iconbtn,
        .qq-editor-shell[data-theme="dark"] .qq-integ-secret {
          background: rgba(255, 255, 255, 0.04);
          border-color: var(--qq-border);
          color: var(--qq-muted);
        }
        .qq-editor-shell[data-theme="dark"] .qq-action-fieldname,
        .qq-editor-shell[data-theme="dark"] .qq-action-soonrow-label {
          color: var(--qq-text);
        }
        .qq-editor-shell[data-theme="dark"] .qq-action-seg-btn:hover:not(.is-active) {
          color: var(--qq-text);
        }
        .qq-editor-shell[data-theme="dark"] .qq-action-seg-btn.is-active {
          background: ${AE.color.accentTint};
          color: ${AE.color.accent};
        }
        .qq-editor-shell[data-theme="dark"] .qq-action-fieldicon,
        .qq-editor-shell[data-theme="dark"] .qq-action-iconbtn,
        .qq-editor-shell[data-theme="dark"] .qq-integ-iconbtn,
        .qq-editor-shell[data-theme="dark"] .qq-integ-secret-value {
          background: rgba(255, 255, 255, 0.06);
          border-color: var(--qq-border);
        }
        .qq-editor-shell[data-theme="dark"] .qq-action-iconbtn,
        .qq-editor-shell[data-theme="dark"] .qq-integ-iconbtn {
          color: var(--qq-text);
        }
        .qq-editor-shell[data-theme="dark"] .qq-action-addfield {
          border-color: var(--qq-border);
          color: var(--qq-muted);
        }
        .qq-editor-shell[data-theme="dark"] .qq-action-subfields {
          border-left-color: var(--qq-border);
        }
        .qq-editor-shell[data-theme="dark"] .qq-action-soonrow-chevron {
          color: var(--qq-muted);
        }
        .qq-editor-shell[data-theme="dark"] .qq-sched-daychip {
          background: rgba(255, 255, 255, 0.04);
          border-color: var(--qq-border);
          color: var(--qq-text);
        }
        .qq-editor-shell[data-theme="dark"] .qq-sched-daychip.is-active {
          background: ${AE.color.accentTint};
          border-color: ${AE.color.accent};
          color: ${AE.color.accent};
        }
      `}</style>
    </section>
  );
}

/* ── Lead field editor ──────────────────────────────────────────────────
   One editable custom lead-form field row: label, type, required toggle, and
   (for `select`) a comma-separated options input. Follows the input-field
   rules — title-in-field via FloatField, help cue top-left, 2px gaps. */
function LeadFieldEditor({
  field, index, onChange, onRemove,
}: {
  field: LeadCustomField;
  index: number;
  onChange: (next: Partial<LeadCustomField>) => void;
  onRemove: () => void;
}) {
  const labelId = `qq-leadfield-label-${field.id}`;
  const typeId = `qq-leadfield-type-${field.id}`;
  const optionsId = `qq-leadfield-options-${field.id}`;
  const optionsText = (field.options ?? []).join(', ');

  return (
    <div className="qq-leadfield" data-testid={`action-custom-field-${index}`}>
      <div className="qq-leadfield-head">
        <span className="qq-leadfield-num" aria-hidden="true">{index + 1}</span>
        <span className="qq-leadfield-headlabel">
          {field.label.trim() || 'Untitled field'}
        </span>
        <button
          type="button"
          className="qq-leadfield-remove"
          onClick={onRemove}
          title="Remove field"
          aria-label={`Remove field ${index + 1}`}
          data-testid={`action-custom-field-remove-${index}`}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>

      <div className="qq-leadfield-body">
        <FloatField
          label="Field label"
          htmlFor={labelId}
          infoText="The label shown to the customer (e.g. “Estimated budget”). Lead values arrive keyed by this label."
          infoTestid={`action-custom-field-label-${index}`}
        >
          <input
            id={labelId}
            type="text"
            className="premium-input"
            placeholder=" "
            maxLength={80}
            value={field.label}
            onChange={(e) => onChange({ label: e.target.value })}
            data-testid={`action-custom-field-label-input-${index}`}
          />
        </FloatField>

        <FloatField label="Field type" htmlFor={typeId} variant="select">
          <StyledSelect
            value={field.type}
            onChange={(next) => onChange({ type: next as LeadFieldType })}
            options={LEAD_FIELD_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            title="Field type"
            ariaLabel="Field type"
            testId={`action-custom-field-type-${index}`}
          />
        </FloatField>

        {field.type === 'select' && (
          <FloatField
            label="Options (comma separated)"
            htmlFor={optionsId}
            infoText="The choices in the dropdown, separated by commas (e.g. “Under $1k, $1k–$5k, $5k+”)."
            infoTestid={`action-custom-field-options-${index}`}
          >
            <input
              id={optionsId}
              type="text"
              className="premium-input"
              placeholder=" "
              value={optionsText}
              onChange={(e) =>
                onChange({
                  options: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              data-testid={`action-custom-field-options-input-${index}`}
            />
          </FloatField>
        )}

        <label className="qq-action-toggle qq-leadfield-required">
          <input
            type="checkbox"
            checked={field.required === true}
            onChange={(e) => onChange({ required: e.target.checked })}
            data-testid={`action-custom-field-required-${index}`}
            aria-label="Required field"
          />
          <span className="qq-action-toggle-title">Required</span>
        </label>
      </div>
    </div>
  );
}

/* ── Owner-SMS lead notification card ───────────────────────────────────
   One shared card surfaced on BOTH the generic Action tab and the roof widget.
   The toggle + phone write settings.leadSmsEnabled / settings.leadSmsPhone,
   which the save mutation persists as the top-level `owner_phone` column +
   followup.notifications.sms_enabled — the keys the lead pipeline
   (enqueueLeadNotificationsAndFollowups) reads to text the owner on every lead.
   Same card chrome / testid conventions as the Email-notifications card. */
function OwnerSmsCard({
  enabled, phone, invalid, onToggle, onPhoneChange,
}: {
  enabled: boolean;
  phone: string;
  invalid: boolean;
  onToggle: (next: boolean) => void;
  onPhoneChange: (next: string) => void;
}) {
  return (
    <div className="qq-action-card" data-testid="action-group-sms">
      <div className="qq-action-card-head">
        <span className="qq-action-card-headicon" aria-hidden="true">
          <MessageSquare size={16} />
        </span>
        <span className="qq-action-card-title">Text notifications</span>
        <InfoCue
          testid="action-section-sms"
          text="Get a text the moment a lead comes in. We send the SMS to this number on every new lead, alongside the email notification."
        />
      </div>
      <div className="qq-action-card-body">
        <label className="qq-action-toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            data-testid="action-sms-enabled"
            aria-label="Text me on every new lead"
          />
          <span className="qq-action-toggle-title">Text me on every new lead</span>
        </label>
        <p className="qq-action-seg-hint" data-testid="action-sms-hint">
          A short SMS with the customer's name and quote, sent to your phone the instant they submit.
        </p>
        {enabled && (
          <FloatField
            label="Notification phone number"
            htmlFor="qq-action-sms-phone"
            infoText="Where lead-alert texts are sent. Use the full number including area/country code."
            infoTestid="action-sms-phone"
          >
            <input
              id="qq-action-sms-phone"
              type="tel"
              inputMode="tel"
              className="premium-input"
              placeholder=" "
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
              data-testid="action-input-sms-phone"
              aria-invalid={invalid ? 'true' : 'false'}
            />
          </FloatField>
        )}
        {invalid && (
          <p className="qq-action-error" data-testid="action-sms-phone-error">
            Enter a valid phone number (at least 10 digits).
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Integrations panel ─────────────────────────────────────────────────
   Real outbound LEAD webhook config. Fires a signed POST to the owner's URL
   on every lead/quote submission — so it connects to Zapier, Make, n8n,
   HubSpot, GoHighLevel, Google Sheets, Slack, or any custom endpoint (they
   all accept inbound webhooks). Free for all tiers.

   The signing secret is generated + stored server-side; this panel reads,
   saves (on-blur / toggle), can "Send test", and can rotate the secret via
   the token-authed /api/calculators/integrations endpoints. */

interface WebhookCfg { url: string; enabled: boolean; secret: string; }

const URL_RE = /^https:\/\/[^\s]+$/i;

function IntegrationsPanel({ editToken }: { editToken: string }) {
  const [cfg, setCfg] = useState<WebhookCfg>({ url: '', enabled: false, secret: '' });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const hasToken = !!editToken;

  // Load existing config once we have a token.
  useEffect(() => {
    if (!hasToken) { setLoaded(true); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/calculators/integrations?token=${encodeURIComponent(editToken)}`);
        if (!r.ok) { if (!cancelled) setLoaded(true); return; }
        const data = await r.json();
        if (cancelled) return;
        const wh = data?.webhook ?? {};
        setCfg({
          url: typeof wh.url === 'string' ? wh.url : '',
          enabled: wh.enabled === true,
          secret: typeof wh.secret === 'string' ? wh.secret : '',
        });
      } catch {
        /* leave defaults — the panel still renders, save will surface errors */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [editToken, hasToken]);

  const persist = useCallback(
    async (next: { url?: string; enabled?: boolean; rotate_secret?: boolean }) => {
      if (!hasToken) {
        setSaveError('Save the calculator first to configure integrations.');
        return;
      }
      setSaving(true);
      setSaveError(null);
      try {
        const r = await fetch('/api/calculators/integrations', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: editToken,
            url: next.url ?? cfg.url,
            enabled: next.enabled ?? cfg.enabled,
            ...(next.rotate_secret ? { rotate_secret: true } : {}),
          }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          setSaveError(data?.error || 'Could not save. Please try again.');
          return;
        }
        const wh = data?.webhook ?? {};
        setCfg({
          url: typeof wh.url === 'string' ? wh.url : '',
          enabled: wh.enabled === true,
          secret: typeof wh.secret === 'string' ? wh.secret : '',
        });
      } catch {
        setSaveError('Network error while saving.');
      } finally {
        setSaving(false);
      }
    },
    [cfg.url, cfg.enabled, editToken, hasToken],
  );

  const onToggle = useCallback((enabled: boolean) => {
    setCfg((c) => ({ ...c, enabled }));
    void persist({ enabled });
  }, [persist]);

  const onUrlBlur = useCallback(() => {
    const url = cfg.url.trim();
    if (url && !URL_RE.test(url)) {
      setSaveError('Enter a full https:// URL.');
      return;
    }
    void persist({ url });
  }, [cfg.url, persist]);

  const onSendTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch('/api/calculators/integrations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: editToken, url: cfg.url.trim() }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setTestResult({ ok: false, msg: data?.error || `Failed (${r.status})` });
        return;
      }
      setTestResult(
        data?.ok
          ? { ok: true, msg: `Delivered${data.status ? ` (HTTP ${data.status})` : ''}.` }
          : { ok: false, msg: data?.error || `Endpoint rejected the test${data.status ? ` (HTTP ${data.status})` : ''}.` },
      );
    } catch {
      setTestResult({ ok: false, msg: 'Network error sending test.' });
    } finally {
      setTesting(false);
    }
  }, [editToken, cfg.url]);

  const onCopySecret = useCallback(async () => {
    if (!cfg.secret) return;
    try {
      await navigator.clipboard.writeText(cfg.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }, [cfg.secret]);

  const onRotate = useCallback(() => {
    void persist({ rotate_secret: true });
  }, [persist]);

  const urlInvalid = !!cfg.url.trim() && !URL_RE.test(cfg.url.trim());
  const canTest = hasToken && !!cfg.url.trim() && !urlInvalid && !!cfg.secret;

  return (
    <div className="qq-action-card qq-integ" data-testid="action-group-integrations">
      <div className="qq-action-card-head">
        <span className="qq-action-card-headicon" aria-hidden="true">
          <Plug size={16} />
        </span>
        <span className="qq-action-card-title">Integrations</span>
        <InfoCue
          testid="action-section-integrations"
          region="result"
          text="Send every new lead to your own systems in real time with a signed webhook. Works with Zapier, Make, n8n, HubSpot, GoHighLevel, Google Sheets and Slack — they all accept this webhook."
        />
      </div>
      <div className="qq-action-card-body">
        {!hasToken && (
          <p className="qq-integ-hint" data-testid="integ-needs-save">
            Save your calculator first, then connect a webhook here.
          </p>
        )}

        <label className="qq-action-toggle">
          <input
            type="checkbox"
            checked={cfg.enabled}
            disabled={!hasToken || saving || !loaded}
            onChange={(e) => onToggle(e.target.checked)}
            data-testid="integ-enabled"
            aria-label="Send a webhook on every new lead"
          />
          <span className="qq-action-toggle-title">Send a webhook on every new lead</span>
        </label>

        <FloatField
          label="Webhook URL"
          htmlFor="qq-integ-url"
          infoText="The https:// endpoint we POST each lead to. Paste a Zapier/Make catch-hook URL, a Slack incoming webhook, or your own API."
          infoTestid="integ-url"
        >
          <input
            id="qq-integ-url"
            type="url"
            inputMode="url"
            className="premium-input"
            placeholder=" "
            value={cfg.url}
            disabled={!hasToken}
            onChange={(e) => { setCfg((c) => ({ ...c, url: e.target.value })); setSaveError(null); }}
            onBlur={onUrlBlur}
            data-testid="integ-url-input"
            aria-invalid={urlInvalid}
          />
        </FloatField>

        {urlInvalid && (
          <p className="qq-integ-error" data-testid="integ-url-error">Enter a full https:// URL.</p>
        )}
        {saveError && (
          <p className="qq-integ-error" data-testid="integ-save-error">{saveError}</p>
        )}

        <div className="qq-integ-row">
          <button
            type="button"
            className="qq-integ-btn"
            onClick={onSendTest}
            disabled={!canTest || testing}
            data-testid="integ-send-test"
          >
            <Send size={16} aria-hidden="true" />
            <span>{testing ? 'Sending…' : 'Send test'}</span>
          </button>
          {testResult && (
            <span
              className={`qq-integ-testresult${testResult.ok ? ' is-ok' : ' is-err'}`}
              data-testid="integ-test-result"
              role="status"
            >
              {testResult.msg}
            </span>
          )}
        </div>

        {cfg.secret && (
          <div className="qq-integ-secret" data-testid="integ-secret-block">
            <div className="qq-integ-secret-label">Signing secret</div>
            <div className="qq-integ-secret-row">
              <code className="qq-integ-secret-value" data-testid="integ-secret-value">{cfg.secret}</code>
              <button
                type="button"
                className="qq-integ-iconbtn"
                onClick={onCopySecret}
                title="Copy signing secret"
                aria-label="Copy signing secret"
                data-testid="integ-copy-secret"
              >
                <Copy size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="qq-integ-iconbtn"
                onClick={onRotate}
                disabled={saving}
                title="Regenerate signing secret"
                aria-label="Regenerate signing secret"
                data-testid="integ-rotate-secret"
              >
                <RefreshCw size={16} aria-hidden="true" />
              </button>
            </div>
            <p className="qq-integ-hint">
              {copied ? 'Copied.' : 'Verify the X-WFT-Signature header with this secret to confirm each request is genuine.'}
            </p>
          </div>
        )}

        <p className="qq-integ-hint">
          Connect to Zapier, Make, HubSpot, Google Sheets, Slack and more — they all accept this webhook.{' '}
          <a
            href="/docs/webhooks"
            target="_blank"
            rel="noopener noreferrer"
            className="qq-integ-link"
            data-testid="integ-docs-link"
          >
            Read the docs <ExternalLink size={12} aria-hidden="true" />
          </a>
        </p>
      </div>
    </div>
  );
}
