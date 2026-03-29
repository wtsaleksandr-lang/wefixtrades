import { useMemo, useState, useRef } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { Link } from 'wouter';
import {
  TrendingDown, Calendar, Briefcase, ArrowRight, Info,
  Clock, ChevronDown, ChevronUp, Zap,
} from 'lucide-react';
import { mkt, colors, radius } from '@/theme/tokens';
import { calculateRange, formatCurrencyFull } from '@/lib/missedCallCalculator';
import type { RangeResult, CalcInputs } from '@/lib/missedCallCalculator';
import ResultMetricCard from './ResultMetricCard';
import AnimatedNumber from './AnimatedNumber';

interface ResultsPanelProps {
  inputs: CalcInputs;
  tradeName: string;
}

export default function ResultsPanel({ inputs, tradeName }: ResultsPanelProps) {
  const range: RangeResult = useMemo(() => calculateRange(inputs), [inputs]);
  const [showScenario, setShowScenario] = useState(false);
  const heroControls = useAnimationControls();
  const prevInputsRef = useRef(inputs);

  // Micro-interaction: subtle pulse on value change
  const inputsChanged =
    prevInputsRef.current.missedCallsPerWeek !== inputs.missedCallsPerWeek ||
    prevInputsRef.current.closeRatePercent !== inputs.closeRatePercent ||
    prevInputsRef.current.avgJobValue !== inputs.avgJobValue;

  if (inputsChanged) {
    prevInputsRef.current = inputs;
    heroControls.start({
      scale: [1, 1.015, 1],
      transition: { duration: 0.3, ease: 'easeOut' },
    });
  }

  const { conservative, typical, high } = range;

  // Response improvement scenario: +10% close rate
  const improvedRange = useMemo(() => {
    const boost = Math.min(inputs.closeRatePercent + 10, 95);
    return calculateRange({ ...inputs, closeRatePercent: boost });
  }, [inputs]);
  const scenarioDelta = improvedRange.typical.lostPerYear - typical.lostPerYear;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.1 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}
    >
      {/* ── Primary hero: yearly opportunity range ── */}
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
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 10,
        }}>
          <TrendingDown size={14} color="#EF4444" strokeWidth={2} />
          <span style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#EF4444',
            letterSpacing: '0.04em',
            textTransform: 'uppercase' as const,
          }}>
            Estimated lost opportunity per year
          </span>
        </div>

        <div
          aria-live="polite"
          aria-label={`Estimated lost revenue range: ${formatCurrencyFull(conservative.lostPerYear)} to ${formatCurrencyFull(high.lostPerYear)} per year`}
          style={{
            fontSize: 'clamp(32px, 6vw, 48px)',
            fontWeight: 700,
            color: colors.effortel.n100,
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
            marginBottom: 6,
          }}
        >
          <AnimatedNumber value={conservative.lostPerYear} /> – <AnimatedNumber value={high.lostPerYear} />
        </div>

        <div style={{
          fontSize: 14,
          color: mkt.textMuted,
          lineHeight: 1.4,
        }}>
          Most likely: <strong style={{ color: colors.effortel.n200 }}>
            {formatCurrencyFull(typical.lostPerYear)}
          </strong>/yr
        </div>
      </motion.div>

      {/* ── Secondary: monthly + daily + jobs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <ResultMetricCard
          label="Per month"
          value={`${formatCurrencyFull(conservative.lostPerMonth)} – ${formatCurrencyFull(high.lostPerMonth)}`}
          icon={<Calendar size={14} />}
          accent="#EF4444"
          accentTint="rgba(239,68,68,0.08)"
          delay={0.25}
        />
        <ResultMetricCard
          label="Per day"
          value={`${formatCurrencyFull(conservative.lostPerDay)} – ${formatCurrencyFull(high.lostPerDay)}`}
          icon={<Clock size={14} />}
          accent="#EF4444"
          accentTint="rgba(239,68,68,0.06)"
          delay={0.3}
        />
        <ResultMetricCard
          label="Jobs / mo"
          value={`~${Math.round(conservative.lostJobsPerMonth)} – ${Math.round(high.lostJobsPerMonth)}`}
          icon={<Briefcase size={14} />}
          accent="#D97706"
          accentTint="rgba(217,119,6,0.08)"
          delay={0.35}
        />
      </div>

      {/* ── Daily loss context line with subtle pulse ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        style={{
          textAlign: 'center',
          padding: '10px 0',
        }}
      >
        <motion.span
          animate={{ opacity: [0.65, 1, 0.65] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#EF4444',
            letterSpacing: '0.01em',
          }}
        >
          ≈ {formatCurrencyFull(conservative.lostPerDay)} – {formatCurrencyFull(high.lostPerDay)} per day in missed opportunities
        </motion.span>
      </motion.div>

      {/* ── Response improvement scenario (collapsible) ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.48, duration: 0.35 }}
      >
        <button
          onClick={() => setShowScenario(s => !s)}
          aria-expanded={showScenario}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 16px',
            background: mkt.cardBg,
            border: `1px solid ${mkt.cardBorder}`,
            borderRadius: showScenario ? `${radius.md} ${radius.md} 0 0` : radius.md,
            cursor: 'pointer',
            transition: 'border-radius 0.2s',
            color: mkt.textMuted,
            fontSize: 13,
            fontWeight: 600,
            textAlign: 'left',
          }}
        >
          <Zap size={14} color={mkt.accent} />
          <span style={{ flex: 1 }}>
            What if you improved response time?
          </span>
          {showScenario
            ? <ChevronUp size={14} color={mkt.textFaint} />
            : <ChevronDown size={14} color={mkt.textFaint} />
          }
        </button>

        {showScenario && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            style={{
              background: mkt.cardBg,
              border: `1px solid ${mkt.cardBorder}`,
              borderTop: 'none',
              borderRadius: `0 0 ${radius.md} ${radius.md}`,
              padding: '14px 16px',
            }}
          >
            <p style={{
              fontSize: 13,
              color: mkt.textMuted,
              lineHeight: 1.55,
              margin: '0 0 10px',
            }}>
              Faster response times generally increase close rates. If your close rate
              improved by ~10 points (from {inputs.closeRatePercent}% to{' '}
              {Math.min(inputs.closeRatePercent + 10, 95)}%):
            </p>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 14px',
              background: 'rgba(102,232,250,0.06)',
              border: `1px solid ${mkt.accent}22`,
              borderRadius: radius.sm,
            }}>
              <Zap size={16} color={mkt.accent} />
              <div>
                <div style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: colors.effortel.n100,
                  letterSpacing: '-0.01em',
                }}>
                  +{formatCurrencyFull(scenarioDelta)}/yr potential
                </div>
                <div style={{
                  fontSize: 12,
                  color: mkt.textFaint,
                  marginTop: 2,
                }}>
                  Based on industry benchmarks — not a guarantee
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* ── Assumptions + trust text ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '14px 16px',
          background: mkt.cardBg,
          border: `1px solid ${mkt.cardBorder}`,
          borderRadius: radius.md,
        }}
      >
        <Info size={14} color={mkt.textFaint} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 12, color: mkt.textFaint, lineHeight: 1.55 }}>
          <p style={{ margin: '0 0 6px' }}>
            <strong style={{ color: mkt.textMuted }}>How we estimate:</strong>{' '}
            Conservative assumes 70% of missed calls were genuine leads.
            High includes 20% for repeat and referral value.
          </p>
          <p style={{ margin: 0, opacity: 0.85 }}>
            Estimates based on aggregated service industry data across North America.
            Your results depend on lead quality, seasonality, and local market.
          </p>
        </div>
      </motion.div>

      {/* ── CTA ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.35 }}
      >
        <Link href="/demo" style={{ textDecoration: 'none', display: 'block' }}>
          <div
            role="link"
            tabIndex={0}
            style={{
              background: mkt.accent,
              borderRadius: radius.lg,
              padding: '18px 24px',
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              border: '2px solid transparent',
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
                fontSize: 'clamp(15px, 2.5vw, 18px)',
                fontWeight: 700,
                color: '#0d1514',
                lineHeight: 1.2,
                marginBottom: 3,
              }}>
                See how faster response could change this
              </div>
              <div style={{
                fontSize: 13,
                color: 'rgba(13,21,20,0.55)',
                fontWeight: 500,
              }}>
                Explore the demo — no signup required
              </div>
            </div>
            <div style={{
              width: 44,
              height: 44,
              background: '#0d1514',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <ArrowRight size={16} color="white" strokeWidth={2.2} />
            </div>
          </div>
        </Link>
      </motion.div>
    </motion.div>
  );
}
