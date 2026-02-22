import { useState, useEffect, useRef, useCallback } from 'react';
import { designTokens } from '@/components/designTokens';
import { CATEGORIES, TRADES, getTradesByCategory, type Trade } from '@/data/trades';
import {
  Loader2, ArrowRight, ArrowLeft, Check, Sparkles, Wrench, Hammer,
  Layers, AlertTriangle, Car, Briefcase, Plus, HelpCircle, X,
  Search, ChevronDown, ExternalLink, Copy, Zap, AlertCircle
} from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

const ICON_MAP: Record<string, any> = {
  Sparkles, Hammer, Layers, Wrench, AlertTriangle, Car, Briefcase, Plus,
};

interface WizardCardProps {
  embed?: boolean;
  onComplete?: (result: any) => void;
}

interface CustomRequest {
  serviceOffered: string;
  pricingMethod: string;
  website: string;
  email: string;
  submitted: boolean;
}

interface WizardState {
  businessName: string;
  selectedCategory: string;
  selectedTrade: string;
  customRequest: CustomRequest;
  ownerEmail: string;
  businessDescription: string;
  primaryColor: string;
}

const INITIAL_CUSTOM_REQUEST: CustomRequest = {
  serviceOffered: '',
  pricingMethod: '',
  website: '',
  email: '',
  submitted: false,
};

const INITIAL_STATE: WizardState = {
  businessName: '',
  selectedCategory: '',
  selectedTrade: '',
  customRequest: { ...INITIAL_CUSTOM_REQUEST },
  ownerEmail: '',
  businessDescription: '',
  primaryColor: '#2563EB',
};

function loadSavedState(): WizardState {
  try {
    const saved = localStorage.getItem('quickquote_wizard_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...INITIAL_STATE, ...parsed };
    }
  } catch {}
  return { ...INITIAL_STATE };
}

