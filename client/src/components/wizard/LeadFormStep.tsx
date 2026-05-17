// FROZEN — scheduled for rebuild in Phase 3 (Builder Wizard). Do not add features.
import { useState, useMemo, useEffect } from 'react';
import { platformTheme } from '@/theme/platformTheme';
import type { CalculatorSettings } from '@shared/schema';
import {
  Users, Mail, Phone, MapPin, Calendar, FileText, Upload, Shield,
  MessageSquare, Send, Globe, Bot, ChevronDown, ChevronUp, Lock,
  User, Building2, Zap, Eye
} from 'lucide-react';

const p = platformTheme;

type LeadFormMode = 'optional' | 'gated' | 'call_only';

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

interface LeadFormData {
  version: number;
  mode: LeadFormMode;
  fields: LeadFormFields;
  consent: { enabled: boolean; text: string; sms_opt_in: boolean };
  cta: { button_text: string; helper_text: string };
  delivery: { primary_email: string; secondary_email: string; webhook_url: string };
  spam: { honeypot: boolean; recaptcha: boolean };
}

interface LeadFormStepProps {
  leadForm: LeadFormData;
  ownerEmail: string;
  onChange: (lf: LeadFormData) => void;
  onBack: () => void;
  onNext: () => void;
  onSave?: () => void;
  draftGenerating?: boolean;
}

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

function getDefaultCta(mode: LeadFormMode): string {
  if (mode === 'gated') return 'Get My Quote';
  if (mode === 'call_only') return 'Request a Call';
  return 'Request Booking';
}

function validateWebhookUrl(url: string): boolean {
  if (!url) return true;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch { return false; }
}

