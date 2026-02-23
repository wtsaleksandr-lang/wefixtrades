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

const INITIAL_CUSTOM: CustomRequest = {
  serviceOffered: '', pricingMethod: '', website: '', email: '', submitted: false,
};

const INITIAL_STATE: WizardState = {
  businessName: '', selectedCategory: '', selectedTrade: '',
  customRequest: { ...INITIAL_CUSTOM },
  ownerEmail: '', businessDescription: '', primaryColor: '#059669',
};

function loadState(): WizardState {
  try {
    const s = localStorage.getItem('qq_wizard');
    if (s) return { ...INITIAL_STATE, ...JSON.parse(s) };
  } catch {}
  return { ...INITIAL_STATE };
}

const t = designTokens;

export default function WizardCard({ embed = false }: { embed?: boolean }) {
  const [step, setStep] = useState(0);
  const [ws, setWs] = useState<WizardState>(loadState);
  const [showHelp, setShowHelp] = useState(false);
  const [tradeSearch, setTradeSearch] = useState('');
  const [tradeOpen, setTradeOpen] = useState(false);
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({});
  const [customSubmitting, setCustomSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    localStorage.setItem('qq_wizard', JSON.stringify(ws));
  }, [ws]);

  const set = useCallback(<K extends keyof WizardState>(k: K, v: WizardState[K]) => {
    setWs(p => ({ ...p, [k]: v }));
  }, []);

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

  const canContinueStep1 = () => {
    if (!ws.businessName.trim()) return false;
    if (!ws.selectedCategory) return false;
    if (ws.selectedCategory === 'custom') return ws.customRequest.submitted;
    return !!ws.selectedTrade;
  };

  const generateMutation = useMutation({
    mutationFn: async () => {
      const tradeLabel = TRADES.find(tr => tr.id === ws.selectedTrade)?.label || ws.selectedCategory;
      const aiRes = await apiRequest('POST', '/api/ai/generate-pricing', {
        trade_type: tradeLabel,
        business_description: ws.businessDescription || tradeLabel,
        services: ws.businessDescription || tradeLabel,
      });
      const aiData = await aiRes.json();
      if (!aiData.success || !aiData.pricing_config) throw new Error(aiData.error || 'Failed to generate pricing.');
      const createRes = await apiRequest('POST', '/api/calculators', {
        business_name: ws.businessName,
        trade_type: tradeLabel,
        owner_email: ws.ownerEmail || undefined,
        pricing_config: aiData.pricing_config,
        primary_color: ws.primaryColor,
      });
      const d = await createRes.json();
      if (!d.success) throw new Error(d.error || 'Failed to create calculator.');
      return d;
    },
    onSuccess: (d) => { setResult(d); setStep(5); },
  });

  const genError = generateMutation.error ? (generateMutation.error as Error).message : null;
  const selectedTradeLabel = TRADES.find(tr => tr.id === ws.selectedTrade)?.label || '';
  const totalSteps = 6;

  if (step === 5 && result) {
    const origin = window.location.origin;
    return (
      <Shell step={5} total={totalSteps} onHelp={() => setShowHelp(true)} title="You're Live!" subtitle="Share these links to start collecting leads.">
        <div className="animate-fade-in-up" style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div className="animate-checkmark" style={{ width: '56px', height: '56px', borderRadius: '50%', background: t.colors.gradientHeader, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: `0 8px 24px ${t.colors.primaryGlow}` }}>
            <Check style={{ width: '28px', height: '28px', color: 'white' }} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <LinkRow label="Calculator URL" url={`${origin}${result.calculator_url}`} icon={<ExternalLink style={{ width: '14px', height: '14px' }} />} />
          <LinkRow label="Edit Link (7 days)" url={`${origin}${result.edit_url}`} icon={<Sparkles style={{ width: '14px', height: '14px' }} />} />
          <LinkRow label="Leads Dashboard" url={`${origin}${result.leads_url}`} icon={<Zap style={{ width: '14px', height: '14px' }} />} />
        </div>
        <div className="animate-fade-in-up animation-delay-200" style={{ marginTop: '20px', padding: '14px 16px', background: t.colors.primaryLighter, borderRadius: t.radius.md, fontSize: '13px', color: t.colors.primaryDark, display: 'flex', alignItems: 'flex-start', gap: '10px', border: `1px solid ${t.colors.primaryTint}` }}>
          <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0, marginTop: '1px' }} />
          <span><strong>Bookmark these links.</strong> The edit link expires in 7 days.</span>
        </div>
        {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      </Shell>
    );
  }

  return (
    <>
      <Shell step={step} total={totalSteps} onHelp={() => setShowHelp(true)}
        title={['Business Details', 'About Your Business', 'Brand Color', 'Pricing', 'Preview', 'Launch'][step]}
        subtitle={[
          'This info appears on your quote page.',
          'Help us generate accurate pricing for you.',
          'Choose the color for your calculator.',
          'Set up your pricing structure.',
          'See how your calculator will look.',
          'Get your links and embed code.',
        ][step]}
      >
        {step === 0 && (
          <div className="animate-fade-in-up">
            <InputField
              id="business-name"
              testId="input-business-name"
              label="Business Name"
              required
              value={ws.businessName}
              onChange={v => set('businessName', v)}
              placeholder="e.g. Sunshine Cleaning Co."
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
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                      padding: '18px 8px', borderRadius: t.radius.lg, cursor: 'pointer',
                      border: sel ? `2px solid ${t.colors.primary}` : `1.5px solid ${t.colors.border}`,
                      background: sel ? t.colors.primaryLighter : '#FFFFFF',
                      transition: t.transitions.normal,
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
                      transition: t.transitions.normal,
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

            {ws.selectedCategory && ws.selectedCategory !== 'custom' && (
              <TradeDropdown
                trades={filteredTrades}
                searched={searchedTrades}
                selectedId={ws.selectedTrade}
                selectedLabel={selectedTradeLabel}
                search={tradeSearch}
                isOpen={tradeOpen}
                onSearch={setTradeSearch}
                onToggle={() => setTradeOpen(p => !p)}
                onSelect={selectTrade}
                onClose={() => setTradeOpen(false)}
              />
            )}

            {ws.selectedCategory === 'custom' && (
              <CustomPanel
                cr={ws.customRequest}
                errors={customErrors}
                submitting={customSubmitting}
                onUpdate={setCR}
                onSubmit={submitCR}
              />
            )}

            <Footer
              onBack={undefined}
              onNext={canContinueStep1() ? () => setStep(1) : undefined}
              nextDisabled={!canContinueStep1()}
              backDisabled
              step={step}
              total={totalSteps}
            />
          </div>
        )}

        {step === 1 && (
          <div className="animate-fade-in-up">
            <InputField id="biz-desc" testId="input-business-description" label="Describe Your Services"
              value={ws.businessDescription} onChange={v => set('businessDescription', v)}
              placeholder="e.g., Residential and commercial plumbing, drain cleaning..."
              multiline rows={3} />
            <div style={{ marginTop: '18px' }}>
              <InputField id="owner-email" testId="input-owner-email" label="Your Email"
                sublabel="(for lead notifications)" type="email"
                value={ws.ownerEmail} onChange={v => set('ownerEmail', v)}
                placeholder="you@company.com" />
            </div>
            <Footer onBack={() => setStep(0)} onNext={() => setStep(2)} step={step} total={totalSteps} />
          </div>
        )}

        {step === 2 && (
          <div className="animate-fade-in-up">
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '24px' }}>
              {['#059669', '#10B981', '#0ea5e9', '#2563EB', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'].map(color => (
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
              <input
                data-testid="input-custom-color"
                type="color"
                value={ws.primaryColor}
                onChange={e => set('primaryColor', e.target.value)}
                style={{ width: '44px', height: '44px', borderRadius: '50%', border: `2px solid ${t.colors.border}`, cursor: 'pointer', padding: '3px', background: 'white' }}
              />
            </div>
            <div style={{ padding: '16px', borderRadius: t.radius.md, border: `1.5px solid ${t.colors.border}`, display: 'flex', alignItems: 'center', gap: '14px', background: '#FAFBFC' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: ws.primaryColor, transition: t.transitions.normal, flexShrink: 0, boxShadow: `0 4px 12px ${ws.primaryColor}30` }} />
              <div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: t.colors.heading, marginBottom: '2px' }}>{ws.businessName || 'Your Business'}</p>
                <p style={{ fontSize: '12px', color: t.colors.muted }}>Preview of your brand</p>
              </div>
            </div>
            <Footer onBack={() => setStep(1)} step={step} total={totalSteps}>
              <PrimaryBtn testId="button-generate" onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending} loading={generateMutation.isPending}>
                {generateMutation.isPending
                  ? <><Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> Generating...</>
                  : <><Sparkles style={{ width: '16px', height: '16px' }} /> Generate Calculator</>
                }
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
      </Shell>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </>
  );
}


