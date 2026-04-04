import { useState } from 'react';
import { motion } from 'framer-motion';
import { trackEvent } from '@/lib/trackEvent';
import { Lock, Send, CheckCircle2, Loader2, Shield } from 'lucide-react';
import { mkt, colors, radius } from '@/theme/tokens';

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
      const res = await fetch('/api/missed-call-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Something went wrong.');
      }

      setSubmitted(true);
      trackEvent("calculator_lead_submitted", { trade, estimatedAnnualLoss });
      setTimeout(() => onUnlock(), 2000);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
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
        <div style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.5 }}>
          We've also emailed your recovery plan.
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

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(''); }}
          placeholder="your@email.com"
          required
          style={{
            width: '100%', height: 44, padding: '0 14px',
            borderRadius: radius.md,
            border: `1px solid ${error ? '#EF4444' : mkt.cardBorder}`,
            fontSize: 14, outline: 'none', fontFamily: 'inherit',
            color: colors.effortel.n200,
            background: 'rgba(255,255,255,0.04)',
            boxSizing: 'border-box',
            transition: 'border-color 0.2s',
          }}
          onFocus={(e) => { if (!error) e.currentTarget.style.borderColor = mkt.accent; }}
          onBlur={(e) => { if (!error) e.currentTarget.style.borderColor = mkt.cardBorder; }}
        />
        {error && (
          <div style={{ fontSize: 12, color: '#EF4444', marginTop: -4 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            style={{
              flex: 1, height: 40, padding: '0 12px',
              borderRadius: radius.md,
              border: `1px solid ${mkt.cardBorder}`,
              fontSize: 13, outline: 'none', fontFamily: 'inherit',
              color: colors.effortel.n200,
              background: 'rgba(255,255,255,0.04)',
              boxSizing: 'border-box',
            }}
          />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone (optional)"
            style={{
              flex: 1, height: 40, padding: '0 12px',
              borderRadius: radius.md,
              border: `1px solid ${mkt.cardBorder}`,
              fontSize: 13, outline: 'none', fontFamily: 'inherit',
              color: colors.effortel.n200,
              background: 'rgba(255,255,255,0.04)',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: '100%', height: 48, borderRadius: radius.lg,
            border: 'none', background: mkt.accent, color: '#0d1514',
            fontSize: 15, fontWeight: 700,
            cursor: submitting ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.2s',
            opacity: submitting ? 0.7 : 1,
          }}
          onMouseEnter={(e) => { if (!submitting) e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,212,200,0.3)'; }}
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
