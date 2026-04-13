import { useState, useCallback, useEffect, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { trackEvent } from '@/lib/trackEvent';
import { mkt, colors, radius } from '@/theme/tokens';
import { getPresetById } from '@/data/missedCallTradePresets';
import type { TradePreset } from '@/data/missedCallTradePresets';
import { calculate } from '@/lib/missedCallCalculator';
import TradeOnboarding from './TradeOnboarding';
import CalculatorControls from './CalculatorControls';
import type { SliderValues } from './CalculatorControls';
import ResultsPanel from './ResultsPanel';
import CalculatorLeadGate from './CalculatorLeadGate';

const STORAGE_KEY = 'wft-calc-trade';
const UNLOCK_PREFIX = 'wft-calc-unlocked-';

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

type Step = 'onboarding' | 'calculator';

interface ShellProps {
  initialTradeId?: string;
}

export default function MissedCallCalculatorShell({ initialTradeId }: ShellProps = {}) {
  const [step, setStep] = useState<Step>(initialTradeId ? 'calculator' : 'onboarding');
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
    setStep('calculator');
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

  // Compute typical annual loss for the gate
  const typicalAnnualLoss = useMemo(() => {
    return calculate({
      missedCallsPerWeek: sliderValues.missedCallsPerWeek,
      closeRatePercent: sliderValues.closeRatePercent,
      avgJobValue: sliderValues.avgJobValue,
    }).lostPerYear;
  }, [sliderValues]);

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
              Your {selectedPreset.label.toLowerCase()} business is{' '}
              <span style={{ color: '#EF4444' }}>losing money</span> right now
              <span style={{
                display: 'block',
                fontSize: 'clamp(14px, 2vw, 16px)',
                fontWeight: 400,
                color: mkt.textMuted,
                letterSpacing: 0,
                marginTop: 6,
              }}>
                Adjust the sliders to see how much missed calls cost you.
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
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
