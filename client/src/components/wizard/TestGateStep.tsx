import { useState, useMemo, useEffect } from 'react';
import { platformTheme } from '@/theme/platformTheme';
import { calculateEstimate, type EstimateInputs, type EstimateResult } from '@shared/calculateEstimate';
import { type PricingConfigV1 } from '@shared/pricingConfig';
import {
  Shield, Check, AlertCircle, ArrowRight, Pencil, TrendingUp,
  TrendingDown, Minus, BarChart3, ChevronDown, ChevronUp, Settings2,
  CheckCircle2
} from 'lucide-react';

const p = platformTheme;

interface ScenarioData {
  label: string;
  inputs: Record<string, number | string | boolean>;
  yourCharge: string;
  confirmed: boolean;
}

export interface TestGateResult {
  scenarios: ScenarioData[];
  accuracyScore: number;
  confirmed: boolean;
  advancedAdjustments: Record<string, number> | null;
  timestamp: number;
}

interface TestGateStepProps {
  pricingConfig: any;
  onPricingConfigChange: (config: any) => void;
  onPublish: () => void;
  onBack: () => void;
  onTestHistoryChange: (result: TestGateResult) => void;
  publishPending: boolean;
  genError: string | null;
  initialTestHistory?: TestGateResult | null;
}

const SCENARIO_LABELS = ['Small Job', 'Typical Job', 'Large Job'];
const SCENARIO_HINTS = [
  'Minimum scope — quickest, smallest version of this job.',
  'Average scope — the most common job you handle.',
  'Premium scope — largest or most complex version.',
];

const DEFAULT_QTY: Record<string, number[]> = {
  hourly: [1, 3, 8],
  per_unit: [1, 5, 20],
  per_sqft: [100, 500, 2000],
  per_linear_ft: [10, 50, 200],
  base_plus_rate: [1, 5, 15],
  tiered_ranges: [1, 5, 20],
};

function getUnitLabel(config: any): string {
  switch (config?.pricingType) {
    case 'hourly': return 'Hours';
    case 'per_sqft': return 'Sq Ft';
    case 'per_linear_ft': return 'Linear Ft';
    case 'per_unit': return config.unitName ? `${config.unitName}s` : 'Units';
    case 'base_plus_rate': return config.unitName ? `${config.unitName}s` : 'Units';
    case 'tiered_ranges': return config.unitName ? `${config.unitName}s` : 'Units';
    default: return 'Quantity';
  }
}

function needsQuantityInput(pricingType: string): boolean {
  return ['hourly', 'per_unit', 'per_sqft', 'per_linear_ft', 'base_plus_rate', 'tiered_ranges'].includes(pricingType);
}

function needsTierInput(pricingType: string): boolean {
  return pricingType === 'tiered_packages';
}

function getDeviationColor(pct: number): { bg: string; text: string; border: string; label: string } {
  const abs = Math.abs(pct);
  if (abs <= 10) return { bg: '#ECFDF5', text: '#065F46', border: '#A7F3D0', label: 'Excellent' };
  if (abs <= 20) return { bg: '#FFFBEB', text: '#92400E', border: '#FDE68A', label: 'Acceptable' };
  return { bg: '#FEF2F2', text: '#991B1B', border: '#FECACA', label: 'Needs Review' };
}

function calculateAccuracyScore(deviations: number[]): number {
  let score = 100;
  for (const dev of deviations) {
    const abs = Math.abs(dev);
    if (abs <= 10) continue;
    else if (abs <= 20) score -= 10;
    else score -= 25;
  }
  return Math.max(0, score);
}

function getAccuracyMeta(score: number): { color: string; bg: string; label: string } {
  if (score >= 80) return { color: '#059669', bg: '#ECFDF5', label: 'Ready to Publish' };
  if (score >= 60) return { color: '#D97706', bg: '#FFFBEB', label: 'Needs Attention' };
  return { color: '#DC2626', bg: '#FEF2F2', label: 'Adjust Before Publishing' };
}

