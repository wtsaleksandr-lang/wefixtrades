import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { platformTheme } from '@/theme/platformTheme';
import { CATEGORIES, TRADES, getTradesByCategory, type Trade } from '@/data/trades';
import { calculatorSettingsSchema, customTradeDataSchema, type CalculatorSettings, type CustomTradeData, type Stage2Data } from '@shared/schema';
import DesignStudio from './DesignStudio';
import CustomTradeQuestionnaire from './CustomTradeQuestionnaire';
import PricingIntakeStage2 from './PricingIntakeStage2';
import { mapPricingIntakeToConfig } from '@shared/pricingIntakeMapper';
import {
  Loader2, ArrowRight, ArrowLeft, Check, Sparkles, Wrench, Hammer,
  Layers, AlertTriangle, Car, Briefcase, Plus, HelpCircle, X,
  Search, ChevronDown, ExternalLink, Copy, Zap, AlertCircle,
  RotateCcw, Code2, Eye, Upload, Trash2, Image as ImageIcon, ChevronRight,
  FileText, ClipboardCheck, Shield, Mail, Phone, User, Building2,
  CheckCircle2, XCircle, TriangleAlert
} from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

const ICON_MAP: Record<string, any> = {
  Sparkles, Hammer, Layers, Wrench, AlertTriangle, Car, Briefcase, Plus,
};

interface LeadFormField {
  id: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'textarea';
  required: boolean;
  enabled: boolean;
}

interface TestScenario {
  label: string;
  answers: Record<string, string>;
  expectedMin: string;
  expectedMax: string;
  confirmed: boolean;
}

interface WizardState {
  businessName: string;
  selectedCategory: string;
  selectedTrade: string;
  isCustomTrade: boolean;
  customTradeData: CustomTradeData;
  stage2Data: Stage2Data;
  ownerEmail: string;
  primaryColor: string;
  tagline: string;
  logoUrl: string;
  calculatorSettings: CalculatorSettings;
  leadFormFields: LeadFormField[];
  leadThankYouMessage: string;
  testScenarios: TestScenario[];
  testPassed: boolean;
}

const DEFAULT_SETTINGS = calculatorSettingsSchema.parse({});
const DEFAULT_CUSTOM_TRADE = customTradeDataSchema.parse({});

const DEFAULT_LEAD_FIELDS: LeadFormField[] = [
  { id: 'name', label: 'Full Name', type: 'text', required: true, enabled: true },
  { id: 'email', label: 'Email Address', type: 'email', required: true, enabled: true },
  { id: 'phone', label: 'Phone Number', type: 'phone', required: false, enabled: true },
  { id: 'company', label: 'Company Name', type: 'text', required: false, enabled: false },
];

const EMPTY_SCENARIO: TestScenario = {
  label: '', answers: {}, expectedMin: '', expectedMax: '', confirmed: false,
};

const INITIAL_STATE: WizardState = {
  businessName: '', selectedCategory: '', selectedTrade: '',
  isCustomTrade: false, customTradeData: DEFAULT_CUSTOM_TRADE,
  stage2Data: {},
  ownerEmail: '', primaryColor: '#0284C7',
  tagline: '', logoUrl: '',
  calculatorSettings: DEFAULT_SETTINGS,
  leadFormFields: [...DEFAULT_LEAD_FIELDS],
  leadThankYouMessage: 'Thanks! We\'ll be in touch soon.',
  testScenarios: [{ ...EMPTY_SCENARIO }, { ...EMPTY_SCENARIO }, { ...EMPTY_SCENARIO }],
  testPassed: false,
};

function loadState(): WizardState {
  try {
    const s = localStorage.getItem('qq_wizard');
    if (s) {
      const parsed = JSON.parse(s);
      return {
        ...INITIAL_STATE,
        ...parsed,
        customTradeData: parsed.customTradeData
          ? { ...DEFAULT_CUSTOM_TRADE, ...parsed.customTradeData }
          : DEFAULT_CUSTOM_TRADE,
        stage2Data: parsed.stage2Data || {},
        calculatorSettings: parsed.calculatorSettings
          ? { ...DEFAULT_SETTINGS, ...parsed.calculatorSettings }
          : DEFAULT_SETTINGS,
        leadFormFields: parsed.leadFormFields || [...DEFAULT_LEAD_FIELDS],
        testScenarios: parsed.testScenarios || [{ ...EMPTY_SCENARIO }, { ...EMPTY_SCENARIO }, { ...EMPTY_SCENARIO }],
      };
    }
  } catch {}
  return { ...INITIAL_STATE };
}

function loadResult(): any {
  try {
    const s = localStorage.getItem('qq_result');
    if (s) return JSON.parse(s);
  } catch {}
  return null;
}

function loadStep(): number {
  try {
    const s = localStorage.getItem('qq_step');
    if (s) return parseInt(s, 10) || 0;
  } catch {}
  return 0;
}

const p = platformTheme;
const TOTAL_STEPS = 6;

const STEP_TITLES = [
  'Business & Trade Setup',
  'Design Your Calculator',
  'Pricing Logic',
  'Lead Form Builder',
  'Final Test & Preview',
  'Publish & Share',
];
const STEP_SUBTITLES = [
  'Tell us about your business and trade.',
  'Customize appearance, layout, and branding.',
  'Review and confirm your pricing configuration.',
  'Configure how you collect customer information.',
  'Test your calculator before publishing.',
  'Share your links and start collecting leads.',
];

