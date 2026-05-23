import { useState } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { trackEvent } from '@/lib/trackEvent';
import { Lock, Send, CheckCircle2, Loader2, Shield, ArrowRight } from 'lucide-react';
import { mkt, colors, radius } from '@/theme/tokens';

/** Dark-theme floating-label input — mirrors the FloatingLabelInput pattern
 *  from `pages/portal/PortalOnboarding.tsx` (light theme), but rendered with
 *  inline styles on the marketing dark palette. Title sits INSIDE the field
 *  per design-system "Input / form field rules". No duplicated <label>
 *  outside; help cue (when needed) sits top-left of the field. */
function DarkFloatingLabel({
  id, label, value, onChange, type = 'text', required, error, onFocus, onBlur,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  error?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const floated = focused || value.length > 0;
  const accent = error ? '#EF4444' : (focused ? mkt.accent : mkt.cardBorder);

  return (
    <div data-theme="light" style={{ position: 'relative', width: '100%' }}>
      <input
        id={id}
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => { setFocused(true); onFocus?.(); }}
        onBlur={() => { setFocused(false); onBlur?.(); }}
        aria-label={label}
        style={{
          width: '100%',
          height: 52,
          padding: '20px 14px 6px',
          borderRadius: radius.md,
          border: `1px solid ${accent}`,
          fontSize: 14,
          outline: 'none',
          fontFamily: 'inherit',
          color: colors.effortel.n200,
          background: 'rgba(255,255,255,0.04)',
          boxSizing: 'border-box',
          transition: 'border-color 0.2s',
        }}
      />
      <label
        htmlFor={id}
        style={{
          position: 'absolute',
          left: 14,
          pointerEvents: 'none',
          transition: 'all 0.15s ease',
          top: floated ? 7 : 16,
          fontSize: floated ? 10 : 14,
          fontWeight: floated ? 600 : 400,
          letterSpacing: floated ? '0.04em' : 0,
          textTransform: floated ? 'uppercase' : 'none',
          color: floated ? (error ? '#EF4444' : (focused ? mkt.accent : mkt.textMuted)) : mkt.textFaint,
        }}
      >
        {label}
        {!required && (
          <span style={{
            marginLeft: 4,
            fontWeight: 400,
            textTransform: 'none',
            letterSpacing: 0,
            color: mkt.textFaint,
          }}>
            (optional)
          </span>
        )}
      </label>
    </div>
  );
}

interface CalculatorLeadGateProps {
  trade: string;
  tradeName: string;
  missedCallsPerWeek: number;
  closeRatePercent: number;
  avgJobValue: number;
  estimatedAnnualLoss: number;
  onUnlock: () => void;
}

export default function CalculatorLeadGate({
  trade,
  tradeName,
  missedCallsPerWeek,
  closeRatePercent,
  avgJobValue,
  estimatedAnnualLoss,
  onUnlock,
}: CalculatorLeadGateProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || submitted) return;

    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch('/api/missed-call-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          email: trimmed,
          name: name.trim() || null,
          phone: phone.trim() || null,
          trade,
          missedCallsPerWeek,
          closeRatePercent,
          avgJobValue,
          estimatedAnnualLoss,
          source_tool: "calculator",
          source_page: typeof window !== "undefined" ? window.location.pathname : null,
        }),
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Something went wrong.');
      }

      setSubmitted(true);
      trackEvent("calculator_lead_submitted", { trade, estimatedAnnualLoss });
      setTimeout(() => onUnlock(), 2000);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('Request timed out. Please try again.');
      } else {
        setError(err.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        role="status"
        aria-live="polite"
        style={{
          background: mkt.cardBg,
          border: `1px solid ${mkt.cardBorder}`,
          borderRadius: radius.xl,
          padding: '32px 24px',
          textAlign: 'center',
          margin: '16px 0',
        }}
      >
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'rgba(34,197,94,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <CheckCircle2 size={28} color="#22C55E" />
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: colors.effortel.n200, marginBottom: 6 }}>
          Your full report is ready.
        </div>
        <div style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.5, marginBottom: 16 }}>
          We've also emailed your action plan to capture missed revenue — check your inbox within 5 minutes.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          <Link href="/tools/free-audit" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 13, color: mkt.accent, textDecoration: 'none', fontWeight: 600,
          }}>
            Run a free Google audit <ArrowRight size={14} />
          </Link>
          <Link href="/tools/quote-demo" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 13, color: mkt.accent, textDecoration: 'none', fontWeight: 600,
          }}>
            Try the instant quote demo <ArrowRight size={14} />
          </Link>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.15 }}
      style={{
        background: mkt.cardBg,
        border: `1px solid ${mkt.cardBorder}`,
        borderRadius: radius.xl,
        padding: '28px 24px',
        margin: '16px 0',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Accent top border */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${mkt.accent}, #3B82F6)`,
      }} />

      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: mkt.accentTint,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 14px',
        }}>
          <Lock size={20} color={mkt.accent} />
        </div>
        <div style={{
          fontSize: 20, fontWeight: 700,
          color: colors.effortel.n200,
          marginBottom: 6, lineHeight: 1.2,
        }}>
          Unlock Your Full Revenue Breakdown
        </div>
        <div style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.5 }}>
          See the full picture — monthly, daily, and a recovery plan for your {tradeName.toLowerCase()} business.
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* BD-2a floating-label pattern — title inside field, max 2px gap
            between stacked inputs per design-system rule. */}
        <DarkFloatingLabel
          id="calc-email"
          label="Email"
          type="email"
          value={email}
          required
          error={Boolean(error)}
          onChange={(v) => { setEmail(v); setError(''); }}
        />
        {error && (
          <div style={{ fontSize: 12, color: '#EF4444', marginTop: 2, marginBottom: 2 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
          <DarkFloatingLabel
            id="calc-name"
            label="Name"
            value={name}
            onChange={setName}
          />
          <DarkFloatingLabel
            id="calc-phone"
            label="Phone"
            type="tel"
            value={phone}
            onChange={setPhone}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
          style={{
            width: '100%', height: 48, borderRadius: radius.lg,
            border: 'none', background: mkt.accent, color: '#FFFFFF',
            fontSize: 15, fontWeight: 700,
            cursor: submitting ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.2s',
            opacity: submitting ? 0.7 : 1,
            marginTop: 10,
          }}
          onMouseEnter={(e) => { if (!submitting) e.currentTarget.style.boxShadow = '0 4px 16px rgba(13,60,252,0.3)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
        >
          {submitting ? (
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
          ) : (
            <Send size={16} />
          )}
          Unlock My Full Breakdown & Recovery Plan
        </button>
      </form>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        marginTop: 14, fontSize: 12, color: mkt.textFaint,
      }}>
        <Shield size={12} />
        <span>No spam. We'll send your personalized report.</span>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </motion.div>
  );
}
