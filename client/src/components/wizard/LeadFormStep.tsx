// Action step — what happens after the customer sees their estimate.
// Rebuilt from the former FROZEN LeadFormStep (Elfsight "Action" tab parity):
// a 3-way Action mode toggle (Lead form / Redirect / No action) plus, under
// Lead form, arbitrary owner-defined "+ Add Field" custom fields.
import { useState, useEffect } from 'react';
import { platformTheme } from '@/theme/platformTheme';
import { dashboardTheme as d } from '@/theme/dashboardTheme';
import {
  Users, Mail, Phone, MapPin, Calendar, FileText, Upload, Shield,
  Send, Globe, Bot, ChevronDown, ChevronUp, Lock,
  User, Building2, Zap, Eye, ExternalLink, Plus, Trash2,
} from 'lucide-react';

const p = platformTheme;

type LeadFormMode = 'optional' | 'gated' | 'call_only';
type ActionMode = 'lead_form' | 'redirect' | 'none';
type CustomFieldType = 'text' | 'email' | 'phone' | 'number' | 'select' | 'textarea' | 'checkbox';

interface LeadFormFields {
  name: boolean;
  phone: boolean;
  email: boolean;
  address: boolean;
  city: boolean;
  postal_zip: boolean;
  preferred_datetime: boolean;
  job_notes: boolean;
  file_upload: boolean;
}

interface CustomField {
  id: string;
  type: CustomFieldType;
  label: string;
  required: boolean;
  options: string[];
}

interface LeadFormData {
  version: number;
  mode: LeadFormMode;
  fields: LeadFormFields;
  custom_fields: CustomField[];
  consent: { enabled: boolean; text: string; sms_opt_in: boolean };
  cta: { button_text: string; helper_text: string };
  delivery: { primary_email: string; secondary_email: string; webhook_url: string };
  spam: { honeypot: boolean; recaptcha: boolean };
}

interface RedirectData {
  heading: string;
  caption: string;
  button_text: string;
  button_url: string;
}

interface ActionData {
  version: number;
  mode: ActionMode;
  redirect: RedirectData;
}

interface LeadFormStepProps {
  leadForm: LeadFormData;
  action: ActionData;
  ownerEmail: string;
  onChange: (lf: LeadFormData) => void;
  onActionChange: (a: ActionData) => void;
  onBack: () => void;
  onNext: () => void;
  onSave?: () => void;
  draftGenerating?: boolean;
}

const ACTION_OPTIONS: { value: ActionMode; label: string; desc: string; icon: any }[] = [
  { value: 'lead_form', label: 'Lead Form', desc: 'Collect contact details after the quote', icon: Users },
  { value: 'redirect', label: 'Redirect', desc: 'Show a button that links somewhere else', icon: ExternalLink },
  { value: 'none', label: 'No Action', desc: 'Just show the estimate, nothing after', icon: Eye },
];

const MODE_OPTIONS: { value: LeadFormMode; label: string; desc: string; icon: any }[] = [
  { value: 'optional', label: 'Optional Form', desc: 'Estimate shows first, form appears below', icon: Eye },
  { value: 'gated', label: 'Gated Quote', desc: 'Customer fills form before seeing estimate', icon: Lock },
  { value: 'call_only', label: 'Call-Only', desc: 'No estimate shown — collect details + CTA to call', icon: Phone },
];

const FIELD_DEFS: { id: string; label: string; icon: any; defaultOn: boolean; pro?: boolean }[] = [
  { id: 'name', label: 'Name', icon: User, defaultOn: true },
  { id: 'phone', label: 'Phone', icon: Phone, defaultOn: true },
  { id: 'email', label: 'Email', icon: Mail, defaultOn: true },
  { id: 'address', label: 'Address', icon: MapPin, defaultOn: false },
  { id: 'city', label: 'City', icon: Building2, defaultOn: false },
  { id: 'postal_zip', label: 'Postal / ZIP', icon: MapPin, defaultOn: false },
  { id: 'preferred_datetime', label: 'Preferred Date & Time', icon: Calendar, defaultOn: false },
  { id: 'job_notes', label: 'Job Notes', icon: FileText, defaultOn: false },
  { id: 'file_upload', label: 'File Upload', icon: Upload, defaultOn: false, pro: true },
];

const CUSTOM_FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
];

function getDefaultCta(mode: LeadFormMode): string {
  if (mode === 'gated') return 'Get My Quote';
  if (mode === 'call_only') return 'Request a Call';
  return 'Request Booking';
}

