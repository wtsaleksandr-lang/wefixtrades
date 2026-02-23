import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { designTokens } from '@/components/designTokens';
import { CATEGORIES, TRADES, getTradesByCategory, type Trade } from '@/data/trades';
import {
  Loader2, ArrowRight, ArrowLeft, Check, Sparkles, Wrench, Hammer,
  Layers, AlertTriangle, Car, Briefcase, Plus, HelpCircle, X,
  Search, ChevronDown, ExternalLink, Copy, Zap, AlertCircle,
  RotateCcw, Code2, Eye, Upload, Trash2, Image as ImageIcon, ChevronRight
} from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

const ICON_MAP: Record<string, any> = {
  Sparkles, Hammer, Layers, Wrench, AlertTriangle, Car, Briefcase, Plus,
};

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
  tagline: string;
  logoUrl: string;
}

const INITIAL_CUSTOM: CustomRequest = {
  serviceOffered: '', pricingMethod: '', website: '', email: '', submitted: false,
};

const INITIAL_STATE: WizardState = {
  businessName: '', selectedCategory: '', selectedTrade: '',
  customRequest: { ...INITIAL_CUSTOM },
  ownerEmail: '', businessDescription: '', primaryColor: '#4F46E5',
  tagline: '', logoUrl: '',
};