function Shell({ children, step, total, onHelp, title, subtitle }: {
  children: any; step: number; total: number; onHelp: () => void; title?: string; subtitle?: string;
}) {
  const progress = Math.min(((step + 1) / total) * 100, 100);

  return (
    <div style={{
      borderRadius: t.radius['2xl'],
      overflow: 'hidden',
      background: '#FFFFFF',
      boxShadow: t.shadows.lg,
    }}>
      <div className="wizard-gradient-header" style={{
        padding: '20px 20px 24px',
        color: 'white',
        position: 'relative',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.85 }}>
            Step {step + 1} of {total}
          </span>
          <button
            data-testid="button-help"
            onClick={onHelp}
            style={{
              width: '30px', height: '30px', borderRadius: '50%',
              border: '1.5px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.15)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              WebkitTapHighlightColor: 'transparent',
            }}
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

      <div style={{ padding: '24px 20px 20px' }}>
        {children}
      </div>
    </div>
  );
}


function InputField({ id, testId, label, sublabel, required, value, onChange, placeholder, type, multiline, rows }: {
  id: string; testId: string; label: string; sublabel?: string; required?: boolean;
  value: string; onChange: (v: string) => void; placeholder: string;
  type?: string; multiline?: boolean; rows?: number;
}) {
  return (
    <div>
      <label htmlFor={id} style={{ ...t.typography.label, display: 'block', marginBottom: '8px' }}>
        {label} {required && <span style={{ color: t.colors.danger }}>*</span>}
        {sublabel && <span style={{ fontWeight: 400, color: t.colors.subtle, textTransform: 'none', fontSize: '11px', marginLeft: '4px' }}>{sublabel}</span>}
      </label>
      {multiline ? (
        <textarea
          id={id} data-testid={testId} value={value}
          onChange={e => onChange(e.target.value)} placeholder={placeholder}
          rows={rows || 3} className="premium-input"
          style={{ resize: 'vertical' }}
        />
      ) : (
        <input
          id={id} data-testid={testId} type={type || 'text'}
          value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} className="premium-input"
        />
      )}
    </div>
  );
}


