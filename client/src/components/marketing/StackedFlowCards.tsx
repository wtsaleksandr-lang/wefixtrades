import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { shadows } from "@/theme/tokens";

interface Step {
  title: string;
  subtitle: string;
  badge: string;
}

interface MktColors {
  accent: string;
  accentTint: string;
  accentGlow: string;
  text: string;
  textMuted: string;
  bg: string;
  border: string;
  overlay: string;
  [key: string]: string;
}

interface StackedFlowCardsProps {
  steps: Step[];
  mkt: MktColors;
}

export default function StackedFlowCards({ steps, mkt }: StackedFlowCardsProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (steps.length === 0) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % steps.length);
    }, 3200);
    return () => clearInterval(interval);
  }, [steps.length]);

  if (steps.length === 0) return null;

  return (
    <div
      data-testid="stacked-flow-cards"
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 400,
        height: 320,
      }}
    >
      <AnimatePresence>
        {steps.map((step, i) => {
          const offset = (i - activeIndex + steps.length) % steps.length;
          if (offset > 3) return null;

          const isActive = offset === 0;

          return (
            <motion.div
              key={`${step.badge}-${i}`}
              data-testid={`flow-card-${i}`}
              initial={{ opacity: 0, y: 40, scale: 0.92 }}
              animate={{
                opacity: isActive ? 1 : Math.max(0, 1 - offset * 0.3),
                y: offset * 18,
                scale: 1 - offset * 0.04,
                zIndex: steps.length - offset,
              }}
              exit={{ opacity: 0, y: -30, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 200, damping: 24 }}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                padding: "24px 28px",
                borderRadius: 20,
                background: mkt.bg,
                border: `1px solid ${isActive ? mkt.accent : mkt.border}`,
                boxShadow: isActive
                  ? `0 8px 32px ${mkt.accentGlow}, ${shadows.card}`
                  : shadows.card,
                cursor: "pointer",
              }}
              onClick={() => setActiveIndex(i)}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: 24,
                    padding: "0 10px",
                    borderRadius: 14,
                    background: isActive ? mkt.accentTint : mkt.overlay,
                    fontSize: 11,
                    fontWeight: 700,
                    color: isActive ? mkt.accent : mkt.textMuted,
                    letterSpacing: "0.02em",
                    textTransform: "uppercase" as const,
                  }}
                >
                  {step.badge}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: mkt.textMuted,
                    opacity: 0.5,
                  }}
                >
                  Step {i + 1} of {steps.length}
                </span>
              </div>

              <h3
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: mkt.text,
                  lineHeight: 1.3,
                  marginBottom: 6,
                }}
              >
                {step.title}
              </h3>

              <p
                style={{
                  fontSize: 14,
                  color: mkt.textMuted,
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                {step.subtitle}
              </p>
            </motion.div>
          );
        })}
      </AnimatePresence>

      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          gap: 6,
        }}
      >
        {steps.map((_, i) => (
          <button
            key={i}
            data-testid={`flow-dot-${i}`}
            onClick={() => setActiveIndex(i)}
            style={{
              width: activeIndex === i ? 20 : 8,
              height: 8,
              borderRadius: activeIndex === i ? 4 : "50%",
              background: activeIndex === i ? mkt.accent : mkt.border,
              border: "none",
              padding: 0,
              cursor: "pointer",
              transition: "all 0.3s ease",
            }}
          />
        ))}
      </div>
    </div>
  );
}
