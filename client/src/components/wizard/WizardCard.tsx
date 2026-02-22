import { useState } from 'react';
import { designTokens } from '@/components/designTokens';
import { Loader2, ArrowRight, ArrowLeft, Check, Sparkles, Wrench, HardHat, SprayCan, Trees, Zap, Paintbrush, Home, Snowflake, Hammer, AlertCircle } from 'lucide-react';
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

  const PRESET_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

  const containerStyle: React.CSSProperties = {
    backgroundColor: t.colors.surface,
    borderRadius: embed ? t.radius.lg : t.radius.xl,
    border: `1px solid ${t.colors.border}`,
    boxShadow: embed ? 'none' : t.shadows.md,
    overflow: 'hidden',
  };

  if (step === 3 && result) {
    const origin = window.location.origin;
    return (
      <div style={containerStyle}>
        <div style={{ padding: t.layout.cardPadding }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Check style={{ width: '28px', height: '28px', color: 'white' }} />
            </div>
            <h2 style={{ ...t.typography.h2, marginBottom: '8px' }}>Your Calculator is Live!</h2>
            <p style={{ ...t.typography.body, color: t.colors.muted }}>Share these links to start collecting leads.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <LinkRow label="Calculator URL" url={`${origin}${result.calculator_url}`} />
            <LinkRow label="Edit Link (7 days)" url={`${origin}${result.edit_url}`} />
            <LinkRow label="Leads Dashboard" url={`${origin}${result.leads_url}`} />
          </div>

          <div style={{ marginTop: '20px', padding: '12px 16px', background: t.colors.blueLighter, borderRadius: t.radius.md, fontSize: '13px', color: t.colors.blue }}>
            <strong>Save these links!</strong> The edit link expires in 7 days.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={{ padding: '12px 24px', borderBottom: `1px solid ${t.colors.border}`, display: 'flex', gap: '8px' }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ flex: 1, height: '4px', borderRadius: '2px', background: i <= step ? t.colors.blue : t.colors.borderLight, transition: t.transitions.fast }} />
        ))}
      </div>

      <div style={{ padding: t.layout.cardPadding }}>
        {step === 0 && (
          <div>
            <h3 style={{ ...t.typography.h3, marginBottom: '4px' }}>What's your trade?</h3>
            <p style={{ ...t.typography.caption, marginBottom: '20px' }}>Select your industry to customize your calculator.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {TRADE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  data-testid={`trade-option-${opt.value}`}
                  onClick={() => { set('trade_type', opt.value); setStep(1); }}
                  style={{
                    padding: '14px 8px',
                    borderRadius: t.radius.md,
                    border: `1.5px solid ${formData.trade_type === opt.value ? t.colors.blue : t.colors.border}`,
                    background: formData.trade_type === opt.value ? t.colors.blueLighter : t.colors.surface,
                    cursor: 'pointer',
                    transition: t.transitions.fast,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: t.colors.heading,
                  }}
                >
                  <opt.Icon style={{ width: '24px', height: '24px', color: formData.trade_type === opt.value ? t.colors.blue : t.colors.muted }} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <h3 style={{ ...t.typography.h3, marginBottom: '4px' }}>Business Details</h3>
            <p style={{ ...t.typography.caption, marginBottom: '20px' }}>Tell us about your business.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ ...t.typography.caption, display: 'block', marginBottom: '6px' }}>Business Name *</label>
                <input
                  data-testid="input-business-name"
                  value={formData.business_name}
                  onChange={e => set('business_name', e.target.value)}
                  placeholder="e.g., Smith Plumbing Co."
                  style={{ width: '100%', padding: '10px 14px', borderRadius: t.radius.md, border: `1px solid ${t.colors.border}`, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ ...t.typography.caption, display: 'block', marginBottom: '6px' }}>Describe your services</label>
                <textarea
                  data-testid="input-business-description"
                  value={formData.business_description}
                  onChange={e => set('business_description', e.target.value)}
                  placeholder="e.g., Residential and commercial plumbing, drain cleaning, water heater installation..."
                  rows={3}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: t.radius.md, border: `1px solid ${t.colors.border}`, fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ ...t.typography.caption, display: 'block', marginBottom: '6px' }}>Your Email (for lead notifications)</label>
                <input
                  data-testid="input-owner-email"
                  type="email"
                  value={formData.owner_email}
                  onChange={e => set('owner_email', e.target.value)}
                  placeholder="you@company.com"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: t.radius.md, border: `1px solid ${t.colors.border}`, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
              <button onClick={() => setStep(0)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px', borderRadius: t.radius.md, border: `1px solid ${t.colors.border}`, background: 'transparent', cursor: 'pointer', fontSize: '14px', fontWeight: 500, color: t.colors.muted }}>
                <ArrowLeft style={{ width: '16px', height: '16px' }} /> Back
              </button>
              <button
                data-testid="button-next-step2"
                onClick={() => formData.business_name && setStep(2)}
                disabled={!formData.business_name}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 22px', borderRadius: t.radius.md, border: 'none', background: formData.business_name ? 'linear-gradient(180deg, #3B82F6 0%, #2563EB 100%)' : t.colors.borderLight, color: formData.business_name ? 'white' : t.colors.subtle, cursor: formData.business_name ? 'pointer' : 'not-allowed', fontSize: '14px', fontWeight: 600, boxShadow: formData.business_name ? t.shadows.button : 'none' }}
              >
                Next <ArrowRight style={{ width: '16px', height: '16px' }} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h3 style={{ ...t.typography.h3, marginBottom: '4px' }}>Choose Your Brand Color</h3>
            <p style={{ ...t.typography.caption, marginBottom: '20px' }}>This color will be used throughout your calculator.</p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '24px' }}>
              {PRESET_COLORS.map(color => (
                <button
                  key={color}
                  data-testid={`color-option-${color.replace('#', '')}`}
                  onClick={() => set('primary_color', color)}
                  style={{
                    width: '36px', height: '36px', borderRadius: '50%', backgroundColor: color,
                    border: formData.primary_color === color ? '3px solid #1e293b' : '2px solid transparent',
                    cursor: 'pointer', transform: formData.primary_color === color ? 'scale(1.15)' : 'scale(1)',
                    transition: t.transitions.fast,
                  }}
                />
              ))}
              <input
                type="color"
                value={formData.primary_color}
                onChange={e => set('primary_color', e.target.value)}
                style={{ width: '36px', height: '36px', borderRadius: '50%', border: `2px solid ${t.colors.border}`, cursor: 'pointer', padding: '2px', background: 'transparent' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setStep(1)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px', borderRadius: t.radius.md, border: `1px solid ${t.colors.border}`, background: 'transparent', cursor: 'pointer', fontSize: '14px', fontWeight: 500, color: t.colors.muted }}>
                <ArrowLeft style={{ width: '16px', height: '16px' }} /> Back
              </button>
              <button
                data-testid="button-generate"
                onClick={handleGenerate}
                disabled={isGenerating}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 22px',
                  borderRadius: t.radius.md, border: 'none',
                  background: 'linear-gradient(180deg, #3B82F6 0%, #2563EB 100%)',
                  color: 'white', cursor: isGenerating ? 'wait' : 'pointer', fontSize: '14px', fontWeight: 600,
                  boxShadow: t.shadows.button, opacity: isGenerating ? 0.7 : 1,
                }}
              >
                {isGenerating ? (
                  <><Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> Generating...</>
                ) : (
                  <><Sparkles style={{ width: '16px', height: '16px' }} /> Generate Calculator</>
                )}
              </button>
            </div>
            {genError && (
              <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: t.radius.md, background: '#FEF2F2', border: '1px solid #FECACA', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle style={{ width: '14px', height: '14px', color: '#DC2626', flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: '#DC2626' }}>{genError}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LinkRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div>
      <label style={{ fontSize: '12px', fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: '4px' }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F9FAFB', borderRadius: '10px', padding: '8px 12px', border: '1px solid #E5E7EB' }}>
        <span style={{ fontSize: '13px', color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</span>
        <button onClick={copy} data-testid={`copy-${label.toLowerCase().replace(/\s/g, '-')}`} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #E5E7EB', background: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: 500, color: copied ? '#16A34A' : '#6B7280', whiteSpace: 'nowrap' }}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
