import { useEffect, useState, useRef } from "react";
import { mkt } from "@/theme/tokens";

const TRADES = [
  "Plumbers",
  "Electricians",
  "HVAC",
  "Roofers",
  "Landscapers",
  "Cleaners",
  "Painters",
  "Fences",
  "Decks",
  "Concrete",
];

const HOLD_MS = 2200;
const TRANSITION_MS = 360;

export default function BuiltForRotator() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"visible" | "exiting" | "entering">("visible");
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const cycle = () => {
      // Start exit
      setPhase("exiting");

      timerRef.current = setTimeout(() => {
        // Swap word and start enter
        setIndex((i) => (i + 1) % TRADES.length);
        setPhase("entering");

        timerRef.current = setTimeout(() => {
          // Settle
          setPhase("visible");

          // Schedule next cycle
          timerRef.current = setTimeout(cycle, HOLD_MS);
        }, TRANSITION_MS);
      }, TRANSITION_MS);
    };

    timerRef.current = setTimeout(cycle, HOLD_MS);
    return () => clearTimeout(timerRef.current);
  }, []);

  const wordStyle: React.CSSProperties = {
    display: "inline-block",
    transition: `transform ${TRANSITION_MS}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${TRANSITION_MS}ms cubic-bezier(0.4, 0, 0.2, 1), filter ${TRANSITION_MS}ms ease`,
    willChange: "transform, opacity, filter",
    ...(phase === "visible"
      ? { transform: "translateY(0)", opacity: 1, filter: "blur(0px)" }
      : phase === "exiting"
        ? { transform: "translateY(-100%)", opacity: 0.6, filter: "blur(1.5px)" }
        : { transform: "translateY(100%)", opacity: 0.6, filter: "blur(1.5px)", transition: "none" }),
  };

  // After setting "entering" with no transition, force reflow then animate to final
  const wordRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (phase === "entering" && wordRef.current) {
      // Force reflow so the browser registers the translateY(100%) position
      wordRef.current.getBoundingClientRect();
      // Then animate to final position
      requestAnimationFrame(() => {
        setPhase("visible");
      });
    }
  }, [phase]);

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          fontFamily: "'DM Mono', monospace",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: mkt.textMuted,
          whiteSpace: "nowrap",
        }}
      >
        Built for:
      </span>
      <span
        style={{
          display: "inline-block",
          height: "1.3em",
          overflow: "hidden",
          position: "relative",
          verticalAlign: "bottom",
        }}
      >
        <span ref={wordRef} style={{ ...wordStyle, color: mkt.accent, fontWeight: 600 }}>
          {TRADES[index]}
        </span>
      </span>
    </div>
  );
}
