import { useState, useCallback, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  SlidersHorizontal,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  ArrowRight,
  BadgeCheck,
  Users,
} from 'lucide-react';
import { trackEvent } from '@/lib/trackEvent';
import { mkt, colors, radius, shadows } from '@/theme/tokens';
import { getPresetById } from '@/data/missedCallTradePresets';
import type { TradePreset } from '@/data/missedCallTradePresets';
import {
  calculate,
  calculateRange,
  formatCurrencyFull,
} from '@/lib/missedCallCalculator';
import TradeOnboarding from './TradeOnboarding';
import CalculatorControls from './CalculatorControls';
import type { SliderValues, SliderStepKey } from './CalculatorControls';
import ResultsPanel from './ResultsPanel';
import CalculatorLeadGate from './CalculatorLeadGate';

const STORAGE_KEY = 'wft-calc-trade';
const UNLOCK_PREFIX = 'wft-calc-unlocked-';
const FOLD_KEY = 'wft-calc-foot-fold';

function readStoredTradeId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredTradeId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch { /* quota / private browsing */ }
}

/** Build a deterministic unlock key from trade + inputs */
function unlockKey(trade: string, v: SliderValues): string {
  return `${UNLOCK_PREFIX}${trade}-${v.missedCallsPerWeek}-${v.closeRatePercent}-${v.avgJobValue}`;
}

function isUnlockedInStorage(trade: string, v: SliderValues): boolean {
  try {
    return localStorage.getItem(unlockKey(trade, v)) === '1';
  } catch {
    return false;
  }
}

function persistUnlock(trade: string, v: SliderValues): void {
  try {
    localStorage.setItem(unlockKey(trade, v), '1');
  } catch { /* ignore */ }
}

function readFold(): boolean {
  try {
    return localStorage.getItem(FOLD_KEY) === '1';
  } catch {
    return false;
  }
}

function writeFold(folded: boolean): void {
  try {
    localStorage.setItem(FOLD_KEY, folded ? '1' : '0');
  } catch { /* ignore */ }
}

/** Multi-step flow.
 *  - onboarding: trade picker
 *  - q1/q2/q3: one slider per screen (BD-2a one-question-per-screen pattern)
 *  - results: estimated revenue + lead-gate
 */
type Step = 'onboarding' | 'q1' | 'q2' | 'q3' | 'results';

const SLIDER_STEPS: Step[] = ['q1', 'q2', 'q3'];
const SLIDER_KEYS: Record<'q1' | 'q2' | 'q3', SliderStepKey> = {
  q1: 'missedCalls',
  q2: 'closeRate',
  q3: 'avgJobValue',
};

interface ShellProps {
  initialTradeId?: string;
}

