import { useState } from 'react';
import { getEffectiveTheme } from '@/components/themeUtils';
import { Loader2, PartyPopper, AlertCircle } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface Question {
  id: string;
  label: string;
  type: string;
  options: { label: string; value: string; price_impact: number }[];
}

interface PricingConfig {
  questions: Question[];
  base_price: number;
  currency: string;
}

interface CalculatorData {
  id: number;
  slug: string;
  business_name: string;
  tagline?: string;
  logo_url?: string;
  primary_color?: string;
  pricing_config: PricingConfig;
  theme_overrides?: any;
  cta_button_text?: string;
  lead_thank_you_message?: string;
}

interface CalculatorWidgetProps {
  calculator: CalculatorData;
  isEmbed?: boolean;
}

export default function CalculatorWidget({ calculator, isEmbed = false }: CalculatorWidgetProps) {
  const theme = getEffectiveTheme(calculator.theme_overrides);
  const config = calculator.pricing_config as PricingConfig;
  const questions = config?.questions || [];

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [leadData, setLeadData] = useState({ name: '', email: '', phone: '', company: '' });

  const accentColor = calculator.primary_color || theme.colors.primary;

  const calculateTotal = () => {
    let total = config?.base_price || 0;
    for (const q of questions) {
      const selected = answers[q.id];
      if (selected) {
        const opt = q.options.find(o => o.value === selected);
        if (opt) total += opt.price_impact;
      }
    }
    return Math.max(0, total);
  };

  const handleSelect = (questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
    if (currentQ < questions.length - 1) {
      setTimeout(() => setCurrentQ(prev => prev + 1), 300);
    } else {
      setTimeout(() => setShowResult(true), 300);
    }
  };

  const leadMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/leads', {
        calculator_id: calculator.id,
        name: leadData.name,
        email: leadData.email,
        phone: leadData.phone,
        company: leadData.company,
        quote_amount: calculateTotal(),
        answers,
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to submit.');
      return data;
    },
    onSuccess: () => {
      setLeadSubmitted(true);
    },
  });

  const submitting = leadMutation.isPending;
  const submitError = leadMutation.error ? (leadMutation.error as Error).message : null;

  const handleLeadSubmit = () => {
    leadMutation.mutate();
  };

  const containerStyle: React.CSSProperties = {
    maxWidth: isEmbed ? '100%' : '640px',
    margin: isEmbed ? '0' : '0 auto',
    fontFamily: theme.typography?.fontFamily || 'inherit',
  };

  if (!config || !questions.length) {
    return (
      <div style={{ ...containerStyle, textAlign: 'center', padding: '40px' }}>
        <p style={{ color: theme.colors.muted }}>Calculator configuration not available.</p>
      </div>
    );
  }

  if (leadSubmitted) {
    return (
      <div style={containerStyle}>
        <div style={{
          background: theme.colors.surface,
          borderRadius: theme.radius.xl,
          padding: '40px',
          textAlign: 'center',
          boxShadow: isEmbed ? 'none' : theme.shadows.md,
          border: `1px solid ${theme.colors.border}`,
        }}>
          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}><PartyPopper style={{ width: '48px', height: '48px', color: accentColor }} /></div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: theme.colors.heading, marginBottom: '8px' }}>
            {calculator.lead_thank_you_message || "Thanks! We'll be in touch soon."}
          </h2>
          <p style={{ fontSize: '14px', color: theme.colors.muted }}>Your estimated quote: <strong style={{ color: accentColor }}>${calculateTotal().toLocaleString()}</strong></p>
        </div>
      </div>
    );
  }

  if (showLeadForm) {
    return (
      <div style={containerStyle}>
        <div style={{
          background: theme.colors.surface,
          borderRadius: theme.radius.xl,
          padding: '32px',
          boxShadow: isEmbed ? 'none' : theme.shadows.md,
          border: `1px solid ${theme.colors.border}`,
          borderTop: `4px solid ${accentColor}`,
        }}>
          <h3 style={{ fontSize: '20px', fontWeight: 700, color: theme.colors.heading, marginBottom: '4px' }}>Get Your Detailed Quote</h3>
          <p style={{ fontSize: '14px', color: theme.colors.muted, marginBottom: '20px' }}>Estimated: <strong style={{ color: accentColor }}>${calculateTotal().toLocaleString()}</strong></p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { key: 'name', label: 'Your Name', placeholder: 'John Smith', type: 'text' },
              { key: 'email', label: 'Email Address', placeholder: 'john@company.com', type: 'email' },
              { key: 'phone', label: 'Phone Number', placeholder: '(555) 123-4567', type: 'tel' },
              { key: 'company', label: 'Company (optional)', placeholder: 'Company name', type: 'text' },
            ].map(field => (
              <div key={field.key}>
                <label style={{ fontSize: '12px', fontWeight: 500, color: theme.colors.muted, display: 'block', marginBottom: '4px' }}>{field.label}</label>
                <input
                  data-testid={`lead-input-${field.key}`}
                  type={field.type}
                  value={(leadData as any)[field.key]}
                  onChange={e => setLeadData(prev => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: theme.radius.md, border: `1px solid ${theme.colors.border}`, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            ))}
          </div>
          <button
            data-testid="button-submit-lead"
            onClick={handleLeadSubmit}
            disabled={submitting || !leadData.email}
            style={{
              width: '100%', marginTop: '20px', padding: '12px',
              borderRadius: theme.radius.md, border: 'none',
              backgroundColor: accentColor, color: 'white',
              fontSize: '15px', fontWeight: 600, cursor: submitting ? 'wait' : 'pointer',
              opacity: submitting || !leadData.email ? 0.6 : 1,
            }}
          >
            {submitting ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> Submitting...</span> : (calculator.cta_button_text || 'Get My Free Quote')}
          </button>
          {submitError && (
            <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: theme.radius.md, background: '#FEF2F2', border: '1px solid #FECACA', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle style={{ width: '14px', height: '14px', color: '#DC2626', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: '#DC2626' }}>{submitError}</span>
            </div>
          )}
          <button
            onClick={() => setShowLeadForm(false)}
            style={{ width: '100%', marginTop: '8px', padding: '10px', border: 'none', background: 'transparent', color: theme.colors.muted, fontSize: '13px', cursor: 'pointer' }}
          >
            ← Back to quote
          </button>
        </div>
      </div>
    );
  }

  if (showResult) {
    return (
      <div style={containerStyle}>
        <div style={{
          background: theme.colors.surface,
          borderRadius: theme.radius.xl,
          padding: '32px',
          boxShadow: isEmbed ? 'none' : theme.shadows.md,
          border: `1px solid ${theme.colors.border}`,
          borderTop: `4px solid ${accentColor}`,
          textAlign: 'center',
        }}>
          <p style={{ fontSize: '14px', color: theme.colors.muted, marginBottom: '8px' }}>Your Estimated Quote</p>
          <p style={{ fontSize: '42px', fontWeight: 800, color: accentColor, marginBottom: '20px' }}>
            ${calculateTotal().toLocaleString()}
          </p>
          <div style={{ marginBottom: '24px', textAlign: 'left' }}>
            {questions.map(q => {
              const selected = answers[q.id];
              const opt = q.options.find(o => o.value === selected);
              return opt ? (
                <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.colors.borderLight}`, fontSize: '14px' }}>
                  <span style={{ color: theme.colors.body }}>{q.label}</span>
                  <span style={{ color: theme.colors.heading, fontWeight: 500 }}>{opt.label}</span>
                </div>
              ) : null;
            })}
          </div>
          <button
            data-testid="button-get-quote"
            onClick={() => setShowLeadForm(true)}
            style={{
              width: '100%', padding: '14px',
              borderRadius: theme.radius.md, border: 'none',
              backgroundColor: accentColor, color: 'white',
              fontSize: '15px', fontWeight: 600, cursor: 'pointer',
              boxShadow: theme.shadows.button,
            }}
          >
            {calculator.cta_button_text || 'Get My Free Quote'}
          </button>
          <button
            onClick={() => { setShowResult(false); setCurrentQ(0); setAnswers({}); }}
            style={{ width: '100%', marginTop: '8px', padding: '10px', border: 'none', background: 'transparent', color: theme.colors.muted, fontSize: '13px', cursor: 'pointer' }}
          >
            Start Over
          </button>
        </div>
      </div>
    );
  }

  const question = questions[currentQ];
  if (!question) return null;

  return (
    <div style={containerStyle}>
      {!isEmbed && (
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          {calculator.logo_url && <img src={calculator.logo_url} alt={calculator.business_name} style={{ height: '48px', margin: '0 auto 12px', objectFit: 'contain' }} />}
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: theme.colors.heading }}>{calculator.business_name}</h2>
          {calculator.tagline && <p style={{ fontSize: '14px', color: theme.colors.muted, marginTop: '4px' }}>{calculator.tagline}</p>}
        </div>
      )}
      <div style={{
        background: theme.colors.surface,
        borderRadius: theme.radius.xl,
        padding: '28px',
        boxShadow: isEmbed ? 'none' : theme.shadows.md,
        border: `1px solid ${theme.colors.border}`,
        borderTop: `4px solid ${accentColor}`,
      }}>
        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px' }}>
          {questions.map((_, i) => (
            <div key={i} style={{ flex: 1, height: '3px', borderRadius: '2px', background: i <= currentQ ? accentColor : theme.colors.borderLight, transition: 'all 0.3s ease' }} />
          ))}
        </div>

        <p style={{ fontSize: '12px', color: theme.colors.muted, marginBottom: '4px' }}>Question {currentQ + 1} of {questions.length}</p>
        <h3 style={{ fontSize: '18px', fontWeight: 600, color: theme.colors.heading, marginBottom: '16px' }}>{question.label}</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {question.options.map(opt => {
            const isSelected = answers[question.id] === opt.value;
            return (
              <button
                key={opt.value}
                data-testid={`option-${question.id}-${opt.value}`}
                onClick={() => handleSelect(question.id, opt.value)}
                style={{
                  padding: '14px 16px',
                  borderRadius: theme.radius.md,
                  border: `1.5px solid ${isSelected ? accentColor : theme.colors.border}`,
                  background: isSelected ? `${accentColor}0D` : theme.colors.surface,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '14px',
                  fontWeight: isSelected ? 600 : 400,
                  color: isSelected ? accentColor : theme.colors.body,
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{opt.label}</span>
                {opt.price_impact > 0 && (
                  <span style={{ fontSize: '12px', color: theme.colors.muted, fontWeight: 400 }}>+${opt.price_impact}</span>
                )}
              </button>
            );
          })}
        </div>

        {currentQ > 0 && (
          <button
            onClick={() => setCurrentQ(prev => prev - 1)}
            style={{ marginTop: '16px', padding: '8px 0', border: 'none', background: 'transparent', color: theme.colors.muted, fontSize: '13px', cursor: 'pointer' }}
          >
            ← Previous question
          </button>
        )}
      </div>
    </div>
  );
}
