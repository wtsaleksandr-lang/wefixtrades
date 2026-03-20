// FROZEN — scheduled for rebuild in Phase 3 (Builder Wizard). Do not add features.
import { useState, useMemo, useEffect, useCallback } from 'react';
import { platformTheme } from '@/theme/platformTheme';
import { calculateEstimate, type EstimateInputs, type EstimateResult } from '@shared/calculateEstimate';
import { type PricingConfigV1 } from '@shared/pricingConfig';
import {
  Shield, Check, AlertCircle, ArrowRight, Pencil, TrendingUp,
  TrendingDown, Minus, BarChart3, ChevronDown, ChevronUp, Settings2,
  CheckCircle2, Sliders, RotateCcw, Zap, Target, Wrench
} from 'lucide-react';

const p = platformTheme;

interface ScenarioData {
  label: string;
  inputs: Record<string, number | string | boolean>;
  yourCharge: string;
  confirmed: boolean;
}

export interface RefinementData {
  version: number;
  last_tier: 'strong' | 'close' | 'needs_adjustment';
  last_answers: { q1: string[]; q2: string; q3: string };
  tune_count: number;
  last_tuned_at: number | null;
}

export interface TestGateResult {
  scenarios: ScenarioData[];
  accuracyScore: number;
  confirmed: boolean;
  advancedAdjustments: Record<string, number> | null;
  timestamp: number;
  refinement?: RefinementData;
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

type ConfidenceTier = 'strong' | 'close' | 'needs_adjustment';

function getConfidenceTier(avgAbsDev: number, score: number): ConfidenceTier {
  if (avgAbsDev <= 10 && score >= 80) return 'strong';
  if (avgAbsDev <= 20 && score >= 60) return 'close';
  return 'needs_adjustment';
}

const TIER_META: Record<ConfidenceTier, { label: string; color: string; bg: string; micro: string; icon: any }> = {
  strong: {
    label: 'Strong Match',
    color: '#059669',
    bg: '#ECFDF5',
    micro: 'Your pricing aligns well with real jobs.',
    icon: CheckCircle2,
  },
  close: {
    label: 'Close Match',
    color: '#D97706',
    bg: '#FFFBEB',
    micro: 'Your pricing is close. You can fine-tune to reduce price objections.',
    icon: Target,
  },
  needs_adjustment: {
    label: 'Needs Adjustment',
    color: '#DC2626',
    bg: '#FEF2F2',
    micro: "Let's tighten this before going live.",
    icon: Wrench,
  },
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

const Q1_OPTIONS = [
  { id: 'labor', label: 'Labor rate' },
  { id: 'materials', label: 'Materials' },
  { id: 'travel', label: 'Travel/time' },
  { id: 'minimum', label: 'Minimum charge' },
  { id: 'complexity', label: 'Complexity/difficulty' },
];

const Q2_OPTIONS = [
  { id: 'raise_base_fee', label: 'Raise base fee' },
  { id: 'adjust_rate', label: 'Adjust rate' },
  { id: 'increase_minimum', label: 'Increase minimum charge' },
  { id: 'add_difficulty', label: 'Add difficulty multiplier' },
  { id: 'add_trip_fee', label: 'Add trip/service fee' },
];

const Q3_OPTIONS = [
  { id: 'conservative', label: 'Conservative', desc: 'Higher margin' },
  { id: 'balanced', label: 'Balanced', desc: 'Middle ground' },
  { id: 'competitive', label: 'Competitive', desc: 'Lower margin' },
];

const STYLE_PCTS: Record<string, number> = {
  conservative: 0.08,
  balanced: 0.04,
  competitive: 0.02,
};

function applyTune(config: any, q2: string, q3: string): any {
  const pct = STYLE_PCTS[q3] || 0.04;
  const tuned = { ...config };
  const bump = (val: number | undefined) => val !== undefined ? Math.round((val * (1 + pct)) * 100) / 100 : undefined;

  switch (q2) {
    case 'raise_base_fee':
      if (tuned.baseFee !== undefined) tuned.baseFee = bump(tuned.baseFee)!;
      break;
    case 'adjust_rate':
      if (tuned.rate !== undefined) tuned.rate = bump(tuned.rate)!;
      if (tuned.hourlyRate !== undefined) tuned.hourlyRate = bump(tuned.hourlyRate)!;
      break;
    case 'increase_minimum':
      if (tuned.minCharge !== undefined) tuned.minCharge = bump(tuned.minCharge)!;
      if (tuned.minimumCharge !== undefined) tuned.minimumCharge = bump(tuned.minimumCharge)!;
      break;
    case 'add_difficulty':
      if (!tuned.difficultyTiers || tuned.difficultyTiers.length === 0) {
        tuned.difficultyTiers = [
          { label: 'Standard', multiplier: 1.0 },
          { label: 'Moderate', multiplier: 1.15 },
          { label: 'Heavy', multiplier: 1.3 },
        ];
      }
      break;
    case 'add_trip_fee':
      if (tuned.travelFee !== undefined) {
        tuned.travelFee = bump(tuned.travelFee)!;
      } else {
        const avgDev = 15;
        tuned.travelFee = Math.round(avgDev * (1 + pct) * 100) / 100;
      }
      break;
  }

  return tuned;
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

  const [refineOpen, setRefineOpen] = useState(false);
  const [q1Answers, setQ1Answers] = useState<string[]>(initialTestHistory?.refinement?.last_answers?.q1 || []);
  const [q2Answer, setQ2Answer] = useState(initialTestHistory?.refinement?.last_answers?.q2 || '');
  const [q3Answer, setQ3Answer] = useState(initialTestHistory?.refinement?.last_answers?.q3 || 'balanced');
  const [tuneCount, setTuneCount] = useState(initialTestHistory?.refinement?.tune_count || 0);
  const [lastTunedAt, setLastTunedAt] = useState<number | null>(initialTestHistory?.refinement?.last_tuned_at || null);
  const [tuneBanner, setTuneBanner] = useState<string | null>(null);

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

  const avgAbsDeviation = validDeviations.length > 0
    ? validDeviations.reduce((sum, d) => sum + Math.abs(d!.pct), 0) / validDeviations.length
    : 0;

  const tier: ConfidenceTier = validDeviations.length > 0 ? getConfidenceTier(avgAbsDeviation, accuracyScore) : 'strong';
  const tierMeta = TIER_META[tier];
  const TierIcon = tierMeta.icon;

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

  const hardBlocked = !isCallForQuote && accuracyScore < 55 && validDeviations.length >= 3;
  const softBlocked = !isCallForQuote && tier === 'needs_adjustment' && accuracyScore >= 55;

  useEffect(() => {
    if (tier === 'needs_adjustment' && validDeviations.length >= 3) {
      setRefineOpen(true);
    }
  }, [tier, validDeviations.length]);

  const currentRefinement: RefinementData = {
    version: 1,
    last_tier: tier,
    last_answers: { q1: q1Answers, q2: q2Answer, q3: q3Answer },
    tune_count: tuneCount,
    last_tuned_at: lastTunedAt,
  };

  useEffect(() => {
    onTestHistoryChange({
      scenarios,
      accuracyScore: isCallForQuote ? 100 : accuracyScore,
      confirmed: userConfirmed,
      advancedAdjustments: advancedMode && Object.keys(adjustments).length > 0 ? adjustments : null,
      timestamp: Date.now(),
      refinement: currentRefinement,
    });
  }, [scenarios, userConfirmed, advancedMode, adjustments, q1Answers, q2Answer, q3Answer, tuneCount, lastTunedAt]);

  const publishGateReasons: string[] = [];
  if (!isCallForQuote) {
    if (filledCount < 3) publishGateReasons.push(`Complete all 3 scenarios (${filledCount}/3 done)`);
    if (withinRange < 2 && validDeviations.length > 0) publishGateReasons.push(`At least 2 scenarios must be within ±20% (${withinRange}/2)`);
    if (accuracyScore < 60 && validDeviations.length > 0) publishGateReasons.push(`Quote confidence score must be 60+ (currently ${accuracyScore})`);
  }
  if (!userConfirmed) publishGateReasons.push('Confirm pricing checkbox');

  const handlePublish = () => {
    if (!canPublishOverride && !publishPending) return;
    onTestHistoryChange({
      scenarios,
      accuracyScore: isCallForQuote ? 100 : accuracyScore,
      confirmed: userConfirmed,
      advancedAdjustments: advancedMode && Object.keys(adjustments).length > 0 ? adjustments : null,
      timestamp: Date.now(),
      refinement: currentRefinement,
    });
    if (advancedMode && Object.keys(adjustments).length > 0) {
      onPricingConfigChange(effectiveConfig);
    }
    onPublish();
  };

  const handleApplyTune = useCallback(() => {
    if (!q2Answer || !q3Answer) return;
    const tuned = applyTune(effectiveConfig, q2Answer, q3Answer);
    onPricingConfigChange(tuned);
    setTuneCount(prev => prev + 1);
    setLastTunedAt(Date.now());
    setTuneBanner('Updated. Re-check your scenarios.');
    setTimeout(() => setTuneBanner(null), 4000);
  }, [q2Answer, q3Answer, effectiveConfig, onPricingConfigChange]);

  const handleResetTune = () => {
    setQ1Answers([]);
    setQ2Answer('');
    setQ3Answer('balanced');
  };

  const toggleQ1 = (id: string) => {
    setQ1Answers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const tierImproved = tuneBanner && (tier === 'strong' || tier === 'close');

  return (
    <div className="animate-fade-in-up">
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

      {validDeviations.length > 0 && (
        <div data-testid="confidence-meter" style={{
          padding: '16px', borderRadius: p.radius.md,
          background: p.colors.surfaceRaised, border: `1px solid ${p.colors.border}`,
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TierIcon style={{ width: '15px', height: '15px', color: tierMeta.color }} />
              <span style={{ ...p.typography.label }}>Quote Confidence</span>
            </div>
            <div data-testid="tier-badge" style={{
              padding: '3px 10px', borderRadius: p.radius.pill,
              background: tierMeta.bg, fontSize: '12px', fontWeight: 600,
              color: tierMeta.color,
            }}>
              {tierMeta.label}
            </div>
          </div>
          <div style={{
            height: '8px', borderRadius: '4px', background: p.colors.borderLight, overflow: 'hidden',
          }}>
            <div data-testid="confidence-bar" style={{
              height: '100%', borderRadius: '4px',
              width: `${accuracyScore}%`,
              background: tierMeta.color,
              transition: p.transitions.normal,
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
            <span style={{ ...p.typography.captionSm }}>{accuracyScore}/100</span>
            <span style={{ ...p.typography.captionSm }}>
              {filledCount}/3 scenarios · {withinRange} within ±20%
            </span>
          </div>
          <p data-testid="tier-microcopy" style={{
            fontSize: '12px', color: tierMeta.color, marginTop: '8px', marginBottom: 0,
            fontWeight: 500, lineHeight: 1.4,
          }}>
            {tierMeta.micro}
          </p>
        </div>
      )}

      {tuneBanner && (
        <div data-testid="tune-banner" className="animate-fade-in-up" style={{
          padding: '12px 16px', borderRadius: p.radius.md,
          background: tierImproved ? '#ECFDF5' : '#FFFBEB',
          border: `1px solid ${tierImproved ? '#A7F3D0' : '#FDE68A'}`,
          marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          {tierImproved
            ? <CheckCircle2 style={{ width: '15px', height: '15px', color: '#059669', flexShrink: 0 }} />
            : <Zap style={{ width: '15px', height: '15px', color: '#D97706', flexShrink: 0 }} />
          }
          <span style={{ fontSize: '13px', color: tierImproved ? '#065F46' : '#92400E', fontWeight: 500 }}>
            {tierImproved ? "Nice — your quotes now match real jobs better." : tuneBanner}
          </span>
        </div>
      )}

      {!isCallForQuote && validDeviations.length > 0 && validDeviations.some(d => Math.abs(d!.pct) > 20) && !refineOpen && (
        <div data-testid="smart-suggestion" style={{
          padding: '12px 16px', borderRadius: p.radius.md,
          background: '#FFFBEB', border: '1px solid #FDE68A', marginBottom: '16px',
          display: 'flex', alignItems: 'flex-start', gap: '10px',
        }}>
          <AlertCircle style={{ width: '15px', height: '15px', color: '#D97706', flexShrink: 0, marginTop: '1px' }} />
          <div>
            <p style={{ fontSize: '13px', color: '#92400E', lineHeight: 1.5, margin: 0 }}>
              Some estimates differ from your charges. Fine-tune to reduce price objections.
            </p>
            <button data-testid="button-open-refine" onClick={() => setRefineOpen(true)} style={{
              marginTop: '8px', padding: '6px 12px', borderRadius: p.radius.sm,
              border: `1px solid ${p.colors.border}`, background: 'white',
              fontSize: '12px', fontWeight: 600, color: p.colors.accent,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px',
            }}>
              <Sliders style={{ width: '12px', height: '12px' }} /> Fine-Tune Pricing
            </button>
          </div>
        </div>
      )}

      {/* Advanced Adjustment Mode (legacy) */}
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

            {isExpanded && (
              <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${p.colors.borderLight}` }}>
                <p style={{ ...p.typography.captionSm, marginTop: '12px', marginBottom: '12px', fontStyle: 'italic' }}>
                  {SCENARIO_HINTS[idx]}
                </p>

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

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ ...p.typography.captionSm, display: 'block', marginBottom: '4px' }}>
                    What would YOU normally charge? ($)
                  </label>
                  <input data-testid={`input-your-charge-${idx}`} type="number" min="0" step="0.01"
                    value={scenario.yourCharge}
                    onChange={e => updateScenario(idx, { yourCharge: e.target.value })}
                    className="premium-input" placeholder="Enter your real price"
                    style={scenario.yourCharge !== '' && parseFloat(scenario.yourCharge) <= 0
                      ? { borderColor: '#FECACA', boxShadow: '0 0 0 2px rgba(220,38,38,0.10)' }
                      : undefined
                    } />
                  {scenario.yourCharge !== '' && parseFloat(scenario.yourCharge) <= 0 && (
                    <p data-testid={`error-your-charge-${idx}`} style={{
                      fontSize: '12px', color: '#DC2626', marginTop: '4px', marginBottom: 0,
                    }}>
                      Enter a charge greater than $0
                    </p>
                  )}
                </div>

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

      {/* Inline Refinement Panel */}
      {!isCallForQuote && (
        <div data-testid="refine-panel-wrapper" style={{ marginTop: '16px', marginBottom: '16px' }}>
          <button data-testid="button-toggle-refine" onClick={() => setRefineOpen(!refineOpen)} style={{
            width: '100%', padding: '12px 16px',
            borderRadius: refineOpen ? `${p.radius.md} ${p.radius.md} 0 0` : p.radius.md,
            border: `1px solid ${refineOpen ? p.colors.borderSelected : p.colors.border}`,
            borderBottom: refineOpen ? 'none' : undefined,
            background: refineOpen ? p.colors.surfaceRaised : 'white',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            transition: p.transitions.fast,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sliders style={{ width: '14px', height: '14px', color: p.colors.accent }} />
              <span style={{ fontSize: '13px', fontWeight: 600, color: p.colors.heading }}>Refine Pricing</span>
              {tuneCount > 0 && (
                <span style={{
                  fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '10px',
                  background: p.colors.accentLighter, color: p.colors.accent,
                }}>{tuneCount} tune{tuneCount > 1 ? 's' : ''}</span>
              )}
            </div>
            {refineOpen
              ? <ChevronUp style={{ width: '14px', height: '14px', color: p.colors.muted }} />
              : <ChevronDown style={{ width: '14px', height: '14px', color: p.colors.muted }} />
            }
          </button>

          {refineOpen && (
            <div data-testid="refine-panel" className="animate-fade-in-up" style={{
              padding: '16px', border: `1px solid ${p.colors.borderSelected}`,
              borderTop: 'none', borderRadius: `0 0 ${p.radius.md} ${p.radius.md}`,
              background: 'white',
            }}>
              <div style={{ marginBottom: '16px' }}>
                <p style={{ ...p.typography.label, marginBottom: '8px' }}>
                  Where is the mismatch usually coming from?
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {Q1_OPTIONS.map(opt => {
                    const sel = q1Answers.includes(opt.id);
                    return (
                      <button key={opt.id} data-testid={`q1-${opt.id}`} onClick={() => toggleQ1(opt.id)} style={{
                        padding: '7px 12px', borderRadius: p.radius.pill,
                        border: `1px solid ${sel ? p.colors.accent : p.colors.border}`,
                        background: sel ? p.colors.accentLighter : 'white',
                        color: sel ? p.colors.accent : p.colors.body,
                        fontSize: '12px', fontWeight: sel ? 600 : 500, cursor: 'pointer',
                        transition: p.transitions.fast,
                      }}>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <p style={{ ...p.typography.label, marginBottom: '8px' }}>
                  What do you want to change?
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {Q2_OPTIONS.map(opt => {
                    const sel = q2Answer === opt.id;
                    return (
                      <button key={opt.id} data-testid={`q2-${opt.id}`} onClick={() => setQ2Answer(opt.id)} style={{
                        padding: '10px 14px', borderRadius: p.radius.sm,
                        border: `1px solid ${sel ? p.colors.accent : p.colors.border}`,
                        background: sel ? p.colors.accentLighter : 'white',
                        color: sel ? p.colors.accent : p.colors.body,
                        fontSize: '13px', fontWeight: sel ? 600 : 500, cursor: 'pointer',
                        textAlign: 'left', transition: p.transitions.fast,
                        display: 'flex', alignItems: 'center', gap: '8px',
                      }}>
                        <div style={{
                          width: '16px', height: '16px', borderRadius: '50%',
                          border: `2px solid ${sel ? p.colors.accent : p.colors.borderHover}`,
                          background: sel ? p.colors.accent : 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          {sel && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'white' }} />}
                        </div>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <p style={{ ...p.typography.label, marginBottom: '8px' }}>
                  Pricing style
                </p>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {Q3_OPTIONS.map(opt => {
                    const sel = q3Answer === opt.id;
                    return (
                      <button key={opt.id} data-testid={`q3-${opt.id}`} onClick={() => setQ3Answer(opt.id)} style={{
                        flex: 1, padding: '10px 8px', borderRadius: p.radius.sm,
                        border: `1px solid ${sel ? p.colors.accent : p.colors.border}`,
                        background: sel ? p.colors.accentLighter : 'white',
                        cursor: 'pointer', textAlign: 'center', transition: p.transitions.fast,
                      }}>
                        <span style={{ display: 'block', fontSize: '13px', fontWeight: sel ? 700 : 600, color: sel ? p.colors.accent : p.colors.heading }}>
                          {opt.label}
                        </span>
                        <span style={{ display: 'block', fontSize: '10px', color: p.colors.muted, marginTop: '2px' }}>
                          {opt.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button data-testid="button-apply-tune" onClick={handleApplyTune}
                  disabled={!q2Answer}
                  style={{
                    flex: 1, padding: '12px', borderRadius: p.radius.md, border: 'none',
                    background: q2Answer
                      ? `linear-gradient(135deg, ${p.colors.accent}, ${p.colors.accentDark})`
                      : p.colors.borderLight,
                    color: q2Answer ? 'white' : p.colors.muted,
                    fontSize: '13px', fontWeight: 600,
                    cursor: q2Answer ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    boxShadow: q2Answer ? p.shadows.button : 'none',
                  }}>
                  <Zap style={{ width: '14px', height: '14px' }} />
                  Apply Tune
                </button>
                <button data-testid="button-reset-tune" onClick={handleResetTune} style={{
                  padding: '12px 16px', borderRadius: p.radius.md,
                  border: `1px solid ${p.colors.border}`, background: 'white',
                  fontSize: '13px', fontWeight: 600, color: p.colors.muted,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
                }}>
                  <RotateCcw style={{ width: '12px', height: '12px' }} />
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Checkbox */}
      <div style={{
        padding: '14px 16px', borderRadius: p.radius.md,
        background: userConfirmed ? '#F0FDF4' : p.colors.surfaceRaised,
        border: `1px solid ${userConfirmed ? '#A7F3D0' : p.colors.border}`,
        marginTop: '4px', marginBottom: '16px',
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

      {/* Hard Block */}
      {hardBlocked && (
        <div data-testid="hard-block" style={{
          padding: '14px 16px', borderRadius: p.radius.md,
          background: '#FEF2F2', border: '1px solid #FECACA',
          marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <AlertCircle style={{ width: '16px', height: '16px', color: '#DC2626', flexShrink: 0 }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#991B1B' }}>
            Refine pricing to proceed.
          </span>
        </div>
      )}

      {/* Publish Gate Reasons */}
      {publishGateReasons.length > 0 && filledCount > 0 && !hardBlocked && (
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

      {/* Footer Buttons */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
        <button data-testid="button-back" onClick={onBack} style={{
          flex: '0 0 auto', padding: '12px 20px', borderRadius: p.radius.md,
          border: `1px solid ${p.colors.border}`, background: 'white',
          fontSize: '14px', fontWeight: 600, color: p.colors.body, cursor: 'pointer',
        }}>
          Back
        </button>

        {/* Dynamic CTA based on tier */}
        {hardBlocked ? (
          <button data-testid="button-refine-primary" onClick={() => setRefineOpen(true)} style={{
            flex: 1, padding: '12px 20px', borderRadius: p.radius.md, border: 'none',
            background: `linear-gradient(135deg, ${p.colors.accent}, ${p.colors.accentDark})`,
            color: 'white', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            boxShadow: p.shadows.button,
          }}>
            <Sliders style={{ width: '16px', height: '16px' }} />
            Refine Pricing
          </button>
        ) : tier === 'needs_adjustment' && canPublishOverride && !publishPending ? (
          <div style={{ flex: 1, display: 'flex', gap: '8px' }}>
            <button data-testid="button-refine-primary" onClick={() => setRefineOpen(true)} style={{
              flex: 1, padding: '12px 16px', borderRadius: p.radius.md, border: 'none',
              background: `linear-gradient(135deg, ${p.colors.accent}, ${p.colors.accentDark})`,
              color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              boxShadow: p.shadows.button,
            }}>
              <Sliders style={{ width: '14px', height: '14px' }} />
              Refine Pricing
            </button>
            {accuracyScore >= 55 && (
              <button data-testid="button-continue-anyway" onClick={handlePublish} style={{
                padding: '12px 16px', borderRadius: p.radius.md,
                border: `1px solid ${p.colors.border}`, background: 'white',
                fontSize: '13px', fontWeight: 600, color: p.colors.body, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                whiteSpace: 'nowrap',
              }}>
                Continue Anyway
              </button>
            )}
          </div>
        ) : tier === 'close' && canPublishOverride && !publishPending ? (
          <div style={{ flex: 1, display: 'flex', gap: '8px' }}>
            <button data-testid="button-generate" onClick={handlePublish} style={{
              flex: 1, padding: '12px 20px', borderRadius: p.radius.md, border: 'none',
              background: `linear-gradient(135deg, ${p.colors.accent}, ${p.colors.accentDark})`,
              color: 'white', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              boxShadow: p.shadows.button,
            }}>
              <CheckCircle2 style={{ width: '16px', height: '16px' }} />
              Continue
            </button>
            <button data-testid="button-fine-tune" onClick={() => setRefineOpen(true)} style={{
              padding: '12px 16px', borderRadius: p.radius.md,
              border: `1px solid ${p.colors.border}`, background: 'white',
              fontSize: '13px', fontWeight: 600, color: p.colors.accent, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              whiteSpace: 'nowrap',
            }}>
              <Sliders style={{ width: '14px', height: '14px' }} />
              Fine-Tune
            </button>
          </div>
        ) : (
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
          </div>
        )}
      </div>
    </div>
  );
}