function isValidUrl(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch { return false; }
}

function validateWebhookUrl(url: string): boolean {
  if (!url) return true;
  return isValidUrl(url);
}

function newCustomField(): CustomField {
  return {
    id: `cf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    type: 'text',
    label: 'New field',
    required: false,
    options: [],
  };
}

/** Compact pill toggle used by custom-field rows. */
function MiniToggle({ on, onClick, testId }: { on: boolean; onClick: () => void; testId?: string }) {
  return (
    <button data-testid={testId} onClick={onClick} type="button" style={{
      width: '36px', height: '20px', borderRadius: '10px', border: 'none',
      background: on ? p.colors.accent : '#D1D5DB',
      cursor: 'pointer', position: 'relative', flexShrink: 0,
      transition: 'background 0.2s ease',
    }}>
      <div style={{
        width: '16px', height: '16px', borderRadius: '50%', background: 'white',
        position: 'absolute', top: '2px', left: on ? '18px' : '2px',
        transition: 'left 0.2s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
      }} />
    </button>
  );
}

export default function LeadFormStep({
  leadForm, action, ownerEmail, onChange, onActionChange, onBack, onNext, onSave, draftGenerating,
}: LeadFormStepProps) {
  const [showDelivery, setShowDelivery] = useState(false);
  const [showSpam, setShowSpam] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!leadForm.delivery.primary_email && ownerEmail) {
      onChange({ ...leadForm, delivery: { ...leadForm.delivery, primary_email: ownerEmail } });
    }
  }, []);

  const set = <K extends keyof LeadFormData>(key: K, val: LeadFormData[K]) => {
    onChange({ ...leadForm, [key]: val });
  };

  const setField = (fieldId: keyof LeadFormFields, enabled: boolean) => {
    set('fields', { ...leadForm.fields, [fieldId]: enabled });
  };

  const setRedirect = <K extends keyof RedirectData>(key: K, val: RedirectData[K]) => {
    onActionChange({ ...action, redirect: { ...action.redirect, [key]: val } });
  };

  /* ── custom field mutations ── */
  const customFields = leadForm.custom_fields || [];
  const addCustomField = () => set('custom_fields', [...customFields, newCustomField()]);
  const updateCustomField = (id: string, patch: Partial<CustomField>) =>
    set('custom_fields', customFields.map(f => (f.id === id ? { ...f, ...patch } : f)));
  const removeCustomField = (id: string) =>
    set('custom_fields', customFields.filter(f => f.id !== id));

  const enabledFields = FIELD_DEFS.filter(f => leadForm.fields[f.id as keyof LeadFormFields]);

  /* ── validation (mode-aware) ── */
  const validationErrors: string[] = [];
  if (action.mode === 'lead_form') {
    if ((leadForm.mode === 'gated' || leadForm.mode === 'optional') && !leadForm.delivery.primary_email) {
      validationErrors.push('Add a delivery email to receive leads');
    }
    if (leadForm.delivery.webhook_url && !validateWebhookUrl(leadForm.delivery.webhook_url)) {
      validationErrors.push('Webhook URL is not a valid URL');
    }
    if (leadForm.mode === 'gated' && enabledFields.length === 0 && customFields.length === 0) {
      validationErrors.push('Gated mode requires at least one field');
    }
    if (customFields.some(f => !f.label.trim())) {
      validationErrors.push('Every custom field needs a label');
    }
    if (customFields.some(f => f.type === 'select' && f.options.filter(o => o.trim()).length === 0)) {
      validationErrors.push('Dropdown fields need at least one option');
    }
  } else if (action.mode === 'redirect') {
    if (!isValidUrl(action.redirect.button_url)) {
      validationErrors.push('Enter a valid redirect URL (http:// or https://)');
    }
    if (!action.redirect.button_text.trim()) {
      validationErrors.push('Add button text for the redirect');
    }
  }
  const canContinue = validationErrors.length === 0;

  return (
    <div className="animate-fade-in-up">
      {draftGenerating && (
        <div data-testid="draft-generating-banner" style={{
          padding: '12px 16px', borderRadius: p.radius.md,
          background: p.colors.accentLighter, border: `1px solid ${p.colors.accentLight}`,
          display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px',
        }}>
          <Zap style={{ width: '16px', height: '16px', color: p.colors.accent }} />
          <p style={{ fontSize: '13px', color: p.colors.accentDark, margin: 0, lineHeight: 1.4 }}>
            AI is generating your pricing draft in the background...
          </p>
        </div>
      )}

      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: p.radius.sm,
            background: p.colors.accentLighter, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Zap style={{ width: '16px', height: '16px', color: p.colors.accent }} />
          </div>
          <div>
            <h2 style={{ ...p.typography.h3, margin: 0 }}>After the Quote</h2>
          </div>
        </div>
        <p style={{ ...p.typography.caption, marginTop: '4px', marginLeft: '42px' }}>
          Choose what happens once the customer sees their estimate.
        </p>
      </div>

      {/* ─── Action mode toggle ─── */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ ...p.typography.label, display: 'block', marginBottom: '10px' }}>Action</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {ACTION_OPTIONS.map(opt => {
            const selected = action.mode === opt.value;
            const Icon = opt.icon;
            return (
              <button key={opt.value} data-testid={`action-${opt.value}`} type="button"
                onClick={() => onActionChange({ ...action, mode: opt.value })}
                style={{
                  padding: '14px 16px', borderRadius: p.radius.md, border: 'none',
                  background: selected ? p.colors.accentLighter : d.colors.card,
                  outline: 'none',
                  boxShadow: selected ? `0 0 0 2px ${p.colors.accent}, ${d.shadows.card}` : d.shadows.card,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px',
                  textAlign: 'left', transition: p.transitions.normal,
                }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                  background: selected ? p.colors.accent : p.colors.surfaceRaised,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon style={{ width: '16px', height: '16px', color: selected ? 'white' : p.colors.muted }} />
                </div>
                <div>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: p.colors.heading, display: 'block' }}>
                    {opt.label}
                  </span>
                  <span style={{ fontSize: '12px', color: p.colors.muted }}>{opt.desc}</span>
                </div>
                <div style={{
                  marginLeft: 'auto', width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                  border: selected ? `5px solid ${p.colors.accent}` : `2px solid ${p.colors.borderLight}`,
                  background: 'white',
                }} />
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ REDIRECT branch ═══ */}
      {action.mode === 'redirect' && (
        <>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ ...p.typography.label, display: 'block', marginBottom: '10px' }}>Redirect Content</label>
            <div style={{
              padding: '14px 16px', borderRadius: p.radius.md,
              border: 'none', background: d.colors.card, boxShadow: d.shadows.card,
            }}>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ ...p.typography.captionSm, display: 'block', marginBottom: '4px' }}>Heading</label>
                <input data-testid="input-redirect-heading" type="text"
                  value={action.redirect.heading}
                  onChange={e => setRedirect('heading', e.target.value)}
                  className="premium-input" placeholder="Thanks for your interest!"
                  style={{ fontSize: '13px' }} />
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ ...p.typography.captionSm, display: 'block', marginBottom: '4px' }}>Caption (optional)</label>
                <input data-testid="input-redirect-caption" type="text"
                  value={action.redirect.caption}
                  onChange={e => setRedirect('caption', e.target.value)}
                  className="premium-input" placeholder="Click below to continue"
                  style={{ fontSize: '13px' }} />
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ ...p.typography.captionSm, display: 'block', marginBottom: '4px' }}>Button Text</label>
                <input data-testid="input-redirect-button-text" type="text"
                  value={action.redirect.button_text}
                  onChange={e => setRedirect('button_text', e.target.value)}
                  className="premium-input" placeholder="Continue"
                  style={{ fontSize: '13px' }} />
              </div>
              <div>
                <label style={{ ...p.typography.captionSm, display: 'block', marginBottom: '4px' }}>Button URL</label>
                <input data-testid="input-redirect-button-url" type="url"
                  value={action.redirect.button_url}
                  onChange={e => setRedirect('button_url', e.target.value)}
                  className="premium-input" placeholder="https://your-site.com/book"
                  style={{ fontSize: '13px' }} />
              </div>
            </div>
          </div>

          {/* Redirect preview */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ ...p.typography.label, display: 'block', marginBottom: '10px' }}>
              <Eye style={{ width: '14px', height: '14px', display: 'inline', verticalAlign: '-2px', marginRight: '6px', color: p.colors.accent }} />
              Live Preview
            </label>
            <div style={{
              padding: '24px 16px', borderRadius: p.radius.md, textAlign: 'center',
              border: 'none', background: d.colors.cardMuted, boxShadow: d.shadows.card,
            }}>
              <p style={{ fontSize: '16px', fontWeight: 700, color: p.colors.heading, margin: '0 0 6px' }}>
                {action.redirect.heading || 'Thanks for your interest!'}
              </p>
              {action.redirect.caption && (
                <p style={{ fontSize: '13px', color: p.colors.muted, margin: '0 0 14px' }}>
                  {action.redirect.caption}
                </p>
              )}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '12px 24px', borderRadius: p.radius.sm,
                background: p.colors.accent, color: 'white', fontWeight: 600, fontSize: '14px',
              }}>
                {action.redirect.button_text || 'Continue'}
                <ExternalLink style={{ width: '14px', height: '14px' }} />
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ NO ACTION branch ═══ */}
      {action.mode === 'none' && (
        <div data-testid="no-action-note" style={{
          marginBottom: '24px', padding: '16px',
          borderRadius: p.radius.md, border: `1px dashed ${p.colors.border}`,
          background: '#FAFAFA', display: 'flex', alignItems: 'flex-start', gap: '10px',
        }}>
          <Eye style={{ width: '16px', height: '16px', color: p.colors.muted, flexShrink: 0, marginTop: '1px' }} />
          <p style={{ fontSize: '13px', color: p.colors.muted, margin: 0, lineHeight: 1.5 }}>
            The customer will see their estimate and nothing else. No lead is
            collected and no follow-up button is shown.
          </p>
        </div>
      )}

      {/* ═══ LEAD FORM branch ═══ */}
      {action.mode === 'lead_form' && (
        <>
          {/* A) Mode Selector */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ ...p.typography.label, display: 'block', marginBottom: '10px' }}>Quote Display Mode</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {MODE_OPTIONS.map(opt => {
                const selected = leadForm.mode === opt.value;
                const Icon = opt.icon;
                return (
                  <button key={opt.value} data-testid={`mode-${opt.value}`} type="button"
                    onClick={() => {
                      const newCta = getDefaultCta(opt.value);
                      const isDefault = leadForm.cta.button_text === getDefaultCta(leadForm.mode);
                      onChange({
                        ...leadForm,
                        mode: opt.value,
                        cta: isDefault ? { ...leadForm.cta, button_text: newCta } : leadForm.cta,
                      });
                    }}
                    style={{
                      padding: '14px 16px', borderRadius: p.radius.md, border: 'none',
                      background: selected ? p.colors.accentLighter : d.colors.card,
                      outline: 'none',
                      boxShadow: selected ? `0 0 0 2px ${p.colors.accent}, ${d.shadows.card}` : d.shadows.card,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px',
                      textAlign: 'left', transition: p.transitions.normal,
                    }}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                      background: selected ? p.colors.accent : p.colors.surfaceRaised,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon style={{ width: '16px', height: '16px', color: selected ? 'white' : p.colors.muted }} />
                    </div>
                    <div>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: p.colors.heading, display: 'block' }}>
                        {opt.label}
                      </span>
                      <span style={{ fontSize: '12px', color: p.colors.muted }}>{opt.desc}</span>
                    </div>
                    <div style={{
                      marginLeft: 'auto', width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                      border: selected ? `5px solid ${p.colors.accent}` : `2px solid ${p.colors.borderLight}`,
                      background: 'white',
                    }} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* B) Fields Checklist */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ ...p.typography.label, display: 'block', marginBottom: '10px' }}>Form Fields</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {FIELD_DEFS.map(field => {
                const enabled = leadForm.fields[field.id as keyof LeadFormFields] ?? field.defaultOn;
                const Icon = field.icon;
                return (
                  <div key={field.id} data-testid={`field-toggle-${field.id}`} style={{
                    padding: '10px 14px', borderRadius: p.radius.sm,
                    border: 'none',
                    background: enabled ? d.colors.card : d.colors.cardMuted,
                    boxShadow: enabled ? d.shadows.card : 'none',
                    display: 'flex', alignItems: 'center', gap: '10px',
                    opacity: field.pro ? 0.55 : 1,
                  }}>
                    <button data-testid={`toggle-${field.id}`} type="button"
                      disabled={!!field.pro}
                      onClick={() => setField(field.id as keyof LeadFormFields, !enabled)}
                      style={{
                        width: '40px', height: '22px', borderRadius: '11px', border: 'none',
                        background: enabled ? p.colors.accent : '#D1D5DB',
                        cursor: field.pro ? 'not-allowed' : 'pointer', position: 'relative', flexShrink: 0,
                        transition: 'background 0.2s ease',
                      }}>
                      <div style={{
                        width: '18px', height: '18px', borderRadius: '50%', background: 'white',
                        position: 'absolute', top: '2px', left: enabled ? '20px' : '2px',
                        transition: 'left 0.2s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                      }} />
                    </button>
                    <Icon style={{ width: '14px', height: '14px', color: enabled ? p.colors.heading : p.colors.muted, flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', fontWeight: 500, color: enabled ? p.colors.heading : p.colors.muted, flex: 1 }}>
                      {field.label}
                    </span>
                    {field.pro && (
                      <span style={{
                        padding: '2px 8px', borderRadius: p.radius.pill, fontSize: '10px', fontWeight: 700,
                        background: '#F3F4F6', color: p.colors.muted, letterSpacing: '0.05em',
                      }}>PRO</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* B2) Custom fields */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ ...p.typography.label, display: 'block', marginBottom: '4px' }}>Custom Fields</label>
            <p style={{ ...p.typography.captionSm, margin: '0 0 10px' }}>
              Add your own questions — budget, timeframe, "how did you hear about us", anything.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {customFields.map(field => (
                <div key={field.id} data-testid={`custom-field-${field.id}`} style={{
                  padding: '12px 14px', borderRadius: p.radius.md,
                  border: 'none', background: d.colors.card, boxShadow: d.shadows.card,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input data-testid={`custom-field-label-${field.id}`} type="text"
                      value={field.label}
                      onChange={e => updateCustomField(field.id, { label: e.target.value })}
                      className="premium-input" placeholder="Field label"
                      style={{ fontSize: '13px', flex: 1 }} />
                    <select data-testid={`custom-field-type-${field.id}`}
                      value={field.type}
                      onChange={e => updateCustomField(field.id, { type: e.target.value as CustomFieldType })}
                      className="premium-input"
                      style={{ fontSize: '13px', width: '130px', flexShrink: 0 }}>
                      {CUSTOM_FIELD_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    <button data-testid={`custom-field-remove-${field.id}`} type="button"
                      onClick={() => removeCustomField(field.id)}
                      style={{
                        width: '32px', height: '32px', borderRadius: p.radius.sm, flexShrink: 0,
                        border: `1px solid ${p.colors.borderLight}`, background: 'white', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                      <Trash2 style={{ width: '14px', height: '14px', color: p.colors.muted }} />
                    </button>
                  </div>
                  {field.type === 'select' && (
                    <div style={{ marginTop: '8px' }}>
                      <label style={{ ...p.typography.captionSm, display: 'block', marginBottom: '4px' }}>
                        Options (comma-separated)
                      </label>
                      <input data-testid={`custom-field-options-${field.id}`} type="text"
                        value={field.options.join(', ')}
                        onChange={e => updateCustomField(field.id, {
                          options: e.target.value.split(',').map(o => o.trim()).filter(Boolean),
                        })}
                        className="premium-input" placeholder="Option A, Option B, Option C"
                        style={{ fontSize: '13px' }} />
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                    <MiniToggle on={field.required} testId={`custom-field-required-${field.id}`}
                      onClick={() => updateCustomField(field.id, { required: !field.required })} />
                    <span style={{ fontSize: '12px', color: p.colors.muted }}>Required</span>
                  </div>
                </div>
              ))}
            </div>
            <button data-testid="button-add-field" type="button" onClick={addCustomField}
              style={{
                marginTop: customFields.length ? '8px' : 0,
                width: '100%', padding: '10px 14px', borderRadius: p.radius.md,
                border: `1px dashed ${p.colors.border}`, background: '#FAFAFA', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                fontSize: '13px', fontWeight: 600, color: p.colors.accentDark,
              }}>
              <Plus style={{ width: '14px', height: '14px' }} />
              Add Field
            </button>
          </div>

          {/* C) Consent / Compliance */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ ...p.typography.label, display: 'block', marginBottom: '10px' }}>Consent & Compliance</label>
            <div style={{
              padding: '14px 16px', borderRadius: p.radius.md,
              border: 'none', background: d.colors.card, boxShadow: d.shadows.card,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <button data-testid="toggle-consent" type="button"
                  onClick={() => set('consent', { ...leadForm.consent, enabled: !leadForm.consent.enabled })}
                  style={{
                    width: '40px', height: '22px', borderRadius: '11px', border: 'none',
                    background: leadForm.consent.enabled ? p.colors.accent : '#D1D5DB',
                    cursor: 'pointer', position: 'relative', flexShrink: 0,
                  }}>
                  <div style={{
                    width: '18px', height: '18px', borderRadius: '50%', background: 'white',
                    position: 'absolute', top: '2px', left: leadForm.consent.enabled ? '20px' : '2px',
                    transition: 'left 0.2s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                  }} />
                </button>
                <Shield style={{ width: '14px', height: '14px', color: p.colors.accent }} />
                <span style={{ fontSize: '13px', fontWeight: 500, color: p.colors.heading }}>Show consent checkbox</span>
              </div>
              {leadForm.consent.enabled && (
                <div>
                  <input data-testid="input-consent-text" type="text"
                    value={leadForm.consent.text}
                    onChange={e => set('consent', { ...leadForm.consent, text: e.target.value })}
                    className="premium-input" placeholder="I agree to be contacted..."
                    style={{ fontSize: '13px', marginBottom: '8px' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', opacity: 0.55 }}>
                    <button disabled type="button" style={{
                      width: '36px', height: '20px', borderRadius: '10px', border: 'none',
                      background: '#D1D5DB', cursor: 'not-allowed', position: 'relative', flexShrink: 0,
                    }}>
                      <div style={{
                        width: '16px', height: '16px', borderRadius: '50%', background: 'white',
                        position: 'absolute', top: '2px', left: '2px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                      }} />
                    </button>
                    <span style={{ fontSize: '12px', color: p.colors.muted }}>SMS opt-in consent</span>
                    <span style={{
                      padding: '2px 8px', borderRadius: p.radius.pill, fontSize: '10px', fontWeight: 700,
                      background: '#F3F4F6', color: p.colors.muted,
                    }}>PRO</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* D) CTA Customization */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ ...p.typography.label, display: 'block', marginBottom: '10px' }}>Call-to-Action Button</label>
            <div style={{
              padding: '14px 16px', borderRadius: p.radius.md,
              border: 'none', background: d.colors.card, boxShadow: d.shadows.card,
            }}>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ ...p.typography.captionSm, display: 'block', marginBottom: '4px' }}>Button Text</label>
                <input data-testid="input-cta-text" type="text"
                  value={leadForm.cta.button_text}
                  onChange={e => set('cta', { ...leadForm.cta, button_text: e.target.value })}
                  className="premium-input" placeholder="Get My Quote"
                  style={{ fontSize: '13px' }} />
              </div>
              <div>
                <label style={{ ...p.typography.captionSm, display: 'block', marginBottom: '4px' }}>Helper Text (optional)</label>
                <input data-testid="input-cta-helper" type="text"
                  value={leadForm.cta.helper_text}
                  onChange={e => set('cta', { ...leadForm.cta, helper_text: e.target.value })}
                  className="premium-input" placeholder="No obligation — free estimate"
                  style={{ fontSize: '13px' }} />
              </div>
            </div>
          </div>

          {/* E) Delivery Settings (collapsible) */}
          <div style={{ marginBottom: '24px' }}>
            <button data-testid="toggle-delivery-section" type="button"
              onClick={() => setShowDelivery(!showDelivery)}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: p.radius.md,
                border: 'none', background: d.colors.card, boxShadow: d.shadows.card, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Send style={{ width: '14px', height: '14px', color: p.colors.accent }} />
                <span style={{ ...p.typography.label }}>Lead Delivery</span>
              </div>
              {showDelivery
                ? <ChevronUp style={{ width: '14px', height: '14px', color: p.colors.muted }} />
                : <ChevronDown style={{ width: '14px', height: '14px', color: p.colors.muted }} />}
            </button>
            {showDelivery && (
              <div style={{
                padding: '14px 16px', borderRadius: `0 0 ${p.radius.md} ${p.radius.md}`,
                border: 'none', borderTop: 'none', background: d.colors.cardMuted, boxShadow: d.shadows.card,
              }}>
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ ...p.typography.captionSm, display: 'block', marginBottom: '4px' }}>Primary Email</label>
                  <input data-testid="input-primary-email" type="email"
                    value={leadForm.delivery.primary_email}
                    onChange={e => set('delivery', { ...leadForm.delivery, primary_email: e.target.value })}
                    className="premium-input" placeholder="your@email.com"
                    style={{ fontSize: '13px' }} />
                </div>
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ ...p.typography.captionSm, display: 'block', marginBottom: '4px' }}>Secondary Email (optional)</label>
                  <input data-testid="input-secondary-email" type="email"
                    value={leadForm.delivery.secondary_email}
                    onChange={e => set('delivery', { ...leadForm.delivery, secondary_email: e.target.value })}
                    className="premium-input" placeholder="backup@email.com"
                    style={{ fontSize: '13px' }} />
                </div>
                <div style={{ marginBottom: '10px', opacity: 0.55 }}>
                  <label style={{ ...p.typography.captionSm, display: 'block', marginBottom: '4px' }}>
                    Webhook URL
                    <span style={{ padding: '2px 6px', marginLeft: '6px', borderRadius: p.radius.pill, fontSize: '10px', fontWeight: 700, background: '#F3F4F6', color: p.colors.muted }}>PRO</span>
                  </label>
                  <input disabled type="url" className="premium-input" placeholder="https://hooks.example.com/leads"
                    style={{ fontSize: '13px', cursor: 'not-allowed' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', opacity: 0.55 }}>
                  <Globe style={{ width: '13px', height: '13px', color: p.colors.muted }} />
                  <span style={{ fontSize: '12px', color: p.colors.muted }}>CRM integration</span>
                  <span style={{ padding: '2px 8px', borderRadius: p.radius.pill, fontSize: '10px', fontWeight: 700, background: '#F3F4F6', color: p.colors.muted }}>PRO</span>
                </div>
              </div>
            )}
          </div>

          {/* F) Anti-spam (collapsible) */}
          <div style={{ marginBottom: '24px' }}>
            <button data-testid="toggle-spam-section" type="button"
              onClick={() => setShowSpam(!showSpam)}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: p.radius.md,
                border: 'none', background: d.colors.card, boxShadow: d.shadows.card, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bot style={{ width: '14px', height: '14px', color: p.colors.accent }} />
                <span style={{ ...p.typography.label }}>Anti-Spam</span>
              </div>
              {showSpam
                ? <ChevronUp style={{ width: '14px', height: '14px', color: p.colors.muted }} />
                : <ChevronDown style={{ width: '14px', height: '14px', color: p.colors.muted }} />}
            </button>
            {showSpam && (
              <div style={{
                padding: '14px 16px', borderRadius: `0 0 ${p.radius.md} ${p.radius.md}`,
                border: 'none', borderTop: 'none', background: d.colors.cardMuted, boxShadow: d.shadows.card,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <button data-testid="toggle-honeypot" type="button"
                    onClick={() => set('spam', { ...leadForm.spam, honeypot: !leadForm.spam.honeypot })}
                    style={{
                      width: '40px', height: '22px', borderRadius: '11px', border: 'none',
                      background: leadForm.spam.honeypot ? p.colors.accent : '#D1D5DB',
                      cursor: 'pointer', position: 'relative', flexShrink: 0,
                    }}>
                    <div style={{
                      width: '18px', height: '18px', borderRadius: '50%', background: 'white',
                      position: 'absolute', top: '2px', left: leadForm.spam.honeypot ? '20px' : '2px',
                      transition: 'left 0.2s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                    }} />
                  </button>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: p.colors.heading }}>Honeypot field (invisible to humans)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', opacity: 0.55 }}>
                  <button disabled type="button" style={{
                    width: '36px', height: '20px', borderRadius: '10px', border: 'none',
                    background: '#D1D5DB', cursor: 'not-allowed', position: 'relative', flexShrink: 0,
                  }}>
                    <div style={{
                      width: '16px', height: '16px', borderRadius: '50%', background: 'white',
                      position: 'absolute', top: '2px', left: '2px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                    }} />
                  </button>
                  <span style={{ fontSize: '12px', color: p.colors.muted }}>reCAPTCHA verification</span>
                  <span style={{ padding: '2px 8px', borderRadius: p.radius.pill, fontSize: '10px', fontWeight: 700, background: '#F3F4F6', color: p.colors.muted }}>PRO</span>
                </div>
              </div>
            )}
          </div>

          {/* Live Preview */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ ...p.typography.label, display: 'block', marginBottom: '10px' }}>
              <Eye style={{ width: '14px', height: '14px', display: 'inline', verticalAlign: '-2px', marginRight: '6px', color: p.colors.accent }} />
              Live Preview
            </label>
            <div style={{
              padding: '20px 16px', borderRadius: p.radius.md,
              border: 'none', background: d.colors.cardMuted, boxShadow: d.shadows.card,
            }}>
              {leadForm.mode === 'gated' && (
                <div style={{
                  padding: '10px 12px', borderRadius: p.radius.sm, marginBottom: '14px',
                  background: '#FFFBEB', border: '1px solid #FDE68A', fontSize: '12px', color: '#92400E',
                }}>
                  Customer must fill this form before seeing their estimate.
                </div>
              )}
              {leadForm.mode === 'optional' && (
                <div style={{
                  padding: '10px 12px', borderRadius: p.radius.sm, marginBottom: '14px',
                  background: p.colors.accentLighter, border: `1px solid ${p.colors.accentLight}`,
                  fontSize: '12px', color: p.colors.accentDark, textAlign: 'center', fontWeight: 600,
                }}>
                  Your estimate: $125.00
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                {enabledFields.map(field => (
                  <div key={field.id} style={{
                    padding: '10px 12px', borderRadius: p.radius.sm,
                    border: `1px solid ${p.colors.borderLight}`, background: 'white',
                    fontSize: '13px', color: p.colors.muted,
                  }}>
                    {field.label}
                  </div>
                ))}
                {customFields.map(field => (
                  <div key={field.id} style={{
                    padding: '10px 12px', borderRadius: p.radius.sm,
                    border: `1px solid ${p.colors.borderLight}`, background: 'white',
                    fontSize: '13px', color: p.colors.muted,
                  }}>
                    {field.label || 'Custom field'}
                    {field.required && <span style={{ color: '#DC2626', marginLeft: '4px' }}>*</span>}
                  </div>
                ))}
                {enabledFields.length === 0 && customFields.length === 0 && (
                  <p style={{ fontSize: '12px', color: p.colors.muted, textAlign: 'center', padding: '10px' }}>
                    No fields enabled
                  </p>
                )}
              </div>
              {leadForm.consent.enabled && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '14px',
                  fontSize: '11px', color: p.colors.muted,
                }}>
                  <div style={{
                    width: '14px', height: '14px', borderRadius: '3px', border: '1.5px solid #D1D5DB',
                    flexShrink: 0, marginTop: '1px',
                  }} />
                  <span>{leadForm.consent.text}</span>
                </div>
              )}
              <div style={{
                padding: '12px', borderRadius: p.radius.sm, textAlign: 'center',
                background: p.colors.accent, color: 'white', fontWeight: 600, fontSize: '14px',
              }}>
                {leadForm.cta.button_text || 'Submit'}
              </div>
              {leadForm.cta.helper_text && (
                <p style={{ fontSize: '11px', color: p.colors.muted, textAlign: 'center', marginTop: '6px' }}>
                  {leadForm.cta.helper_text}
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div data-testid="lead-form-errors" style={{
          padding: '12px 16px', borderRadius: p.radius.md,
          background: '#FEF2F2', border: '1px solid #FECACA', marginBottom: '16px',
        }}>
          {validationErrors.map((err, i) => (
            <p key={i} style={{ fontSize: '12px', color: '#991B1B', margin: i > 0 ? '4px 0 0' : 0 }}>
              {err}
            </p>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingTop: '16px', borderTop: `1px solid ${p.colors.borderLight}`,
      }}>
        <button data-testid="button-back" type="button" onClick={onBack} style={{
          padding: '10px 20px', borderRadius: p.radius.sm, border: `1px solid ${p.colors.border}`,
          background: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: 500, color: p.colors.body,
        }}>
          Back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {onSave && (
            <button data-testid="button-save" type="button"
              onClick={() => { onSave(); setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1800); }}
              style={{
                padding: '10px 20px', borderRadius: p.radius.sm,
                border: `1px solid ${savedFlash ? p.colors.accent : p.colors.border}`,
                background: savedFlash ? p.colors.accentLighter : 'white',
                cursor: 'pointer', fontSize: '14px', fontWeight: 600,
                color: savedFlash ? p.colors.accentDark : p.colors.body,
              }}>
              {savedFlash ? 'Saved' : 'Save'}
            </button>
          )}
          <button data-testid="button-next" type="button" disabled={!canContinue} onClick={onNext} style={{
            padding: '10px 24px', borderRadius: p.radius.sm, border: 'none',
            background: canContinue ? p.colors.accent : '#D1D5DB',
            cursor: canContinue ? 'pointer' : 'not-allowed',
            fontSize: '14px', fontWeight: 600, color: 'white',
            opacity: canContinue ? 1 : 0.7,
            transition: p.transitions.normal,
          }}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
