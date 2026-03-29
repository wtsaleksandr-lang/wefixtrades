import { motion } from 'framer-motion';
import { colors, radius } from '@/theme/tokens';

interface ResultMetricCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  /** Accent color for the icon badge and border tint */
  accent: string;
  accentTint: string;
  /** Delay for stagger animation */
  delay?: number;
  size?: 'default' | 'large';
}

export default function ResultMetricCard({
  label,
  value,
  icon,
  accent,
  accentTint,
  delay = 0,
  size = 'default',
}: ResultMetricCardProps) {
  const isLarge = size === 'large';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      style={{
        background: accentTint,
        border: `1px solid ${accent}22`,
        borderRadius: radius.lg,
        padding: isLarge ? 'clamp(20px, 4vw, 28px)' : 'clamp(14px, 3vw, 20px)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: isLarge ? 10 : 6,
        color: accent,
        opacity: 0.85,
      }}>
        {icon}
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.03em',
          textTransform: 'uppercase' as const,
        }}>
          {label}
        </span>
      </div>
      <div
        aria-live="polite"
        style={{
          fontSize: isLarge ? 'clamp(26px, 5vw, 36px)' : 'clamp(15px, 3vw, 22px)',
          fontWeight: 700,
          color: colors.effortel.n100,
          letterSpacing: '-0.02em',
          lineHeight: 1.15,
          overflowWrap: 'break-word',
        }}
      >
        {value}
      </div>
    </motion.div>
  );
}
