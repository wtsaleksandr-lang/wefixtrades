import { useState, useMemo, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, ChevronDown, ArrowRight, Briefcase } from 'lucide-react';
import { mkt, colors, radius, shadows } from '@/theme/tokens';
import { TRADE_PRESETS, GENERIC_PRESET, CATEGORY_LABELS, getPresetById } from '@/data/missedCallTradePresets';
import type { TradePreset } from '@/data/missedCallTradePresets';

const LISTBOX_ID = 'trade-listbox';

const POPULAR_IDS = ['plumbing', 'hvac', 'electrical', 'roofing', 'house_cleaning', 'landscaping'];

interface TradeOnboardingProps {
  onSelect: (preset: TradePreset) => void;
  previousTradeId?: string | null;
}

export default function TradeOnboarding({ onSelect, previousTradeId }: TradeOnboardingProps) {
  const allOptions = useMemo(() => [...TRADE_PRESETS, GENERIC_PRESET], []);
  const popularPresets = useMemo(
    () => POPULAR_IDS.map(id => allOptions.find(p => p.id === id)).filter(Boolean) as TradePreset[],
    [allOptions],
  );

  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  // Filter
  const filtered = useMemo(() => {
    if (!query.trim()) return allOptions;
    const q = query.toLowerCase();
    return allOptions.filter(p =>
      p.label.toLowerCase().includes(q) ||
      CATEGORY_LABELS[p.category].toLowerCase().includes(q)
    );
  }, [query, allOptions]);

  const flatItems = filtered;

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlightIndex(filtered.length > 0 ? 0 : -1);
  }, [filtered.length, query]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex < 0 || !listRef.current) return;
    const item = listRef.current.querySelector(`[data-index="${highlightIndex}"]`);
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex]);

  // Position the fixed dropdown relative to the trigger
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownRect({ top: rect.bottom, left: rect.left, width: rect.width });
  }, [isOpen]);

  const selectPreset = useCallback((preset: TradePreset) => {
    setIsOpen(false);
    setQuery('');
    onSelect(preset);
  }, [onSelect]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex(i => Math.min(i + 1, flatItems.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < flatItems.length) {
          selectPreset(flatItems[highlightIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        inputRef.current?.blur();
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  }, [isOpen, highlightIndex, flatItems, selectPreset]);

  // Previous trade shortcut
  const prevPreset = previousTradeId ? (() => {
    const p = getPresetById(previousTradeId);
    return p.id === previousTradeId ? p : null;
  })() : null;

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

      {/* Continue with previous trade */}
      {prevPreset && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.3 }}
          style={{ marginBottom: 16 }}
        >
          <button
            onClick={() => onSelect(prevPreset)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 16px',
              background: mkt.accentTint,
              border: `1px solid ${mkt.accent}33`,
              borderRadius: radius.md,
              cursor: 'pointer',
              color: mkt.accent,
              fontSize: 14,
              fontWeight: 600,
              textAlign: 'left',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = mkt.accentGlow; }}
            onMouseLeave={e => { e.currentTarget.style.background = mkt.accentTint; }}
          >
            <ArrowRight size={14} />
            <span style={{ flex: 1 }}>Continue with {prevPreset.label}</span>
            <span style={{ fontSize: 12, fontWeight: 400, color: mkt.textFaint }}>last used</span>
          </button>
        </motion.div>
      )}

      {/* Combobox trigger */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28, duration: 0.35 }}
        style={{ position: 'relative' }}
      >
        <div
          ref={triggerRef}
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={LISTBOX_ID}
          style={{ position: 'relative' }}
        >
          <Search
            size={16}
            color={mkt.textFaint}
            style={{
              position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }}
          />
          <input
            ref={inputRef}
            type="text"
            role="searchbox"
            placeholder="Search or select a trade..."
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            aria-label="Search trades"
            aria-autocomplete="list"
            aria-controls={isOpen ? LISTBOX_ID : undefined}
            aria-activedescendant={
              isOpen && highlightIndex >= 0
                ? `trade-option-${flatItems[highlightIndex]?.id}`
                : undefined
            }
            style={{
              width: '100%',
              padding: '13px 40px 13px 40px',
              fontSize: 15,
              fontWeight: 500,
              color: colors.effortel.n200,
              background: mkt.cardBg,
              border: `1px solid ${isOpen ? mkt.accent + '55' : mkt.cardBorder}`,
              borderRadius: isOpen ? `${radius.md} ${radius.md} 0 0` : radius.md,
              outline: 'none',
              boxSizing: 'border-box',
              boxShadow: isOpen ? shadows.focus : 'none',
              transition: 'border-color 0.15s, border-radius 0.15s, box-shadow 0.15s',
            }}
          />
          <ChevronDown
            size={16}
            color={mkt.textFaint}
            style={{
              position: 'absolute', right: 14, top: '50%',
              transform: `translateY(-50%) rotate(${isOpen ? 180 : 0}deg)`,
              transition: 'transform 0.2s ease',
              pointerEvents: 'none',
            }}
          />
        </div>
      </motion.div>

      {/* Fixed overlay + dropdown when open */}
      {isOpen && dropdownRect && (
        <>
          {/* Backdrop — blocks page scroll via event handlers, catches clicks to close */}
          <div
            onClick={close}
            onWheel={e => e.preventDefault()}
            onTouchMove={e => e.preventDefault()}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 49,
            }}
          />
          {/* Dropdown list — fixed position, aligned to trigger */}
          <div
            id={LISTBOX_ID}
            role="listbox"
            aria-label="Trade options"
            ref={listRef}
            onWheel={e => {
              const el = e.currentTarget;
              const atTop = el.scrollTop <= 0 && e.deltaY < 0;
              const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight && e.deltaY > 0;
              if (atTop || atBottom) e.preventDefault();
              e.stopPropagation();
            }}
            style={{
              position: 'fixed',
              top: dropdownRect.top,
              left: dropdownRect.left,
              width: dropdownRect.width,
              zIndex: 50,
              maxHeight: `min(320px, calc(100vh - ${dropdownRect.top + 16}px))`,
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              background: mkt.surfaceAlt,
              border: `1px solid ${mkt.accent}33`,
              borderTop: 'none',
              borderRadius: `0 0 ${radius.md} ${radius.md}`,
              boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {filtered.length === 0 && (
              <div style={{
                padding: '20px 16px',
                textAlign: 'center',
                color: mkt.textMuted,
                fontSize: 14,
              }}>
                No trades found
              </div>
            )}

            {filtered.length > 0 && (() => {
              let flatIdx = 0;
              const grouped = new Map<string, TradePreset[]>();
              for (const preset of filtered) {
                if (!grouped.has(preset.category)) grouped.set(preset.category, []);
                grouped.get(preset.category)!.push(preset);
              }

              return Array.from(grouped.entries()).map(([category, presets]) => (
                <div key={category} role="group" aria-label={CATEGORY_LABELS[category as TradePreset['category']]}>
                  <div style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase' as const,
                    color: mkt.textFaint,
                    padding: '10px 16px 4px',
                  }}>
                    {CATEGORY_LABELS[category as TradePreset['category']] ?? category}
                  </div>
                  {presets.map(preset => {
                    const idx = flatIdx++;
                    const isHighlighted = idx === highlightIndex;
                    return (
                      <div
                        key={preset.id}
                        id={`trade-option-${preset.id}`}
                        role="option"
                        aria-selected={isHighlighted}
                        data-index={idx}
                        onClick={() => selectPreset(preset)}
                        onMouseEnter={() => setHighlightIndex(idx)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 16px',
                          fontSize: 14,
                          fontWeight: 500,
                          color: isHighlighted ? colors.effortel.n100 : colors.effortel.n300,
                          background: isHighlighted ? mkt.accentTint : 'transparent',
                          cursor: 'pointer',
                          transition: 'background 0.1s, color 0.1s',
                        }}
                      >
                        <span style={{ flex: 1 }}>{preset.label}</span>
                      </div>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
        </>
      )}

      {/* Popular trades quick-picks */}
      {!isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.3 }}
          style={{ marginTop: 20 }}
        >
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase' as const,
            color: mkt.textFaint,
            marginBottom: 10,
          }}>
            Popular trades
          </div>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
          }}>
            {popularPresets.map(preset => (
              <button
                key={preset.id}
                onClick={() => onSelect(preset)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  background: mkt.cardBg,
                  border: `1px solid ${mkt.cardBorder}`,
                  borderRadius: radius.sm,
                  cursor: 'pointer',
                  color: colors.effortel.n300,
                  fontSize: 13,
                  fontWeight: 550,
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = mkt.accent + '44';
                  e.currentTarget.style.background = mkt.accentTint;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = mkt.cardBorder;
                  e.currentTarget.style.background = mkt.cardBg;
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