export default function TestGateStep({
  pricingConfig,
  onPricingConfigChange,
  onPublish,
  onBack,
  onTestHistoryChange,
  publishPending,
  genError,
  initialTestHistory,
}: TestGateStepProps) {
  const pType = pricingConfig?.pricingType || 'call_for_quote_only';
  const hasTiers = pType === 'tiered_packages' && pricingConfig?.tiers?.length > 0;
  const hasQty = needsQuantityInput(pType);

  const defaultQtys = DEFAULT_QTY[pType] || [1, 5, 10];

  const [scenarios, setScenarios] = useState<ScenarioData[]>(() => {
    if (initialTestHistory?.scenarios?.length === 3) {
      return initialTestHistory.scenarios;
    }
    return SCENARIO_LABELS.map((label, i) => {
      const inputs: Record<string, number | string | boolean> = {};
      if (hasQty) inputs.quantity = defaultQtys[i];
      if (hasTiers) inputs.tierIndex = Math.min(i, (pricingConfig?.tiers?.length || 1) - 1);
      return { label, inputs, yourCharge: '', confirmed: false };
    });
  });

  const [userConfirmed, setUserConfirmed] = useState(initialTestHistory?.confirmed ?? false);
  const [advancedMode, setAdvancedMode] = useState(!!initialTestHistory?.advancedAdjustments);
  const [adjustments, setAdjustments] = useState<Record<string, number>>(initialTestHistory?.advancedAdjustments ?? {});
  const [expandedCard, setExpandedCard] = useState<number | null>(0);

  const effectiveConfig = useMemo(() => {
    if (!advancedMode || Object.keys(adjustments).length === 0) return pricingConfig;
    const cfg = { ...pricingConfig };
    if (adjustments.baseFee !== undefined) cfg.baseFee = adjustments.baseFee;
    if (adjustments.rate !== undefined) cfg.rate = adjustments.rate;
    if (adjustments.minCharge !== undefined) cfg.minCharge = adjustments.minCharge;
    if (adjustments.multiplier !== undefined && cfg.afterHoursMult) cfg.afterHoursMult = adjustments.multiplier;
    return cfg;
  }, [pricingConfig, advancedMode, adjustments]);

  const estimates = useMemo(() => {
    return scenarios.map(s => {
      const inputs: EstimateInputs = {};
      if (hasQty) inputs.quantity = Number(s.inputs.quantity) || 1;
      if (hasTiers) inputs.selectedTierIndex = Number(s.inputs.tierIndex) || 0;
      return calculateEstimate(effectiveConfig, inputs);
    });
  }, [scenarios, effectiveConfig, hasQty, hasTiers]);

  const deviations = useMemo(() => {
    return scenarios.map((s, i) => {
      const est = estimates[i];
      const charge = parseFloat(s.yourCharge);
      if (!charge || charge <= 0 || est.type === 'call_for_quote') return null;
      const estTotal = est.total;
      if (estTotal === 0) return null;
      const diff = estTotal - charge;
      const pct = (diff / charge) * 100;
      return { diff, pct, charge, estTotal };
    });
  }, [scenarios, estimates]);

  const validDeviations = deviations.filter(d => d !== null);
  const accuracyScore = calculateAccuracyScore(validDeviations.map(d => d!.pct));
  const accuracyMeta = getAccuracyMeta(accuracyScore);

  const filledCount = scenarios.filter((s, i) => {
    const charge = parseFloat(s.yourCharge);
    return charge > 0 && estimates[i].type !== 'call_for_quote';
  }).length;

  const withinRange = validDeviations.filter(d => Math.abs(d!.pct) <= 20).length;

  const canPublish = filledCount >= 3 && accuracyScore >= 60 && userConfirmed && withinRange >= 2;

  const updateScenario = (idx: number, patch: Partial<ScenarioData>) => {
    setScenarios(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const updateInput = (idx: number, key: string, val: number | string) => {
    setScenarios(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], inputs: { ...next[idx].inputs, [key]: val } };
      return next;
    });
  };

  const isCallForQuote = pType === 'call_for_quote_only' || pType === 'price_range_only';
  const canPublishOverride = isCallForQuote ? userConfirmed : canPublish;

  useEffect(() => {
    onTestHistoryChange({
      scenarios,
      accuracyScore: isCallForQuote ? 100 : accuracyScore,
      confirmed: userConfirmed,
      advancedAdjustments: advancedMode && Object.keys(adjustments).length > 0 ? adjustments : null,
      timestamp: Date.now(),
    });
  }, [scenarios, userConfirmed, advancedMode, adjustments]);

  const publishGateReasons: string[] = [];
  if (!isCallForQuote) {
    if (filledCount < 3) publishGateReasons.push(`Complete all 3 scenarios (${filledCount}/3 done)`);
    if (withinRange < 2 && validDeviations.length > 0) publishGateReasons.push(`At least 2 scenarios must be within ±20% (${withinRange}/2)`);
    if (accuracyScore < 60 && validDeviations.length > 0) publishGateReasons.push(`Accuracy score must be 60+ (currently ${accuracyScore})`);
  }
  if (!userConfirmed) publishGateReasons.push('Confirm pricing accuracy checkbox');

  const handlePublish = () => {
    if (!canPublishOverride && !publishPending) return;
    onTestHistoryChange({
      scenarios,
      accuracyScore: isCallForQuote ? 100 : accuracyScore,
      confirmed: userConfirmed,
      advancedAdjustments: advancedMode && Object.keys(adjustments).length > 0 ? adjustments : null,
      timestamp: Date.now(),
    });
    if (advancedMode && Object.keys(adjustments).length > 0) {
      onPricingConfigChange(effectiveConfig);
    }
    onPublish();
  };

  const suggestEdit = validDeviations.some(d => Math.abs(d!.pct) > 20);
  const allFail = validDeviations.length >= 3 && validDeviations.every(d => Math.abs(d!.pct) > 20);

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: p.radius.sm,
            background: p.colors.accentLighter, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Shield style={{ width: '16px', height: '16px', color: p.colors.accent }} />
          </div>
          <div>
            <h2 style={{ ...p.typography.h3, margin: 0 }}>Validate Your Pricing</h2>
          </div>
        </div>
        <p style={{ ...p.typography.caption, marginTop: '4px', marginLeft: '42px' }}>
          Test real scenarios before publishing. Compare calculator estimates against what you'd actually charge.
        </p>
      </div>

      {isCallForQuote && (
        <div style={{
          padding: '16px', borderRadius: p.radius.md,
          background: p.colors.warningLight, border: '1px solid #FDE68A', marginBottom: '20px',
        }}>
          <p style={{ fontSize: '13px', color: '#92400E', lineHeight: 1.5 }}>
            Your pricing is set to "{pType === 'call_for_quote_only' ? 'Call for Quote' : 'Price Range Only'}". 
            Scenario testing is limited for this pricing type. Consider editing your pricing logic for more precise estimates.
          </p>
        </div>
      )}

      {/* Accuracy Meter */}
      {validDeviations.length > 0 && (
        <div data-testid="accuracy-meter" style={{
          padding: '16px', borderRadius: p.radius.md,
          background: p.colors.surfaceRaised, border: `1px solid ${p.colors.border}`,
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BarChart3 style={{ width: '15px', height: '15px', color: accuracyMeta.color }} />
              <span style={{ ...p.typography.label }}>Accuracy Score</span>
            </div>
            <div style={{
              padding: '3px 10px', borderRadius: p.radius.pill,
              background: accuracyMeta.bg, fontSize: '12px', fontWeight: 600,
              color: accuracyMeta.color,
            }}>
              {accuracyMeta.label}
            </div>
          </div>
          <div style={{
            height: '8px', borderRadius: '4px', background: p.colors.borderLight, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: '4px',
              width: `${accuracyScore}%`,
              background: accuracyMeta.color,
              transition: p.transitions.normal,
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
            <span style={{ ...p.typography.captionSm }}>{accuracyScore}/100</span>
            <span style={{ ...p.typography.captionSm }}>
              {filledCount}/3 scenarios · {withinRange} within ±20%
            </span>
          </div>
        </div>
      )}

      {/* Smart Suggestions */}
      {suggestEdit && !allFail && (
        <div data-testid="smart-suggestion" style={{
          padding: '12px 16px', borderRadius: p.radius.md,
          background: '#FFFBEB', border: '1px solid #FDE68A', marginBottom: '16px',
          display: 'flex', alignItems: 'flex-start', gap: '10px',
        }}>
          <AlertCircle style={{ width: '15px', height: '15px', color: '#D97706', flexShrink: 0, marginTop: '1px' }} />
          <div>
            <p style={{ fontSize: '13px', color: '#92400E', lineHeight: 1.5, margin: 0 }}>
              Some estimates differ significantly from your actual charges. Consider adjusting your base fee or rate.
            </p>
            {!advancedMode && (
              <button data-testid="button-enable-advanced" onClick={() => setAdvancedMode(true)} style={{
                marginTop: '8px', padding: '6px 12px', borderRadius: p.radius.sm,
                border: `1px solid ${p.colors.border}`, background: 'white',
                fontSize: '12px', fontWeight: 600, color: p.colors.accent,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px',
              }}>
                <Settings2 style={{ width: '12px', height: '12px' }} /> Enable Adjustment Mode
              </button>
            )}
          </div>
        </div>
      )}

      {allFail && (
        <div data-testid="smart-suggestion-critical" style={{
          padding: '12px 16px', borderRadius: p.radius.md,
          background: '#FEF2F2', border: '1px solid #FECACA', marginBottom: '16px',
          display: 'flex', alignItems: 'flex-start', gap: '10px',
        }}>
          <AlertCircle style={{ width: '15px', height: '15px', color: '#DC2626', flexShrink: 0, marginTop: '1px' }} />
          <div>
            <p style={{ fontSize: '13px', color: '#991B1B', lineHeight: 1.5, margin: 0 }}>
              Your formula may need revision — all test scenarios show large deviations.
            </p>
            <button data-testid="button-edit-pricing" onClick={onBack} style={{
              marginTop: '8px', padding: '6px 12px', borderRadius: p.radius.sm,
              border: `1px solid #FECACA`, background: 'white',
              fontSize: '12px', fontWeight: 600, color: '#DC2626',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px',
            }}>
              <Pencil style={{ width: '12px', height: '12px' }} /> Edit Pricing Logic
            </button>
          </div>
        </div>
      )}

      {/* Advanced Adjustment Mode */}
      {advancedMode && (
        <div data-testid="advanced-adjustments" style={{
          padding: '16px', borderRadius: p.radius.md,
          background: p.colors.surfaceRaised, border: `1px solid ${p.colors.borderSelected}`,
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Settings2 style={{ width: '14px', height: '14px', color: p.colors.accent }} />
              <span style={{ ...p.typography.label, color: p.colors.accent }}>Adjustment Mode</span>
            </div>
            <button data-testid="button-close-advanced" onClick={() => { setAdvancedMode(false); setAdjustments({}); }}
              style={{
                padding: '4px 10px', borderRadius: p.radius.sm,
                border: `1px solid ${p.colors.border}`, background: 'white',
                fontSize: '11px', fontWeight: 600, color: p.colors.muted, cursor: 'pointer',
              }}>
              Close
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {(pricingConfig.baseFee !== undefined || pType === 'base_plus_rate') && (
              <div>
                <label style={{ ...p.typography.captionSm, display: 'block', marginBottom: '4px' }}>Base Fee ($)</label>
                <input data-testid="input-adjust-basefee" type="number" min="0" step="0.01"
                  value={adjustments.baseFee ?? pricingConfig.baseFee ?? 0}
                  onChange={e => setAdjustments(prev => ({ ...prev, baseFee: parseFloat(e.target.value) || 0 }))}
                  className="premium-input" style={{ fontSize: '13px' }} />
              </div>
            )}
            {pricingConfig.rate !== undefined && (
              <div>
                <label style={{ ...p.typography.captionSm, display: 'block', marginBottom: '4px' }}>Rate ($)</label>
                <input data-testid="input-adjust-rate" type="number" min="0" step="0.01"
                  value={adjustments.rate ?? pricingConfig.rate ?? 0}
                  onChange={e => setAdjustments(prev => ({ ...prev, rate: parseFloat(e.target.value) || 0 }))}
                  className="premium-input" style={{ fontSize: '13px' }} />
              </div>
            )}
            {(pricingConfig.minCharge !== undefined) && (
              <div>
                <label style={{ ...p.typography.captionSm, display: 'block', marginBottom: '4px' }}>Min Charge ($)</label>
                <input data-testid="input-adjust-mincharge" type="number" min="0" step="0.01"
                  value={adjustments.minCharge ?? pricingConfig.minCharge ?? 0}
                  onChange={e => setAdjustments(prev => ({ ...prev, minCharge: parseFloat(e.target.value) || 0 }))}
                  className="premium-input" style={{ fontSize: '13px' }} />
              </div>
            )}
            {pricingConfig.afterHoursMult !== undefined && (
              <div>
                <label style={{ ...p.typography.captionSm, display: 'block', marginBottom: '4px' }}>After-Hours Mult</label>
                <input data-testid="input-adjust-multiplier" type="number" min="1" step="0.1"
                  value={adjustments.multiplier ?? pricingConfig.afterHoursMult ?? 1}
                  onChange={e => setAdjustments(prev => ({ ...prev, multiplier: parseFloat(e.target.value) || 1 }))}
                  className="premium-input" style={{ fontSize: '13px' }} />
              </div>
            )}
          </div>
          <p style={{ ...p.typography.captionSm, marginTop: '10px', color: p.colors.muted }}>
            Adjustments update all scenario estimates in real-time. Changes are saved when you publish.
          </p>
        </div>
      )}

      {/* Scenario Cards */}
      {scenarios.map((scenario, idx) => {
        const est = estimates[idx];
        const dev = deviations[idx];
        const charge = parseFloat(scenario.yourCharge);
        const isExpanded = expandedCard === idx;

        return (
          <div key={idx} data-testid={`test-scenario-${idx}`} style={{
            borderRadius: p.radius.md,
            border: `1px solid ${dev && Math.abs(dev.pct) <= 10 ? '#A7F3D0' : dev && Math.abs(dev.pct) <= 20 ? '#FDE68A' : dev ? '#FECACA' : p.colors.border}`,
            background: 'white',
            marginBottom: '12px',
            overflow: 'hidden',
            boxShadow: isExpanded ? p.shadows.card : p.shadows.xs,
            transition: p.transitions.normal,
          }}>
            {/* Card Header */}
            <button data-testid={`button-expand-scenario-${idx}`}
              onClick={() => setExpandedCard(isExpanded ? null : idx)}
              style={{
                width: '100%', padding: '14px 16px',
                border: 'none', background: 'transparent', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  background: dev && Math.abs(dev.pct) <= 20
                    ? (Math.abs(dev.pct) <= 10 ? '#ECFDF5' : '#FFFBEB')
                    : dev ? '#FEF2F2' : p.colors.accentLighter,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: 700,
                  color: dev && Math.abs(dev.pct) <= 20
                    ? (Math.abs(dev.pct) <= 10 ? '#059669' : '#D97706')
                    : dev ? '#DC2626' : p.colors.accent,
                }}>
                  {dev && Math.abs(dev.pct) <= 20
                    ? <Check style={{ width: '14px', height: '14px' }} />
                    : dev ? <AlertCircle style={{ width: '14px', height: '14px' }} />
                    : idx + 1
                  }
                </div>
                <div style={{ textAlign: 'left' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: p.colors.heading, display: 'block' }}>
                    {SCENARIO_LABELS[idx]}
                  </span>
                  {dev && (
                    <span style={{
                      fontSize: '11px', fontWeight: 500,
                      color: getDeviationColor(dev.pct).text,
                    }}>
                      {getDeviationColor(dev.pct).label} · {dev.pct >= 0 ? '+' : ''}{dev.pct.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {est.type !== 'call_for_quote' && charge > 0 && (
                  <span style={{ fontSize: '14px', fontWeight: 600, color: p.colors.heading }}>
                    ${est.total.toFixed(2)}
                  </span>
                )}
                {isExpanded
                  ? <ChevronUp style={{ width: '16px', height: '16px', color: p.colors.muted }} />
                  : <ChevronDown style={{ width: '16px', height: '16px', color: p.colors.muted }} />
                }
              </div>
            </button>

            {/* Card Body */}
            {isExpanded && (
              <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${p.colors.borderLight}` }}>
                <p style={{ ...p.typography.captionSm, marginTop: '12px', marginBottom: '12px', fontStyle: 'italic' }}>
                  {SCENARIO_HINTS[idx]}
                </p>

                {/* Dynamic Inputs */}
                {hasQty && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ ...p.typography.captionSm, display: 'block', marginBottom: '4px' }}>
                      {getUnitLabel(effectiveConfig)}
                    </label>
                    <input data-testid={`input-scenario-qty-${idx}`} type="number" min="0" step="1"
                      value={String(scenario.inputs.quantity || '')}
                      onChange={e => updateInput(idx, 'quantity', parseFloat(e.target.value) || 0)}
                      className="premium-input" placeholder="Enter quantity" />
                  </div>
                )}

                {hasTiers && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ ...p.typography.captionSm, display: 'block', marginBottom: '4px' }}>Package</label>
                    <select data-testid={`input-scenario-tier-${idx}`}
                      value={String(Number(scenario.inputs.tierIndex) || 0)}
                      onChange={e => updateInput(idx, 'tierIndex', parseInt(e.target.value))}
                      className="premium-input" style={{ fontSize: '13px' }}>
                      {(pricingConfig.tiers || []).map((t: any, ti: number) => (
                        <option key={ti} value={ti}>{t.label} — ${t.price}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Estimated Price Output */}
                <div style={{
                  padding: '12px', borderRadius: p.radius.sm,
                  background: p.colors.surfaceRaised, marginBottom: '12px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ ...p.typography.captionSm }}>Calculator Estimate</span>
                    <span data-testid={`text-estimate-${idx}`} style={{
                      fontSize: '18px', fontWeight: 700, color: p.colors.heading,
                      fontFeatureSettings: "'tnum'",
                    }}>
                      {est.type === 'call_for_quote' ? 'Call for Quote'
                        : est.type === 'range' ? `$${est.rangeMin?.toFixed(2)} – $${est.rangeMax?.toFixed(2)}`
                        : `$${est.total.toFixed(2)}`}
                    </span>
                  </div>
                  {est.breakdown.length > 0 && est.type === 'exact' && (
                    <div style={{ marginTop: '8px', borderTop: `1px solid ${p.colors.borderLight}`, paddingTop: '8px' }}>
                      {est.breakdown.map((b, bi) => (
                        <div key={bi} style={{
                          display: 'flex', justifyContent: 'space-between',
                          fontSize: '11px', color: p.colors.muted, padding: '2px 0',
                        }}>
                          <span>{b.label}</span>
                          <span>${b.amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Your Charge */}
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ ...p.typography.captionSm, display: 'block', marginBottom: '4px' }}>
                    What would YOU normally charge? ($)
                  </label>
                  <input data-testid={`input-your-charge-${idx}`} type="number" min="0" step="0.01"
                    value={scenario.yourCharge}
                    onChange={e => updateScenario(idx, { yourCharge: e.target.value })}
                    className="premium-input" placeholder="Enter your real price" />
                </div>

                {/* Deviation Display */}
                {dev && (
                  <div data-testid={`deviation-display-${idx}`} style={{
                    padding: '10px 12px', borderRadius: p.radius.sm,
                    background: getDeviationColor(dev.pct).bg,
                    border: `1px solid ${getDeviationColor(dev.pct).border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {dev.pct > 0
                        ? <TrendingUp style={{ width: '14px', height: '14px', color: getDeviationColor(dev.pct).text }} />
                        : dev.pct < 0
                        ? <TrendingDown style={{ width: '14px', height: '14px', color: getDeviationColor(dev.pct).text }} />
                        : <Minus style={{ width: '14px', height: '14px', color: getDeviationColor(dev.pct).text }} />
                      }
                      <span style={{ fontSize: '13px', fontWeight: 600, color: getDeviationColor(dev.pct).text }}>
                        {dev.diff >= 0 ? '+' : '-'}${Math.abs(dev.diff).toFixed(2)}
                      </span>
                    </div>
                    <span style={{
                      fontSize: '12px', fontWeight: 600,
                      color: getDeviationColor(dev.pct).text,
                    }}>
                      {dev.pct >= 0 ? '+' : ''}{dev.pct.toFixed(1)}% · {getDeviationColor(dev.pct).label}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Confirmation Checkbox */}
      <div style={{
        padding: '14px 16px', borderRadius: p.radius.md,
        background: userConfirmed ? '#F0FDF4' : p.colors.surfaceRaised,
        border: `1px solid ${userConfirmed ? '#A7F3D0' : p.colors.border}`,
        marginTop: '20px', marginBottom: '16px',
        display: 'flex', alignItems: 'flex-start', gap: '12px',
        cursor: 'pointer', transition: p.transitions.normal,
      }} onClick={() => setUserConfirmed(!userConfirmed)}>
        <div data-testid="checkbox-confirm-pricing" style={{
          width: '20px', height: '20px', borderRadius: '4px', flexShrink: 0, marginTop: '1px',
          border: `2px solid ${userConfirmed ? '#059669' : p.colors.borderHover}`,
          background: userConfirmed ? '#059669' : 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: p.transitions.fast,
        }}>
          {userConfirmed && <Check style={{ width: '13px', height: '13px', color: 'white' }} />}
        </div>
        <div>
          <p style={{ fontSize: '13px', fontWeight: 600, color: p.colors.heading, margin: 0 }}>
            I confirm these estimates reflect my real pricing.
          </p>
          <p style={{ fontSize: '12px', color: p.colors.muted, margin: '2px 0 0' }}>
            By checking this, you verify the calculator produces estimates consistent with what you charge.
          </p>
        </div>
      </div>

      {/* Publish Gate Reasons */}
      {publishGateReasons.length > 0 && filledCount > 0 && (
        <div data-testid="publish-gate-reasons" style={{
          padding: '12px 16px', borderRadius: p.radius.md,
          background: p.colors.surfaceRaised, border: `1px solid ${p.colors.border}`,
          marginBottom: '16px',
        }}>
          <p style={{ ...p.typography.captionSm, fontWeight: 600, marginBottom: '6px' }}>Before you can publish:</p>
          {publishGateReasons.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0' }}>
              <div style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: p.colors.muted, flexShrink: 0,
              }} />
              <span style={{ fontSize: '12px', color: p.colors.muted }}>{r}</span>
            </div>
          ))}
        </div>
      )}

      {genError && (
        <div className="animate-fade-in-up" style={{
          padding: '12px 16px', borderRadius: p.radius.md,
          background: p.colors.dangerLight, border: '1px solid #FCA5A5',
          marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <AlertCircle style={{ width: '15px', height: '15px', color: p.colors.danger, flexShrink: 0 }} />
          <span style={{ fontSize: '13px', color: '#991B1B' }}>{genError}</span>
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
        <button data-testid="button-back" onClick={onBack} style={{
          flex: '0 0 auto', padding: '12px 20px', borderRadius: p.radius.md,
          border: `1px solid ${p.colors.border}`, background: 'white',
          fontSize: '14px', fontWeight: 600, color: p.colors.body, cursor: 'pointer',
        }}>
          Back
        </button>
        <div style={{ position: 'relative', flex: 1 }}>
          <button data-testid="button-generate" onClick={handlePublish}
            disabled={!canPublishOverride || publishPending}
            style={{
              width: '100%', padding: '12px 20px', borderRadius: p.radius.md,
              border: 'none',
              background: canPublishOverride && !publishPending
                ? `linear-gradient(135deg, ${p.colors.accent}, ${p.colors.accentDark})`
                : p.colors.borderLight,
              color: canPublishOverride && !publishPending ? 'white' : p.colors.muted,
              fontSize: '14px', fontWeight: 600, cursor: canPublishOverride && !publishPending ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              boxShadow: canPublishOverride ? p.shadows.button : 'none',
              transition: p.transitions.normal,
              opacity: publishPending ? 0.7 : 1,
            }}>
            {publishPending ? (
              <div style={{
                width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: 'white', borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
            ) : (
              <CheckCircle2 style={{ width: '16px', height: '16px' }} />
            )}
            {publishPending ? 'Generating...' : 'Generate & Publish'}
          </button>
          {!canPublishOverride && !publishPending && publishGateReasons.length > 0 && (
            <div style={{
              position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
              marginBottom: '6px', padding: '6px 10px', borderRadius: p.radius.sm,
              background: p.colors.heading, color: 'white', fontSize: '11px',
              whiteSpace: 'nowrap', pointerEvents: 'none', opacity: 0,
              transition: p.transitions.fast,
            }} className="publish-tooltip">
              Complete pricing validation to publish.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