export default function LeadFormStep({ leadForm, ownerEmail, onChange, onBack, onNext, onSave, draftGenerating }: LeadFormStepProps) {
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

  const enabledFields = FIELD_DEFS.filter(f => leadForm.fields[f.id as keyof LeadFormFields]);

  const validationErrors: string[] = [];
  if ((leadForm.mode === 'gated' || leadForm.mode === 'optional') && !leadForm.delivery.primary_email) {
    validationErrors.push('Add a delivery email to receive leads');
  }
  if (leadForm.delivery.webhook_url && !validateWebhookUrl(leadForm.delivery.webhook_url)) {
    validationErrors.push('Webhook URL is not a valid URL');
  }
  if (leadForm.mode === 'gated' && enabledFields.length === 0) {
    validationErrors.push('Gated mode requires at least one contact field');
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
            <Users style={{ width: '16px', height: '16px', color: p.colors.accent }} />
          </div>
          <div>
            <h2 style={{ ...p.typography.h3, margin: 0 }}>Capture Leads</h2>
          </div>
        </div>
        <p style={{ ...p.typography.caption, marginTop: '4px', marginLeft: '42px' }}>
          Decide when to ask for contact details.
        </p>
      </div>

      {/* A) Mode Selector */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ ...p.typography.label, display: 'block', marginBottom: '10px' }}>Quote Display Mode</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {MODE_OPTIONS.map(opt => {
            const selected = leadForm.mode === opt.value;
            const Icon = opt.icon;
            return (
              <button key={opt.value} data-testid={`mode-${opt.value}`}
                onClick={() => {
                  const newCta = getDefaultCta(opt.value);
                  const currentCta = leadForm.cta.button_text;
                  const isDefault = currentCta === getDefaultCta(leadForm.mode);
                  set('mode', opt.value);
                  if (isDefault) {
                    setTimeout(() => onChange({
                      ...leadForm,
                      mode: opt.value,
                      cta: { ...leadForm.cta, button_text: newCta },
                    }), 0);
                  }
                }}
                style={{
                  padding: '14px 16px', borderRadius: p.radius.md, border: 'none',
                  background: selected ? p.colors.accentLighter : 'white',
                  outline: selected ? `2px solid ${p.colors.accent}` : `1px solid ${p.colors.border}`,
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
                  <span style={{ fontSize: '12px', color: p.colors.muted }}>
                    {opt.desc}
                  </span>
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
                border: `1px solid ${enabled ? p.colors.border : p.colors.borderLight}`,
                background: enabled ? 'white' : '#F9FAFB',
                display: 'flex', alignItems: 'center', gap: '10px',
                opacity: field.pro ? 0.55 : 1,
              }}>
                <button data-testid={`toggle-${field.id}`}
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
                    position: 'absolute', top: '2px',
                    left: enabled ? '20px' : '2px',
                    transition: 'left 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
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

      {/* C) Consent / Compliance */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ ...p.typography.label, display: 'block', marginBottom: '10px' }}>Consent & Compliance</label>
        <div style={{
          padding: '14px 16px', borderRadius: p.radius.md,
          border: `1px solid ${p.colors.border}`, background: 'white',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <button data-testid="toggle-consent"
              onClick={() => set('consent', { ...leadForm.consent, enabled: !leadForm.consent.enabled })}
              style={{
                width: '40px', height: '22px', borderRadius: '11px', border: 'none',
                background: leadForm.consent.enabled ? p.colors.accent : '#D1D5DB',
                cursor: 'pointer', position: 'relative', flexShrink: 0,
              }}>
              <div style={{
                width: '18px', height: '18px', borderRadius: '50%', background: 'white',
                position: 'absolute', top: '2px',
                left: leadForm.consent.enabled ? '20px' : '2px',
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
                className="premium-input" placeholder="I agree to be contacted…"
                style={{ fontSize: '13px', marginBottom: '8px' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', opacity: 0.55 }}>
                <button disabled style={{
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
          border: `1px solid ${p.colors.border}`, background: 'white',
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
        <button data-testid="toggle-delivery-section"
          onClick={() => setShowDelivery(!showDelivery)}
          style={{
            width: '100%', padding: '12px 16px', borderRadius: p.radius.md,
            border: `1px solid ${p.colors.border}`, background: 'white', cursor: 'pointer',
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
            border: `1px solid ${p.colors.border}`, borderTop: 'none', background: '#FAFAFA',
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
        <button data-testid="toggle-spam-section"
          onClick={() => setShowSpam(!showSpam)}
          style={{
            width: '100%', padding: '12px 16px', borderRadius: p.radius.md,
            border: `1px solid ${p.colors.border}`, background: 'white', cursor: 'pointer',
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
            border: `1px solid ${p.colors.border}`, borderTop: 'none', background: '#FAFAFA',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <button data-testid="toggle-honeypot"
                onClick={() => set('spam', { ...leadForm.spam, honeypot: !leadForm.spam.honeypot })}
                style={{
                  width: '40px', height: '22px', borderRadius: '11px', border: 'none',
                  background: leadForm.spam.honeypot ? p.colors.accent : '#D1D5DB',
                  cursor: 'pointer', position: 'relative', flexShrink: 0,
                }}>
                <div style={{
                  width: '18px', height: '18px', borderRadius: '50%', background: 'white',
                  position: 'absolute', top: '2px',
                  left: leadForm.spam.honeypot ? '20px' : '2px',
                  transition: 'left 0.2s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                }} />
              </button>
              <span style={{ fontSize: '13px', fontWeight: 500, color: p.colors.heading }}>Honeypot field (invisible to humans)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', opacity: 0.55 }}>
              <button disabled style={{
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
          border: `1px solid ${p.colors.border}`, background: '#FAFAFA',
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
            {enabledFields.length === 0 && (
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
        <button data-testid="button-back" onClick={onBack} style={{
          padding: '10px 20px', borderRadius: p.radius.sm, border: `1px solid ${p.colors.border}`,
          background: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: 500, color: p.colors.body,
        }}>
          Back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {onSave && (
            <button data-testid="button-save"
              onClick={() => { onSave(); setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1800); }}
              style={{
                padding: '10px 20px', borderRadius: p.radius.sm,
                border: `1px solid ${savedFlash ? p.colors.accent : p.colors.border}`,
                background: savedFlash ? p.colors.accentLighter : 'white',
                cursor: 'pointer', fontSize: '14px', fontWeight: 600,
                color: savedFlash ? p.colors.accentDark : p.colors.body,
              }}>
              {savedFlash ? 'Saved ✓' : 'Save'}
            </button>
          )}
          <button data-testid="button-next" disabled={!canContinue} onClick={onNext} style={{
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