export default function MissedCallCalculatorShell({ initialTradeId }: ShellProps = {}) {
  const [step, setStep] = useState<Step>(initialTradeId ? 'q1' : 'onboarding');
  const [selectedPreset, setSelectedPreset] = useState<TradePreset | null>(() => {
    if (initialTradeId) {
      const preset = getPresetById(initialTradeId);
      return preset.id === initialTradeId ? preset : null;
    }
    return null;
  });
  const [previousTradeId, setPreviousTradeId] = useState<string | null>(null);
  const [sliderValues, setSliderValues] = useState<SliderValues>(() => {
    if (initialTradeId) {
      const preset = getPresetById(initialTradeId);
      if (preset.id === initialTradeId) {
        return {
          missedCallsPerWeek: preset.defaultMissedCallsPerWeek,
          closeRatePercent: preset.defaultCloseRate,
          avgJobValue: preset.avgJobValueMid,
        };
      }
    }
    return { missedCallsPerWeek: 10, closeRatePercent: 30, avgJobValue: 500 };
  });
  const [unlocked, setUnlocked] = useState(false);
  const [folded, setFolded] = useState<boolean>(() => readFold());

  // Restore previous trade on mount
  useEffect(() => {
    const stored = readStoredTradeId();
    if (stored) {
      const preset = getPresetById(stored);
      if (preset.id === stored) {
        setPreviousTradeId(stored);
      }
    }
  }, []);

  // Re-check unlock state whenever inputs change
  useEffect(() => {
    if (selectedPreset) {
      setUnlocked(isUnlockedInStorage(selectedPreset.id, sliderValues));
    }
  }, [selectedPreset, sliderValues]);

  const handleTradeSelect = useCallback((preset: TradePreset) => {
    setSelectedPreset(preset);
    const newValues = {
      missedCallsPerWeek: preset.defaultMissedCallsPerWeek,
      closeRatePercent: preset.defaultCloseRate,
      avgJobValue: preset.avgJobValueMid,
    };
    setSliderValues(newValues);
    setUnlocked(isUnlockedInStorage(preset.id, newValues));
    writeStoredTradeId(preset.id);
    trackEvent("calculator_used", { trade: preset.id });
    setStep('q1');
  }, []);

  const handleChangeTrade = useCallback(() => {
    setStep('onboarding');
  }, []);

  const handleUnlock = useCallback(() => {
    if (selectedPreset) {
      persistUnlock(selectedPreset.id, sliderValues);
      trackEvent("calculator_unlocked", { trade: selectedPreset.id });
      setUnlocked(true);
    }
  }, [selectedPreset, sliderValues]);

  const toggleFold = useCallback(() => {
    setFolded(prev => {
      const next = !prev;
      writeFold(next);
      return next;
    });
  }, []);

  // Compute typical annual loss for the gate
  const typicalAnnualLoss = useMemo(() => {
    return calculate({
      missedCallsPerWeek: sliderValues.missedCallsPerWeek,
      closeRatePercent: sliderValues.closeRatePercent,
      avgJobValue: sliderValues.avgJobValue,
    }).lostPerYear;
  }, [sliderValues]);

  // Running micro-summary for the folded sticky bottom bar.
  const microSummaryRange = useMemo(() => {
    return calculateRange({
      missedCallsPerWeek: sliderValues.missedCallsPerWeek,
      closeRatePercent: sliderValues.closeRatePercent,
      avgJobValue: sliderValues.avgJobValue,
    });
  }, [sliderValues]);

  // Stepper progress (only counts slider steps, not onboarding/results).
  const sliderStepIdx = step === 'q1' ? 0 : step === 'q2' ? 1 : step === 'q3' ? 2 : -1;
  const isSliderStep = sliderStepIdx >= 0;
  const totalSliderSteps = SLIDER_STEPS.length;

  const goNext = useCallback(() => {
    if (step === 'q1') setStep('q2');
    else if (step === 'q2') setStep('q3');
    else if (step === 'q3') {
      trackEvent("calculator_results_shown", { trade: selectedPreset?.id });
      setStep('results');
    }
  }, [step, selectedPreset]);

  const goBack = useCallback(() => {
    if (step === 'q2') setStep('q1');
    else if (step === 'q3') setStep('q2');
    else if (step === 'results') setStep('q3');
  }, [step]);

  const microSummaryText = `Est. ${formatCurrencyFull(microSummaryRange.conservative.lostPerYear)} – ${formatCurrencyFull(microSummaryRange.high.lostPerYear)}/yr`;

  return (
    <div data-theme="light" style={{ maxWidth: 640, margin: '0 auto' }}>
      {/* ═══ Outer shell card — overflow: clip (NOT hidden) so sticky children
            anchor to the page scroll context, not this card. See
            project-overflow-clip-for-sticky memory. ═══ */}
      <div
        data-testid="missed-call-calc-shell"
        style={{
          position: 'relative',
          background: mkt.cardBg,
          border: `1px solid ${mkt.cardBorder}`,
          borderRadius: radius.xl,
          overflow: 'clip',
          boxShadow: shadows.card,
        }}
      >
        {/* ── Sticky TOP region — trust strip + trade pill ── */}
        {step !== 'onboarding' && selectedPreset && (
          <div
            data-testid="missed-call-calc-sticky-top"
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 40,
              background: mkt.surface,
              borderBottom: `1px solid ${mkt.cardBorder}`,
            }}
          >
            {/* Trust strip header — marketing-tool appropriate copy.
                Adopts BD-2b TrustStripHeader's pill style on the dark
                marketing palette. */}
            <div
              data-testid="missed-call-trust-strip"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 10,
                padding: '8px 16px',
                borderBottom: `1px solid ${mkt.cardBorder}`,
                fontSize: 11,
                lineHeight: 1.4,
                color: mkt.textMuted,
              }}
            >
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontWeight: 700, color: mkt.onDark,
              }}>
                <Users size={12} aria-hidden="true" color={mkt.accent} />
                Used by 2,000+ trade businesses
              </span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', borderRadius: 999,
                background: mkt.accentTint,
                color: mkt.onDark, fontSize: 11, fontWeight: 600,
              }}>
                <BadgeCheck size={11} aria-hidden="true" color={mkt.accent} />
                Industry-average data
              </span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', borderRadius: 999,
                background: mkt.accentTint,
                color: mkt.onDark, fontSize: 11, fontWeight: 600,
              }}>
                25+ trades supported
              </span>
            </div>

            {/* Trade pill + change-trade button + stepper progress */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '10px 16px',
            }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: mkt.accentTint,
                border: `1px solid ${mkt.accent}33`,
                borderRadius: 100,
                padding: '5px 12px',
                minWidth: 0,
              }}>
                <SlidersHorizontal size={13} color={mkt.accent} strokeWidth={2} />
                <span style={{
                  fontSize: 13, fontWeight: 600, color: mkt.accent,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {selectedPreset.label}
                </span>
              </div>

              {/* Stepper progress dots — only on slider steps */}
              {isSliderStep && (
                <div
                  aria-label={`Step ${sliderStepIdx + 1} of ${totalSliderSteps}`}
                  style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
                >
                  {SLIDER_STEPS.map((_, i) => (
                    <span
                      key={i}
                      style={{
                        width: i === sliderStepIdx ? 18 : 6,
                        height: 6,
                        borderRadius: 999,
                        background: i <= sliderStepIdx ? mkt.accent : mkt.cardBorder,
                        transition: 'all 0.25s ease',
                      }}
                    />
                  ))}
                </div>
              )}

              <button
                onClick={() => { trackEvent("calculator_trade_changed"); handleChangeTrade(); }}
                aria-label="Change trade"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 13,
                  fontWeight: 500,
                  color: mkt.textFaint,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '8px 10px',
                  minHeight: 44,
                  borderRadius: radius.sm,
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = mkt.accent; }}
                onMouseLeave={e => { e.currentTarget.style.color = mkt.textFaint; }}
              >
                <ChevronLeft size={14} />
                Change
              </button>
            </div>
          </div>
        )}

        {/* ── Step body ── */}
        <div style={{ padding: 'clamp(20px, 4vw, 32px)' }}>
          <AnimatePresence mode="wait">
            {step === 'onboarding' && (
              <TradeOnboarding
                key="onboarding"
                onSelect={handleTradeSelect}
                previousTradeId={previousTradeId}
              />
            )}

            {isSliderStep && selectedPreset && (
              <CalculatorControls
                key={`slider-${step}`}
                preset={selectedPreset}
                values={sliderValues}
                onChange={setSliderValues}
                onChangeTrade={handleChangeTrade}
                step={SLIDER_KEYS[step as 'q1' | 'q2' | 'q3']}
                hideChrome
              />
            )}

            {step === 'results' && selectedPreset && (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
              >
                <h2
                  style={{
                    fontSize: 'clamp(20px, 3.5vw, 26px)',
                    fontWeight: 700,
                    color: colors.effortel.n300,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.2,
                    margin: '0 0 6px',
                    textAlign: 'center',
                  }}
                >
                  Your {selectedPreset.label.toLowerCase()} business is{' '}
                  <span style={{ color: '#EF4444' }}>losing money</span> right now
                </h2>
                <p style={{
                  fontSize: 13,
                  color: mkt.textMuted,
                  textAlign: 'center',
                  margin: '0 0 20px',
                  lineHeight: 1.5,
                }}>
                  Here's the revenue range you're likely losing each year.
                </p>

                <ResultsPanel
                  inputs={{
                    missedCallsPerWeek: sliderValues.missedCallsPerWeek,
                    closeRatePercent: sliderValues.closeRatePercent,
                    avgJobValue: sliderValues.avgJobValue,
                  }}
                  tradeName={selectedPreset.label}
                  tradeId={selectedPreset.id}
                  unlocked={unlocked}
                />

                {/* Lead gate — only when not unlocked */}
                {!unlocked && (
                  <CalculatorLeadGate
                    trade={selectedPreset.id}
                    tradeName={selectedPreset.label}
                    missedCallsPerWeek={sliderValues.missedCallsPerWeek}
                    closeRatePercent={sliderValues.closeRatePercent}
                    avgJobValue={sliderValues.avgJobValue}
                    estimatedAnnualLoss={typicalAnnualLoss}
                    onUnlock={handleUnlock}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Sticky BOTTOM action bar — Back / Next + fold/unfold ──
              Only rendered for slider steps + results step. Mirrors the
              BD-2a-sticky pattern in QuoteWidget. ── */}
        {(isSliderStep || step === 'results') && selectedPreset && (
          <div
            data-testid="missed-call-calc-sticky-bottom"
            data-folded={folded ? 'true' : 'false'}
            style={{
              position: 'sticky',
              bottom: 0,
              zIndex: 40,
              background: mkt.surface,
              borderTop: `1px solid ${mkt.cardBorder}`,
              paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
              paddingTop: folded ? 0 : 12,
              transition: 'padding 0.2s ease',
            }}
          >
            {folded ? (
              <button
                type="button"
                data-testid="missed-call-sticky-unfold"
                onClick={toggleFold}
                aria-expanded="false"
                aria-label="Show actions"
                style={{
                  width: '100%', height: 36,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 8,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: mkt.textMuted,
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ color: mkt.onDark }}>{microSummaryText}</span>
                <ChevronUp size={14} />
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    onClick={goBack}
                    disabled={step === 'q1'}
                    aria-label="Go to previous step"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      height: 44,
                      padding: '0 14px',
                      borderRadius: radius.md,
                      border: `1px solid ${mkt.cardBorder}`,
                      background: 'transparent',
                      color: step === 'q1' ? mkt.textFaint : mkt.textMuted,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: step === 'q1' ? 'not-allowed' : 'pointer',
                      opacity: step === 'q1' ? 0.5 : 1,
                      fontFamily: 'inherit',
                      flexShrink: 0,
                    }}
                  >
                    <ChevronLeft size={14} />
                    Back
                  </button>

                  {isSliderStep ? (
                    <button
                      type="button"
                      onClick={goNext}
                      aria-label={step === 'q3' ? 'See my results' : 'Next step'}
                      style={{
                        flex: 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        height: 44,
                        padding: '0 18px',
                        borderRadius: radius.md,
                        border: 'none',
                        background: mkt.accent,
                        color: '#FFFFFF',
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {step === 'q3' ? 'See my results' : 'Next'}
                      <ArrowRight size={14} />
                    </button>
                  ) : (
                    <div style={{
                      flex: 1,
                      textAlign: 'center',
                      fontSize: 12,
                      color: mkt.textFaint,
                      fontWeight: 500,
                    }}>
                      {microSummaryText}
                    </div>
                  )}

                  <button
                    type="button"
                    data-testid="missed-call-sticky-fold"
                    onClick={toggleFold}
                    aria-expanded="true"
                    aria-label="Hide actions"
                    style={{
                      flexShrink: 0,
                      width: 44, height: 44,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'transparent',
                      border: `1px solid ${mkt.cardBorder}`,
                      borderRadius: radius.md,
                      color: mkt.textMuted,
                      cursor: 'pointer',
                    }}
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>

                {/* Running quote micro-summary, only on slider steps */}
                {isSliderStep && (
                  <div style={{
                    textAlign: 'center',
                    fontSize: 11,
                    color: mkt.textFaint,
                    fontWeight: 500,
                  }}>
                    Running estimate: <span style={{ color: mkt.onDark, fontWeight: 600 }}>{microSummaryText}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