function TradeDropdown({ trades, searched, selectedId, selectedLabel, search, isOpen, onSearch, onToggle, onSelect, onClose }: {
  trades: Trade[]; searched: Trade[]; selectedId: string; selectedLabel: string;
  search: string; isOpen: boolean; onSearch: (v: string) => void;
  onToggle: () => void; onSelect: (t: Trade) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (isOpen && searchRef.current) searchRef.current.focus(); }, [isOpen]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    if (isOpen) document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [isOpen, onClose]);

  return (
    <div ref={ref} className="animate-fade-in" style={{ marginBottom: '8px', position: 'relative' }}>
      <label style={{ ...t.typography.label, display: 'block', marginBottom: '8px' }}>
        Select Your Trade <span style={{ color: t.colors.danger }}>*</span>
      </label>

      <button
        data-testid="trade-dropdown-trigger"
        onClick={onToggle}
        style={{
          width: '100%', padding: '14px 16px', borderRadius: t.radius.md,
          border: `1.5px solid ${isOpen ? t.colors.primary : t.colors.border}`,
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
          transition: t.transitions.fast,
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
        }} />
      </button>

      {isOpen && (
        <div className="animate-scale-in" style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          marginTop: '6px', borderRadius: t.radius.md,
          border: `1.5px solid ${t.colors.border}`, background: '#FFFFFF',
          boxShadow: t.shadows.lg, zIndex: 50, overflow: 'hidden',
        }}>
          <div style={{ padding: '10px 12px', borderBottom: `1px solid ${t.colors.borderLight}` }}>
            <div style={{ position: 'relative' }}>
              <Search style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', color: t.colors.subtle }} />
              <input
                ref={searchRef}
                data-testid="trade-search-input"
                value={search}
                onChange={e => onSearch(e.target.value)}
                placeholder="Search trades..."
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
            <div style={{ position: 'sticky', top: 0, height: '6px', background: 'linear-gradient(to bottom, rgba(255,255,255,1), rgba(255,255,255,0))', pointerEvents: 'none', zIndex: 2 }} />
            {searched.length === 0 ? (
              <div style={{ padding: '20px 16px', textAlign: 'center', fontSize: '13px', color: t.colors.muted }}>
                No trades found for "{search}"
              </div>
            ) : searched.map(tr => (
              <button
                key={tr.id}
                data-testid={`trade-option-${tr.id}`}
                onClick={() => onSelect(tr)}
                style={{
                  width: '100%', padding: '12px 16px', border: 'none',
                  background: tr.id === selectedId ? t.colors.primaryLighter : 'transparent',
                  cursor: 'pointer', textAlign: 'left', fontSize: '14px',
                  color: tr.id === selectedId ? t.colors.primaryDark : t.colors.body,
                  fontWeight: tr.id === selectedId ? 600 : 400,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  transition: t.transitions.fast,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span>{tr.label}</span>
                {tr.id === selectedId && <Check style={{ width: '16px', height: '16px', color: t.colors.primary }} />}
              </button>
            ))}
            <div style={{ position: 'sticky', bottom: 0, height: '6px', background: 'linear-gradient(to top, rgba(255,255,255,1), rgba(255,255,255,0))', pointerEvents: 'none', zIndex: 2 }} />
          </div>
        </div>
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
        background: t.colors.primaryLighter,
        border: `1.5px solid ${t.colors.primaryTint}`, marginBottom: '8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: t.colors.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Check style={{ width: '14px', height: '14px', color: 'white' }} />
          </div>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#065F46' }}>Request submitted!</span>
        </div>
        <p style={{ fontSize: '13px', color: t.colors.primaryDark, marginLeft: '34px' }}>
          We'll build a tailored quote tool for you. Click Continue.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-expand" style={{
      padding: '20px', borderRadius: t.radius.lg,
      background: '#FFFFFF', border: `1.5px dashed ${t.colors.border}`,
      marginBottom: '8px',
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
            placeholder="e.g. Residential solar panel installation"
            className="premium-input" />
        </MiniField>
        <MiniField label="How do you calculate pricing?" optional>
          <input data-testid="input-custom-pricing" value={cr.pricingMethod}
            onChange={e => onUpdate('pricingMethod', e.target.value)}
            placeholder="e.g. By panel count, roof type, and complexity"
            className="premium-input" />
        </MiniField>
        <MiniField label="Your website" optional>
          <input data-testid="input-custom-website" type="url" value={cr.website}
            onChange={e => onUpdate('website', e.target.value)}
            placeholder="https://yoursite.com"
            className="premium-input" />
        </MiniField>
        <MiniField label="Your email" required error={errors.email}>
          <input data-testid="input-custom-email" type="email" value={cr.email}
            onChange={e => onUpdate('email', e.target.value)}
            placeholder="you@example.com"
            className="premium-input" />
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


function Footer({ onBack, onNext, nextDisabled, backDisabled, step, total, children }: {
  onBack?: () => void; onNext?: () => void; nextDisabled?: boolean; backDisabled?: boolean;
  step: number; total: number; children?: any;
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginTop: '28px', paddingTop: '20px',
      borderTop: `1px solid ${t.colors.borderLight}`,
    }}>
      <button
        data-testid="button-back"
        onClick={backDisabled ? undefined : onBack}
        disabled={backDisabled}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '12px 16px', borderRadius: t.radius.md,
          border: `1.5px solid ${t.colors.border}`, background: 'white',
          cursor: backDisabled ? 'default' : 'pointer',
          fontSize: '14px', fontWeight: 500, color: backDisabled ? t.colors.subtle : t.colors.muted,
          transition: t.transitions.fast, opacity: backDisabled ? 0.5 : 1,
          WebkitTapHighlightColor: 'transparent',
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
    <button
      data-testid={testId}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        padding: '12px 24px', borderRadius: t.radius.md, border: 'none',
        background: disabled && !loading ? '#CBD5E1' : t.colors.gradientButton,
        color: disabled && !loading ? '#94A3B8' : 'white',
        cursor: disabled ? (loading ? 'wait' : 'not-allowed') : 'pointer',
        fontSize: '14px', fontWeight: 600,
        boxShadow: disabled ? 'none' : t.shadows.button,
        transition: t.transitions.fast,
        opacity: loading ? 0.9 : 1,
        width: fullWidth ? '100%' : 'auto',
        WebkitTapHighlightColor: 'transparent',
        minHeight: '44px',
        ...extraStyle,
      }}
    >
      {children}
    </button>
  );
}


