import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, ArrowRight, Briefcase } from 'lucide-react';
import { mkt, colors, radius, shadows } from '@/theme/tokens';
import { TRADE_PRESETS, GENERIC_PRESET, CATEGORY_LABELS } from '@/data/missedCallTradePresets';
import type { TradePreset } from '@/data/missedCallTradePresets';

interface TradeOnboardingProps {
  onSelect: (preset: TradePreset) => void;
}

export default function TradeOnboarding({ onSelect }: TradeOnboardingProps) {
  const [search, setSearch] = useState('');

  const allOptions = useMemo(() => [...TRADE_PRESETS, GENERIC_PRESET], []);

  const filtered = useMemo(() => {
    if (!search.trim()) return allOptions;
    const q = search.toLowerCase();
    return allOptions.filter(p =>
      p.label.toLowerCase().includes(q) ||
      CATEGORY_LABELS[p.category].toLowerCase().includes(q)
    );
  }, [search, allOptions]);

  // Group by category for visual organization
  const grouped = useMemo(() => {
    const map = new Map<string, TradePreset[]>();
    for (const preset of filtered) {
      const key = preset.category;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(preset);
    }
    return map;
  }, [filtered]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.35 }}
      style={{ maxWidth: 640, margin: '0 auto' }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 'clamp(24px, 4vw, 36px)' }}>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: mkt.accentTint,
            border: `1px solid ${mkt.accent}33`,
            borderRadius: 100,
            padding: '6px 16px',
            marginBottom: 20,
          }}
        >
          <Briefcase size={14} color={mkt.accent} strokeWidth={2} />
          <span style={{ fontSize: 13, fontWeight: 600, color: mkt.accent, letterSpacing: '0.02em' }}>
            Revenue Calculator
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          style={{
            fontSize: 'clamp(26px, 5vw, 38px)',
            fontWeight: 700,
            color: colors.effortel.n300,
            lineHeight: 1.1,
            letterSpacing: '-0.025em',
            margin: '0 0 12px',
          }}
        >
          What trade are you in?
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, duration: 0.4 }}
          style={{
            fontSize: 'clamp(14px, 2vw, 16px)',
            color: mkt.textMuted,
            lineHeight: 1.5,
            margin: '0 auto',
            maxWidth: 420,
          }}
        >
          We'll prefill typical numbers for your industry so you get relevant estimates.
        </motion.p>
      </div>

      {/* Search */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28, duration: 0.35 }}
        style={{
          position: 'relative',
          marginBottom: 20,
        }}
      >
        <Search
          size={16}
          color={mkt.textFaint}
          style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}
        />
        <input
          type="text"
          placeholder="Search trades..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search trades"
          style={{
            width: '100%',
            padding: '12px 14px 12px 40px',
            fontSize: 15,
            fontWeight: 500,
            color: colors.effortel.n200,
            background: mkt.cardBg,
            border: `1px solid ${mkt.cardBorder}`,
            borderRadius: radius.md,
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = mkt.accent + '55';
            e.currentTarget.style.boxShadow = shadows.focus;
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = mkt.cardBorder;
            e.currentTarget.style.boxShadow = 'none';
          }}
        />
      </motion.div>

      {/* Trade grid */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.32, duration: 0.35 }}
        style={{
          maxHeight: 'min(420px, 55vh)',
          overflowY: 'auto',
          paddingRight: 4,
          // Thin scrollbar styling via webkit
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {filtered.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '32px 0',
            color: mkt.textMuted,
            fontSize: 14,
          }}>
            No trades found. Try a different search or pick "Other / General."
          </div>
        )}

        {Array.from(grouped.entries()).map(([category, presets]) => (
          <div key={category} style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase' as const,
              color: mkt.textFaint,
              padding: '0 4px 8px',
            }}>
              {CATEGORY_LABELS[category as TradePreset['category']] ?? category}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: 8,
            }}>
              {presets.map((preset, i) => (
                <TradeButton key={preset.id} preset={preset} onClick={onSelect} index={i} />
              ))}
            </div>
          </div>
        ))}
      </motion.div>
    </motion.div>
  );
}

function TradeButton({
  preset,
  onClick,
  index,
}: {
  preset: TradePreset;
  onClick: (p: TradePreset) => void;
  index: number;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: Math.min(index * 0.02, 0.3), duration: 0.25 }}
      onClick={() => onClick(preset)}
      aria-label={`Select ${preset.label}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        background: mkt.cardBg,
        border: `1px solid ${mkt.cardBorder}`,
        borderRadius: radius.md,
        cursor: 'pointer',
        color: colors.effortel.n300,
        fontSize: 14,
        fontWeight: 550,
        textAlign: 'left',
        transition: 'border-color 0.2s, background 0.2s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = mkt.accent + '44';
        e.currentTarget.style.background = mkt.accentTint;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = mkt.cardBorder;
        e.currentTarget.style.background = mkt.cardBg;
      }}
      onFocus={e => {
        e.currentTarget.style.borderColor = mkt.accent + '66';
        e.currentTarget.style.boxShadow = shadows.focus;
      }}
      onBlur={e => {
        e.currentTarget.style.borderColor = mkt.cardBorder;
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <ArrowRight size={12} color={mkt.textFaint} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {preset.label}
      </span>
    </motion.button>
  );
}
