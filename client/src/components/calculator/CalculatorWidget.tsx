import { useState, useMemo } from 'react';
import { getWidgetTheme } from '@/theme/widgetTheme';
import { Loader2, PartyPopper, AlertCircle, ChevronLeft, ArrowRight, CheckCircle2, Plus, Minus, Phone } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { calculateEstimate } from '@shared/calculateEstimate';
import { validatePricingConfig, FAMILY_LABELS } from '@shared/pricingConfig';
import type { PricingConfigV1, AddOn, DifficultyTier } from '@shared/pricingConfig';
import type { EstimateInputs, EstimateResult } from '@shared/calculateEstimate';

interface CalculatorData {
  id: number;
  slug: string;
  business_name: string;
  tagline?: string;
  logo_url?: string;
  primary_color?: string;
  pricing_config: any;
  theme_overrides?: any;
  cta_button_text?: string;
  lead_thank_you_message?: string;
}

interface CalculatorWidgetProps {
  calculator: CalculatorData;
  isEmbed?: boolean;
}

export default function CalculatorWidget({ calculator, isEmbed = false }: CalculatorWidgetProps) {
  const theme = getWidgetTheme(calculator.theme_overrides, calculator.primary_color);
  const accentColor = theme.colors.primary;

  const validation = useMemo(() => validatePricingConfig(calculator.pricing_config), [calculator.pricing_config]);
  const config = validation.config;

  const [quantity, setQuantity] = useState<number>(1);
  const [selectedTierIndex, setSelectedTierIndex] = useState<number>(0);
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<string[]>([]);
  const [selectedDifficultyId, setSelectedDifficultyId] = useState<string>("");
  const [isAfterHours, setIsAfterHours] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [leadData, setLeadData] = useState({ name: '', email: '', phone: '', company: '' });

  const inputs: EstimateInputs = {
    quantity,
    selectedTierIndex,
    selectedAddOnIds,
    selectedDifficultyId: selectedDifficultyId || undefined,
    isAfterHours,
  };

  const estimate = useMemo(() => calculateEstimate(config, inputs), [config, quantity, selectedTierIndex, selectedAddOnIds, selectedDifficultyId, isAfterHours]);

  const toggleAddOn = (id: string) => {
    setSelectedAddOnIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const leadMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/leads', {
        calculator_id: calculator.id,
        name: leadData.name,
        email: leadData.email,
        phone: leadData.phone,
        company: leadData.company,
        quote_amount: estimate.total,
        answers: { pricingType: config.pricingType, quantity, selectedTierIndex, selectedAddOnIds, selectedDifficultyId, isAfterHours },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to submit.');
      return data;
    },
    onSuccess: () => setLeadSubmitted(true),
  });

  const submitting = leadMutation.isPending;
  const submitError = leadMutation.error ? (leadMutation.error as Error).message : null;

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

  const btnPrimary: React.CSSProperties = {
    width: '100%', padding: '15px',
    borderRadius: '12px', border: 'none',
    background: `linear-gradient(135deg, ${accentColor}, ${accentColor}dd)`,
    color: 'white', fontSize: '16px', fontWeight: 600, cursor: 'pointer',
    boxShadow: `0 4px 16px ${accentColor}30`,
    transition: 'all 0.2s ease', letterSpacing: '0.01em',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '13px', fontWeight: 600, color: theme.colors.muted, display: 'block', marginBottom: '6px',
  };

  if (leadSubmitted) {
    return (
      <div style={containerStyle}>
        <div className="animate-scale-in" style={{ ...cardStyle, padding: '48px 32px', textAlign: 'center' }}>
          <div className="animate-checkmark" style={{ width: '72px', height: '72px', borderRadius: '50%', background: `linear-gradient(135deg, ${accentColor}, ${accentColor}dd)`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: `0 8px 30px ${accentColor}30` }}>
            <PartyPopper style={{ width: '36px', height: '36px', color: 'white' }} />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: theme.colors.heading, marginBottom: '10px' }}>
            {calculator.lead_thank_you_message || "Thanks! We'll be in touch soon."}
          </h2>
          {estimate.type === "exact" && (
            <p style={{ fontSize: '15px', color: theme.colors.muted, lineHeight: 1.6 }}>
              Your estimated quote: <strong style={{ color: accentColor, fontSize: '18px' }}>${estimate.total.toLocaleString()}</strong>
            </p>
          )}
          {estimate.type === "range" && (
            <p style={{ fontSize: '15px', color: theme.colors.muted, lineHeight: 1.6 }}>
              Estimated range: <strong style={{ color: accentColor, fontSize: '18px' }}>${estimate.rangeMin?.toLocaleString()} – ${estimate.rangeMax?.toLocaleString()}</strong>
            </p>
          )}
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
            <h3 style={{ fontSize: '21px', fontWeight: 700, color: theme.colors.heading, marginBottom: '4px' }}>Get Your Detailed Quote</h3>
            {estimate.type === "exact" && (
              <p style={{ fontSize: '14px', color: theme.colors.muted, marginBottom: '24px' }}>
                Estimated total: <strong style={{ color: accentColor, fontSize: '16px' }}>${estimate.total.toLocaleString()}</strong>
              </p>
            )}
            {estimate.type === "range" && (
              <p style={{ fontSize: '14px', color: theme.colors.muted, marginBottom: '24px' }}>
                Estimated range: <strong style={{ color: accentColor, fontSize: '16px' }}>${estimate.rangeMin?.toLocaleString()} – ${estimate.rangeMax?.toLocaleString()}</strong>
              </p>
            )}
            {estimate.type === "call_for_quote" && (
              <p style={{ fontSize: '14px', color: theme.colors.muted, marginBottom: '24px' }}>{estimate.message}</p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                { key: 'name', label: 'Your Name', placeholder: 'John Smith', type: 'text' },
                { key: 'email', label: 'Email Address', placeholder: 'john@company.com', type: 'email' },
                { key: 'phone', label: 'Phone Number', placeholder: '(555) 123-4567', type: 'tel' },
                { key: 'company', label: 'Company (optional)', placeholder: 'Company name', type: 'text' },
              ].map((field, i) => (
                <div key={field.key} className="animate-fade-in-up" style={{ animationDelay: `${i * 50}ms` }}>
                  <label style={labelStyle}>{field.label}</label>
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
              onClick={() => leadMutation.mutate()}
              disabled={submitting || !leadData.email}
              style={{
                ...btnPrimary,
                marginTop: '24px',
                background: submitting || !leadData.email ? '#CBD5E1' : btnPrimary.background,
                color: submitting || !leadData.email ? '#94A3B8' : 'white',
                cursor: submitting ? 'wait' : !leadData.email ? 'not-allowed' : 'pointer',
                boxShadow: submitting || !leadData.email ? 'none' : btnPrimary.boxShadow,
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

  if (showResult && estimate.type !== "call_for_quote") {
    return (
      <div style={containerStyle}>
        <div className="animate-scale-in" style={cardStyle}>
          <div style={{ padding: '8px 0 0', borderTop: `4px solid ${accentColor}` }} />
          <div style={{ padding: '36px 32px 32px', textAlign: 'center' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: theme.colors.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Your Estimated Quote</p>
            {estimate.type === "exact" && (
              <p className="animate-count-up" style={{ fontSize: '48px', fontWeight: 800, color: accentColor, marginBottom: '24px', letterSpacing: '-0.02em', lineHeight: 1 }}>
                ${estimate.total.toLocaleString()}
              </p>
            )}
            {estimate.type === "range" && (
              <p className="animate-count-up" style={{ fontSize: '36px', fontWeight: 800, color: accentColor, marginBottom: '24px', letterSpacing: '-0.02em', lineHeight: 1 }}>
                ${estimate.rangeMin?.toLocaleString()} – ${estimate.rangeMax?.toLocaleString()}
              </p>
            )}
            {estimate.callUs && (
              <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '10px', background: '#FEF3C7', border: '1px solid #FCD34D', fontSize: '13px', color: '#92400E', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Phone style={{ width: '14px', height: '14px', flexShrink: 0 }} />
                For projects of this size, we recommend contacting us directly.
              </div>
            )}
            <div style={{ marginBottom: '28px', textAlign: 'left' }}>
              {estimate.breakdown.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${theme.colors.borderLight}`, fontSize: '14px' }}>
                  <span style={{ color: theme.colors.body }}>{item.label}</span>
                  <span style={{ color: theme.colors.heading, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 style={{ width: '14px', height: '14px', color: accentColor }} />
                    {item.amount > 0 ? `$${item.amount.toLocaleString()}` : '—'}
                  </span>
                </div>
              ))}
            </div>
            <button data-testid="button-get-quote" onClick={() => setShowLeadForm(true)} style={btnPrimary}>
              {calculator.cta_button_text || 'Get My Free Quote'}
              <ArrowRight style={{ width: '18px', height: '18px' }} />
            </button>
            <button
              data-testid="button-start-over"
              onClick={() => { setShowResult(false); setQuantity(1); setSelectedTierIndex(0); setSelectedAddOnIds([]); setSelectedDifficultyId(""); setIsAfterHours(false); }}
              style={{ width: '100%', marginTop: '10px', padding: '10px', border: 'none', background: 'transparent', color: theme.colors.muted, fontSize: '13px', cursor: 'pointer' }}
            >
              Start Over
            </button>
          </div>
        </div>
      </div>
    );
  }

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
          <PricingInputs
            config={config}
            quantity={quantity}
            setQuantity={setQuantity}
            selectedTierIndex={selectedTierIndex}
            setSelectedTierIndex={setSelectedTierIndex}
            selectedAddOnIds={selectedAddOnIds}
            toggleAddOn={toggleAddOn}
            selectedDifficultyId={selectedDifficultyId}
            setSelectedDifficultyId={setSelectedDifficultyId}
            isAfterHours={isAfterHours}
            setIsAfterHours={setIsAfterHours}
            theme={theme}
            accentColor={accentColor}
          />

          {config.pricingType === "call_for_quote_only" ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <Phone style={{ width: '40px', height: '40px', color: accentColor, margin: '0 auto 12px' }} />
              <p style={{ fontSize: '16px', fontWeight: 600, color: theme.colors.heading, marginBottom: '16px' }}>
                {(config as any).message || "Request a quote"}
              </p>
              <button data-testid="button-get-quote" onClick={() => setShowLeadForm(true)} style={btnPrimary}>
                {calculator.cta_button_text || 'Request a Quote'}
                <ArrowRight style={{ width: '18px', height: '18px' }} />
              </button>
            </div>
          ) : (
            <>
              <div style={{ marginTop: '20px', padding: '16px', borderRadius: '12px', background: `${accentColor}08`, border: `1px solid ${accentColor}20` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: theme.colors.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {estimate.type === "range" ? "Estimated Range" : "Live Estimate"}
                  </span>
                  <span data-testid="text-live-estimate" style={{ fontSize: '24px', fontWeight: 800, color: accentColor, letterSpacing: '-0.02em' }}>
                    {estimate.type === "range"
                      ? `$${estimate.rangeMin?.toLocaleString()} – $${estimate.rangeMax?.toLocaleString()}`
                      : `$${estimate.total.toLocaleString()}`}
                  </span>
                </div>
              </div>
              <button
                data-testid="button-see-breakdown"
                onClick={() => setShowResult(true)}
                style={{ ...btnPrimary, marginTop: '16px' }}
              >
                See Full Breakdown
                <ArrowRight style={{ width: '18px', height: '18px' }} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface PricingInputsProps {
  config: PricingConfigV1;
  quantity: number;
  setQuantity: (n: number) => void;
  selectedTierIndex: number;
  setSelectedTierIndex: (n: number) => void;
  selectedAddOnIds: string[];
  toggleAddOn: (id: string) => void;
  selectedDifficultyId: string;
  setSelectedDifficultyId: (id: string) => void;
  isAfterHours: boolean;
  setIsAfterHours: (v: boolean) => void;
  theme: any;
  accentColor: string;
}

function PricingInputs({
  config, quantity, setQuantity, selectedTierIndex, setSelectedTierIndex,
  selectedAddOnIds, toggleAddOn, selectedDifficultyId, setSelectedDifficultyId,
  isAfterHours, setIsAfterHours, theme, accentColor
}: PricingInputsProps) {
  const labelStyle: React.CSSProperties = {
    fontSize: '13px', fontWeight: 600, color: theme.colors.muted, display: 'block', marginBottom: '6px',
  };

  const needsQuantity = ["hourly", "per_unit", "per_sqft", "per_linear_ft", "base_plus_rate", "tiered_ranges"].includes(config.pricingType);
  const hasAddOns = "addOns" in config && (config as any).addOns?.length > 0;
  const hasDifficultyTiers = "difficultyTiers" in config && (config as any).difficultyTiers?.length > 0;
  const hasAfterHours = "afterHoursMult" in config && (config as any).afterHoursMult > 1;
  const hasTiers = config.pricingType === "tiered_packages" && config.tiers?.length > 0;

  const unitLabel = "unitName" in config ? (config as any).unitName : "units";

  if (config.pricingType === "call_for_quote_only" || config.pricingType === "price_range_only") {
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {needsQuantity && (
        <div>
          <label style={labelStyle}>
            How many {unitLabel}{unitLabel !== "hour" ? "" : "s"} do you need?
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              data-testid="button-qty-minus"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              style={{ width: '40px', height: '40px', borderRadius: '10px', border: `1px solid ${theme.colors.border}`, background: theme.colors.surface, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Minus style={{ width: '16px', height: '16px', color: theme.colors.body }} />
            </button>
            <input
              data-testid="input-quantity"
              type="number"
              value={quantity}
              onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              className="premium-input"
              style={{ width: '80px', textAlign: 'center', padding: '10px', borderRadius: '10px', fontSize: '16px', fontWeight: 600 }}
            />
            <button
              data-testid="button-qty-plus"
              onClick={() => setQuantity(quantity + 1)}
              style={{ width: '40px', height: '40px', borderRadius: '10px', border: `1px solid ${theme.colors.border}`, background: theme.colors.surface, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Plus style={{ width: '16px', height: '16px', color: theme.colors.body }} />
            </button>
            <span style={{ fontSize: '14px', color: theme.colors.muted }}>{unitLabel}</span>
          </div>
        </div>
      )}

      {hasTiers && config.pricingType === "tiered_packages" && (
        <div>
          <label style={labelStyle}>Choose a package</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {config.tiers.map((tier, idx) => {
              const isSelected = selectedTierIndex === idx;
              return (
                <button
                  key={idx}
                  data-testid={`option-tier-${idx}`}
                  onClick={() => setSelectedTierIndex(idx)}
                  style={{
                    padding: '15px 18px', borderRadius: '12px',
                    border: `1.5px solid ${isSelected ? accentColor : theme.colors.border}`,
                    background: isSelected ? `${accentColor}08` : theme.colors.surface,
                    cursor: 'pointer', textAlign: 'left', fontSize: '15px',
                    fontWeight: isSelected ? 600 : 400,
                    color: isSelected ? accentColor : theme.colors.body,
                    transition: 'all 0.2s ease',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    boxShadow: isSelected ? `0 2px 8px ${accentColor}15` : '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                      border: isSelected ? `6px solid ${accentColor}` : `2px solid ${theme.colors.border}`,
                      transition: 'all 0.2s ease', boxSizing: 'border-box',
                    }} />
                    {tier.label}
                  </span>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: isSelected ? accentColor : theme.colors.heading }}>
                    ${tier.price.toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {hasDifficultyTiers && (
        <div>
          <label style={labelStyle}>Complexity level</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {((config as any).difficultyTiers as DifficultyTier[]).map(tier => {
              const isSelected = selectedDifficultyId === tier.id;
              return (
                <button
                  key={tier.id}
                  data-testid={`option-difficulty-${tier.id}`}
                  onClick={() => setSelectedDifficultyId(isSelected ? "" : tier.id)}
                  style={{
                    padding: '10px 16px', borderRadius: '10px',
                    border: `1.5px solid ${isSelected ? accentColor : theme.colors.border}`,
                    background: isSelected ? `${accentColor}08` : theme.colors.surface,
                    cursor: 'pointer', fontSize: '13px', fontWeight: isSelected ? 600 : 400,
                    color: isSelected ? accentColor : theme.colors.body,
                    transition: 'all 0.2s ease',
                  }}
                >
                  {tier.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {hasAfterHours && (
        <div>
          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input
              data-testid="input-after-hours"
              type="checkbox"
              checked={isAfterHours}
              onChange={e => setIsAfterHours(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor }}
            />
            After-hours / Weekend service (×{(config as any).afterHoursMult})
          </label>
        </div>
      )}

      {hasAddOns && (
        <div>
          <label style={labelStyle}>Optional add-ons</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {((config as any).addOns as AddOn[]).map(ao => {
              const isSelected = selectedAddOnIds.includes(ao.id);
              return (
                <button
                  key={ao.id}
                  data-testid={`option-addon-${ao.id}`}
                  onClick={() => toggleAddOn(ao.id)}
                  style={{
                    padding: '12px 16px', borderRadius: '10px',
                    border: `1.5px solid ${isSelected ? accentColor : theme.colors.border}`,
                    background: isSelected ? `${accentColor}08` : theme.colors.surface,
                    cursor: 'pointer', textAlign: 'left', fontSize: '14px',
                    color: isSelected ? accentColor : theme.colors.body,
                    transition: 'all 0.2s ease',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle2 style={{ width: '16px', height: '16px', color: isSelected ? accentColor : theme.colors.border }} />
                    {ao.label}
                  </span>
                  <span style={{ fontSize: '12px', color: theme.colors.muted, background: theme.colors.borderLight, padding: '3px 8px', borderRadius: '6px' }}>
                    {ao.type === "pct" ? `+${ao.amount}%` : `+$${ao.amount}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