export default function WizardCard({ embed = false }: WizardCardProps) {
  const t = designTokens;
  const [step, setStep] = useState(0);
  const [wizardState, setWizardState] = useState<WizardState>(loadSavedState);
  const [showHelp, setShowHelp] = useState(false);
  const [tradeSearch, setTradeSearch] = useState('');
  const [tradeDropdownOpen, setTradeDropdownOpen] = useState(false);
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({});
  const [customSubmitting, setCustomSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    localStorage.setItem('quickquote_wizard_state', JSON.stringify(wizardState));
  }, [wizardState]);

  const updateState = useCallback((key: keyof WizardState, val: any) => {
    setWizardState(prev => ({ ...prev, [key]: val }));
  }, []);

  const updateCustomRequest = useCallback((key: keyof CustomRequest, val: any) => {
    setWizardState(prev => ({
      ...prev,
      customRequest: { ...prev.customRequest, [key]: val },
    }));
    if (customErrors[key]) {
      setCustomErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
    }
  }, [customErrors]);

  const filteredTrades = wizardState.selectedCategory && wizardState.selectedCategory !== 'custom'
    ? getTradesByCategory(wizardState.selectedCategory)
    : [];

  const searchedTrades = tradeSearch
    ? filteredTrades.filter(t => t.label.toLowerCase().includes(tradeSearch.toLowerCase()))
    : filteredTrades;

  const handleCategorySelect = (catId: string) => {
    if (catId === wizardState.selectedCategory) return;
    setWizardState(prev => ({
      ...prev,
      selectedCategory: catId,
      selectedTrade: '',
      customRequest: catId !== 'custom' ? { ...INITIAL_CUSTOM_REQUEST } : prev.customRequest,
    }));
    setTradeSearch('');
    setTradeDropdownOpen(false);
  };

  const handleTradeSelect = (trade: Trade) => {
    updateState('selectedTrade', trade.id);
    setTradeDropdownOpen(false);
    setTradeSearch('');
  };

  const validateCustomRequest = () => {
    const errors: Record<string, string> = {};
    if (!wizardState.customRequest.serviceOffered.trim()) {
      errors.serviceOffered = 'Please describe the service you offer.';
    }
    if (!wizardState.customRequest.email.trim()) {
      errors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(wizardState.customRequest.email)) {
      errors.email = 'Please enter a valid email address.';
    }
    setCustomErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCustomSubmit = async () => {
    if (!validateCustomRequest()) return;
    setCustomSubmitting(true);
    await new Promise(r => setTimeout(r, 1500));
    updateCustomRequest('submitted', true);
    setCustomSubmitting(false);
  };

  const canContinue = () => {
    if (!wizardState.businessName.trim()) return false;
    if (!wizardState.selectedCategory) return false;
    if (wizardState.selectedCategory === 'custom') {
      return wizardState.customRequest.submitted;
    }
    if (!wizardState.selectedTrade) return false;
    return true;
  };

  const handleContinue = () => {
    if (!canContinue()) return;
    setStep(1);
  };

  const generateMutation = useMutation({
    mutationFn: async () => {
      const tradeLabel = TRADES.find(t => t.id === wizardState.selectedTrade)?.label || wizardState.selectedCategory;
      const aiRes = await apiRequest('POST', '/api/ai/generate-pricing', {
        trade_type: tradeLabel,
        business_description: wizardState.businessDescription || tradeLabel,
        services: wizardState.businessDescription || tradeLabel,
      });
      const aiData = await aiRes.json();
      if (!aiData.success || !aiData.pricing_config) {
        throw new Error(aiData.error || 'Failed to generate pricing.');
      }
      const createRes = await apiRequest('POST', '/api/calculators', {
        business_name: wizardState.businessName,
        trade_type: tradeLabel,
        owner_email: wizardState.ownerEmail || undefined,
        pricing_config: aiData.pricing_config,
        primary_color: wizardState.primaryColor,
      });
      const createData = await createRes.json();
      if (!createData.success) throw new Error(createData.error || 'Failed to create calculator.');
      return createData;
    },
    onSuccess: (data) => { setResult(data); setStep(3); },
  });

  const isGenerating = generateMutation.isPending;
  const genError = generateMutation.error ? (generateMutation.error as Error).message : null;

  if (step === 3 && result) {
    const origin = window.location.origin;
    return (
      <WizardShell step={3} totalSteps={6} onHelp={() => setShowHelp(true)}>
        <div className="text-center mb-8 animate-fade-in-up">
          <div className="animate-checkmark" style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 8px 24px rgba(16, 185, 129, 0.25)' }}>
            <Check style={{ width: '30px', height: '30px', color: 'white' }} />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: t.colors.heading, marginBottom: '6px' }}>Your Calculator is Live</h2>
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
        {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      </WizardShell>
    );
  }

  const selectedTradeLabel = TRADES.find(t => t.id === wizardState.selectedTrade)?.label || '';

  return (
    <>
      <WizardShell step={step} totalSteps={6} onHelp={() => setShowHelp(true)}>
        {step === 0 && (
          <div className="animate-fade-in">
            <StepHeader step={1} title="Business Details" subtitle="This info appears on your quote page." />

            <div style={{ marginBottom: '24px' }}>
              <label htmlFor="business-name" style={{ ...t.typography.label, display: 'block', marginBottom: '8px', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.05em' }}>
                Business Name <span style={{ color: t.colors.danger }}>*</span>
              </label>
              <input
                id="business-name"
                data-testid="input-business-name"
                value={wizardState.businessName}
                onChange={e => updateState('businessName', e.target.value)}
                placeholder="e.g. Sunshine Cleaning Co."
                className="premium-input"
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: t.radius.md,
                  fontSize: '15px', boxSizing: 'border-box',
                  border: `1.5px solid ${t.colors.border}`, background: '#FFFFFF',
                  transition: t.transitions.fast,
                }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ ...t.typography.label, display: 'block', marginBottom: '6px', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.05em' }}>
                Service Category <span style={{ color: t.colors.danger }}>*</span>
              </label>
              <p style={{ fontSize: '13px', color: t.colors.muted, marginBottom: '16px', lineHeight: 1.5 }}>
                Select your primary service. We'll generate a tailored pricing structure.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '20px' }}>
              {CATEGORIES.map((cat) => {
                const Icon = ICON_MAP[cat.icon] || Plus;
                const isSelected = wizardState.selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    data-testid={`category-${cat.id}`}
                    onClick={() => handleCategorySelect(cat.id)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                      padding: '20px 12px', borderRadius: t.radius.lg, cursor: 'pointer',
                      border: isSelected ? '2px solid #2563EB' : `1.5px solid ${t.colors.border}`,
                      background: isSelected ? '#EFF6FF' : '#FFFFFF',
                      transition: t.transitions.normal,
                      boxShadow: isSelected ? '0 0 0 3px rgba(37,99,235,0.12), 0 2px 8px rgba(37,99,235,0.1)' : t.shadows.xs,
                      position: 'relative',
                      outline: 'none',
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) {
                        (e.currentTarget as HTMLElement).style.borderColor = '#CBD5E1';
                        (e.currentTarget as HTMLElement).style.boxShadow = t.shadows.sm;
                        (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) {
                        (e.currentTarget as HTMLElement).style.borderColor = t.colors.border;
                        (e.currentTarget as HTMLElement).style.boxShadow = t.shadows.xs;
                        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                      }
                    }}
                    onMouseDown={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.98)'; }}
                    onMouseUp={e => { (e.currentTarget as HTMLElement).style.transform = isSelected ? 'translateY(0)' : 'translateY(-1px)'; }}
                  >
                    {isSelected && (
                      <div style={{
                        position: 'absolute', top: '8px', right: '8px',
                        width: '20px', height: '20px', borderRadius: '50%',
                        background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Check style={{ width: '12px', height: '12px', color: 'white' }} />
                      </div>
                    )}
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '12px',
                      background: isSelected ? 'linear-gradient(135deg, #2563EB, #3B82F6)' : '#F1F5F9',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: t.transitions.normal,
                    }}>
                      <Icon style={{ width: '20px', height: '20px', color: isSelected ? 'white' : t.colors.muted }} />
                    </div>
                    <span style={{
                      fontSize: '13px', fontWeight: 500, textAlign: 'center', lineHeight: 1.3,
                      color: isSelected ? '#1D4ED8' : t.colors.heading,
                    }}>
                      {cat.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {wizardState.selectedCategory && wizardState.selectedCategory !== 'custom' && (
              <TradeDropdown
                trades={filteredTrades}
                searchedTrades={searchedTrades}
                selectedTradeId={wizardState.selectedTrade}
                selectedTradeLabel={selectedTradeLabel}
                tradeSearch={tradeSearch}
                isOpen={tradeDropdownOpen}
                onSearch={setTradeSearch}
                onToggle={() => setTradeDropdownOpen(p => !p)}
                onSelect={handleTradeSelect}
                onClose={() => setTradeDropdownOpen(false)}
              />
            )}

            {wizardState.selectedCategory === 'custom' && (
              <CustomRequestPanel
                customRequest={wizardState.customRequest}
                errors={customErrors}
                submitting={customSubmitting}
                onUpdate={updateCustomRequest}
                onSubmit={handleCustomSubmit}
              />
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '28px', paddingTop: '20px', borderTop: `1px solid ${t.colors.borderLight}` }}>
              <BackButton onClick={() => {}} disabled={true} />
              <ContinueButton
                testId="button-continue-step1"
                onClick={handleContinue}
                disabled={!canContinue()}
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="animate-fade-in">
            <StepHeader step={2} title="Business Info" subtitle="Tell us about your business to generate accurate pricing." />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <label htmlFor="biz-desc" style={{ ...t.typography.label, display: 'block', marginBottom: '8px', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.05em' }}>
                  Describe your services
                </label>
                <textarea
                  id="biz-desc"
                  data-testid="input-business-description"
                  value={wizardState.businessDescription}
                  onChange={e => updateState('businessDescription', e.target.value)}
                  placeholder="e.g., Residential and commercial plumbing, drain cleaning, water heater installation..."
                  rows={3}
                  className="premium-input"
                  style={{ width: '100%', padding: '12px 16px', borderRadius: t.radius.md, fontSize: '14px', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', border: `1.5px solid ${t.colors.border}`, background: '#FFFFFF' }}
                />
              </div>
              <div>
                <label htmlFor="owner-email" style={{ ...t.typography.label, display: 'block', marginBottom: '8px', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.05em' }}>
                  Your Email <span style={{ fontWeight: 400, color: t.colors.subtle, textTransform: 'none' }}>(for lead notifications)</span>
                </label>
                <input
                  id="owner-email"
                  data-testid="input-owner-email"
                  type="email"
                  value={wizardState.ownerEmail}
                  onChange={e => updateState('ownerEmail', e.target.value)}
                  placeholder="you@company.com"
                  className="premium-input"
                  style={{ width: '100%', padding: '12px 16px', borderRadius: t.radius.md, fontSize: '14px', boxSizing: 'border-box', border: `1.5px solid ${t.colors.border}`, background: '#FFFFFF' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '28px', paddingTop: '20px', borderTop: `1px solid ${t.colors.borderLight}` }}>
              <BackButton onClick={() => setStep(0)} />
              <ContinueButton testId="button-next-step2" onClick={() => setStep(2)} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-fade-in">
            <StepHeader step={3} title="Choose Your Brand Color" subtitle="This color will be used throughout your calculator." />
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '28px' }}>
              {['#2563EB', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'].map(color => (
                <button
                  key={color}
                  data-testid={`color-option-${color.replace('#', '')}`}
                  onClick={() => updateState('primaryColor', color)}
                  style={{
                    width: '40px', height: '40px', borderRadius: '50%', backgroundColor: color,
                    border: wizardState.primaryColor === color ? '3px solid #0F172A' : '2px solid transparent',
                    cursor: 'pointer', transform: wizardState.primaryColor === color ? 'scale(1.15)' : 'scale(1)',
                    transition: designTokens.transitions.spring,
                    boxShadow: wizardState.primaryColor === color ? `0 4px 14px ${color}50` : '0 1px 3px rgba(0,0,0,0.1)',
                    outline: 'none',
                  }}
                />
              ))}
              <div style={{ width: '1px', height: '28px', background: t.colors.border, margin: '0 4px' }} />
              <input
                data-testid="input-custom-color"
                type="color"
                value={wizardState.primaryColor}
                onChange={e => updateState('primaryColor', e.target.value)}
                style={{ width: '40px', height: '40px', borderRadius: '50%', border: `2px solid ${t.colors.border}`, cursor: 'pointer', padding: '3px', background: 'white' }}
              />
            </div>
            <div style={{ padding: '16px 20px', borderRadius: t.radius.md, border: `1.5px solid ${t.colors.border}`, display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px', background: '#FAFBFC' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: wizardState.primaryColor, transition: t.transitions.normal, flexShrink: 0, boxShadow: `0 4px 12px ${wizardState.primaryColor}30` }} />
              <div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: t.colors.heading, marginBottom: '2px' }}>{wizardState.businessName}</p>
                <p style={{ fontSize: '12px', color: t.colors.muted }}>Preview of your brand identity</p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '20px', borderTop: `1px solid ${t.colors.borderLight}` }}>
              <BackButton onClick={() => setStep(1)} />
              <PrimaryButton
                testId="button-generate"
                onClick={() => generateMutation.mutate()}
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
      </WizardShell>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </>
  );
}


function WizardShell({ children, step, totalSteps, onHelp }: { children: any; step: number; totalSteps: number; onHelp: () => void }) {
  const t = designTokens;
  const progress = ((step + 1) / totalSteps) * 100;

  return (
    <div
      style={{
        borderRadius: t.radius['2xl'],
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #FAFBFE 0%, #F0F4FA 50%, #F5F7FB 100%)',
        boxShadow: t.shadows.lg,
        position: 'relative',
      }}
    >
      <div style={{
        height: '4px',
        background: t.colors.borderLight,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${progress}%`,
          background: 'linear-gradient(90deg, #2563EB, #3B82F6)',
          borderRadius: '0 2px 2px 0',
          transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />
      </div>

      <div style={{ padding: '28px 28px 32px', position: 'relative' }}>
        <button
          data-testid="button-help"
          onClick={onHelp}
          style={{
            position: 'absolute', top: '20px', right: '20px',
            width: '32px', height: '32px', borderRadius: '50%',
            border: `1.5px solid ${t.colors.border}`, background: '#FFFFFF',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: t.transitions.fast, zIndex: 5,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2563EB'; (e.currentTarget as HTMLElement).style.background = '#EFF6FF'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = t.colors.border; (e.currentTarget as HTMLElement).style.background = '#FFFFFF'; }}
        >
          <HelpCircle style={{ width: '16px', height: '16px', color: t.colors.muted }} />
        </button>
        {children}
      </div>
    </div>
  );
}


function StepHeader({ step, title, subtitle }: { step: number; title: string; subtitle: string }) {
  const t = designTokens;
  return (
    <div style={{ marginBottom: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: t.colors.subtle, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Step {step} of 6
        </span>
      </div>
      <div style={{ borderLeft: '3px solid #2563EB', paddingLeft: '14px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 700, color: t.colors.heading, letterSpacing: '-0.01em', lineHeight: 1.2, marginBottom: '6px' }}>
          {title}
        </h2>
        <p style={{ fontSize: '14px', color: t.colors.muted, lineHeight: 1.5 }}>
          {subtitle}
        </p>
      </div>
    </div>
  );
}


function TradeDropdown({
  trades, searchedTrades, selectedTradeId, selectedTradeLabel,
  tradeSearch, isOpen, onSearch, onToggle, onSelect, onClose,
}: {
  trades: Trade[]; searchedTrades: Trade[]; selectedTradeId: string; selectedTradeLabel: string;
  tradeSearch: string; isOpen: boolean; onSearch: (v: string) => void;
  onToggle: () => void; onSelect: (t: Trade) => void; onClose: () => void;
}) {
  const t = designTokens;
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  return (
    <div ref={dropdownRef} style={{ marginBottom: '4px', position: 'relative' }} className="animate-fade-in">
      <label style={{ ...t.typography.label, display: 'block', marginBottom: '8px', textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.05em' }}>
        Select Your Trade <span style={{ color: t.colors.danger }}>*</span>
      </label>

      <button
        data-testid="trade-dropdown-trigger"
        onClick={onToggle}
        style={{
          width: '100%', padding: '12px 16px', borderRadius: t.radius.md,
          border: `1.5px solid ${isOpen ? '#2563EB' : t.colors.border}`,
          background: '#FFFFFF', cursor: 'pointer', textAlign: 'left',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: '15px', color: selectedTradeId ? t.colors.heading : t.colors.subtle,
          transition: t.transitions.fast,
          boxShadow: isOpen ? '0 0 0 3px rgba(37,99,235,0.1)' : 'none',
        }}
      >
        <span>{selectedTradeLabel || 'Choose a trade...'}</span>
        <ChevronDown style={{
          width: '18px', height: '18px', color: t.colors.muted,
          transition: t.transitions.fast,
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
        }} />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0,
            marginTop: '6px', borderRadius: t.radius.md,
            border: `1.5px solid ${t.colors.border}`,
            background: '#FFFFFF', boxShadow: t.shadows.lg,
            zIndex: 50, overflow: 'hidden',
          }}
          className="animate-fade-in"
        >
          <div style={{ padding: '10px 12px', borderBottom: `1px solid ${t.colors.borderLight}` }}>
            <div style={{ position: 'relative' }}>
              <Search style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', color: t.colors.subtle }} />
              <input
                ref={searchInputRef}
                data-testid="trade-search-input"
                value={tradeSearch}
                onChange={e => onSearch(e.target.value)}
                placeholder="Search trades..."
                style={{
                  width: '100%', padding: '9px 12px 9px 34px', borderRadius: '8px',
                  border: `1px solid ${t.colors.border}`, fontSize: '14px',
                  background: t.colors.surfaceRaised, boxSizing: 'border-box',
                  outline: 'none',
                }}
                onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2563EB'; }}
                onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = t.colors.border; }}
              />
            </div>
          </div>
          <div style={{ maxHeight: '220px', overflowY: 'auto', position: 'relative' }}>
            <div style={{
              position: 'sticky', top: 0, height: '8px', zIndex: 2,
              background: 'linear-gradient(to bottom, rgba(255,255,255,1), rgba(255,255,255,0))',
              pointerEvents: 'none',
            }} />
            {searchedTrades.length === 0 ? (
              <div style={{ padding: '20px 16px', textAlign: 'center', fontSize: '13px', color: t.colors.muted }}>
                No trades found matching "{tradeSearch}"
              </div>
            ) : (
              searchedTrades.map(trade => (
                <button
                  key={trade.id}
                  data-testid={`trade-option-${trade.id}`}
                  onClick={() => onSelect(trade)}
                  style={{
                    width: '100%', padding: '10px 16px', border: 'none',
                    background: trade.id === selectedTradeId ? '#EFF6FF' : 'transparent',
                    cursor: 'pointer', textAlign: 'left', fontSize: '14px',
                    color: trade.id === selectedTradeId ? '#2563EB' : t.colors.body,
                    fontWeight: trade.id === selectedTradeId ? 600 : 400,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    transition: t.transitions.fast,
                  }}
                  onMouseEnter={e => {
                    if (trade.id !== selectedTradeId) {
                      (e.currentTarget as HTMLElement).style.background = '#F8FAFC';
                    }
                  }}
                  onMouseLeave={e => {
                    if (trade.id !== selectedTradeId) {
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }
                  }}
                >
                  <span>{trade.label}</span>
                  {trade.id === selectedTradeId && <Check style={{ width: '16px', height: '16px', color: '#2563EB' }} />}
                </button>
              ))
            )}
            <div style={{
              position: 'sticky', bottom: 0, height: '8px', zIndex: 2,
              background: 'linear-gradient(to top, rgba(255,255,255,1), rgba(255,255,255,0))',
              pointerEvents: 'none',
            }} />
          </div>
        </div>
      )}
    </div>
  );
}


function CustomRequestPanel({
  customRequest, errors, submitting, onUpdate, onSubmit,
}: {
  customRequest: CustomRequest; errors: Record<string, string>;
  submitting: boolean; onUpdate: (key: keyof CustomRequest, val: any) => void;
  onSubmit: () => void;
}) {
  const t = designTokens;

  if (customRequest.submitted) {
    return (
      <div className="animate-fade-in" style={{
        padding: '20px', borderRadius: t.radius.lg,
        background: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)',
        border: '1.5px solid rgba(16,185,129,0.2)', marginBottom: '4px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Check style={{ width: '14px', height: '14px', color: 'white' }} />
          </div>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#065F46' }}>Custom request submitted!</span>
        </div>
        <p style={{ fontSize: '13px', color: '#047857', marginLeft: '34px' }}>
          We'll build a tailored quote tool for you. Click Continue to proceed.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{
      padding: '24px', borderRadius: t.radius.lg,
      background: '#FFFFFF', border: `1.5px solid ${t.colors.border}`,
      boxShadow: t.shadows.sm, marginBottom: '4px',
    }}>
      <h4 style={{ fontSize: '16px', fontWeight: 600, color: t.colors.heading, marginBottom: '4px' }}>
        Request a Custom Quote Tool
      </h4>
      <p style={{ fontSize: '13px', color: t.colors.muted, marginBottom: '20px', lineHeight: 1.5 }}>
        Tell us about your service and we'll build it for you.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <FieldGroup
          label="What service do you offer?"
          required
          error={errors.serviceOffered}
        >
          <input
            data-testid="input-custom-service"
            value={customRequest.serviceOffered}
            onChange={e => onUpdate('serviceOffered', e.target.value)}
            placeholder="e.g. Residential solar panel installation"
            className="premium-input"
            style={{ width: '100%', padding: '11px 14px', borderRadius: t.radius.sm, fontSize: '14px', boxSizing: 'border-box', border: `1.5px solid ${errors.serviceOffered ? t.colors.danger : t.colors.border}`, background: '#FFFFFF' }}
          />
        </FieldGroup>

        <FieldGroup label="How do you calculate pricing?" optional>
          <input
            data-testid="input-custom-pricing"
            value={customRequest.pricingMethod}
            onChange={e => onUpdate('pricingMethod', e.target.value)}
            placeholder="e.g. By panel count, roof type, and install complexity"
            className="premium-input"
            style={{ width: '100%', padding: '11px 14px', borderRadius: t.radius.sm, fontSize: '14px', boxSizing: 'border-box', border: `1.5px solid ${t.colors.border}`, background: '#FFFFFF' }}
          />
        </FieldGroup>

        <FieldGroup label="Your website" optional>
          <input
            data-testid="input-custom-website"
            type="url"
            value={customRequest.website}
            onChange={e => onUpdate('website', e.target.value)}
            placeholder="https://yoursite.com"
            className="premium-input"
            style={{ width: '100%', padding: '11px 14px', borderRadius: t.radius.sm, fontSize: '14px', boxSizing: 'border-box', border: `1.5px solid ${t.colors.border}`, background: '#FFFFFF' }}
          />
        </FieldGroup>

        <FieldGroup label="Your email" required error={errors.email}>
          <input
            data-testid="input-custom-email"
            type="email"
            value={customRequest.email}
            onChange={e => onUpdate('email', e.target.value)}
            placeholder="you@example.com"
            className="premium-input"
            style={{ width: '100%', padding: '11px 14px', borderRadius: t.radius.sm, fontSize: '14px', boxSizing: 'border-box', border: `1.5px solid ${errors.email ? t.colors.danger : t.colors.border}`, background: '#FFFFFF' }}
          />
        </FieldGroup>
      </div>

      <button
        data-testid="button-custom-submit"
        onClick={onSubmit}
        disabled={submitting}
        style={{
          width: '100%', marginTop: '20px', padding: '12px',
          borderRadius: t.radius.md, border: 'none',
          background: submitting ? '#93C5FD' : 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
          color: 'white', fontSize: '14px', fontWeight: 600,
          cursor: submitting ? 'wait' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          boxShadow: submitting ? 'none' : t.shadows.button,
          transition: t.transitions.fast,
        }}
        onMouseDown={e => { if (!submitting) (e.currentTarget as HTMLElement).style.transform = 'scale(0.98)'; }}
        onMouseUp={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
      >
        {submitting ? (
          <><Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> Requesting...</>
        ) : (
          'Request Custom Quote Tool'
        )}
      </button>
    </div>
  );
}


function FieldGroup({ label, required, optional, error, children }: {
  label: string; required?: boolean; optional?: boolean; error?: string; children: any;
}) {
  const t = designTokens;
  return (
    <div>
      <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500, color: t.colors.body }}>
        {label} {required && <span style={{ color: t.colors.danger }}>*</span>}
        {optional && <span style={{ fontWeight: 400, color: t.colors.subtle, fontSize: '12px' }}> (optional)</span>}
      </label>
      {children}
      {error && (
        <p style={{ fontSize: '12px', color: t.colors.danger, marginTop: '4px' }}>{error}</p>
      )}
    </div>
  );
}


function HelpModal({ onClose }: { onClose: () => void }) {
  const t = designTokens;
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);

    if (modalRef.current) {
      modalRef.current.focus();
    }

    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.4)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.2s ease-out',
        padding: '20px',
      }}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Help"
        style={{
          width: '100%', maxWidth: '440px',
          background: '#FFFFFF', borderRadius: t.radius.xl,
          boxShadow: t.shadows.xl, padding: '28px',
          animation: 'slideUp 0.25s ease-out',
          outline: 'none', position: 'relative',
          maxHeight: '80vh', overflowY: 'auto',
        }}
      >
        <button
          data-testid="button-close-help"
          onClick={onClose}
          style={{
            position: 'absolute', top: '16px', right: '16px',
            width: '32px', height: '32px', borderRadius: '50%',
            border: 'none', background: t.colors.backgroundLight,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: t.transitions.fast,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = t.colors.border; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = t.colors.backgroundLight; }}
        >
          <X style={{ width: '16px', height: '16px', color: t.colors.muted }} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <HelpCircle style={{ width: '20px', height: '20px', color: '#2563EB' }} />
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: t.colors.heading }}>How It Works</h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[
            { num: 1, title: 'Business Details', desc: 'Enter your business name and select your service category.' },
            { num: 2, title: 'Configure Options', desc: 'Choose features and pricing model for your quote calculator.' },
            { num: 3, title: 'Brand It', desc: 'Pick your brand color and customize the appearance.' },
            { num: 4, title: 'Preview', desc: 'See exactly how your calculator will look to customers.' },
            { num: 5, title: 'Launch', desc: 'Get your hosted link and embed code to start collecting leads.' },
          ].map(item => (
            <div key={item.num} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #2563EB, #3B82F6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '12px', fontWeight: 700, color: 'white',
              }}>
                {item.num}
              </div>
              <div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: t.colors.heading, marginBottom: '2px' }}>{item.title}</p>
                <p style={{ fontSize: '13px', color: t.colors.muted, lineHeight: 1.5 }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '24px', padding: '14px 16px', background: '#F8FAFC', borderRadius: t.radius.md, border: `1px solid ${t.colors.borderLight}` }}>
          <p style={{ fontSize: '13px', color: t.colors.muted, lineHeight: 1.5 }}>
            <strong style={{ color: t.colors.body }}>Need help?</strong> Your calculator can be edited for 7 days after creation using the edit link.
          </p>
        </div>
      </div>
    </div>
  );
}


function BackButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const t = designTokens;
  return (
    <button
      data-testid="button-back"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px',
        borderRadius: t.radius.md, border: `1.5px solid ${t.colors.border}`,
        background: 'white', cursor: disabled ? 'default' : 'pointer',
        fontSize: '14px', fontWeight: 500,
        color: disabled ? t.colors.subtle : t.colors.muted,
        transition: t.transitions.fast,
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={e => {
        if (!disabled) {
          (e.currentTarget as HTMLElement).style.borderColor = t.colors.borderHover;
          (e.currentTarget as HTMLElement).style.color = t.colors.body;
        }
      }}
      onMouseLeave={e => {
        if (!disabled) {
          (e.currentTarget as HTMLElement).style.borderColor = t.colors.border;
          (e.currentTarget as HTMLElement).style.color = t.colors.muted;
        }
      }}
    >
      <ArrowLeft style={{ width: '16px', height: '16px' }} /> Back
    </button>
  );
}


function ContinueButton({ onClick, disabled, testId }: { onClick: () => void; disabled?: boolean; testId?: string }) {
  return (
    <button
      data-testid={testId || "button-continue"}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 24px',
        borderRadius: '12px', border: 'none',
        background: disabled ? '#CBD5E1' : 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
        color: disabled ? '#94A3B8' : 'white',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '14px', fontWeight: 600,
        boxShadow: disabled ? 'none' : '0 2px 8px rgba(37,99,235,0.25), 0 1px 3px rgba(37,99,235,0.1)',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={e => {
        if (!disabled) {
          (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(37,99,235,0.35), 0 2px 6px rgba(37,99,235,0.15)';
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={e => {
        if (!disabled) {
          (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(37,99,235,0.25), 0 1px 3px rgba(37,99,235,0.1)';
          (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
        }
      }}
      onMouseDown={e => { if (!disabled) (e.currentTarget as HTMLElement).style.transform = 'scale(0.98)'; }}
      onMouseUp={e => { if (!disabled) (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
    >
      Continue <ArrowRight style={{ width: '16px', height: '16px' }} />
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
