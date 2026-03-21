import { useEffect, useState, useRef } from "react";
import { mkt } from "@/theme/tokens";

const TRADES = [
  "Electricians",
  "Cleaners",
  "Locksmiths",
  "HVAC Technicians",
  "Plumbers",
  "Contractors",
  "Detailers",
  "Mechanics",
  "Roofers",
  "Welders",
  "Carpenters",
  "Landscapers",
];

const HOLD_MS = 2200;
const TRANSITION_MS = 360;

const FONT: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "'DM Mono', monospace",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

export default function BuiltForRotator() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"visible" | "exiting" | "entering">("visible");
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const cycle = () => {
      setPhase("exiting");

      timerRef.current = setTimeout(() => {
        setIndex((i) => (i + 1) % TRADES.length);
        setPhase("entering");

        timerRef.current = setTimeout(() => {
          setPhase("visible");
          timerRef.current = setTimeout(cycle, HOLD_MS);
        }, TRANSITION_MS);
      }, TRANSITION_MS);
    };

    timerRef.current = setTimeout(cycle, HOLD_MS);
    return () => clearTimeout(timerRef.current);
  }, []);

  const wordStyle: React.CSSProperties = {
    display: "block",
    transition: `transform ${TRANSITION_MS}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${TRANSITION_MS}ms cubic-bezier(0.4, 0, 0.2, 1), filter ${TRANSITION_MS}ms ease`,
    willChange: "transform, opacity, filter",
    ...(phase === "visible"
      ? { transform: "translateY(0)", opacity: 1, filter: "blur(0px)" }
      : phase === "exiting"
        ? { transform: "translateY(-100%)", opacity: 0.6, filter: "blur(1.5px)" }
        : { transform: "translateY(100%)", opacity: 0.6, filter: "blur(1.5px)", transition: "none" }),
  };

  const wordRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (phase === "entering" && wordRef.current) {
      wordRef.current.getBoundingClientRect();
      requestAnimationFrame(() => {
        setPhase("visible");
      });
    }
  }, [phase]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ ...FONT, color: mkt.textMuted, whiteSpace: "nowrap", flexShrink: 0 }}>
        Built for:
      </span>
      <span
        style={{
          display: "block",
          height: "1.4em",
          overflow: "hidden",
          position: "relative",
          ...FONT,
        }}
      >
        <span
          ref={wordRef}
          style={{ ...wordStyle, color: mkt.accent, fontWeight: 600, whiteSpace: "nowrap" }}
        >
          {TRADES[index]}
        </span>
      </span>
    </div>
  );
}
