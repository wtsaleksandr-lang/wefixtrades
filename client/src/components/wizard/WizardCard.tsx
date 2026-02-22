import { useState } from 'react';
import { designTokens } from '@/components/designTokens';
import { Loader2, ArrowRight, ArrowLeft, Check, Sparkles, Wrench, HardHat, SprayCan, Trees, Zap, Paintbrush, Home, Snowflake, Hammer, AlertCircle, Copy, ExternalLink } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface WizardCardProps {
  embed?: boolean;
  onComplete?: (result: any) => void;
}

const TRADE_OPTIONS = [
  { label: 'Plumbing', value: 'plumbing', Icon: Wrench },
  { label: 'Concrete / Masonry', value: 'concrete', Icon: HardHat },
  { label: 'Cleaning', value: 'cleaning', Icon: SprayCan },
  { label: 'Landscaping', value: 'landscaping', Icon: Trees },
  { label: 'Electrical', value: 'electrical', Icon: Zap },
  { label: 'Painting', value: 'painting', Icon: Paintbrush },
  { label: 'Roofing', value: 'roofing', Icon: Home },
  { label: 'HVAC', value: 'hvac', Icon: Snowflake },
  { label: 'Other', value: 'other', Icon: Hammer },
];

const STEP_LABELS = ['Select Trade', 'Business Info', 'Brand Color'];

const PRESET_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

