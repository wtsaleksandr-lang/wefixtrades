import { useMemo, useState, useRef, useEffect } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { Link } from 'wouter';
import {
  TrendingDown, Calendar, Briefcase, ArrowRight, Info,
  ChevronDown, ChevronUp, Zap, Lock, Search, Copy, Check,
} from 'lucide-react';
import InfoTooltip from '@/components/marketing/InfoTooltip';
import { mkt, colors, radius } from '@/theme/tokens';
import { calculateRange, formatCurrencyFull } from '@/lib/missedCallCalculator';
import type { CalcInputs } from '@/lib/missedCallCalculator';
import ResultMetricCard from './ResultMetricCard';
import AnimatedNumber from './AnimatedNumber';
import { trackEvent } from '@/lib/trackEvent';

const SCENARIO_ID = 'response-scenario-panel';
const METHODOLOGY_ID = 'methodology-panel';

/** Detect prefers-reduced-motion */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

interface ResultsPanelProps {
  inputs: CalcInputs;
  tradeName: string;
  unlocked?: boolean;
}

export default function ResultsPanel({ inputs, tradeName, unlocked = false }: ResultsPanelProps) {
  const range = useMemo(() => calculateRange(inputs), [inputs]);
  const [showScenario, setShowScenario] = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);
  const [copied, setCopied] = useState(false);
  const heroControls = useAnimationControls();
  const prevInputsRef = useRef(inputs);
  const reducedMotion = usePrefersReducedMotion();

  // Micro-interaction: subtle pulse on value change
  useEffect(() => {
    const prev = prevInputsRef.current;
    const changed =
      prev.missedCallsPerWeek !== inputs.missedCallsPerWeek ||
      prev.closeRatePercent !== inputs.closeRatePercent ||
      prev.avgJobValue !== inputs.avgJobValue;

    prevInputsRef.current = inputs;

    if (changed && !reducedMotion) {
      heroControls.start({
        scale: [1, 1.012, 1],
        transition: { duration: 0.28, ease: 'easeOut' },
      });
    }
  }, [inputs, heroControls, reducedMotion]);

  const { conservative, typical, high } = range;

  // Response improvement scenario
  const scenarioBoost = Math.min(10, 95 - inputs.closeRatePercent);
  const boostedRate = inputs.closeRatePercent + scenarioBoost;
  const improvedRange = useMemo(
    () => calculateRange({ ...inputs, closeRatePercent: boostedRate }),
    [inputs, boostedRate],
  );
  const scenarioDelta = improvedRange.typical.lostPerYear - typical.lostPerYear;
  const scenarioUseful = scenarioBoost >= 3 && scenarioDelta > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.45, delay: reducedMotion ? 0 : 0.1 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}
    >
      {/* ═══ PARTIAL: Always visible ═══ */}

      {/* ── Primary hero: typical annual loss ── */}
      <motion.div
        animate={heroControls}
        style={{
          background: 'rgba(239,68,68,0.06)',
          border: '1px solid rgba(239,68,68,0.15)',
          borderRadius: radius.xl,
          padding: 'clamp(24px, 4vw, 32px)',
          textAlign: 'center',
        }}
      >
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10,
        }}>
          <TrendingDown size={14} color="#EF4444" strokeWidth={2} />
          <span style={{
            fontSize: 12, fontWeight: 700, color: '#EF4444',
            letterSpacing: '0.04em', textTransform: 'uppercase' as const,
            display: 'inline-flex', alignItems: 'center',
          }}>
            Estimated revenue from missed calls
            <InfoTooltip text="This is the revenue that likely went to competitors because the call wasn't answered. It's based on your missed call volume, the percentage that would have become jobs, and your average job value." />
          </span>
        </div>

        {unlocked ? (
          /* Full: show range */
          <>
            <div
              aria-live="polite"
              aria-label={`Estimated range: ${formatCurrencyFull(conservative.lostPerYear)} to ${formatCurrencyFull(high.lostPerYear)} per year`}
              style={{
                fontSize: 'clamp(30px, 6vw, 48px)', fontWeight: 700,
                color: colors.effortel.n100, letterSpacing: '-0.03em',
                lineHeight: 1.05, marginBottom: 6,
              }}
            >
              <AnimatedNumber value={conservative.lostPerYear} />{' – '}
              <AnimatedNumber value={high.lostPerYear} />
            </div>
            <div style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.4 }}>
              Most likely: <strong style={{ color: colors.effortel.n200 }}>
                {formatCurrencyFull(typical.lostPerYear)}
              </strong>/yr
            </div>
          </>
        ) : (
          /* Partial: typical only */
          <div
            aria-live="polite"
            style={{
              fontSize: 'clamp(30px, 6vw, 48px)', fontWeight: 700,
              color: colors.effortel.n100, letterSpacing: '-0.03em',
              lineHeight: 1.05, marginBottom: 6,
            }}
          >
            <AnimatedNumber value={typical.lostPerYear} />
          </div>
        )}
      </motion.div>

      {/* ── Daily loss — always visible ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: reducedMotion ? 0 : 0.35, duration: reducedMotion ? 0 : 0.4 }}
        style={{ textAlign: 'center', padding: '8px 0' }}
      >
        <motion.span
          animate={reducedMotion ? {} : { opacity: [0.6, 1, 0.6] }}
          transition={reducedMotion ? {} : { duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          aria-live="polite"
          style={{ fontSize: 13, fontWeight: 600, color: '#EF4444', letterSpacing: '0.01em' }}
        >
          ≈ {formatCurrencyFull(typical.lostPerDay)} per day
        </motion.span>
      </motion.div>

      {/* ── Input context — always visible ── */}
      <div style={{
        textAlign: 'center', fontSize: 12, color: mkt.textFaint, lineHeight: 1.5,
        padding: '0 8px',
      }}>
        Based on {inputs.missedCallsPerWeek} missed calls/week at {inputs.closeRatePercent}% booking rate
      </div>

      {/* ═══ LOCKED TEASERS: only when NOT unlocked ═══ */}
      {!unlocked && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reducedMotion ? 0 : 0.4, duration: reducedMotion ? 0 : 0.3 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {/* Locked preview rows */}
          {[
            { label: 'Monthly breakdown', icon: <Calendar size={13} /> },
            { label: 'Missed jobs per month', icon: <Briefcase size={13} /> },
          ].map((row) => (
            <div key={row.label} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: 'clamp(8px, 1.5vw, 10px) clamp(10px, 2vw, 14px)',
              background: mkt.cardBg,
              border: `1px solid ${mkt.cardBorder}`,
              borderRadius: radius.md,
              opacity: 0.6,
            }}>
              <span style={{ color: mkt.textFaint }}>{row.icon}</span>
              <span style={{ flex: 1, fontSize: 13, color: mkt.textMuted, fontWeight: 500 }}>
                {row.label}
              </span>
              <Lock size={12} color={mkt.textFaint} />
            </div>
          ))}
        </motion.div>
      )}

      {/* ═══ FULL: only when unlocked ═══ */}
      {unlocked && (
        <>
          {/* ── Monthly + jobs (2-col) ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 10,
          }}>
            <ResultMetricCard
              label="Per month"
              value={`${formatCurrencyFull(conservative.lostPerMonth)} – ${formatCurrencyFull(high.lostPerMonth)}`}
              icon={<Calendar size={14} />}
              accent="#EF4444"
              accentTint="rgba(239,68,68,0.08)"
              delay={reducedMotion ? 0 : 0.2}
            />
            <ResultMetricCard
              label="Missed jobs / mo"
              value={`~${Math.round(conservative.lostJobsPerMonth)} – ${Math.round(high.lostJobsPerMonth)}`}
              icon={<Briefcase size={14} />}
              accent="#D97706"
              accentTint="rgba(217,119,6,0.08)"
              delay={reducedMotion ? 0 : 0.25}
            />
          </div>

          {/* ── Response improvement scenario ── */}
          {scenarioUseful && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reducedMotion ? 0 : 0.4, duration: reducedMotion ? 0 : 0.35 }}
            >
              <button
                onClick={() => { setShowScenario(s => !s); trackEvent("calculator_scenario_toggled", { open: !showScenario }); }}
                aria-expanded={showScenario}
                aria-controls={SCENARIO_ID}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '12px 16px',
                  background: mkt.cardBg, border: `1px solid ${mkt.cardBorder}`,
                  borderRadius: showScenario ? `${radius.md} ${radius.md} 0 0` : radius.md,
                  cursor: 'pointer', transition: 'border-radius 0.2s',
                  color: mkt.textMuted, fontSize: 13, fontWeight: 600, textAlign: 'left',
                }}
              >
                <Zap size={14} color={mkt.accent} />
                <span style={{ flex: 1, display: 'inline-flex', alignItems: 'center' }}>
                  What if you answered calls faster?
                  <InfoTooltip text="Businesses that respond to calls within 30 seconds book significantly more jobs. This shows how much more revenue you'd capture if your booking rate increased." />
                </span>
                {showScenario
                  ? <ChevronUp size={14} color={mkt.textFaint} />
                  : <ChevronDown size={14} color={mkt.textFaint} />}
              </button>

              {showScenario && (
                <motion.div
                  id={SCENARIO_ID} role="region" aria-label="Response improvement scenario"
                  initial={reducedMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    background: mkt.cardBg, border: `1px solid ${mkt.cardBorder}`,
                    borderTop: 'none', borderRadius: `0 0 ${radius.md} ${radius.md}`,
                    padding: '14px 16px',
                  }}
                >
                  <p style={{ fontSize: 13, color: mkt.textMuted, lineHeight: 1.55, margin: '0 0 10px' }}>
                    Answering calls faster means more booked jobs. If your booking rate
                    went from {inputs.closeRatePercent}% to {boostedRate}%:
                  </p>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: 'clamp(8px, 1.5vw, 10px) clamp(10px, 2vw, 14px)',
                    background: 'rgba(102,232,250,0.06)',
                    border: `1px solid ${mkt.accent}22`, borderRadius: radius.sm,
                  }}>
                    <Zap size={16} color={mkt.accent} style={{ flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: colors.effortel.n100, letterSpacing: '-0.01em' }}>
                        +{formatCurrencyFull(scenarioDelta)}/yr potential
                      </div>
                      <div style={{ fontSize: 12, color: mkt.textFaint, marginTop: 2 }}>
                        Based on industry patterns — not a guarantee
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ── Methodology disclosure ── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reducedMotion ? 0 : 0.45, duration: reducedMotion ? 0 : 0.4 }}
            style={{
              background: mkt.cardBg, border: `1px solid ${mkt.cardBorder}`,
              borderRadius: radius.md, overflow: 'hidden',
            }}
          >
            <button
              onClick={() => setShowMethodology(s => !s)}
              aria-expanded={showMethodology}
              aria-controls={METHODOLOGY_ID}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '12px 16px', background: 'none', border: 'none',
                cursor: 'pointer', color: mkt.textFaint, fontSize: 12,
                fontWeight: 600, textAlign: 'left',
              }}
            >
              <Info size={13} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>How this is estimated</span>
              <ChevronDown size={12} style={{
                flexShrink: 0,
                transform: showMethodology ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
              }} />
            </button>

            {showMethodology && (
              <motion.div
                id={METHODOLOGY_ID} role="region" aria-label="Estimation methodology"
                initial={reducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: reducedMotion ? 0 : 0.2 }}
                style={{ padding: '0 16px 14px' }}
              >
                <ul style={{
                  margin: 0, paddingLeft: 16, fontSize: 12, color: mkt.textFaint,
                  lineHeight: 1.65, listStyleType: 'disc',
                }}>
                  <li>Results are based on your inputs for missed calls, close rate, and average job value</li>
                  <li>The low estimate assumes 70% of missed calls were real potential customers</li>
                  <li>The high estimate adds 20% for repeat business and referrals you'd also lose</li>
                  <li>Trade presets use typical averages for your industry and are meant as starting points</li>
                  <li>Results are shown as ranges because every business varies by season, location, and customer type</li>
                  <li style={{ marginTop: 4 }}>
                    <span style={{ color: mkt.textMuted }}>These are rough estimates, not exact figures</span>
                  </li>
                </ul>
              </motion.div>
            )}
          </motion.div>

          {/* ── TradeLine CTA ── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reducedMotion ? 0 : 0.5, duration: reducedMotion ? 0 : 0.35 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            {/* Primary: TradeLine */}
            <Link href="/products/tradeline" style={{ textDecoration: 'none', display: 'block' }}>
              <div
                role="link"
                tabIndex={0}
                onClick={() => trackEvent("calculator_primary_cta_clicked", { target: "/products/tradeline" })}
                style={{
                  background: mkt.accent, borderRadius: radius.lg,
                  padding: '18px 24px', display: 'flex', alignItems: 'center',
                  cursor: 'pointer', border: '2px solid transparent',
                  transition: 'border-color 0.25s, box-shadow 0.25s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'rgba(0,0,0,0.3)';
                  e.currentTarget.style.boxShadow = '0 16px 48px rgba(0,0,0,0.15)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 'clamp(15px, 2.5vw, 18px)', fontWeight: 700,
                    color: '#0d1514', lineHeight: 1.2, marginBottom: 3,
                  }}>
                    Stop Losing {formatCurrencyFull(typical.lostPerMonth)}/mo to Missed Calls
                  </div>
                  <div style={{ fontSize: 13, color: 'rgba(13,21,20,0.55)', fontWeight: 500 }}>
                    AI answers 24/7 · SMS auto-response · From $97/mo
                  </div>
                </div>
                <div style={{
                  width: 44, height: 44, background: '#0d1514', borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <ArrowRight size={16} color="white" strokeWidth={2.2} />
                </div>
              </div>
            </Link>

            {/* Secondary: Cross-tool CTA */}
            <Link href="/tools/free-audit" style={{ textDecoration: 'none', display: 'block' }}>
              <div
                role="link"
                tabIndex={0}
                onClick={() => trackEvent("calculator_secondary_cta_clicked", { target: "/tools/free-audit" })}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '12px 20px', borderRadius: radius.lg,
                  border: `1px solid ${mkt.border}`, background: 'transparent',
                  cursor: 'pointer', transition: 'border-color 0.2s, background 0.2s',
                  fontSize: 14, fontWeight: 600, color: mkt.textMuted,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = mkt.border;
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <Search size={14} />
                Get a full business audit
              </div>
            </Link>

            {/* Copy results to clipboard */}
            <button
              onClick={() => {
                const text = [
                  `Missed Call Revenue Calculator — ${tradeName}`,
                  `Estimated monthly loss: ${formatCurrencyFull(typical.lostPerMonth)}`,
                  `Based on: ${inputs.missedCallsPerWeek} missed calls/week, ${inputs.closeRatePercent}% close rate, ${formatCurrencyFull(inputs.avgJobValue)} avg job`,
                  `Try it: https://wefixtrades.com/tools/missed-call-calculator`,
                ].join("\n");
                navigator.clipboard.writeText(text).then(() => {
                  setCopied(true);
                  trackEvent("calculator_results_copied", { trade: tradeName });
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '10px 20px', borderRadius: radius.lg, minHeight: 44,
                border: `1px solid ${mkt.border}`, background: 'transparent',
                cursor: 'pointer', transition: 'border-color 0.2s, background 0.2s',
                fontSize: 13, fontWeight: 600, color: copied ? '#22C55E' : mkt.textFaint,
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = mkt.border;
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy results'}
            </button>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}