export default function WizardCard({ embed = false }: { embed?: boolean }) {
  const savedResult = loadResult();
  const savedStep = loadStep();
  const [step, setStep] = useState(savedResult && savedStep === 5 ? 5 : (savedStep < 5 ? savedStep : 0));
  const [ws, setWs] = useState<WizardState>(loadState);
  const [showHelp, setShowHelp] = useState(false);
  const [tradeSearch, setTradeSearch] = useState('');
  const [tradeOpen, setTradeOpen] = useState(false);
  const [result, setResult] = useState<any>(savedResult);
  const [genProgress, setGenProgress] = useState(0);
  const [showEmbed, setShowEmbed] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [pricingDraftLoading, setPricingDraftLoading] = useState(false);
  const [showCustomInHelp, setShowCustomInHelp] = useState(false);

  useEffect(() => {
    localStorage.setItem('qq_wizard', JSON.stringify(ws));
  }, [ws]);

  useEffect(() => {
    localStorage.setItem('qq_step', String(step));
  }, [step]);

  useEffect(() => {
    if (result) localStorage.setItem('qq_result', JSON.stringify(result));
  }, [result]);

  const set = useCallback(<K extends keyof WizardState>(k: K, v: WizardState[K]) => {
    setWs(p => ({ ...p, [k]: v }));
    if (validationErrors[k]) setValidationErrors(p => { const n = { ...p }; delete n[k]; return n; });
  }, [validationErrors]);

  const filteredTrades = ws.selectedCategory && ws.selectedCategory !== 'custom'
    ? getTradesByCategory(ws.selectedCategory) : [];
  const searchedTrades = tradeSearch
    ? filteredTrades.filter(tr => tr.label.toLowerCase().includes(tradeSearch.toLowerCase()))
    : filteredTrades;

  const selectCategory = (id: string) => {
    if (id === ws.selectedCategory) return;
    setWs(p => ({
      ...p, selectedCategory: id, selectedTrade: '',
      isCustomTrade: id === 'custom',
      customTradeData: id === 'custom' ? p.customTradeData : DEFAULT_CUSTOM_TRADE,
    }));
    setTradeSearch('');
    setTradeOpen(false);
  };

  const selectTrade = (tr: Trade) => {
    set('selectedTrade', tr.id);
    setTradeOpen(false);
    setTradeSearch('');
  };

  const canContinueStep0 = () => {
    if (!ws.businessName.trim()) return false;
    if (!ws.ownerEmail.trim()) return false;
    if (!ws.selectedCategory) return false;
    if (ws.selectedCategory === 'custom') return true;
    return !!ws.selectedTrade;
  };

  const tryStep0Continue = () => {
    const errs: Record<string, string> = {};
    if (!ws.businessName.trim()) errs.businessName = 'Business name is required.';
    if (!ws.ownerEmail.trim()) errs.ownerEmail = 'Email is required for lead notifications.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ws.ownerEmail)) errs.ownerEmail = 'Enter a valid email address.';
    if (!ws.selectedCategory) errs.selectedCategory = 'Please select a service category.';
    else if (ws.selectedCategory !== 'custom' && !ws.selectedTrade) errs.selectedTrade = 'Please select your trade.';

    if (ws.selectedCategory === 'custom') {
      const ctd = ws.customTradeData;
      if (!ctd.charge_method || ctd.charge_method === 'not_sure') {
        if ((ctd.price_factors || []).length === 0) {
          errs.customTrade = 'Please select how you charge or at least one price factor.';
        }
      }
      if (ctd.has_minimum_charge && (!ctd.minimum_charge_amount || ctd.minimum_charge_amount <= 0)) {
        errs.customTradeMinCharge = 'Enter your minimum charge amount.';
      }
      if (ctd.has_trip_fee && (!ctd.trip_fee_amount || ctd.trip_fee_amount <= 0)) {
        errs.customTradeTripFee = 'Enter your trip fee amount.';
      }
    }

    setValidationErrors(errs);
    if (Object.keys(errs).length === 0) {
      if (ws.isCustomTrade && ws.customTradeData.charge_method === 'not_sure') {
        triggerPricingDraft();
      }
      setStep(1);
    }
  };

  const triggerPricingDraft = async () => {
    if (pricingDraftLoading) return;
    setPricingDraftLoading(true);
    setWs(prev => ({
      ...prev,
      calculatorSettings: {
        ...prev.calculatorSettings,
        pricing_draft: {
          pricing_config: {},
          assumptions: [],
          confidence_score: 0,
          needs_human_review: true,
          status: 'generating' as const,
        },
      },
    }));
    try {
      const res = await apiRequest('POST', '/api/ai/generate-pricing-draft', {
        custom_trade_data: ws.customTradeData,
        business_name: ws.businessName,
      });
      const data = await res.json();
      if (data.success && data.pricing_draft) {
        setWs(prev => ({
          ...prev,
          calculatorSettings: {
            ...prev.calculatorSettings,
            pricing_draft: { ...data.pricing_draft, status: 'ready' as const },
          },
        }));
      }
    } catch {
      setWs(prev => ({
        ...prev,
        calculatorSettings: {
          ...prev.calculatorSettings,
          pricing_draft: {
            pricing_config: { pricingType: 'call_for_quote_only', message: 'Request a quote' },
            assumptions: [],
            confidence_score: 0,
            needs_human_review: true,
            status: 'failed' as const,
          },
        },
      }));
    } finally {
      setPricingDraftLoading(false);
    }
  };

  const generateMutation = useMutation({
    mutationFn: async () => {
      setGenProgress(0);
      const progressTimer = setInterval(() => {
        setGenProgress(p => Math.min(p + Math.random() * 12, 90));
      }, 400);
      try {
        const tradeLabel = TRADES.find(tr => tr.id === ws.selectedTrade)?.label || ws.customTradeData.short_description || ws.selectedCategory;

        let pricingConfig: any;

        if (ws.isCustomTrade && ws.customTradeData.charge_method !== 'not_sure') {
          const mapResult = mapPricingIntakeToConfig(ws.customTradeData, ws.stage2Data);
          if (mapResult.success) {
            pricingConfig = mapResult.config;
            setGenProgress(50);
          } else if (ws.calculatorSettings.pricing_draft?.status === 'ready' && ws.calculatorSettings.pricing_draft?.pricing_config?.pricingType) {
            pricingConfig = ws.calculatorSettings.pricing_draft.pricing_config;
            setGenProgress(50);
          } else {
            const aiRes = await apiRequest('POST', '/api/ai/generate-pricing', {
              trade_type: tradeLabel,
              business_description: tradeLabel,
              services: tradeLabel,
            });
            const aiData = await aiRes.json();
            if (!aiData.success || !aiData.pricing_config) throw new Error(aiData.error || 'Failed to generate pricing.');
            pricingConfig = aiData.pricing_config;
          }
        } else if (ws.isCustomTrade && ws.calculatorSettings.pricing_draft?.status === 'ready' && ws.calculatorSettings.pricing_draft?.pricing_config?.pricingType) {
          pricingConfig = ws.calculatorSettings.pricing_draft.pricing_config;
          setGenProgress(50);
        } else {
          const aiRes = await apiRequest('POST', '/api/ai/generate-pricing', {
            trade_type: tradeLabel,
            business_description: tradeLabel,
            services: tradeLabel,
          });
          const aiData = await aiRes.json();
          if (!aiData.success || !aiData.pricing_config) throw new Error(aiData.error || 'Failed to generate pricing.');
          pricingConfig = aiData.pricing_config;
        }
        setGenProgress(70);
        const createRes = await apiRequest('POST', '/api/calculators', {
          business_name: ws.businessName,
          trade_type: tradeLabel,
          owner_email: ws.ownerEmail || undefined,
          pricing_config: pricingConfig,
          primary_color: ws.primaryColor,
          tagline: ws.tagline || undefined,
          logo_url: ws.logoUrl || undefined,
          calculator_settings: {
            ...ws.calculatorSettings,
            pricing_intake: ws.isCustomTrade ? {
              version: 1 as const,
              stage1: ws.customTradeData,
              stage2: ws.stage2Data,
            } : undefined,
          },
        });
        const d = await createRes.json();
        if (!d.success) throw new Error(d.error || 'Failed to create calculator.');
        setGenProgress(100);
        clearInterval(progressTimer);
        return d;
      } catch (err) {
        clearInterval(progressTimer);
        setGenProgress(0);
        throw err;
      }
    },
    onSuccess: (d) => {
      setResult(d);
      setTimeout(() => setStep(5), 500);
    },
  });

  const genError = generateMutation.error ? (generateMutation.error as Error).message : null;
  const selectedTradeLabel = TRADES.find(tr => tr.id === ws.selectedTrade)?.label || '';
  const selectedCategoryLabel = CATEGORIES.find(c => c.id === ws.selectedCategory)?.label || '';

  const startOver = () => {
    setStep(0);
    setWs({ ...INITIAL_STATE });
    setResult(null);
    setGenProgress(0);
    setShowEmbed(false);
    setShowHelp(false);
    setShowPreview(false);
    setValidationErrors({});
    generateMutation.reset();
    localStorage.removeItem('qq_wizard');
    localStorage.removeItem('qq_result');
    localStorage.removeItem('qq_step');
  };

  const [logoError, setLogoError] = useState('');

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const valid = ['image/png', 'image/jpeg', 'image/svg+xml'];
    if (!valid.includes(file.type)) {
      setLogoError('Please upload a PNG, JPG, or SVG file.');
      e.target.value = '';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError('File must be under 2MB.');
      e.target.value = '';
      return;
    }
    setLogoError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) set('logoUrl', ev.target.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const runTestValidation = () => {
    const errors: string[] = [];
    ws.testScenarios.forEach((s, i) => {
      if (!s.label.trim()) errors.push(`Scenario ${i + 1}: needs a label`);
      const min = parseFloat(s.expectedMin);
      const max = parseFloat(s.expectedMax);
      if (isNaN(min) || isNaN(max)) errors.push(`Scenario ${i + 1}: enter valid min/max`);
      else if (min < 0 || max < 0) errors.push(`Scenario ${i + 1}: no negative values`);
      else if (min > max) errors.push(`Scenario ${i + 1}: min must be less than max`);
      if (!s.confirmed) errors.push(`Scenario ${i + 1}: must be confirmed`);
    });
    return errors;
  };

  return (
    <>
      <Shell step={step} total={TOTAL_STEPS} onHelp={() => setShowHelp(true)}
        title={STEP_TITLES[step]} subtitle={STEP_SUBTITLES[step]}
        generating={generateMutation.isPending} genProgress={genProgress}
      >

        {/* Step 0: Business & Trade Setup */}
        {step === 0 && (
          <div className="animate-fade-in-up">
            <InputField
              id="business-name" testId="input-business-name"
              label="Business Name" required
              value={ws.businessName} onChange={v => set('businessName', v)}
              placeholder="e.g. Sunshine Cleaning Co."
              error={validationErrors.businessName}
            />

            <div style={{ marginTop: '24px', marginBottom: '12px' }}>
              <label style={{ ...p.typography.label, display: 'block', marginBottom: '6px' }}>
                Service Category <span style={{ color: p.colors.danger }}>*</span>
              </label>
              <p style={{ fontSize: '13px', color: p.colors.muted, lineHeight: 1.5 }}>
                Choose your core service area.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '16px' }}>
              {CATEGORIES.map((cat) => {
                const Icon = ICON_MAP[cat.icon] || Plus;
                const sel = ws.selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    data-testid={`category-${cat.id}`}
                    onClick={() => selectCategory(cat.id)}
                    className="category-card"
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                      padding: '18px 8px', borderRadius: p.radius.lg, cursor: 'pointer',
                      border: sel ? `2px solid ${p.colors.accent}` : `1px solid ${p.colors.border}`,
                      background: sel ? p.colors.accentLighter : '#FFFFFF',
                      position: 'relative', outline: 'none',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    {sel && (
                      <div style={{
                        position: 'absolute', top: '6px', right: '6px',
                        width: '20px', height: '20px', borderRadius: '50%',
                        background: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Check style={{ width: '12px', height: '12px', color: 'white' }} />
                      </div>
                    )}
                    <div data-testid={`icon-container-${cat.id}`} style={{
                      width: '40px', height: '40px', borderRadius: '12px',
                      background: sel ? '#2D6A4F' : '#EF4444',
                      border: `1.5px solid ${sel ? '#2D6A4F' : '#EF4444'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Icon style={{ width: '20px', height: '20px', color: 'white', flexShrink: 0 }} />
                    </div>
                    <span style={{
                      fontSize: '12px', fontWeight: 600, textAlign: 'center', lineHeight: 1.3,
                      color: sel ? p.colors.accentDark : p.colors.heading,
                    }}>
                      {cat.label}
                    </span>
                  </button>
                );
              })}
            </div>
            {validationErrors.selectedCategory && (
              <p style={{ fontSize: '12px', color: p.colors.danger, marginBottom: '8px' }}>{validationErrors.selectedCategory}</p>
            )}

            {ws.selectedCategory && ws.selectedCategory !== 'custom' && (
              <TradeDropdown
                trades={filteredTrades} searched={searchedTrades}
                selectedId={ws.selectedTrade} selectedLabel={selectedTradeLabel}
                search={tradeSearch} isOpen={tradeOpen}
                onSearch={setTradeSearch} onToggle={() => setTradeOpen(p => !p)}
                onSelect={selectTrade} onClose={() => setTradeOpen(false)}
                error={validationErrors.selectedTrade}
              />
            )}

            {ws.selectedCategory === 'custom' && (
              <>
                <CustomTradeQuestionnaire
                  data={ws.customTradeData}
                  onChange={(data) => set('customTradeData', data)}
                />
                {(validationErrors.customTrade || validationErrors.customTradeMinCharge || validationErrors.customTradeTripFee) && (
                  <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {validationErrors.customTrade && (
                      <p data-testid="error-custom-trade" style={{ fontSize: '12px', color: p.colors.danger }}>{validationErrors.customTrade}</p>
                    )}
                    {validationErrors.customTradeMinCharge && (
                      <p data-testid="error-custom-min-charge" style={{ fontSize: '12px', color: p.colors.danger }}>{validationErrors.customTradeMinCharge}</p>
                    )}
                    {validationErrors.customTradeTripFee && (
                      <p data-testid="error-custom-trip-fee" style={{ fontSize: '12px', color: p.colors.danger }}>{validationErrors.customTradeTripFee}</p>
                    )}
                  </div>
                )}
              </>
            )}

            <div style={{ marginTop: '18px' }}>
              <InputField id="owner-email" testId="input-owner-email"
                label="Your Email" sublabel="(for lead notifications)" type="email" required
                value={ws.ownerEmail} onChange={v => set('ownerEmail', v)}
                placeholder="you@company.com"
                error={validationErrors.ownerEmail} />
            </div>

            <Footer onBack={undefined} onNext={tryStep0Continue}
              nextDisabled={false} backDisabled />
          </div>
        )}

        {/* Step 1: Design Your Calculator (with logo + tagline moved here) */}
        {step === 1 && (
          <div>
            <div className="animate-fade-in-up" style={{ marginBottom: '20px' }}>
              <label style={{ ...p.typography.label, display: 'block', marginBottom: '12px' }}>
                Brand Color
              </label>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '20px' }}>
                {['#0284C7', '#0ea5e9', '#2563EB', '#059669', '#f59e0b', '#ef4444', '#7C3AED', '#ec4899'].map(color => (
                  <button
                    key={color}
                    data-testid={`color-option-${color.replace('#', '')}`}
                    onClick={() => set('primaryColor', color)}
                    style={{
                      width: '40px', height: '40px', borderRadius: '50%', backgroundColor: color,
                      border: ws.primaryColor === color ? `3px solid ${p.colors.heading}` : '2px solid transparent',
                      cursor: 'pointer', transform: ws.primaryColor === color ? 'scale(1.15)' : 'scale(1)',
                      transition: p.transitions.spring,
                      boxShadow: ws.primaryColor === color ? `0 4px 14px ${color}40` : '0 1px 3px rgba(0,0,0,0.08)',
                      outline: 'none', WebkitTapHighlightColor: 'transparent',
                    }}
                  />
                ))}
                <div style={{ width: '1px', height: '24px', background: p.colors.border, margin: '0 2px' }} />
                <input data-testid="input-custom-color" type="color" value={ws.primaryColor}
                  onChange={e => set('primaryColor', e.target.value)}
                  style={{ width: '40px', height: '40px', borderRadius: '50%', border: `1px solid ${p.colors.border}`, cursor: 'pointer', padding: '3px', background: 'white' }} />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ ...p.typography.label, display: 'block', marginBottom: '8px' }}>
                  Brand Logo <span style={{ fontWeight: 400, color: p.colors.subtle, textTransform: 'none', fontSize: '11px' }}>(optional)</span>
                </label>
                {ws.logoUrl ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 16px', borderRadius: p.radius.md,
                    border: `1px solid ${p.colors.border}`, background: p.colors.surfaceRaised,
                  }}>
                    <img src={ws.logoUrl} alt="Logo" style={{ width: '48px', height: '48px', objectFit: 'contain', borderRadius: '8px', background: 'white', border: `1px solid ${p.colors.borderLight}` }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '13px', fontWeight: 500, color: p.colors.heading }}>Logo uploaded</p>
                      <p style={{ fontSize: '11px', color: p.colors.muted }}>PNG, JPG, or SVG</p>
                    </div>
                    <button data-testid="button-remove-logo" onClick={() => set('logoUrl', '')}
                      style={{ width: '36px', height: '36px', borderRadius: '8px', border: `1px solid ${p.colors.border}`, background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Trash2 style={{ width: '14px', height: '14px', color: p.colors.danger }} />
                    </button>
                  </div>
                ) : (
                  <label data-testid="button-upload-logo" style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '14px 16px', borderRadius: p.radius.md,
                    border: `1.5px dashed ${p.colors.border}`, background: p.colors.surfaceRaised,
                    cursor: 'pointer', transition: p.transitions.fast,
                  }}>
                    <Upload style={{ width: '18px', height: '18px', color: p.colors.subtle }} />
                    <span style={{ fontSize: '14px', color: p.colors.muted }}>Upload PNG, JPG or SVG</span>
                    <input type="file" accept=".png,.jpg,.jpeg,.svg" onChange={handleLogoUpload} style={{ display: 'none' }} />
                  </label>
                )}
                {logoError && <p data-testid="text-logo-error" style={{ fontSize: '12px', color: p.colors.danger, marginTop: '6px' }}>{logoError}</p>}
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label htmlFor="tagline" style={{ ...p.typography.label, display: 'block', marginBottom: '8px' }}>
                  Tagline <span style={{ fontWeight: 400, color: p.colors.subtle, textTransform: 'none', fontSize: '11px' }}>(optional)</span>
                </label>
                <input id="tagline" data-testid="input-tagline"
                  value={ws.tagline} onChange={e => { if (e.target.value.length <= 120) set('tagline', e.target.value); }}
                  placeholder="e.g. Trusted concrete specialists serving the GTA."
                  className="premium-input" maxLength={120} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                  <span style={{ fontSize: '11px', color: ws.tagline.length > 100 ? p.colors.warning : p.colors.subtle, fontWeight: 500 }}>
                    {ws.tagline.length}/120
                  </span>
                </div>
              </div>
            </div>

            <DesignStudio
              settings={ws.calculatorSettings}
              onChange={(newSettings) => set('calculatorSettings', newSettings)}
            />
            <Footer onBack={() => setStep(0)} onNext={() => setStep(2)} />
          </div>
        )}

        {/* Step 2: Pricing Logic */}
        {step === 2 && (
          <div className="animate-fade-in-up">
            {ws.isCustomTrade ? (
              <>
                {ws.customTradeData.charge_method !== 'not_sure' && (
                  <div style={{ marginBottom: '20px' }}>
                    <PricingIntakeStage2
                      stage1={ws.customTradeData}
                      data={ws.stage2Data}
                      onChange={(data) => set('stage2Data', data)}
                    />
                  </div>
                )}
                {pricingDraftLoading ? (
                  <div style={{ textAlign: 'center', padding: '32px 0' }}>
                    <div style={{
                      width: '56px', height: '56px', borderRadius: '50%',
                      background: p.colors.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 16px', boxShadow: `0 8px 24px ${p.colors.accentGlow}`,
                    }}>
                      <Loader2 style={{ width: '24px', height: '24px', color: 'white', animation: 'spin 1.2s linear infinite' }} />
                    </div>
                    <h3 style={{ fontSize: '18px', fontWeight: 700, color: p.colors.heading, marginBottom: '6px' }}>
                      Generating Pricing Draft
                    </h3>
                    <p style={{ fontSize: '13px', color: p.colors.muted }}>
                      AI is analyzing your trade and building a pricing configuration...
                    </p>
                  </div>
                ) : ws.calculatorSettings.pricing_draft?.status === 'ready' ? (
                  <div>
                    <div style={{
                      padding: '16px', borderRadius: p.radius.md,
                      background: '#F0FDF4', border: '1px solid #BBF7D0', marginBottom: '16px',
                      display: 'flex', alignItems: 'flex-start', gap: '10px',
                    }}>
                      <CheckCircle2 style={{ width: '18px', height: '18px', color: '#059669', flexShrink: 0, marginTop: '1px' }} />
                      <div>
                        <p style={{ fontSize: '14px', fontWeight: 600, color: '#065F46', marginBottom: '4px' }}>AI Draft Ready</p>
                        <p style={{ fontSize: '13px', color: '#047857', lineHeight: 1.5 }}>
                          Confidence: {Math.round((ws.calculatorSettings.pricing_draft?.confidence_score || 0) * 100)}%
                          {ws.calculatorSettings.pricing_draft?.needs_human_review && ' — Review recommended'}
                        </p>
                      </div>
                    </div>

                    <div style={{ padding: '16px', borderRadius: p.radius.md, border: `1px solid ${p.colors.border}`, background: '#FFFFFF', marginBottom: '16px' }}>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: p.colors.subtle, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
                        Pricing Family
                      </p>
                      <p style={{ fontSize: '14px', fontWeight: 500, color: p.colors.heading, marginBottom: '16px' }}>
                        {ws.calculatorSettings.pricing_draft?.pricing_config?.pricingType || 'Custom'}
                      </p>

                      {(ws.calculatorSettings.pricing_draft?.assumptions || []).length > 0 && (
                        <>
                          <p style={{ fontSize: '11px', fontWeight: 700, color: p.colors.subtle, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>
                            Assumptions
                          </p>
                          <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {ws.calculatorSettings.pricing_draft?.assumptions.map((a: string, i: number) => (
                              <li key={i} style={{ fontSize: '13px', color: p.colors.body, lineHeight: 1.5 }}>{a}</li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>

                    <button data-testid="button-regenerate-draft" onClick={triggerPricingDraft}
                      style={{
                        width: '100%', padding: '12px', borderRadius: p.radius.md,
                        border: `1px solid ${p.colors.border}`, background: '#FFFFFF',
                        cursor: 'pointer', fontSize: '14px', fontWeight: 500, color: p.colors.muted,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        marginBottom: '8px',
                      }}>
                      <RotateCcw style={{ width: '14px', height: '14px' }} /> Regenerate Draft
                    </button>
                  </div>
                ) : ws.calculatorSettings.pricing_draft?.status === 'failed' ? (
                  <div>
                    <div style={{
                      padding: '16px', borderRadius: p.radius.md,
                      background: '#FEF3C7', border: '1px solid #FDE68A', marginBottom: '16px',
                      display: 'flex', alignItems: 'flex-start', gap: '10px',
                    }}>
                      <TriangleAlert style={{ width: '18px', height: '18px', color: '#D97706', flexShrink: 0, marginTop: '1px' }} />
                      <div>
                        <p style={{ fontSize: '14px', fontWeight: 600, color: '#92400E', marginBottom: '4px' }}>Fallback Mode</p>
                        <p style={{ fontSize: '13px', color: '#A16207', lineHeight: 1.5 }}>
                          AI couldn't generate high-confidence pricing. Your calculator will use a safe price range / request quote fallback.
                        </p>
                      </div>
                    </div>
                    <button data-testid="button-retry-draft" onClick={triggerPricingDraft}
                      style={{
                        width: '100%', padding: '12px', borderRadius: p.radius.md,
                        border: `1px solid ${p.colors.border}`, background: '#FFFFFF',
                        cursor: 'pointer', fontSize: '14px', fontWeight: 500, color: p.colors.muted,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      }}>
                      <RotateCcw style={{ width: '14px', height: '14px' }} /> Try Again
                    </button>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '24px 0' }}>
                    <div style={{
                      width: '56px', height: '56px', borderRadius: '50%',
                      background: p.colors.accentLighter,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 16px',
                    }}>
                      <Zap style={{ width: '24px', height: '24px', color: p.colors.accent }} />
                    </div>
                    <h3 style={{ fontSize: '18px', fontWeight: 700, color: p.colors.heading, marginBottom: '8px' }}>
                      Generate Pricing Draft
                    </h3>
                    <p style={{ fontSize: '13px', color: p.colors.muted, lineHeight: 1.5, maxWidth: '340px', margin: '0 auto 20px' }}>
                      Click below to have AI analyze your custom trade and generate a pricing configuration.
                    </p>
                    <PrimaryBtn testId="button-generate-draft" onClick={triggerPricingDraft} fullWidth>
                      <Sparkles style={{ width: '16px', height: '16px' }} /> Generate Pricing Draft
                    </PrimaryBtn>
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{
                  width: '56px', height: '56px', borderRadius: '50%',
                  background: p.colors.accentLighter,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px',
                }}>
                  <Zap style={{ width: '24px', height: '24px', color: p.colors.accent }} />
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: p.colors.heading, marginBottom: '8px' }}>
                  Predefined Pricing Templates
                </h3>
                <p style={{ fontSize: '13px', color: p.colors.muted, lineHeight: 1.5, maxWidth: '340px', margin: '0 auto 20px' }}>
                  Your trade ({selectedTradeLabel || 'selected'}) uses an optimized pricing template. AI will generate questions based on industry standards when you publish.
                </p>
                <div style={{
                  padding: '14px 16px', borderRadius: p.radius.md,
                  background: p.colors.accentLighter, border: `1px solid ${p.colors.accentLighter}`,
                  display: 'flex', alignItems: 'flex-start', gap: '10px', textAlign: 'left',
                }}>
                  <Sparkles style={{ width: '16px', height: '16px', color: p.colors.accent, flexShrink: 0, marginTop: '1px' }} />
                  <p style={{ fontSize: '13px', color: p.colors.accentDark, lineHeight: 1.5 }}>
                    Pricing will be auto-generated in the final step. You'll be able to review before publishing.
                  </p>
                </div>
              </div>
            )}
            <Footer onBack={() => setStep(1)} onNext={() => setStep(3)} />
          </div>
        )}

        {/* Step 3: Lead Form Builder */}
        {step === 3 && (
          <div className="animate-fade-in-up">
            <p style={{ fontSize: '13px', color: p.colors.muted, lineHeight: 1.5, marginBottom: '20px' }}>
              Configure which fields appear on your lead capture form after a customer receives their quote.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
              {ws.leadFormFields.map((field, idx) => (
                <div key={field.id} data-testid={`lead-field-${field.id}`} style={{
                  padding: '14px 16px', borderRadius: p.radius.md,
                  border: `1px solid ${field.enabled ? p.colors.border : p.colors.borderLight}`,
                  background: field.enabled ? '#FFFFFF' : '#F9FAFB',
                  display: 'flex', alignItems: 'center', gap: '12px',
                  opacity: field.enabled ? 1 : 0.6,
                }}>
                  <button data-testid={`toggle-field-${field.id}`}
                    onClick={() => {
                      const updated = [...ws.leadFormFields];
                      updated[idx] = { ...updated[idx], enabled: !updated[idx].enabled };
                      set('leadFormFields', updated);
                    }}
                    style={{
                      width: '44px', height: '24px', borderRadius: '12px', border: 'none',
                      background: field.enabled ? p.colors.accent : '#D1D5DB',
                      cursor: 'pointer', position: 'relative', flexShrink: 0,
                      transition: 'background 0.2s ease',
                    }}>
                    <div style={{
                      width: '20px', height: '20px', borderRadius: '50%', background: 'white',
                      position: 'absolute', top: '2px',
                      left: field.enabled ? '22px' : '2px',
                      transition: 'left 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                    }} />
                  </button>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '14px', fontWeight: 500, color: p.colors.heading }}>{field.label}</p>
                    <p style={{ fontSize: '11px', color: p.colors.muted }}>{field.type}</p>
                  </div>
                  {field.enabled && (
                    <button data-testid={`toggle-required-${field.id}`}
                      onClick={() => {
                        const updated = [...ws.leadFormFields];
                        updated[idx] = { ...updated[idx], required: !updated[idx].required };
                        set('leadFormFields', updated);
                      }}
                      style={{
                        padding: '4px 10px', borderRadius: '6px', border: 'none',
                        background: field.required ? '#FEE2E2' : '#F3F4F6',
                        cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                        color: field.required ? '#991B1B' : p.colors.muted,
                      }}>
                      {field.required ? 'Required' : 'Optional'}
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div>
              <label style={{ ...p.typography.label, display: 'block', marginBottom: '8px' }}>
                Thank You Message
              </label>
              <textarea data-testid="input-thank-you-message"
                value={ws.leadThankYouMessage}
                onChange={e => set('leadThankYouMessage', e.target.value)}
                className="premium-input" rows={2} maxLength={200}
                placeholder="Thanks! We'll be in touch soon."
                style={{ resize: 'vertical' }} />
            </div>

            <Footer onBack={() => setStep(2)} onNext={() => setStep(4)} />
          </div>
        )}

        {/* Step 4: Final Test & Preview (quality gate) */}
        {step === 4 && !generateMutation.isPending && (
          <div className="animate-fade-in-up">
            <div style={{
              padding: '14px 16px', borderRadius: p.radius.md,
              background: '#FEF3C7', border: '1px solid #FDE68A', marginBottom: '20px',
              display: 'flex', alignItems: 'flex-start', gap: '10px',
            }}>
              <Shield style={{ width: '16px', height: '16px', color: '#D97706', flexShrink: 0, marginTop: '1px' }} />
              <p style={{ fontSize: '13px', color: '#92400E', lineHeight: 1.5 }}>
                Enter at least 3 test scenarios to verify your calculator produces accurate estimates.
              </p>
            </div>

            {ws.testScenarios.map((scenario, idx) => (
              <div key={idx} data-testid={`test-scenario-${idx}`} style={{
                padding: '16px', borderRadius: p.radius.md,
                border: `1px solid ${scenario.confirmed ? '#BBF7D0' : p.colors.border}`,
                background: scenario.confirmed ? '#F0FDF4' : '#FFFFFF',
                marginBottom: '12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <div style={{
                    width: '24px', height: '24px', borderRadius: '50%',
                    background: scenario.confirmed ? '#059669' : p.colors.borderLight,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '12px', fontWeight: 700,
                    color: scenario.confirmed ? 'white' : p.colors.muted,
                  }}>
                    {scenario.confirmed ? <Check style={{ width: '14px', height: '14px' }} /> : idx + 1}
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: p.colors.heading }}>
                    {idx === 0 ? 'Low Estimate' : idx === 1 ? 'Typical Job' : 'High-End Job'}
                  </span>
                </div>

                <input data-testid={`input-scenario-label-${idx}`}
                  value={scenario.label} placeholder={`Describe the ${idx === 0 ? 'simplest' : idx === 1 ? 'average' : 'most complex'} job`}
                  onChange={e => {
                    const updated = [...ws.testScenarios];
                    updated[idx] = { ...updated[idx], label: e.target.value };
                    set('testScenarios', updated);
                  }}
                  className="premium-input" style={{ marginBottom: '10px' }} />

                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: p.colors.muted, display: 'block', marginBottom: '4px' }}>Min ($)</label>
                    <input data-testid={`input-scenario-min-${idx}`} type="number" min="0"
                      value={scenario.expectedMin}
                      onChange={e => {
                        const updated = [...ws.testScenarios];
                        updated[idx] = { ...updated[idx], expectedMin: e.target.value };
                        set('testScenarios', updated);
                      }}
                      className="premium-input" placeholder="0" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: p.colors.muted, display: 'block', marginBottom: '4px' }}>Max ($)</label>
                    <input data-testid={`input-scenario-max-${idx}`} type="number" min="0"
                      value={scenario.expectedMax}
                      onChange={e => {
                        const updated = [...ws.testScenarios];
                        updated[idx] = { ...updated[idx], expectedMax: e.target.value };
                        set('testScenarios', updated);
                      }}
                      className="premium-input" placeholder="0" />
                  </div>
                </div>

                <button data-testid={`button-confirm-scenario-${idx}`}
                  onClick={() => {
                    const updated = [...ws.testScenarios];
                    updated[idx] = { ...updated[idx], confirmed: !updated[idx].confirmed };
                    set('testScenarios', updated);
                    const allConfirmed = updated.every(s => s.confirmed && s.label.trim() && s.expectedMin && s.expectedMax);
                    if (allConfirmed) set('testPassed', true);
                    else set('testPassed', false);
                  }}
                  style={{
                    width: '100%', padding: '10px', borderRadius: p.radius.md, border: 'none',
                    background: scenario.confirmed ? '#059669' : p.colors.accentLighter,
                    color: scenario.confirmed ? 'white' : p.colors.accent,
                    cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  }}>
                  {scenario.confirmed ? <><Check style={{ width: '14px', height: '14px' }} /> Confirmed</> : <><ClipboardCheck style={{ width: '14px', height: '14px' }} /> Confirm Estimate</>}
                </button>
              </div>
            ))}

            {(() => {
              const errs = runTestValidation();
              const allGood = errs.length === 0;
              return (
                <>
                  {!allGood && ws.testScenarios.some(s => s.confirmed) && (
                    <div style={{
                      padding: '12px 16px', borderRadius: p.radius.md,
                      background: p.colors.dangerLight, border: '1px solid #FCA5A5', marginBottom: '16px',
                    }}>
                      {errs.map((e, i) => (
                        <p key={i} style={{ fontSize: '12px', color: '#991B1B', lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <XCircle style={{ width: '12px', height: '12px', flexShrink: 0 }} /> {e}
                        </p>
                      ))}
                    </div>
                  )}
                  <Footer onBack={() => setStep(3)}>
                    <PrimaryBtn testId="button-generate" onClick={() => generateMutation.mutate()}
                      disabled={!ws.testPassed || generateMutation.isPending} loading={generateMutation.isPending}>
                      <Sparkles style={{ width: '16px', height: '16px' }} /> Generate & Publish
                    </PrimaryBtn>
                  </Footer>
                </>
              );
            })()}

            {genError && (
              <div className="animate-fade-in-up" style={{ marginTop: '14px', padding: '12px 16px', borderRadius: p.radius.md, background: p.colors.dangerLight, border: '1px solid #FCA5A5', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertCircle style={{ width: '15px', height: '15px', color: p.colors.danger, flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: '#991B1B' }}>{genError}</span>
              </div>
            )}
          </div>
        )}

        {step === 4 && generateMutation.isPending && (
          <GeneratingAnimation progress={genProgress} businessName={ws.businessName} />
        )}

        {/* Step 5: Publish & Share (was step 3) */}
        {step === 5 && result && (
          <LaunchStep result={result} showEmbed={showEmbed} onToggleEmbed={() => setShowEmbed(p => !p)} onStartOver={startOver} />
        )}

        {step === 5 && !result && (
          <div className="animate-fade-in-up" style={{ textAlign: 'center', padding: '24px 0' }}>
            <p style={{ fontSize: '14px', color: p.colors.muted, marginBottom: '16px' }}>
              Your previous session expired. Let's generate a fresh calculator.
            </p>
            <PrimaryBtn testId="button-back-to-generate" onClick={() => setStep(4)} fullWidth>
              <ArrowLeft style={{ width: '16px', height: '16px' }} /> Back to Generate
            </PrimaryBtn>
          </div>
        )}

        <LivePreview ws={ws} tradeLabel={selectedTradeLabel} categoryLabel={selectedCategoryLabel}
          isOpen={showPreview} onToggle={() => setShowPreview(p => !p)} step={step} />

      </Shell>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </>
  );
}


function PreviewRow({ label, value, children }: { label: string; value: string; children?: any }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 14px', borderRadius: '8px', background: '#F9FAFB',
    }}>
      <span style={{ fontSize: '12px', color: platformTheme.colors.muted, fontWeight: 500 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {children}
        <span style={{ fontSize: '13px', fontWeight: 500, color: platformTheme.colors.heading, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
      </div>
    </div>
  );
}


function LivePreview({ ws, tradeLabel, categoryLabel, isOpen, onToggle, step }: {
  ws: WizardState; tradeLabel: string; categoryLabel: string;
  isOpen: boolean; onToggle: () => void; step: number;
}) {
  if (step === 4 || step === 5) return null;

  return (
    <div style={{ marginTop: '20px', borderTop: `1px solid ${p.colors.borderLight}`, paddingTop: '16px' }}>
      <button data-testid="button-live-preview-toggle" onClick={onToggle}
        style={{
          width: '100%', padding: '12px 16px', borderRadius: p.radius.md,
          border: `1px solid ${p.colors.border}`, background: p.colors.surfaceRaised,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Eye style={{ width: '16px', height: '16px', color: p.colors.accent }} />
          <div style={{ textAlign: 'left' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: p.colors.heading, display: 'block' }}>Live Quote Preview</span>
            <span style={{ fontSize: '11px', color: p.colors.muted }}>See how your calculator will appear to customers.</span>
          </div>
        </div>
        <ChevronDown style={{
          width: '18px', height: '18px', color: p.colors.muted,
          transition: p.transitions.fast, transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
        }} />
      </button>

      {isOpen && (
        <div className="animate-expand widget-scope" style={{
          marginTop: '10px', padding: '20px', borderRadius: p.radius.md,
          border: `1px solid ${p.colors.border}`, background: 'white',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            {ws.logoUrl ? (
              <img data-testid="preview-logo" src={ws.logoUrl} alt="Logo" style={{ width: '40px', height: '40px', objectFit: 'contain', borderRadius: '8px' }} />
            ) : (
              <div data-testid="preview-logo-placeholder" style={{ width: '40px', height: '40px', borderRadius: '8px', background: ws.primaryColor || '#0284C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '16px', fontWeight: 700, color: 'white' }}>
                  {(ws.businessName || 'Q').charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div style={{ flex: 1 }}>
              <p data-testid="preview-business-name" style={{ fontSize: '16px', fontWeight: 700, color: p.colors.heading }}>
                {ws.businessName || 'Your Business Name'}
              </p>
              {ws.tagline && (
                <p data-testid="preview-tagline" style={{ fontSize: '12px', color: p.colors.muted, marginTop: '2px' }}>{ws.tagline}</p>
              )}
            </div>
          </div>

          <div style={{
            padding: '12px 16px', borderRadius: p.radius.sm,
            background: '#F3F4F6', marginBottom: '12px',
          }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: p.colors.subtle, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Category</p>
            <p data-testid="preview-category" style={{ fontSize: '14px', fontWeight: 500, color: p.colors.heading }}>
              {categoryLabel || ws.customTradeData.short_description || 'Not selected'}
            </p>
            {tradeLabel && (
              <p data-testid="preview-trade" style={{ fontSize: '12px', color: p.colors.muted, marginTop: '2px' }}>{tradeLabel}</p>
            )}
          </div>

          <div style={{
            marginTop: '12px', padding: '10px 16px', borderRadius: p.radius.sm,
            background: `${ws.primaryColor || '#0284C7'}0A`,
            border: `1px solid ${ws.primaryColor || '#0284C7'}18`,
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <div style={{ width: '16px', height: '16px', borderRadius: '4px', background: ws.primaryColor || '#0284C7' }} />
            <span style={{ fontSize: '12px', color: p.colors.muted }}>Brand color: <strong>{ws.primaryColor || '#0284C7'}</strong></span>
          </div>

          {ws.calculatorSettings.appearance.button_style !== 'soft-rounded' && (
            <div style={{ marginTop: '8px', padding: '10px 16px', borderRadius: p.radius.sm, background: '#F9FAFB' }}>
              <span style={{ fontSize: '12px', color: p.colors.muted }}>
                Button: <strong>{ws.calculatorSettings.appearance.button_style}</strong>
                {' · '}Font: <strong>{ws.calculatorSettings.appearance.font}</strong>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function SummaryCard({ ws, tradeLabel }: { ws: WizardState; tradeLabel: string }) {
  return (
    <div style={{
      marginTop: '20px', padding: '16px', borderRadius: p.radius.md,
      background: p.colors.surfaceRaised, border: `1px solid ${p.colors.borderLight}`,
    }}>
      <p style={{ fontSize: '11px', fontWeight: 700, color: p.colors.subtle, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
        Summary
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <SummaryRow label="Business" value={ws.businessName} />
        <SummaryRow label="Trade" value={tradeLabel || ws.customTradeData.short_description || '---'} />
        {ws.tagline && <SummaryRow label="Tagline" value={ws.tagline} />}
        {ws.ownerEmail && <SummaryRow label="Email" value={ws.ownerEmail} />}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
      <span style={{ fontSize: '12px', color: p.colors.muted, flexShrink: 0, minWidth: '60px' }}>{label}</span>
      <span style={{ fontSize: '13px', fontWeight: 500, color: p.colors.heading, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{value}</span>
    </div>
  );
}


function GeneratingAnimation({ progress, businessName }: { progress: number; businessName: string }) {
  const messages = [
    'Analyzing your trade...',
    'Building pricing structure...',
    'Generating service questions...',
    'Creating your calculator...',
    'Almost there...',
  ];
  const msgIndex = Math.min(Math.floor(progress / 22), messages.length - 1);

  return (
    <div className="animate-fade-in" style={{ textAlign: 'center', padding: '16px 0 8px' }}>
      <div style={{
        width: '56px', height: '56px', borderRadius: '50%',
        background: p.colors.accent,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 20px',
        boxShadow: `0 8px 24px ${p.colors.accentGlow}`,
      }}>
        <Loader2 style={{ width: '24px', height: '24px', color: 'white', animation: 'spin 1.2s linear infinite' }} />
      </div>

      <h3 style={{ fontSize: '18px', fontWeight: 700, color: p.colors.heading, marginBottom: '6px' }}>
        Building {businessName || 'Your Calculator'}
      </h3>
      <p style={{ fontSize: '13px', color: p.colors.muted, marginBottom: '24px', minHeight: '20px' }}>
        {messages[msgIndex]}
      </p>

      <div style={{
        height: '4px', borderRadius: '2px',
        background: p.colors.borderLight, overflow: 'hidden',
        margin: '0 8px',
      }}>
        <div style={{
          height: '100%', width: `${progress}%`,
          background: p.colors.accent, borderRadius: '2px',
          transition: 'width 0.4s ease-out',
        }} />
      </div>
      <p style={{ fontSize: '12px', color: p.colors.subtle, marginTop: '8px' }}>
        {Math.round(progress)}%
      </p>
    </div>
  );
}


function LaunchStep({ result, showEmbed, onToggleEmbed, onStartOver }: {
  result: any; showEmbed: boolean; onToggleEmbed: () => void; onStartOver: () => void;
}) {
  const origin = window.location.origin;
  const calcUrl = `${origin}${result.calculator_url}`;
  const embedCode = `<iframe src="${calcUrl}?embed=true" width="100%" height="700" frameborder="0" style="border:none;border-radius:16px;max-width:480px;"></iframe>`;

  return (
    <div className="animate-fade-in-up">
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div className="animate-checkmark" style={{
          width: '56px', height: '56px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 12px',
          boxShadow: '0 8px 24px rgba(16, 185, 129, 0.2)',
        }}>
          <Check style={{ width: '28px', height: '28px', color: 'white' }} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <LinkRow label="Calculator URL" url={calcUrl}
          icon={<ExternalLink style={{ width: '14px', height: '14px' }} />}
          actionLabel="Open" onAction={() => window.open(calcUrl, '_blank')} />
        <LinkRow label="Edit Link (7 days)" url={`${origin}${result.edit_url}`}
          icon={<Sparkles style={{ width: '14px', height: '14px' }} />} />
        <LinkRow label="Leads Dashboard" url={`${origin}${result.leads_url}`}
          icon={<Zap style={{ width: '14px', height: '14px' }} />} />
      </div>

      <button
        data-testid="button-embed-toggle"
        onClick={onToggleEmbed}
        style={{
          width: '100%', marginTop: '16px', padding: '12px 16px',
          borderRadius: p.radius.md, border: `1px solid ${p.colors.border}`,
          background: '#FFFFFF', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: '14px', fontWeight: 500, color: p.colors.heading,
          transition: p.transitions.fast,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Code2 style={{ width: '16px', height: '16px', color: p.colors.accent }} />
          Embed on Your Website
        </span>
        <ChevronDown style={{
          width: '16px', height: '16px', color: p.colors.muted,
          transition: p.transitions.fast,
          transform: showEmbed ? 'rotate(180deg)' : 'rotate(0)',
        }} />
      </button>

      {showEmbed && (
        <div className="animate-expand" style={{
          marginTop: '8px', padding: '14px', borderRadius: p.radius.md,
          background: '#111827', border: 'none',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#9CA3AF', letterSpacing: '0.04em', textTransform: 'uppercase' }}>HTML</span>
            <CopyBtn text={embedCode} size="small" />
          </div>
          <pre style={{
            fontSize: '11px', color: '#E5E7EB', lineHeight: 1.6,
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            fontFamily: 'monospace', margin: 0,
          }}>
            {embedCode}
          </pre>
        </div>
      )}

      <div style={{
        marginTop: '16px', padding: '14px 16px', background: p.colors.accentLighter,
        borderRadius: p.radius.md, fontSize: '13px', color: p.colors.accentDark,
        display: 'flex', alignItems: 'flex-start', gap: '10px',
        border: `1px solid ${p.colors.accentLighter}`,
      }}>
        <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0, marginTop: '1px' }} />
        <span><strong>Bookmark your links.</strong> The edit link expires in 7 days.</span>
      </div>

      <button
        data-testid="button-start-over"
        onClick={onStartOver}
        style={{
          width: '100%', marginTop: '16px', padding: '12px',
          borderRadius: p.radius.md, border: `1px solid ${p.colors.border}`,
          background: '#FFFFFF', cursor: 'pointer', fontSize: '14px',
          fontWeight: 500, color: p.colors.muted,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          transition: p.transitions.fast,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <RotateCcw style={{ width: '15px', height: '15px' }} />
        Create Another Calculator
      </button>
    </div>
  );
}


function Shell({ children, step, total, onHelp, title, subtitle, generating, genProgress }: {
  children: any; step: number; total: number; onHelp: () => void;
  title?: string; subtitle?: string; generating?: boolean; genProgress?: number;
}) {
  const progress = generating
    ? ((step / total) * 100 + (genProgress || 0) / total)
    : Math.min(((step + 1) / total) * 100, 100);

  return (
    <div style={{
      borderRadius: '20px', overflow: 'visible',
      background: '#FFFFFF', boxShadow: p.shadows.wizardCard,
      border: `1px solid ${p.colors.border}`,
    }}>
      <div style={{
        padding: '20px 24px 20px', position: 'relative',
        borderRadius: '20px 20px 0 0', borderBottom: `1px solid ${p.colors.borderLight}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.04em', color: p.colors.muted }}>
            Step {step + 1} of {total}
          </span>
          <button data-testid="button-help" onClick={onHelp}
            style={{
              width: '28px', height: '28px', borderRadius: '50%',
              border: '1px solid #BFDBFE', background: '#EFF6FF',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              WebkitTapHighlightColor: 'transparent',
            }}
            aria-label="Help"
          >
            <HelpCircle style={{ width: '15px', height: '15px', color: '#3B82F6' }} />
          </button>
        </div>

        {title && (
          <div style={{ marginBottom: '4px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, lineHeight: 1.2, marginBottom: '4px', color: p.colors.heading }}>{title}</h2>
            {subtitle && <p style={{ fontSize: '13px', color: p.colors.muted, lineHeight: 1.4 }}>{subtitle}</p>}
          </div>
        )}

        <div style={{
          height: '3px', borderRadius: '2px',
          background: p.colors.borderLight,
          marginTop: '14px', overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: `${progress}%`,
            background: p.colors.accent, borderRadius: '2px',
            transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          }} />
        </div>
      </div>

      <div style={{ padding: '24px 24px 20px', position: 'relative' }}>
        {children}
      </div>
    </div>
  );
}


function InputField({ id, testId, label, sublabel, required, value, onChange, placeholder, type, multiline, rows, error }: {
  id: string; testId: string; label: string; sublabel?: string; required?: boolean;
  value: string; onChange: (v: string) => void; placeholder: string;
  type?: string; multiline?: boolean; rows?: number; error?: string;
}) {
  return (
    <div>
      <label htmlFor={id} style={{ ...p.typography.label, display: 'block', marginBottom: '8px' }}>
        {label} {required && <span style={{ color: p.colors.danger }}>*</span>}
        {sublabel && <span style={{ fontWeight: 400, color: p.colors.subtle, textTransform: 'none', fontSize: '11px', marginLeft: '4px' }}>{sublabel}</span>}
      </label>
      {multiline ? (
        <textarea id={id} data-testid={testId} value={value}
          onChange={e => onChange(e.target.value)} placeholder={placeholder}
          rows={rows || 3} className="premium-input" style={{ resize: 'vertical' }} />
      ) : (
        <input id={id} data-testid={testId} type={type || 'text'}
          value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} className="premium-input"
          style={error ? { borderColor: p.colors.danger } : undefined}
        />
      )}
      {error && <p style={{ fontSize: '12px', color: p.colors.danger, marginTop: '4px' }}>{error}</p>}
    </div>
  );
}


function TradeDropdown({ trades, searched, selectedId, selectedLabel, search, isOpen, onSearch, onToggle, onSelect, onClose, error }: {
  trades: Trade[]; searched: Trade[]; selectedId: string; selectedLabel: string;
  search: string; isOpen: boolean; onSearch: (v: string) => void;
  onToggle: () => void; onSelect: (t: Trade) => void; onClose: () => void;
  error?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    }
  }, [isOpen]);

  useEffect(() => { if (isOpen && searchRef.current) searchRef.current.focus(); }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [isOpen, onClose]);

  return (
    <div className="animate-fade-in" style={{ marginBottom: '8px' }}>
      <label style={{ ...p.typography.label, display: 'block', marginBottom: '8px' }}>
        Choose Your Primary Trade <span style={{ color: p.colors.danger }}>*</span>
      </label>
      <button ref={triggerRef} data-testid="trade-dropdown-trigger" onClick={onToggle}
        style={{
          width: '100%', padding: '12px 16px', borderRadius: p.radius.md,
          border: `1px solid ${isOpen ? p.colors.accent : error ? p.colors.danger : p.colors.border}`,
          background: '#FFFFFF', cursor: 'pointer', textAlign: 'left',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: '15px', color: selectedId ? p.colors.heading : p.colors.subtle,
          transition: p.transitions.fast,
          boxShadow: isOpen ? p.shadows.focus : 'none',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span>{selectedLabel || 'Choose a trade...'}</span>
        <ChevronDown style={{
          width: '18px', height: '18px', color: p.colors.muted,
          transition: p.transitions.fast, transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
        }} />
      </button>
      {error && !isOpen && <p style={{ fontSize: '12px', color: p.colors.danger, marginTop: '4px' }}>{error}</p>}

      {isOpen && createPortal(
        <>
          <div className="trade-dropdown-overlay" onClick={onClose} />
          <div ref={dropdownRef} className="animate-scale-in" style={{
            position: 'fixed',
            top: `${dropdownPos.top}px`, left: `${dropdownPos.left}px`,
            width: `${dropdownPos.width}px`,
            borderRadius: p.radius.md,
            border: `1px solid ${p.colors.border}`, background: '#FFFFFF',
            boxShadow: p.shadows.xl, zIndex: 50, overflow: 'hidden',
          }}>
            <div style={{ padding: '10px 12px', borderBottom: `1px solid ${p.colors.borderLight}` }}>
              <div style={{ position: 'relative' }}>
                <Search style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', color: p.colors.subtle }} />
                <input ref={searchRef} data-testid="trade-search-input" value={search}
                  onChange={e => onSearch(e.target.value)} placeholder="Search trades..."
                  style={{
                    width: '100%', padding: '10px 12px 10px 34px', borderRadius: '8px',
                    border: `1px solid ${p.colors.border}`, fontSize: '14px',
                    background: p.colors.surfaceRaised, boxSizing: 'border-box', outline: 'none',
                  }}
                  onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = p.colors.accent; }}
                  onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = p.colors.border; }}
                />
              </div>
            </div>
            <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
              {searched.length === 0 ? (
                <div style={{ padding: '20px 16px', textAlign: 'center', fontSize: '13px', color: p.colors.muted }}>
                  No trades found for "{search}"
                </div>
              ) : searched.map(tr => (
                <button key={tr.id} data-testid={`trade-option-${tr.id}`} onClick={() => onSelect(tr)}
                  style={{
                    width: '100%', padding: '12px 16px', border: 'none',
                    background: tr.id === selectedId ? p.colors.accentLighter : 'transparent',
                    cursor: 'pointer', textAlign: 'left', fontSize: '14px',
                    color: tr.id === selectedId ? p.colors.accentDark : p.colors.body,
                    fontWeight: tr.id === selectedId ? 600 : 400,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    transition: p.transitions.fast, WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <span>{tr.label}</span>
                  {tr.id === selectedId && <Check style={{ width: '16px', height: '16px', color: p.colors.accent }} />}
                </button>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}



function MiniField({ label, required, optional, error, children }: {
  label: string; required?: boolean; optional?: boolean; error?: string; children: any;
}) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500, color: p.colors.body }}>
        {label} {required && <span style={{ color: p.colors.danger }}>*</span>}
        {optional && <span style={{ fontWeight: 400, color: p.colors.subtle, fontSize: '11px' }}> (optional)</span>}
      </label>
      {children}
      {error && <p style={{ fontSize: '12px', color: p.colors.danger, marginTop: '4px' }}>{error}</p>}
    </div>
  );
}


function Footer({ onBack, onNext, nextDisabled, backDisabled, children }: {
  onBack?: () => void; onNext?: () => void; nextDisabled?: boolean; backDisabled?: boolean;
  children?: any;
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginTop: '28px', paddingTop: '20px',
      borderTop: `1px solid ${p.colors.borderLight}`,
    }}>
      <button data-testid="button-back"
        onClick={backDisabled ? undefined : onBack} disabled={backDisabled}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '10px 16px', borderRadius: p.radius.md,
          border: '1px solid #F5D76E', background: '#FEF9E7',
          cursor: backDisabled ? 'default' : 'pointer',
          fontSize: '14px', fontWeight: 600, color: backDisabled ? p.colors.subtle : '#000000',
          transition: p.transitions.fast, opacity: backDisabled ? 0.5 : 1,
          WebkitTapHighlightColor: 'transparent', minHeight: '44px',
        }}
      >
        <ArrowLeft style={{ width: '16px', height: '16px' }} /> Back
      </button>
      {children || (
        <PrimaryBtn testId="button-continue" onClick={onNext} disabled={nextDisabled}>
          Continue <ArrowRight style={{ width: '16px', height: '16px' }} />
        </PrimaryBtn>
      )}
    </div>
  );
}


function PrimaryBtn({ children, onClick, disabled, loading, testId, fullWidth, style: extraStyle }: {
  children: any; onClick?: () => void; disabled?: boolean; loading?: boolean;
  testId?: string; fullWidth?: boolean; style?: any;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  return (
    <button data-testid={testId}
      onClick={disabled ? undefined : onClick} disabled={disabled}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)} onMouseUp={() => setPressed(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        padding: '10px 22px', borderRadius: p.radius.md, border: 'none',
        background: disabled && !loading ? '#D1D5DB' : (hovered && !disabled ? p.colors.accentDark : p.colors.accent),
        color: disabled && !loading ? '#9CA3AF' : 'white',
        cursor: disabled ? (loading ? 'wait' : 'not-allowed') : 'pointer',
        fontSize: '14px', fontWeight: 600,
        boxShadow: disabled ? 'none' : (hovered && !disabled ? p.shadows.buttonHover : p.shadows.button),
        opacity: loading ? 0.9 : 1,
        width: fullWidth ? '100%' : 'auto',
        transform: pressed && !disabled ? 'scale(0.98)' : (hovered && !disabled ? 'translateY(-1px)' : 'none'),
        transition: 'all 0.15s ease-out',
        WebkitTapHighlightColor: 'transparent', minHeight: '44px',
        ...extraStyle,
      }}
    >
      {children}
    </button>
  );
}


function HelpModal({ onClose }: { onClose: () => void }) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [expandedQ, setExpandedQ] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    modalRef.current?.focus();
    return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', h); };
  }, [onClose]);

  const faqs = [
    { q: 'Do I need an account?', a: 'No account needed. You\'ll receive a secure edit link to manage your calculator for 7 days. After that, you can duplicate it to keep going.' },
    { q: 'How do I add this to my website?', a: 'After generating your calculator, you\'ll receive an embed code. Copy the HTML snippet and paste it into your website\'s code wherever you want the calculator to appear.' },
    { q: 'What if I don\'t have a website?', a: 'No problem! Every calculator gets a unique shareable link. Send it directly to customers via email, text, or social media.' },
    { q: 'How do I receive leads?', a: 'When customers submit a quote request through your calculator, their contact info and quote details are captured. View all leads from your Leads Dashboard.' },
    { q: 'Can I edit later?', a: 'Yes! Use your edit link to update business details, pricing, questions, branding, and more anytime within the 7-day window.' },
  ];

  return createPortal(
    <div
      className="animate-modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.2)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        padding: isMobile ? '0' : '20px',
      }}
    >
      <div ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="How it works"
        className={isMobile ? 'animate-modal-sheet' : 'animate-modal-content'}
        style={{
          width: '100%',
          maxWidth: isMobile ? '100%' : '420px',
          background: '#FFFFFF',
          borderRadius: isMobile ? `${p.radius.xl} ${p.radius.xl} 0 0` : p.radius.xl,
          boxShadow: p.shadows.xl,
          padding: '24px 20px 28px',
          outline: 'none',
          maxHeight: isMobile ? '85vh' : '80vh',
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        {isMobile && (
          <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: p.colors.border, margin: '0 auto 16px' }} />
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 700, color: p.colors.heading }}>How it works</h3>
          <button data-testid="button-close-help" onClick={onClose} aria-label="Close"
            style={{
              width: '32px', height: '32px', borderRadius: '50%',
              border: 'none', background: p.colors.borderLight,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X style={{ width: '16px', height: '16px', color: p.colors.muted }} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '28px' }}>
          {[
            { n: 1, text: 'Customize your instant quote tool' },
            { n: 2, text: 'Set your pricing logic' },
            { n: 3, text: 'Publish and start receiving qualified leads' },
          ].map(item => (
            <div key={item.n} style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                background: p.colors.accentLighter,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: 700, color: p.colors.accent,
              }}>
                {item.n}
              </div>
              <p style={{ fontSize: '15px', fontWeight: 500, color: p.colors.heading, lineHeight: 1.4 }}>
                {item.text}
              </p>
            </div>
          ))}
        </div>

        <p style={{
          fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: p.colors.subtle, marginBottom: '12px',
        }}>
          Questions
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', borderTop: `1px solid ${p.colors.borderLight}` }}>
          {faqs.map((faq, i) => (
            <div key={i} style={{ borderBottom: `1px solid ${p.colors.borderLight}` }}>
              <button
                data-testid={`faq-toggle-${i}`}
                onClick={() => setExpandedQ(expandedQ === i ? null : i)}
                style={{
                  width: '100%', padding: '14px 0', border: 'none', background: 'none',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontSize: '14px', fontWeight: 500, color: p.colors.heading, textAlign: 'left',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span>{faq.q}</span>
                <ChevronDown style={{
                  width: '16px', height: '16px', color: p.colors.muted, flexShrink: 0,
                  transition: p.transitions.fast,
                  transform: expandedQ === i ? 'rotate(180deg)' : 'rotate(0)',
                }} />
              </button>
              {expandedQ === i && (
                <div className="animate-expand" style={{ paddingBottom: '14px' }}>
                  <p style={{ fontSize: '13px', color: p.colors.muted, lineHeight: 1.6 }}>{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{
          marginTop: '24px', padding: '16px', borderRadius: p.radius.md,
          background: '#FFFBEB', textAlign: 'center',
        }}>
          <p style={{ fontSize: '14px', fontWeight: 500, color: p.colors.heading, marginBottom: '12px' }}>
            Need something custom?
          </p>
          <button
            data-testid="button-request-custom-tool"
            onClick={onClose}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '10px 20px', borderRadius: p.radius.md, border: 'none',
              background: '#FBBF24', color: '#78350F',
              cursor: 'pointer', fontSize: '14px', fontWeight: 600,
              boxShadow: '0 1px 3px rgba(251,191,36,0.3), 0 1px 2px rgba(0,0,0,0.06)',
              transition: p.transitions.fast,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            Request Custom Tool <ArrowRight style={{ width: '14px', height: '14px' }} />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}


function LinkRow({ label, url, icon, actionLabel, onAction }: {
  label: string; url: string; icon?: any; actionLabel?: string; onAction?: () => void;
}) {
  return (
    <div>
      <label style={{ fontSize: '11px', fontWeight: 700, color: p.colors.muted, display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {icon} {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: p.colors.surfaceRaised, borderRadius: '10px', padding: '8px 10px', border: `1px solid ${p.colors.border}` }}>
        <span data-testid={`text-url-${label.toLowerCase().replace(/[^a-z]/g, '-')}`}
          style={{ fontSize: '11px', color: p.colors.body, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{url}</span>
        <CopyBtn text={url} />
        {actionLabel && onAction && (
          <button data-testid={`action-${label.toLowerCase().replace(/[^a-z]/g, '-')}`}
            onClick={onAction}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '6px 10px', borderRadius: '8px', border: 'none',
              background: p.colors.accent, color: 'white',
              cursor: 'pointer', fontSize: '12px', fontWeight: 600,
              minHeight: '32px', flexShrink: 0,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Eye style={{ width: '12px', height: '12px' }} /> {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function CopyBtn({ text, size }: { text: string; size?: 'small' }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <button onClick={copy}
      style={{
        display: 'flex', alignItems: 'center', gap: '4px',
        padding: size === 'small' ? '4px 8px' : '6px 10px',
        borderRadius: '8px', border: size === 'small' ? 'none' : `1px solid ${p.colors.border}`,
        background: size === 'small' ? 'rgba(255,255,255,0.1)' : 'white',
        cursor: 'pointer',
        fontSize: '12px', fontWeight: 500,
        color: size === 'small' ? '#E5E7EB' : p.colors.muted,
        transition: p.transitions.fast, minHeight: '32px',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {copied ? <Check style={{ width: '12px', height: '12px' }} /> : <Copy style={{ width: '12px', height: '12px' }} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