function loadState(): WizardState {
  try {
    const s = localStorage.getItem('qq_wizard');
    if (s) return { ...INITIAL_STATE, ...JSON.parse(s) };
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

const t = designTokens;
const TOTAL_STEPS = 4;

const STEP_TITLES = ['Business Details', 'Service Info', 'Brand & Generate', 'Your Calculator'];
const STEP_SUBTITLES = [
  'This info appears on your quote page.',
  'Help us generate accurate pricing.',
  'Pick your brand color and launch.',
  'Share your links and start collecting leads.',
];

export default function WizardCard({ embed = false }: { embed?: boolean }) {
  const savedResult = loadResult();
  const savedStep = loadStep();
  const [step, setStep] = useState(savedResult && savedStep === 3 ? 3 : (savedStep < 3 ? savedStep : 0));
  const [ws, setWs] = useState<WizardState>(loadState);
  const [showHelp, setShowHelp] = useState(false);
  const [tradeSearch, setTradeSearch] = useState('');
  const [tradeOpen, setTradeOpen] = useState(false);
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({});
  const [customSubmitting, setCustomSubmitting] = useState(false);
  const [result, setResult] = useState<any>(savedResult);
  const [genProgress, setGenProgress] = useState(0);
  const [showEmbed, setShowEmbed] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

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

  const setCR = useCallback((k: keyof CustomRequest, v: any) => {
    setWs(p => ({ ...p, customRequest: { ...p.customRequest, [k]: v } }));
    if (customErrors[k]) setCustomErrors(p => { const n = { ...p }; delete n[k]; return n; });
  }, [customErrors]);

  const filteredTrades = ws.selectedCategory && ws.selectedCategory !== 'custom'
    ? getTradesByCategory(ws.selectedCategory) : [];
  const searchedTrades = tradeSearch
    ? filteredTrades.filter(tr => tr.label.toLowerCase().includes(tradeSearch.toLowerCase()))
    : filteredTrades;

  const selectCategory = (id: string) => {
    if (id === ws.selectedCategory) return;
    setWs(p => ({
      ...p, selectedCategory: id, selectedTrade: '',
      customRequest: id !== 'custom' ? { ...INITIAL_CUSTOM } : p.customRequest,
    }));
    setTradeSearch('');
    setTradeOpen(false);
  };

  const selectTrade = (tr: Trade) => {
    set('selectedTrade', tr.id);
    setTradeOpen(false);
    setTradeSearch('');
  };

  const validateCR = () => {
    const e: Record<string, string> = {};
    if (!ws.customRequest.serviceOffered.trim()) e.serviceOffered = 'Please describe your service.';
    if (!ws.customRequest.email.trim()) e.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ws.customRequest.email)) e.email = 'Enter a valid email.';
    setCustomErrors(e);
    return Object.keys(e).length === 0;
  };

  const submitCR = async () => {
    if (!validateCR()) return;
    setCustomSubmitting(true);
    await new Promise(r => setTimeout(r, 1200));
    setCR('submitted', true);
    setCustomSubmitting(false);
  };

  const canContinueStep0 = () => {
    if (!ws.businessName.trim()) return false;
    if (!ws.selectedCategory) return false;
    if (ws.selectedCategory === 'custom') return ws.customRequest.submitted;
    return !!ws.selectedTrade;
  };

  const tryStep0Continue = () => {
    const errs: Record<string, string> = {};
    if (!ws.businessName.trim()) errs.businessName = 'Business name is required.';
    if (!ws.selectedCategory) errs.selectedCategory = 'Please select a service category.';
    else if (ws.selectedCategory !== 'custom' && !ws.selectedTrade) errs.selectedTrade = 'Please select your trade.';
    setValidationErrors(errs);
    if (Object.keys(errs).length === 0) setStep(1);
  };

  const generateMutation = useMutation({
    mutationFn: async () => {
      setGenProgress(0);
      const progressTimer = setInterval(() => {
        setGenProgress(p => Math.min(p + Math.random() * 12, 90));
      }, 400);
      try {
        const tradeLabel = TRADES.find(tr => tr.id === ws.selectedTrade)?.label || ws.customRequest.serviceOffered || ws.selectedCategory;
        const aiRes = await apiRequest('POST', '/api/ai/generate-pricing', {
          trade_type: tradeLabel,
          business_description: ws.businessDescription || tradeLabel,
          services: ws.businessDescription || tradeLabel,
        });
        const aiData = await aiRes.json();
        if (!aiData.success || !aiData.pricing_config) throw new Error(aiData.error || 'Failed to generate pricing.');
        setGenProgress(70);
        const createRes = await apiRequest('POST', '/api/calculators', {
          business_name: ws.businessName,
          trade_type: tradeLabel,
          owner_email: ws.ownerEmail || undefined,
          pricing_config: aiData.pricing_config,
          primary_color: ws.primaryColor,
          tagline: ws.tagline || undefined,
          logo_url: ws.logoUrl || undefined,
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
      setTimeout(() => setStep(3), 500);
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

  return (
    <>
      <Shell step={step} total={TOTAL_STEPS} onHelp={() => setShowHelp(true)}
        title={STEP_TITLES[step]} subtitle={STEP_SUBTITLES[step]}
        generating={generateMutation.isPending} genProgress={genProgress}
      >

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
              <label style={{ ...t.typography.label, display: 'block', marginBottom: '6px' }}>
                Service Category <span style={{ color: t.colors.danger }}>*</span>
              </label>
              <p style={{ fontSize: '13px', color: t.colors.muted, lineHeight: 1.5 }}>
                Select your primary service. We'll generate a tailored pricing structure.
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
                    className="category-card hover-elevate active-elevate-2"
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                      padding: '18px 8px', borderRadius: t.radius.lg, cursor: 'pointer',
                      border: sel ? `2px solid ${t.colors.primary}` : `1.5px solid ${t.colors.border}`,
                      background: sel ? t.colors.primaryLighter : '#FFFFFF',
                      boxShadow: sel ? t.shadows.selected : t.shadows.xs,
                      position: 'relative', outline: 'none',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    {sel && (
                      <div style={{
                        position: 'absolute', top: '6px', right: '6px',
                        width: '20px', height: '20px', borderRadius: '50%',
                        background: t.colors.primary, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Check style={{ width: '12px', height: '12px', color: 'white' }} />
                      </div>
                    )}
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '12px',
                      background: sel ? t.colors.gradientHeader : '#F1F5F9',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon style={{ width: '20px', height: '20px', color: sel ? 'white' : t.colors.muted }} />
                    </div>
                    <span style={{
                      fontSize: '12px', fontWeight: 600, textAlign: 'center', lineHeight: 1.3,
                      color: sel ? t.colors.primaryDark : t.colors.heading,
                    }}>
                      {cat.label}
                    </span>
                  </button>
                );
              })}
            </div>
            {validationErrors.selectedCategory && (
              <p style={{ fontSize: '12px', color: t.colors.danger, marginBottom: '8px' }}>{validationErrors.selectedCategory}</p>
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
              <CustomPanel cr={ws.customRequest} errors={customErrors}
                submitting={customSubmitting} onUpdate={setCR} onSubmit={submitCR} />
            )}

            <div style={{ marginTop: '24px' }}>
              <label style={{ ...t.typography.label, display: 'block', marginBottom: '8px' }}>
                Brand Logo <span style={{ fontWeight: 400, color: t.colors.subtle, textTransform: 'none', fontSize: '11px' }}>(optional)</span>
              </label>
              {ws.logoUrl ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 16px', borderRadius: t.radius.md,
                  border: `1.5px solid ${t.colors.border}`, background: '#FAFBFC',
                }}>
                  <img src={ws.logoUrl} alt="Logo" style={{ width: '48px', height: '48px', objectFit: 'contain', borderRadius: '8px', background: 'white', border: `1px solid ${t.colors.borderLight}` }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '13px', fontWeight: 500, color: t.colors.heading }}>Logo uploaded</p>
                    <p style={{ fontSize: '11px', color: t.colors.muted }}>PNG, JPG, or SVG</p>
                  </div>
                  <button data-testid="button-remove-logo" onClick={() => set('logoUrl', '')}
                    style={{ width: '36px', height: '36px', borderRadius: '8px', border: `1px solid ${t.colors.border}`, background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Trash2 style={{ width: '14px', height: '14px', color: t.colors.danger }} />
                  </button>
                </div>
              ) : (
                <label data-testid="button-upload-logo" style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '14px 16px', borderRadius: t.radius.md,
                  border: `1.5px dashed ${t.colors.border}`, background: '#FAFBFC',
                  cursor: 'pointer', transition: t.transitions.fast,
                }}>
                  <Upload style={{ width: '18px', height: '18px', color: t.colors.subtle }} />
                  <span style={{ fontSize: '14px', color: t.colors.muted }}>Upload PNG, JPG or SVG</span>
                  <input type="file" accept=".png,.jpg,.jpeg,.svg" onChange={handleLogoUpload} style={{ display: 'none' }} />
                </label>
              )}
              {logoError && <p data-testid="text-logo-error" style={{ fontSize: '12px', color: t.colors.danger, marginTop: '6px' }}>{logoError}</p>}
            </div>

            <div style={{ marginTop: '18px' }}>
              <label htmlFor="tagline" style={{ ...t.typography.label, display: 'block', marginBottom: '8px' }}>
                Tagline <span style={{ fontWeight: 400, color: t.colors.subtle, textTransform: 'none', fontSize: '11px' }}>(optional)</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input id="tagline" data-testid="input-tagline"
                  value={ws.tagline} onChange={e => { if (e.target.value.length <= 120) set('tagline', e.target.value); }}
                  placeholder="e.g. Premium driveway paving in Toronto."
                  className="premium-input"
                  maxLength={120}
                />
                <span style={{
                  position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                  fontSize: '11px', color: ws.tagline.length > 100 ? t.colors.warning : t.colors.subtle,
                  fontWeight: 500, pointerEvents: 'none',
                }}>
                  {ws.tagline.length}/120
                </span>
              </div>
            </div>

            <Footer onBack={undefined} onNext={canContinueStep0() ? tryStep0Continue : tryStep0Continue}
              nextDisabled={false} backDisabled />
          </div>
        )}

        {step === 1 && (
          <div className="animate-fade-in-up">
            <InputField id="biz-desc" testId="input-business-description"
              label="Describe Your Services"
              value={ws.businessDescription} onChange={v => set('businessDescription', v)}
              placeholder="e.g., Residential and commercial plumbing, drain cleaning, bathroom renovations..."
              multiline rows={3} />

            <div style={{ marginTop: '18px' }}>
              <InputField id="owner-email" testId="input-owner-email"
                label="Your Email" sublabel="(for lead notifications)" type="email"
                value={ws.ownerEmail} onChange={v => set('ownerEmail', v)}
                placeholder="you@company.com" />
            </div>

            <div style={{
              marginTop: '20px', padding: '14px 16px', borderRadius: t.radius.md,
              background: t.colors.primaryLighter, border: `1px solid ${t.colors.primaryLighter}`,
              display: 'flex', alignItems: 'flex-start', gap: '10px',
            }}>
              <Sparkles style={{ width: '16px', height: '16px', color: t.colors.primary, flexShrink: 0, marginTop: '1px' }} />
              <p style={{ fontSize: '13px', color: t.colors.primaryDark, lineHeight: 1.5 }}>
                The more detail you provide, the better your AI-generated pricing will be.
              </p>
            </div>

            <Footer onBack={() => setStep(0)} onNext={() => setStep(2)} />
          </div>
        )}

        {step === 2 && !generateMutation.isPending && (
          <div className="animate-fade-in-up">
            <label style={{ ...t.typography.label, display: 'block', marginBottom: '12px' }}>
              Brand Color
            </label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '24px' }}>
              {['#4F46E5', '#6366F1', '#0ea5e9', '#2563EB', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'].map(color => (
                <button
                  key={color}
                  data-testid={`color-option-${color.replace('#', '')}`}
                  onClick={() => set('primaryColor', color)}
                  style={{
                    width: '44px', height: '44px', borderRadius: '50%', backgroundColor: color,
                    border: ws.primaryColor === color ? '3px solid #0F172A' : '2px solid transparent',
                    cursor: 'pointer', transform: ws.primaryColor === color ? 'scale(1.15)' : 'scale(1)',
                    transition: t.transitions.spring,
                    boxShadow: ws.primaryColor === color ? `0 4px 14px ${color}50` : '0 1px 3px rgba(0,0,0,0.1)',
                    outline: 'none', WebkitTapHighlightColor: 'transparent',
                  }}
                />
              ))}
              <div style={{ width: '1px', height: '28px', background: t.colors.border, margin: '0 2px' }} />
              <input data-testid="input-custom-color" type="color" value={ws.primaryColor}
                onChange={e => set('primaryColor', e.target.value)}
                style={{ width: '44px', height: '44px', borderRadius: '50%', border: `2px solid ${t.colors.border}`, cursor: 'pointer', padding: '3px', background: 'white' }} />
            </div>

            <div style={{
              padding: '16px', borderRadius: t.radius.lg, border: `1.5px solid ${t.colors.border}`,
              display: 'flex', alignItems: 'center', gap: '14px', background: '#FAFBFC',
            }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: ws.primaryColor, transition: t.transitions.normal, flexShrink: 0, boxShadow: `0 4px 12px ${ws.primaryColor}30` }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '14px', fontWeight: 600, color: t.colors.heading, marginBottom: '2px' }}>{ws.businessName || 'Your Business'}</p>
                <p style={{ fontSize: '12px', color: t.colors.muted }}>{selectedTradeLabel || 'Your Trade'}</p>
              </div>
            </div>

            <SummaryCard ws={ws} tradeLabel={selectedTradeLabel} />

            <Footer onBack={() => setStep(1)}>
              <PrimaryBtn testId="button-generate" onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending} loading={generateMutation.isPending}>
                <Sparkles style={{ width: '16px', height: '16px' }} /> Generate Calculator
              </PrimaryBtn>
            </Footer>

            {genError && (
              <div className="animate-fade-in-up" style={{ marginTop: '14px', padding: '12px 16px', borderRadius: t.radius.md, background: t.colors.dangerLight, border: '1px solid #FCA5A5', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertCircle style={{ width: '15px', height: '15px', color: t.colors.danger, flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: '#991B1B' }}>{genError}</span>
              </div>
            )}
          </div>
        )}

        {step === 2 && generateMutation.isPending && (
          <GeneratingAnimation progress={genProgress} businessName={ws.businessName} />
        )}

        {step === 3 && result && (
          <LaunchStep result={result} showEmbed={showEmbed} onToggleEmbed={() => setShowEmbed(p => !p)} onStartOver={startOver} />
        )}

        {step === 3 && !result && (
          <div className="animate-fade-in-up" style={{ textAlign: 'center', padding: '24px 0' }}>
            <p style={{ fontSize: '14px', color: t.colors.muted, marginBottom: '16px' }}>
              Your previous session expired. Let's generate a fresh calculator.
            </p>
            <PrimaryBtn testId="button-back-to-generate" onClick={() => setStep(2)} fullWidth>
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


function LivePreview({ ws, tradeLabel, categoryLabel, isOpen, onToggle, step }: {
  ws: WizardState; tradeLabel: string; categoryLabel: string;
  isOpen: boolean; onToggle: () => void; step: number;
}) {
  if (step === 3) return null;

  return (
    <div style={{ marginTop: '20px', borderTop: `1px solid ${t.colors.borderLight}`, paddingTop: '16px' }}>
      <button data-testid="button-live-preview-toggle" onClick={onToggle}
        style={{
          width: '100%', padding: '12px 16px', borderRadius: t.radius.md,
          border: `1.5px solid ${t.colors.border}`, background: '#FAFBFC',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Eye style={{ width: '16px', height: '16px', color: t.colors.primary }} />
          <div style={{ textAlign: 'left' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: t.colors.heading, display: 'block' }}>Quote Page Preview</span>
            <span style={{ fontSize: '11px', color: t.colors.muted }}>Live preview of your calculator page</span>
          </div>
        </div>
        <ChevronDown style={{
          width: '18px', height: '18px', color: t.colors.muted,
          transition: t.transitions.fast, transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
        }} />
      </button>

      {isOpen && (
        <div className="animate-expand" style={{
          marginTop: '10px', padding: '20px', borderRadius: t.radius.md,
          border: `1.5px solid ${t.colors.border}`, background: 'white',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            {ws.logoUrl ? (
              <img data-testid="preview-logo" src={ws.logoUrl} alt="Logo" style={{ width: '40px', height: '40px', objectFit: 'contain', borderRadius: '8px' }} />
            ) : (
              <div data-testid="preview-logo-placeholder" style={{ width: '40px', height: '40px', borderRadius: '8px', background: ws.primaryColor || t.colors.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '16px', fontWeight: 700, color: 'white' }}>
                  {(ws.businessName || 'Q').charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div style={{ flex: 1 }}>
              <p data-testid="preview-business-name" style={{ fontSize: '16px', fontWeight: 700, color: t.colors.heading }}>
                {ws.businessName || 'Your Business Name'}
              </p>
              {ws.tagline && (
                <p data-testid="preview-tagline" style={{ fontSize: '12px', color: t.colors.muted, marginTop: '2px' }}>{ws.tagline}</p>
              )}
            </div>
          </div>

          <div style={{
            padding: '12px 16px', borderRadius: t.radius.sm,
            background: t.colors.primaryLighter, marginBottom: '12px',
          }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: t.colors.subtle, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Category</p>
            <p data-testid="preview-category" style={{ fontSize: '14px', fontWeight: 500, color: t.colors.heading }}>
              {categoryLabel || ws.customRequest.serviceOffered || 'Not selected'}
            </p>
            {tradeLabel && (
              <p data-testid="preview-trade" style={{ fontSize: '12px', color: t.colors.muted, marginTop: '2px' }}>{tradeLabel}</p>
            )}
          </div>

          {ws.businessDescription && (
            <div style={{ padding: '12px 16px', borderRadius: t.radius.sm, background: '#F8FAFC' }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: t.colors.subtle, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Services</p>
              <p style={{ fontSize: '13px', color: t.colors.body, lineHeight: 1.5 }}>{ws.businessDescription}</p>
            </div>
          )}

          <div style={{
            marginTop: '12px', padding: '10px 16px', borderRadius: t.radius.sm,
            background: `${ws.primaryColor || t.colors.primary}12`,
            border: `1px solid ${ws.primaryColor || t.colors.primary}20`,
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <div style={{ width: '16px', height: '16px', borderRadius: '4px', background: ws.primaryColor || t.colors.primary }} />
            <span style={{ fontSize: '12px', color: t.colors.muted }}>Brand color: <strong>{ws.primaryColor || t.colors.primary}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}


function SummaryCard({ ws, tradeLabel }: { ws: WizardState; tradeLabel: string }) {
  return (
    <div style={{
      marginTop: '20px', padding: '16px', borderRadius: t.radius.md,
      background: '#F8FAFC', border: `1px solid ${t.colors.borderLight}`,
    }}>
      <p style={{ fontSize: '11px', fontWeight: 700, color: t.colors.subtle, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
        Summary
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <SummaryRow label="Business" value={ws.businessName} />
        <SummaryRow label="Trade" value={tradeLabel || ws.customRequest.serviceOffered || '---'} />
        {ws.tagline && <SummaryRow label="Tagline" value={ws.tagline} />}
        {ws.businessDescription && <SummaryRow label="Services" value={ws.businessDescription} />}
        {ws.ownerEmail && <SummaryRow label="Email" value={ws.ownerEmail} />}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
      <span style={{ fontSize: '12px', color: t.colors.muted, flexShrink: 0, minWidth: '60px' }}>{label}</span>
      <span style={{ fontSize: '13px', fontWeight: 500, color: t.colors.heading, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{value}</span>
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
        width: '64px', height: '64px', borderRadius: '50%',
        background: t.colors.gradientHeader,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 20px',
        boxShadow: `0 8px 24px ${t.colors.primaryGlow}`,
      }}>
        <Loader2 style={{ width: '28px', height: '28px', color: 'white', animation: 'spin 1.2s linear infinite' }} />
      </div>

      <h3 style={{ fontSize: '18px', fontWeight: 700, color: t.colors.heading, marginBottom: '6px' }}>
        Building {businessName || 'Your Calculator'}
      </h3>
      <p style={{ fontSize: '13px', color: t.colors.muted, marginBottom: '24px', minHeight: '20px' }}>
        {messages[msgIndex]}
      </p>

      <div style={{
        height: '6px', borderRadius: '3px',
        background: t.colors.borderLight, overflow: 'hidden',
        margin: '0 8px',
      }}>
        <div style={{
          height: '100%', width: `${progress}%`,
          background: t.colors.gradientHeader, borderRadius: '3px',
          transition: 'width 0.4s ease-out',
        }} />
      </div>
      <p style={{ fontSize: '12px', color: t.colors.subtle, marginTop: '8px' }}>
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
          boxShadow: '0 8px 24px rgba(16, 185, 129, 0.25)',
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
          borderRadius: t.radius.md, border: `1.5px solid ${t.colors.border}`,
          background: '#FFFFFF', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: '14px', fontWeight: 500, color: t.colors.heading,
          transition: t.transitions.fast,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Code2 style={{ width: '16px', height: '16px', color: t.colors.primary }} />
          Embed on Your Website
        </span>
        <ChevronDown style={{
          width: '16px', height: '16px', color: t.colors.muted,
          transition: t.transitions.fast,
          transform: showEmbed ? 'rotate(180deg)' : 'rotate(0)',
        }} />
      </button>

      {showEmbed && (
        <div className="animate-expand" style={{
          marginTop: '8px', padding: '14px', borderRadius: t.radius.md,
          background: '#0F172A', border: 'none',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8', letterSpacing: '0.04em', textTransform: 'uppercase' }}>HTML</span>
            <CopyBtn text={embedCode} size="small" />
          </div>
          <pre style={{
            fontSize: '11px', color: '#E2E8F0', lineHeight: 1.6,
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            fontFamily: 'monospace', margin: 0,
          }}>
            {embedCode}
          </pre>
        </div>
      )}

      <div style={{
        marginTop: '16px', padding: '14px 16px', background: t.colors.primaryLighter,
        borderRadius: t.radius.md, fontSize: '13px', color: t.colors.primaryDark,
        display: 'flex', alignItems: 'flex-start', gap: '10px',
        border: `1px solid ${t.colors.primaryLighter}`,
      }}>
        <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0, marginTop: '1px' }} />
        <span><strong>Bookmark your links.</strong> The edit link expires in 7 days.</span>
      </div>

      <button
        data-testid="button-start-over"
        onClick={onStartOver}
        style={{
          width: '100%', marginTop: '16px', padding: '12px',
          borderRadius: t.radius.md, border: `1.5px solid ${t.colors.border}`,
          background: '#FFFFFF', cursor: 'pointer', fontSize: '14px',
          fontWeight: 500, color: t.colors.muted,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          transition: t.transitions.fast,
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
      borderRadius: t.radius['2xl'], overflow: 'visible',
      background: '#FFFFFF', boxShadow: t.shadows.lg,
    }}>
      <div className="wizard-gradient-header" style={{
        padding: '20px 20px 24px', color: 'white', position: 'relative',
        borderRadius: `${t.radius['2xl']} ${t.radius['2xl']} 0 0`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.85 }}>
            Step {step + 1} of {total}
          </span>
          <button data-testid="button-help" onClick={onHelp}
            style={{
              width: '30px', height: '30px', borderRadius: '50%',
              border: '1.5px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.15)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              WebkitTapHighlightColor: 'transparent',
            }}
            aria-label="Help"
          >
            <HelpCircle style={{ width: '16px', height: '16px', color: 'white' }} />
          </button>
        </div>

        {title && (
          <div style={{ marginBottom: '4px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: 700, lineHeight: 1.2, marginBottom: '4px' }}>{title}</h2>
            {subtitle && <p style={{ fontSize: '13px', opacity: 0.8, lineHeight: 1.4 }}>{subtitle}</p>}
          </div>
        )}

        <div style={{
          height: '4px', borderRadius: '2px',
          background: 'rgba(255,255,255,0.25)',
          marginTop: '16px', overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: `${progress}%`,
            background: 'white', borderRadius: '2px',
            transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          }} />
        </div>
      </div>

      <div style={{ padding: '24px 20px 20px', position: 'relative' }}>
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
      <label htmlFor={id} style={{ ...t.typography.label, display: 'block', marginBottom: '8px' }}>
        {label} {required && <span style={{ color: t.colors.danger }}>*</span>}
        {sublabel && <span style={{ fontWeight: 400, color: t.colors.subtle, textTransform: 'none', fontSize: '11px', marginLeft: '4px' }}>{sublabel}</span>}
      </label>
      {multiline ? (
        <textarea id={id} data-testid={testId} value={value}
          onChange={e => onChange(e.target.value)} placeholder={placeholder}
          rows={rows || 3} className="premium-input" style={{ resize: 'vertical' }} />
      ) : (
        <input id={id} data-testid={testId} type={type || 'text'}
          value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} className="premium-input"
          style={error ? { borderColor: t.colors.danger } : undefined}
        />
      )}
      {error && <p style={{ fontSize: '12px', color: t.colors.danger, marginTop: '4px' }}>{error}</p>}
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
      <label style={{ ...t.typography.label, display: 'block', marginBottom: '8px' }}>
        Select Your Trade <span style={{ color: t.colors.danger }}>*</span>
      </label>
      <button ref={triggerRef} data-testid="trade-dropdown-trigger" onClick={onToggle}
        style={{
          width: '100%', padding: '14px 16px', borderRadius: t.radius.md,
          border: `1.5px solid ${isOpen ? t.colors.primary : error ? t.colors.danger : t.colors.border}`,
          background: '#FFFFFF', cursor: 'pointer', textAlign: 'left',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: '15px', color: selectedId ? t.colors.heading : t.colors.subtle,
          transition: t.transitions.fast,
          boxShadow: isOpen ? t.shadows.focus : 'none',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span>{selectedLabel || 'Choose a trade...'}</span>
        <ChevronDown style={{
          width: '18px', height: '18px', color: t.colors.muted,
          transition: t.transitions.fast, transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
        }} />
      </button>
      {error && !isOpen && <p style={{ fontSize: '12px', color: t.colors.danger, marginTop: '4px' }}>{error}</p>}

      {isOpen && createPortal(
        <>
          <div className="trade-dropdown-overlay" onClick={onClose} />
          <div ref={dropdownRef} className="animate-scale-in" style={{
            position: 'fixed',
            top: `${dropdownPos.top}px`, left: `${dropdownPos.left}px`,
            width: `${dropdownPos.width}px`,
            borderRadius: t.radius.md,
            border: `1.5px solid ${t.colors.border}`, background: '#FFFFFF',
            boxShadow: t.shadows.xl, zIndex: 50, overflow: 'hidden',
          }}>
            <div style={{ padding: '10px 12px', borderBottom: `1px solid ${t.colors.borderLight}` }}>
              <div style={{ position: 'relative' }}>
                <Search style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', color: t.colors.subtle }} />
                <input ref={searchRef} data-testid="trade-search-input" value={search}
                  onChange={e => onSearch(e.target.value)} placeholder="Search trades..."
                  style={{
                    width: '100%', padding: '10px 12px 10px 34px', borderRadius: '8px',
                    border: `1px solid ${t.colors.border}`, fontSize: '14px',
                    background: t.colors.surfaceRaised, boxSizing: 'border-box', outline: 'none',
                  }}
                  onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = t.colors.primary; }}
                  onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = t.colors.border; }}
                />
              </div>
            </div>
            <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
              {searched.length === 0 ? (
                <div style={{ padding: '20px 16px', textAlign: 'center', fontSize: '13px', color: t.colors.muted }}>
                  No trades found for "{search}"
                </div>
              ) : searched.map(tr => (
                <button key={tr.id} data-testid={`trade-option-${tr.id}`} onClick={() => onSelect(tr)}
                  style={{
                    width: '100%', padding: '12px 16px', border: 'none',
                    background: tr.id === selectedId ? t.colors.primaryLighter : 'transparent',
                    cursor: 'pointer', textAlign: 'left', fontSize: '14px',
                    color: tr.id === selectedId ? t.colors.primaryDark : t.colors.body,
                    fontWeight: tr.id === selectedId ? 600 : 400,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    transition: t.transitions.fast, WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <span>{tr.label}</span>
                  {tr.id === selectedId && <Check style={{ width: '16px', height: '16px', color: t.colors.primary }} />}
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


function CustomPanel({ cr, errors, submitting, onUpdate, onSubmit }: {
  cr: CustomRequest; errors: Record<string, string>; submitting: boolean;
  onUpdate: (k: keyof CustomRequest, v: any) => void; onSubmit: () => void;
}) {
  if (cr.submitted) {
    return (
      <div className="animate-fade-in" style={{
        padding: '20px', borderRadius: t.radius.lg,
        background: '#ECFDF5', border: `1.5px solid #A7F3D0`, marginBottom: '8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Check style={{ width: '14px', height: '14px', color: 'white' }} />
          </div>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#065F46' }}>Request submitted!</span>
        </div>
        <p style={{ fontSize: '13px', color: '#047857', marginLeft: '34px' }}>
          We'll build a tailored quote tool for you. Click Continue.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-expand" style={{
      padding: '20px', borderRadius: t.radius.lg,
      background: '#FFFFFF', border: `1.5px dashed ${t.colors.border}`, marginBottom: '8px',
    }}>
      <h4 style={{ fontSize: '15px', fontWeight: 600, color: t.colors.heading, marginBottom: '4px' }}>
        Request a Custom Quote Tool
      </h4>
      <p style={{ fontSize: '13px', color: t.colors.muted, marginBottom: '18px', lineHeight: 1.5 }}>
        Tell us about your service and we'll build it for you.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <MiniField label="What service do you offer?" required error={errors.serviceOffered}>
          <input data-testid="input-custom-service" value={cr.serviceOffered}
            onChange={e => onUpdate('serviceOffered', e.target.value)}
            placeholder="e.g. Residential solar panel installation" className="premium-input" />
        </MiniField>
        <MiniField label="How do you calculate pricing?" optional>
          <input data-testid="input-custom-pricing" value={cr.pricingMethod}
            onChange={e => onUpdate('pricingMethod', e.target.value)}
            placeholder="e.g. By panel count, roof type, complexity" className="premium-input" />
        </MiniField>
        <MiniField label="Your website" optional>
          <input data-testid="input-custom-website" type="url" value={cr.website}
            onChange={e => onUpdate('website', e.target.value)}
            placeholder="https://yoursite.com" className="premium-input" />
        </MiniField>
        <MiniField label="Your email" required error={errors.email}>
          <input data-testid="input-custom-email" type="email" value={cr.email}
            onChange={e => onUpdate('email', e.target.value)}
            placeholder="you@example.com" className="premium-input" />
        </MiniField>
      </div>
      <PrimaryBtn testId="button-custom-submit" onClick={onSubmit}
        disabled={submitting} loading={submitting} fullWidth style={{ marginTop: '18px' }}>
        {submitting
          ? <><Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> Requesting...</>
          : 'Request Custom Quote Tool'
        }
      </PrimaryBtn>
    </div>
  );
}

function MiniField({ label, required, optional, error, children }: {
  label: string; required?: boolean; optional?: boolean; error?: string; children: any;
}) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500, color: t.colors.body }}>
        {label} {required && <span style={{ color: t.colors.danger }}>*</span>}
        {optional && <span style={{ fontWeight: 400, color: t.colors.subtle, fontSize: '11px' }}> (optional)</span>}
      </label>
      {children}
      {error && <p style={{ fontSize: '12px', color: t.colors.danger, marginTop: '4px' }}>{error}</p>}
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
      borderTop: `1px solid ${t.colors.borderLight}`,
    }}>
      <button data-testid="button-back"
        onClick={backDisabled ? undefined : onBack} disabled={backDisabled}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '12px 16px', borderRadius: t.radius.md,
          border: `1.5px solid ${t.colors.border}`, background: 'white',
          cursor: backDisabled ? 'default' : 'pointer',
          fontSize: '14px', fontWeight: 500, color: backDisabled ? t.colors.subtle : t.colors.muted,
          transition: t.transitions.fast, opacity: backDisabled ? 0.5 : 1,
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
  return (
    <button data-testid={testId}
      onClick={disabled ? undefined : onClick} disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        padding: '12px 24px', borderRadius: t.radius.md, border: 'none',
        background: disabled && !loading ? '#CBD5E1' : t.colors.gradientButton,
        color: disabled && !loading ? '#94A3B8' : 'white',
        cursor: disabled ? (loading ? 'wait' : 'not-allowed') : 'pointer',
        fontSize: '14px', fontWeight: 600,
        boxShadow: disabled ? 'none' : t.shadows.button,
        opacity: loading ? 0.9 : 1,
        width: fullWidth ? '100%' : 'auto',
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
        background: 'rgba(15, 23, 42, 0.4)',
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
          borderRadius: isMobile ? `${t.radius.xl} ${t.radius.xl} 0 0` : t.radius.xl,
          boxShadow: t.shadows.xl,
          padding: '24px 20px 28px',
          outline: 'none',
          maxHeight: isMobile ? '85vh' : '80vh',
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        {isMobile && (
          <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: t.colors.border, margin: '0 auto 16px' }} />
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 700, color: t.colors.heading }}>How it works</h3>
          <button data-testid="button-close-help" onClick={onClose} aria-label="Close"
            style={{
              width: '32px', height: '32px', borderRadius: '50%',
              border: 'none', background: t.colors.borderLight,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X style={{ width: '16px', height: '16px', color: t.colors.muted }} />
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
                background: t.colors.primaryLighter,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: 700, color: t.colors.primary,
              }}>
                {item.n}
              </div>
              <p style={{ fontSize: '15px', fontWeight: 500, color: t.colors.heading, lineHeight: 1.4 }}>
                {item.text}
              </p>
            </div>
          ))}
        </div>

        <p style={{
          fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: t.colors.subtle, marginBottom: '12px',
        }}>
          Questions
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', borderTop: `1px solid ${t.colors.borderLight}` }}>
          {faqs.map((faq, i) => (
            <div key={i} style={{ borderBottom: `1px solid ${t.colors.borderLight}` }}>
              <button
                data-testid={`faq-toggle-${i}`}
                onClick={() => setExpandedQ(expandedQ === i ? null : i)}
                style={{
                  width: '100%', padding: '14px 0', border: 'none', background: 'none',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontSize: '14px', fontWeight: 500, color: t.colors.heading, textAlign: 'left',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span>{faq.q}</span>
                <ChevronDown style={{
                  width: '16px', height: '16px', color: t.colors.muted, flexShrink: 0,
                  transition: t.transitions.fast,
                  transform: expandedQ === i ? 'rotate(180deg)' : 'rotate(0)',
                }} />
              </button>
              {expandedQ === i && (
                <div className="animate-expand" style={{ paddingBottom: '14px' }}>
                  <p style={{ fontSize: '13px', color: t.colors.muted, lineHeight: 1.6 }}>{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{
          marginTop: '24px', padding: '16px', borderRadius: t.radius.md,
          background: t.colors.primaryLighter, textAlign: 'center',
        }}>
          <p style={{ fontSize: '14px', fontWeight: 500, color: t.colors.heading, marginBottom: '12px' }}>
            Need something custom?
          </p>
          <button
            data-testid="button-request-custom-tool"
            onClick={onClose}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '10px 20px', borderRadius: t.radius.md, border: 'none',
              background: t.colors.gradientButton, color: 'white',
              cursor: 'pointer', fontSize: '14px', fontWeight: 600,
              boxShadow: t.shadows.button,
              transition: t.transitions.fast,
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
      <label style={{ fontSize: '11px', fontWeight: 700, color: t.colors.muted, display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {icon} {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#F8FAFC', borderRadius: '10px', padding: '8px 10px', border: `1px solid ${t.colors.border}` }}>
        <span data-testid={`text-url-${label.toLowerCase().replace(/[^a-z]/g, '-')}`}
          style={{ fontSize: '11px', color: t.colors.body, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{url}</span>
        <CopyBtn text={url} />
        {actionLabel && onAction && (
          <button data-testid={`action-${label.toLowerCase().replace(/[^a-z]/g, '-')}`}
            onClick={onAction}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '6px 10px', borderRadius: '8px', border: 'none',
              background: t.colors.gradientButton, color: 'white',
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
        borderRadius: '8px', border: size === 'small' ? 'none' : `1px solid ${t.colors.border}`,
        background: size === 'small' ? 'rgba(255,255,255,0.1)' : 'white',
        cursor: 'pointer',
        fontSize: '12px', fontWeight: 500,
        color: size === 'small' ? '#E2E8F0' : t.colors.muted,
        transition: t.transitions.fast, minHeight: '32px',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {copied ? <Check style={{ width: '12px', height: '12px' }} /> : <Copy style={{ width: '12px', height: '12px' }} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
