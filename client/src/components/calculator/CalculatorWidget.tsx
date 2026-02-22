import { useState } from 'react';
import { getEffectiveTheme } from '@/components/themeUtils';
import { Loader2, PartyPopper, AlertCircle, ChevronLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
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
      setTimeout(() => setCurrentQ(prev => prev + 1), 250);
    } else {
      setTimeout(() => setShowResult(true), 250);
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
    fontFamily: theme.typography?.fontFamily || 'Inter, system-ui, sans-serif',
  };

  const cardStyle: React.CSSProperties = {
    background: theme.colors.surface,
    borderRadius: '20px',
    boxShadow: isEmbed ? 'none' : '0 4px 20px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)',
    border: `1px solid ${theme.colors.border}`,
    overflow: 'hidden',
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
        <div className="animate-scale-in" style={{ ...cardStyle, padding: '48px 32px', textAlign: 'center' }}>
          <div className="animate-checkmark" style={{ width: '72px', height: '72px', borderRadius: '50%', background: `linear-gradient(135deg, ${accentColor}, ${accentColor}dd)`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: `0 8px 30px ${accentColor}30` }}>
            <PartyPopper style={{ width: '36px', height: '36px', color: 'white' }} />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: theme.colors.heading, marginBottom: '10px', letterSpacing: '-0.01em' }}>
            {calculator.lead_thank_you_message || "Thanks! We'll be in touch soon."}
          </h2>
          <p style={{ fontSize: '15px', color: theme.colors.muted, lineHeight: 1.6 }}>
            Your estimated quote: <strong style={{ color: accentColor, fontSize: '18px' }}>${calculateTotal().toLocaleString()}</strong>
          </p>
        </div>
      </div>
    );
  }

  if (showLeadForm) {
    return (
      <div style={containerStyle}>
        <div className="animate-fade-in" style={cardStyle}>
          <div style={{ padding: '8px 0 0', borderTop: `4px solid ${accentColor}` }} />
          <div style={{ padding: '28px 32px 32px' }}>
            <h3 style={{ fontSize: '21px', fontWeight: 700, color: theme.colors.heading, marginBottom: '4px', letterSpacing: '-0.01em' }}>Get Your Detailed Quote</h3>
            <p style={{ fontSize: '14px', color: theme.colors.muted, marginBottom: '24px' }}>
              Estimated total: <strong style={{ color: accentColor, fontSize: '16px' }}>${calculateTotal().toLocaleString()}</strong>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                { key: 'name', label: 'Your Name', placeholder: 'John Smith', type: 'text' },
                { key: 'email', label: 'Email Address', placeholder: 'john@company.com', type: 'email' },
                { key: 'phone', label: 'Phone Number', placeholder: '(555) 123-4567', type: 'tel' },
                { key: 'company', label: 'Company (optional)', placeholder: 'Company name', type: 'text' },
              ].map((field, i) => (
                <div key={field.key} className="animate-fade-in-up" style={{ animationDelay: `${i * 50}ms` }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: theme.colors.muted, display: 'block', marginBottom: '5px', letterSpacing: '0.01em' }}>{field.label}</label>
                  <input
                    data-testid={`lead-input-${field.key}`}
                    type={field.type}
                    value={(leadData as any)[field.key]}
                    onChange={e => setLeadData(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="premium-input"
                    style={{ width: '100%', padding: '11px 16px', borderRadius: '10px', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
              ))}
            </div>
            <button
              data-testid="button-submit-lead"
              onClick={handleLeadSubmit}
              disabled={submitting || !leadData.email}
              style={{
                width: '100%', marginTop: '24px', padding: '14px',
                borderRadius: '12px', border: 'none',
                background: submitting || !leadData.email ? '#CBD5E1' : `linear-gradient(135deg, ${accentColor}, ${accentColor}dd)`,
                color: submitting || !leadData.email ? '#94A3B8' : 'white',
                fontSize: '15px', fontWeight: 600, cursor: submitting ? 'wait' : !leadData.email ? 'not-allowed' : 'pointer',
                boxShadow: submitting || !leadData.email ? 'none' : `0 4px 14px ${accentColor}30`,
                transition: 'all 0.2s ease',
                letterSpacing: '0.01em',
              }}
            >
              {submitting ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> Submitting...
                </span>
              ) : (calculator.cta_button_text || 'Get My Free Quote')}
            </button>
            {submitError && (
              <div className="animate-fade-in" style={{ marginTop: '10px', padding: '10px 14px', borderRadius: '10px', background: '#FEF2F2', border: '1px solid #FCA5A5', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle style={{ width: '14px', height: '14px', color: '#DC2626', flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: '#991B1B' }}>{submitError}</span>
              </div>
            )}
            <button
              data-testid="button-back-to-quote"
              onClick={() => setShowLeadForm(false)}
              style={{ width: '100%', marginTop: '10px', padding: '10px', border: 'none', background: 'transparent', color: theme.colors.muted, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
            >
              <ChevronLeft style={{ width: '14px', height: '14px' }} /> Back to quote
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showResult) {
    return (
      <div style={containerStyle}>
        <div className="animate-scale-in" style={cardStyle}>
          <div style={{ padding: '8px 0 0', borderTop: `4px solid ${accentColor}` }} />
          <div style={{ padding: '36px 32px 32px', textAlign: 'center' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: theme.colors.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Your Estimated Quote</p>
            <p className="animate-count-up" style={{ fontSize: '48px', fontWeight: 800, color: accentColor, marginBottom: '24px', letterSpacing: '-0.02em', lineHeight: 1 }}>
              ${calculateTotal().toLocaleString()}
            </p>
            <div style={{ marginBottom: '28px', textAlign: 'left' }}>
              {questions.map(q => {
                const selected = answers[q.id];
                const opt = q.options.find(o => o.value === selected);
                return opt ? (
                  <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${theme.colors.borderLight}`, fontSize: '14px' }}>
                    <span style={{ color: theme.colors.body }}>{q.label}</span>
                    <span style={{ color: theme.colors.heading, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 style={{ width: '14px', height: '14px', color: accentColor }} />
                      {opt.label}
                    </span>
                  </div>
                ) : null;
              })}
            </div>
            <button
              data-testid="button-get-quote"
              onClick={() => setShowLeadForm(true)}
              style={{
                width: '100%', padding: '15px',
                borderRadius: '12px', border: 'none',
                background: `linear-gradient(135deg, ${accentColor}, ${accentColor}dd)`,
                color: 'white',
                fontSize: '16px', fontWeight: 600, cursor: 'pointer',
                boxShadow: `0 4px 16px ${accentColor}30`,
                transition: 'all 0.2s ease',
                letterSpacing: '0.01em',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}
            >
              {calculator.cta_button_text || 'Get My Free Quote'}
              <ArrowRight style={{ width: '18px', height: '18px' }} />
            </button>
            <button
              data-testid="button-start-over"
              onClick={() => { setShowResult(false); setCurrentQ(0); setAnswers({}); }}
              style={{ width: '100%', marginTop: '10px', padding: '10px', border: 'none', background: 'transparent', color: theme.colors.muted, fontSize: '13px', cursor: 'pointer' }}
            >
              Start Over
            </button>
          </div>
        </div>
      </div>
    );
  }

  const question = questions[currentQ];
  if (!question) return null;

  return (
    <div style={containerStyle}>
      {!isEmbed && (
        <div className="animate-fade-in" style={{ textAlign: 'center', marginBottom: '28px' }}>
          {calculator.logo_url && <img src={calculator.logo_url} alt={calculator.business_name} style={{ height: '48px', margin: '0 auto 14px', objectFit: 'contain' }} />}
          <h2 style={{ fontSize: '26px', fontWeight: 700, color: theme.colors.heading, letterSpacing: '-0.01em' }}>{calculator.business_name}</h2>
          {calculator.tagline && <p style={{ fontSize: '15px', color: theme.colors.muted, marginTop: '4px' }}>{calculator.tagline}</p>}
        </div>
      )}
      <div className="animate-fade-in" style={cardStyle}>
        <div style={{ padding: '8px 0 0', borderTop: `4px solid ${accentColor}` }} />
        <div style={{ padding: '24px 28px 28px' }}>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '20px' }}>
            {questions.map((_, i) => (
              <div key={i} style={{
                flex: 1, height: '4px', borderRadius: '2px',
                background: i <= currentQ ? accentColor : theme.colors.borderLight,
                transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: i <= currentQ ? `0 0 6px ${accentColor}20` : 'none',
              }} />
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <p style={{ fontSize: '12px', fontWeight: 600, color: theme.colors.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Question {currentQ + 1} of {questions.length}
            </p>
            {currentQ > 0 && (
              <button
                data-testid="button-prev-question"
                onClick={() => setCurrentQ(prev => prev - 1)}
                style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '4px 8px', border: 'none', background: 'transparent', color: theme.colors.muted, fontSize: '12px', fontWeight: 500, cursor: 'pointer', borderRadius: '6px', transition: 'all 0.15s ease' }}
              >
                <ChevronLeft style={{ width: '14px', height: '14px' }} /> Back
              </button>
            )}
          </div>
          <h3 className="animate-fade-in" key={`q-${currentQ}`} style={{ fontSize: '19px', fontWeight: 600, color: theme.colors.heading, marginBottom: '18px', lineHeight: 1.4 }}>
            {question.label}
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {question.options.map((opt, idx) => {
              const isSelected = answers[question.id] === opt.value;
              return (
                <button
                  key={opt.value}
                  data-testid={`option-${question.id}-${opt.value}`}
                  onClick={() => handleSelect(question.id, opt.value)}
                  className="animate-fade-in-up"
                  style={{
                    animationDelay: `${idx * 40}ms`,
                    padding: '15px 18px',
                    borderRadius: '12px',
                    border: `1.5px solid ${isSelected ? accentColor : theme.colors.border}`,
                    background: isSelected ? `${accentColor}08` : theme.colors.surface,
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '15px',
                    fontWeight: isSelected ? 600 : 400,
                    color: isSelected ? accentColor : theme.colors.body,
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxShadow: isSelected ? `0 2px 8px ${accentColor}15` : '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLElement).style.borderColor = theme.colors.borderHover || '#CBD5E1';
                      (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLElement).style.borderColor = theme.colors.border;
                      (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)';
                    }
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                      border: isSelected ? `6px solid ${accentColor}` : `2px solid ${theme.colors.border}`,
                      transition: 'all 0.2s ease',
                      boxSizing: 'border-box',
                    }} />
                    {opt.label}
                  </span>
                  {opt.price_impact > 0 && (
                    <span style={{ fontSize: '12px', color: theme.colors.muted, fontWeight: 500, background: theme.colors.borderLight, padding: '3px 8px', borderRadius: '6px' }}>
                      +${opt.price_impact}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