export default function WizardCard({ embed = false }: WizardCardProps) {
  const t = designTokens;
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState({
    trade_type: '',
    business_name: '',
    business_description: '',
    owner_email: '',
    primary_color: '#6366f1',
  });
  const [result, setResult] = useState<any>(null);

  const set = (key: string, val: string) => setFormData(prev => ({ ...prev, [key]: val }));

  const generateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const aiRes = await apiRequest('POST', '/api/ai/generate-pricing', {
        trade_type: data.trade_type,
        business_description: data.business_description || data.trade_type,
        services: data.business_description || data.trade_type,
      });
      const aiData = await aiRes.json();

      if (!aiData.success || !aiData.pricing_config) {
        throw new Error(aiData.error || 'Failed to generate pricing. Please try again.');
      }

      const createRes = await apiRequest('POST', '/api/calculators', {
        business_name: data.business_name,
        trade_type: data.trade_type,
        owner_email: data.owner_email || undefined,
        pricing_config: aiData.pricing_config,
        primary_color: data.primary_color,
      });
      const createData = await createRes.json();

      if (!createData.success) {
        throw new Error(createData.error || 'Failed to create calculator.');
      }

      return createData;
    },
    onSuccess: (data) => {
      setResult(data);
      setStep(3);
    },
  });

  const handleGenerate = () => {
    if (!formData.business_name || !formData.trade_type) return;
    generateMutation.mutate(formData);
  };

  const isGenerating = generateMutation.isPending;
  const genError = generateMutation.error ? (generateMutation.error as Error).message : null;

  if (step === 3 && result) {
    const origin = window.location.origin;
    return (
      <div className="glass-strong rounded-2xl border border-slate-200/70 overflow-hidden" style={{ boxShadow: t.shadows.lg }}>
        <div style={{ padding: '40px 32px' }}>
          <div className="text-center mb-8 animate-fade-in-up">
            <div className="animate-checkmark" style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 8px 24px rgba(16, 185, 129, 0.25)' }}>
              <Check style={{ width: '30px', height: '30px', color: 'white' }} />
            </div>
            <h2 style={{ fontSize: '24px', fontWeight: 700, color: t.colors.heading, marginBottom: '6px', letterSpacing: '-0.01em' }}>Your Calculator is Live</h2>
            <p style={{ fontSize: '14px', color: t.colors.muted }}>Share these links to start collecting leads.</p>
          </div>

          <div className="animate-fade-in-up animation-delay-200" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <LinkRow label="Calculator URL" url={`${origin}${result.calculator_url}`} icon={<ExternalLink style={{ width: '14px', height: '14px' }} />} />
            <LinkRow label="Edit Link (7 days)" url={`${origin}${result.edit_url}`} icon={<Sparkles style={{ width: '14px', height: '14px' }} />} />
            <LinkRow label="Leads Dashboard" url={`${origin}${result.leads_url}`} icon={<Zap style={{ width: '14px', height: '14px' }} />} />
          </div>

          <div className="animate-fade-in-up animation-delay-300" style={{ marginTop: '24px', padding: '14px 18px', background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)', borderRadius: t.radius.md, fontSize: '13px', color: '#4338CA', display: 'flex', alignItems: 'flex-start', gap: '10px', border: '1px solid rgba(99,102,241,0.15)' }}>
            <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0, marginTop: '1px' }} />
            <span><strong>Bookmark these links.</strong> The edit link expires in 7 days. You can duplicate it to extend access.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-strong rounded-2xl border border-slate-200/70 overflow-hidden" style={{ boxShadow: t.shadows.lg }}>
      <div style={{ padding: '16px 28px 12px', borderBottom: '1px solid rgba(226,232,240,0.7)', display: 'flex', alignItems: 'center', gap: '0' }}>
        {STEP_LABELS.map((label, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700,
                background: i < step ? 'linear-gradient(135deg, #059669, #10b981)' : i === step ? 'linear-gradient(135deg, #2563EB, #3B82F6)' : '#F1F5F9',
                color: i <= step ? 'white' : t.colors.subtle,
                transition: t.transitions.normal,
                boxShadow: i === step ? '0 2px 8px rgba(37,99,235,0.25)' : i < step ? '0 2px 8px rgba(16,185,129,0.2)' : 'none',
              }}>
                {i < step ? <Check style={{ width: '14px', height: '14px' }} /> : i + 1}
              </div>
              <span style={{ fontSize: '13px', fontWeight: i === step ? 600 : 500, color: i <= step ? t.colors.heading : t.colors.subtle, transition: t.transitions.fast, whiteSpace: 'nowrap' }}>
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div style={{ width: '100%', height: '2px', background: i < step ? '#10b981' : '#E2E8F0', borderRadius: '1px', margin: '0 8px', transition: t.transitions.normal }} />
            )}
          </div>
        ))}
      </div>

      <div style={{ padding: '28px 32px 32px' }}>
        {step === 0 && (
          <div className="animate-fade-in">
            <h3 style={{ ...t.typography.h3, marginBottom: '4px' }}>What's your trade?</h3>
            <p style={{ ...t.typography.caption, marginBottom: '24px' }}>Select your industry to customize your calculator.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {TRADE_OPTIONS.map((opt, idx) => (
                <button
                  key={opt.value}
                  data-testid={`trade-option-${opt.value}`}
                  onClick={() => { set('trade_type', opt.value); setStep(1); }}
                  className="animate-fade-in-up"
                  style={{
                    animationDelay: `${idx * 30}ms`,
                    padding: '16px 10px',
                    borderRadius: t.radius.md,
                    border: `1.5px solid ${formData.trade_type === opt.value ? '#3B82F6' : t.colors.border}`,
                    background: formData.trade_type === opt.value ? '#EFF6FF' : 'white',
                    cursor: 'pointer',
                    transition: t.transitions.normal,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: formData.trade_type === opt.value ? '#2563EB' : t.colors.heading,
                    boxShadow: formData.trade_type === opt.value ? '0 2px 8px rgba(37,99,235,0.12)' : t.shadows.xs,
                  }}
                  onMouseEnter={e => {
                    if (formData.trade_type !== opt.value) {
                      (e.currentTarget as HTMLElement).style.borderColor = '#CBD5E1';
                      (e.currentTarget as HTMLElement).style.boxShadow = t.shadows.sm;
                    }
                  }}
                  onMouseLeave={e => {
                    if (formData.trade_type !== opt.value) {
                      (e.currentTarget as HTMLElement).style.borderColor = t.colors.border;
                      (e.currentTarget as HTMLElement).style.boxShadow = t.shadows.xs;
                    }
                  }}
                >
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '10px',
                    background: formData.trade_type === opt.value ? 'linear-gradient(135deg, #2563EB, #3B82F6)' : '#F8FAFC',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: t.transitions.normal,
                  }}>
                    <opt.Icon style={{ width: '20px', height: '20px', color: formData.trade_type === opt.value ? 'white' : t.colors.muted }} />
                  </div>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="animate-fade-in">
            <h3 style={{ ...t.typography.h3, marginBottom: '4px' }}>Business Details</h3>
            <p style={{ ...t.typography.caption, marginBottom: '24px' }}>Tell us about your business to generate accurate pricing.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <label style={{ ...t.typography.label, display: 'block', marginBottom: '6px' }}>Business Name *</label>
                <input
                  data-testid="input-business-name"
                  value={formData.business_name}
                  onChange={e => set('business_name', e.target.value)}
                  placeholder="e.g., Smith Plumbing Co."
                  className="premium-input"
                  style={{ width: '100%', padding: '11px 16px', borderRadius: t.radius.md, fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ ...t.typography.label, display: 'block', marginBottom: '6px' }}>Describe your services</label>
                <textarea
                  data-testid="input-business-description"
                  value={formData.business_description}
                  onChange={e => set('business_description', e.target.value)}
                  placeholder="e.g., Residential and commercial plumbing, drain cleaning, water heater installation..."
                  rows={3}
                  className="premium-input"
                  style={{ width: '100%', padding: '11px 16px', borderRadius: t.radius.md, fontSize: '14px', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ ...t.typography.label, display: 'block', marginBottom: '6px' }}>Your Email <span style={{ fontWeight: 400, color: t.colors.subtle }}>(for lead notifications)</span></label>
                <input
                  data-testid="input-owner-email"
                  type="email"
                  value={formData.owner_email}
                  onChange={e => set('owner_email', e.target.value)}
                  placeholder="you@company.com"
                  className="premium-input"
                  style={{ width: '100%', padding: '11px 16px', borderRadius: t.radius.md, fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '28px' }}>
              <BackButton onClick={() => setStep(0)} />
              <PrimaryButton
                testId="button-next-step2"
                onClick={() => formData.business_name && setStep(2)}
                disabled={!formData.business_name}
              >
                Next <ArrowRight style={{ width: '16px', height: '16px' }} />
              </PrimaryButton>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-fade-in">
            <h3 style={{ ...t.typography.h3, marginBottom: '4px' }}>Choose Your Brand Color</h3>
            <p style={{ ...t.typography.caption, marginBottom: '24px' }}>This color will be used throughout your calculator.</p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '28px' }}>
              {PRESET_COLORS.map(color => (
                <button
                  key={color}
                  data-testid={`color-option-${color.replace('#', '')}`}
                  onClick={() => set('primary_color', color)}
                  style={{
                    width: '40px', height: '40px', borderRadius: '50%', backgroundColor: color,
                    border: formData.primary_color === color ? '3px solid #0F172A' : '2px solid transparent',
                    cursor: 'pointer', transform: formData.primary_color === color ? 'scale(1.15)' : 'scale(1)',
                    transition: designTokens.transitions.spring,
                    boxShadow: formData.primary_color === color ? `0 4px 14px ${color}50` : '0 1px 3px rgba(0,0,0,0.1)',
                    outline: 'none',
                  }}
                />
              ))}
              <div style={{ width: '1px', height: '28px', background: t.colors.border, margin: '0 4px' }} />
              <input
                data-testid="input-custom-color"
                type="color"
                value={formData.primary_color}
                onChange={e => set('primary_color', e.target.value)}
                style={{ width: '40px', height: '40px', borderRadius: '50%', border: `2px solid ${t.colors.border}`, cursor: 'pointer', padding: '3px', background: 'white' }}
              />
            </div>

            <div style={{ padding: '16px 20px', borderRadius: t.radius.md, border: `1.5px solid ${t.colors.border}`, display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px', background: '#FAFBFC' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: formData.primary_color, transition: t.transitions.normal, flexShrink: 0, boxShadow: `0 4px 12px ${formData.primary_color}30` }} />
              <div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: t.colors.heading, marginBottom: '2px' }}>{formData.business_name}</p>
                <p style={{ fontSize: '12px', color: t.colors.muted }}>Preview of your brand identity</p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <BackButton onClick={() => setStep(1)} />
              <PrimaryButton
                testId="button-generate"
                onClick={handleGenerate}
                disabled={isGenerating}
                loading={isGenerating}
              >
                {isGenerating ? (
                  <><Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> Generating...</>
                ) : (
                  <><Sparkles style={{ width: '16px', height: '16px' }} /> Generate Calculator</>
                )}
              </PrimaryButton>
            </div>
            {genError && (
              <div className="animate-fade-in-up" style={{ marginTop: '14px', padding: '12px 16px', borderRadius: t.radius.md, background: '#FEF2F2', border: '1px solid #FCA5A5', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertCircle style={{ width: '15px', height: '15px', color: '#DC2626', flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: '#991B1B' }}>{genError}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  const t = designTokens;
  return (
    <button
      data-testid="button-back"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px',
        borderRadius: t.radius.md, border: `1.5px solid ${t.colors.border}`,
        background: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: 500,
        color: t.colors.muted, transition: t.transitions.fast,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = t.colors.borderHover; (e.currentTarget as HTMLElement).style.color = t.colors.body; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = t.colors.border; (e.currentTarget as HTMLElement).style.color = t.colors.muted; }}
    >
      <ArrowLeft style={{ width: '16px', height: '16px' }} /> Back
    </button>
  );
}

function PrimaryButton({ children, onClick, disabled, loading, testId }: { children: any; onClick: () => void; disabled?: boolean; loading?: boolean; testId?: string }) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 24px',
        borderRadius: '12px', border: 'none',
        background: disabled && !loading ? '#CBD5E1' : 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
        color: disabled && !loading ? '#94A3B8' : 'white',
        cursor: disabled ? (loading ? 'wait' : 'not-allowed') : 'pointer',
        fontSize: '14px', fontWeight: 600,
        boxShadow: disabled ? 'none' : '0 2px 8px rgba(37,99,235,0.25), 0 1px 3px rgba(37,99,235,0.1)',
        transition: 'all 0.2s ease',
        opacity: loading ? 0.85 : 1,
      }}
    >
      {children}
    </button>
  );
}

function LinkRow({ label, url, icon }: { label: string; url: string; icon?: any }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div>
      <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px', letterSpacing: '0.01em' }}>
        {icon}
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F8FAFC', borderRadius: '10px', padding: '10px 14px', border: '1px solid #E2E8F0' }}>
        <span style={{ fontSize: '13px', color: '#334155', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{url}</span>
        <button
          onClick={copy}
          data-testid={`copy-${label.toLowerCase().replace(/\s/g, '-')}`}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '5px 12px', borderRadius: '8px',
            border: '1px solid #E2E8F0', background: 'white',
            cursor: 'pointer', fontSize: '12px', fontWeight: 600,
            color: copied ? '#059669' : '#64748B',
            transition: 'all 0.15s ease',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          }}
        >
          {copied ? <><Check style={{ width: '12px', height: '12px' }} /> Copied</> : <><Copy style={{ width: '12px', height: '12px' }} /> Copy</>}
        </button>
      </div>
    </div>
  );
}
