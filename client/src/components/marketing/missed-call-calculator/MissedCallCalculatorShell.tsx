import { useState, useCallback, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Link } from 'wouter';
import { Calculator, ArrowRight } from 'lucide-react';
import { mkt, colors, radius } from '@/theme/tokens';
import { getPresetById } from '@/data/missedCallTradePresets';
import type { TradePreset } from '@/data/missedCallTradePresets';
import TradeOnboarding from './TradeOnboarding';
import CalculatorControls from './CalculatorControls';
import type { SliderValues } from './CalculatorControls';
import ResultsPanel from './ResultsPanel';

const STORAGE_KEY = 'wft-calc-trade';

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

type Step = 'onboarding' | 'calculator';

export default function MissedCallCalculatorShell() {
  const [step, setStep] = useState<Step>('onboarding');
  const [selectedPreset, setSelectedPreset] = useState<TradePreset | null>(null);
  const [previousTradeId, setPreviousTradeId] = useState<string | null>(null);
  const [sliderValues, setSliderValues] = useState<SliderValues>({
    missedCallsPerWeek: 10,
    closeRatePercent: 30,
    avgJobValue: 500,
  });

  // Restore previous trade on mount
  useEffect(() => {
    const stored = readStoredTradeId();
    if (stored) {
      const preset = getPresetById(stored);
      // Only surface if it resolved to a real preset (not the generic fallback for unknown ids)
      if (preset.id === stored) {
        setPreviousTradeId(stored);
      }
    }
  }, []);

  const handleTradeSelect = useCallback((preset: TradePreset) => {
    setSelectedPreset(preset);
    setSliderValues({
      missedCallsPerWeek: preset.defaultMissedCallsPerWeek,
      closeRatePercent: preset.defaultCloseRate,
      avgJobValue: preset.avgJobValueMid,
    });
    writeStoredTradeId(preset.id);
    setStep('calculator');
  }, []);

  const handleChangeTrade = useCallback(() => {
    setStep('onboarding');
  }, []);

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <AnimatePresence mode="wait">
        {step === 'onboarding' && (
          <TradeOnboarding
            key="onboarding"
            onSelect={handleTradeSelect}
            previousTradeId={previousTradeId}
          />
        )}

        {step === 'calculator' && selectedPreset && (
          <div key="calculator">
            <h2
              style={{
                fontSize: 'clamp(22px, 4vw, 30px)',
                fontWeight: 700,
                color: colors.effortel.n300,
                letterSpacing: '-0.02em',
                lineHeight: 1.15,
                margin: '0 0 20px',
                textAlign: 'center',
              }}
            >
              Missed-call cost estimate
              <span style={{
                display: 'block',
                fontSize: 'clamp(14px, 2vw, 16px)',
                fontWeight: 400,
                color: mkt.textMuted,
                letterSpacing: 0,
                marginTop: 6,
              }}>
                for {selectedPreset.label.toLowerCase()} businesses
              </span>
            </h2>

            <CalculatorControls
              preset={selectedPreset}
              values={sliderValues}
              onChange={setSliderValues}
              onChangeTrade={handleChangeTrade}
            />

            <ResultsPanel
              inputs={{
                missedCallsPerWeek: sliderValues.missedCallsPerWeek,
                closeRatePercent: sliderValues.closeRatePercent,
                avgJobValue: sliderValues.avgJobValue,
              }}
              tradeName={selectedPreset.label}
            />

            {/* Cross-link to quote demo */}
            <div style={{ marginTop: 24 }}>
              <Link href="/tools/quote-demo" style={{ textDecoration: 'none', display: 'block' }}>
                <div
                  role="link"
                  tabIndex={0}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '14px 18px',
                    borderRadius: radius.lg,
                    border: `1px solid ${mkt.border}`,
                    background: mkt.cardBg,
                    cursor: 'pointer',
                    transition: 'border-color 0.2s, background 0.2s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                    e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = mkt.border;
                    e.currentTarget.style.background = mkt.cardBg;
                  }}
                >
                  <div style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: mkt.accentTint,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Calculator size={16} color={mkt.accent} strokeWidth={1.8} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 650, color: mkt.text }}>
                      Try the Quote Calculator Demo
                    </div>
                    <div style={{ fontSize: 13, color: mkt.textMuted }}>
                      See how instant quotes work for your trade
                    </div>
                  </div>
                  <ArrowRight size={16} color={mkt.textFaint} />
                </div>
              </Link>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