function HelpModal({ onClose }: { onClose: () => void }) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    modalRef.current?.focus();
    return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', h); };
  }, [onClose]);

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.4)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        animation: 'fadeIn 0.2s ease-out',
        padding: '0',
      }}
    >
      <div
        ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Help"
        className="animate-slide-up"
        style={{
          width: '100%', maxWidth: '480px',
          background: '#FFFFFF',
          borderRadius: `${t.radius.xl} ${t.radius.xl} 0 0`,
          boxShadow: t.shadows.xl, padding: '24px 20px 32px',
          outline: 'none', maxHeight: '85vh', overflowY: 'auto',
        }}
      >
        <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: t.colors.border, margin: '0 auto 20px' }} />

        <button
          data-testid="button-close-help"
          onClick={onClose}
          style={{
            position: 'absolute', top: '16px', right: '16px',
            width: '32px', height: '32px', borderRadius: '50%',
            border: 'none', background: t.colors.borderLight,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <X style={{ width: '16px', height: '16px', color: t.colors.muted }} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: t.colors.primaryLighter, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <HelpCircle style={{ width: '20px', height: '20px', color: t.colors.primary }} />
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: t.colors.heading }}>How It Works</h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {[
            { n: 1, t: 'Business Details', d: 'Enter your business name and select your service.' },
            { n: 2, t: 'About Your Business', d: 'Add description and contact info.' },
            { n: 3, t: 'Brand Color', d: 'Pick the color for your calculator.' },
            { n: 4, t: 'Generate', d: 'AI creates a pricing model for your trade.' },
            { n: 5, t: 'Launch', d: 'Get your link, embed code, and start collecting leads.' },
          ].map(item => (
            <div key={item.n} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                background: t.colors.gradientHeader,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '12px', fontWeight: 700, color: 'white',
              }}>
                {item.n}
              </div>
              <div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: t.colors.heading, marginBottom: '2px' }}>{item.t}</p>
                <p style={{ fontSize: '13px', color: t.colors.muted, lineHeight: 1.4 }}>{item.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


function LinkRow({ label, url, icon }: { label: string; url: string; icon?: any }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div>
      <label style={{ fontSize: '11px', fontWeight: 700, color: t.colors.muted, display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {icon} {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F8FAFC', borderRadius: '10px', padding: '10px 12px', border: `1px solid ${t.colors.border}` }}>
        <span style={{ fontSize: '12px', color: t.colors.body, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{url}</span>
        <button
          onClick={copy}
          data-testid={`copy-${label.toLowerCase().replace(/\s/g, '-')}`}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '6px 12px', borderRadius: '8px',
            border: `1px solid ${t.colors.border}`, background: 'white',
            cursor: 'pointer', fontSize: '12px', fontWeight: 600,
            color: copied ? t.colors.primary : t.colors.muted,
            transition: t.transitions.fast, flexShrink: 0,
            WebkitTapHighlightColor: 'transparent',
            minHeight: '36px',
          }}
        >
          {copied ? <><Check style={{ width: '12px', height: '12px' }} /> Copied</> : <><Copy style={{ width: '12px', height: '12px' }} /> Copy</>}
        </button>
      </div>
    </div>
  );
}
