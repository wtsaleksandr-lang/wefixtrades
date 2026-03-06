import { useEffect, useRef, useState, useCallback } from "react";
import { mkt } from "@/theme/tokens";

const TRADES = [
  "PLUMBING", "ROOFING", "ELECTRICAL", "PAINTING", "FLOORING",
  "FENCING", "DRYWALL", "CONCRETE", "CLEANING", "LANDSCAPING",
];

const SPACER = "\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0";
const rowText = TRADES.join(SPACER) + SPACER;

const ROW_CONFIG: { opacity: number; dur: string; reverse: boolean }[] = [
  { opacity: 0.16, dur: "32s", reverse: false },
  { opacity: 0.22, dur: "36s", reverse: true },
  { opacity: 0.14, dur: "40s", reverse: false },
];

const BADGES = [
  "Calls answered instantly",
  "Every opportunity captured",
  "Quotes delivered immediately",
  "Customers responded to instantly",
  "Reviews collected automatically",
  "Work uninterrupted",
  "Customers always answered",
  "More jobs. Less interruption",
  "Work continues. Customers handled.",
  "Built around how trades actually work.",
];

type Pos = "top-left" | "top-right" | "mid-left" | "mid-right" | "bottom-left" | "bottom-right";
const POSITIONS: Pos[] = ["top-left", "top-right", "mid-left", "mid-right", "bottom-left", "bottom-right"];

function posStyle(p: Pos): React.CSSProperties {
  const base: React.CSSProperties = { position: "absolute" };
  switch (p) {
    case "top-left": return { ...base, top: 10, left: 18 };
    case "top-right": return { ...base, top: 10, right: 18 };
    case "mid-left": return { ...base, top: "50%", left: 18, marginTop: -22 };
    case "mid-right": return { ...base, top: "50%", right: 18, marginTop: -22 };
    case "bottom-left": return { ...base, bottom: 28, left: 18 };
    case "bottom-right": return { ...base, bottom: 28, right: 18 };
  }
}

function pick<T>(arr: T[], exclude: T[] = []): T {
  const pool = arr.filter(x => !exclude.includes(x));
  const source = pool.length ? pool : arr;
  return source[Math.floor(Math.random() * source.length)];
}

type BadgeState = { id: number; msg: string; pos: Pos; phase: "in" | "visible" | "out" };

export default function HeroTradeDivider() {
  const [badges, setBadges] = useState<BadgeState[]>([]);
  const nextId = useRef(0);
  const usedPos = useRef<Pos[]>([]);
  const usedMsg = useRef<string[]>([]);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const addTimer = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
    return t;
  }, []);

  useEffect(() => {
    return () => {
      timers.current.forEach(t => clearTimeout(t));
      timers.current.clear();
    };
  }, []);

  const spawnBadge = useCallback(() => {
    const isMobile = window.innerWidth < 640;
    const maxBadges = isMobile ? 1 : 2;

    setBadges(prev => {
      if (prev.length >= maxBadges) return prev;
      const pos = pick(POSITIONS, usedPos.current);
      const msg = pick(BADGES, usedMsg.current);
      usedPos.current = [...usedPos.current, pos].slice(-3);
      usedMsg.current = [...usedMsg.current, msg].slice(-3);
      const id = nextId.current++;

      addTimer(() => {
        setBadges(p => p.map(x => x.id === id ? { ...x, phase: "visible" as const } : x));

        const stay = 4500 + Math.random() * 1000;
        addTimer(() => {
          setBadges(p => p.map(x => x.id === id ? { ...x, phase: "out" as const } : x));

          addTimer(() => {
            setBadges(p => p.filter(x => x.id !== id));
          }, 400);
        }, stay);
      }, 450);

      return [...prev, { id, msg, pos, phase: "in" as const }];
    });
  }, [addTimer]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;

    const initial = setTimeout(() => spawnBadge(), 1200);
    const interval = setInterval(() => spawnBadge(), 6500);

    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [spawnBadge]);

  return (
    <div
      data-testid="hero-trade-divider"
      className="hero-trade-divider"
      style={{
        width: "100%",
        overflow: "hidden",
        position: "relative",
        zIndex: 1,
        background: `linear-gradient(to bottom, ${mkt.bg} 0%, #2B3840 35%, #56656E 65%, #A7B6BF 100%)`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 20,
      }}
    >
      {ROW_CONFIG.map((cfg, i) => (
        <div
          key={i}
          className="hero-trade-divider__row"
          style={{
            whiteSpace: "nowrap",
            fontSize: "clamp(14px, 2vw, 20px)",
            fontWeight: 500,
            letterSpacing: "0.12em",
            color: `rgba(102,232,250,${cfg.opacity})`,
            overflow: "hidden",
            lineHeight: 1.4,
          }}
        >
          <div
            className={cfg.reverse ? "htd-scroll-right" : "htd-scroll-left"}
            style={{ display: "inline-block", animationDuration: cfg.dur }}
          >
            <span>{rowText}</span>
            <span>{rowText}</span>
          </div>
        </div>
      ))}

      {badges.map(b => {
        const ps = posStyle(b.pos);
        return (
          <div
            key={b.id}
            data-testid={`htd-badge-${b.id}`}
            className="htd-badge"
            style={{
              ...ps,
              opacity: b.phase === "visible" ? 1 : 0,
              transform: b.phase === "in" ? "translateY(8px)" : b.phase === "out" ? "translateY(-2px)" : "translateY(0)",
              transition: `opacity ${b.phase === "out" ? "400ms" : "450ms"} ease, transform ${b.phase === "out" ? "400ms" : "450ms"} ease`,
              zIndex: 10,
            }}
          >
            <span className="htd-badge__dot" />
            <span className="htd-badge__text">{b.msg}</span>
          </div>
        );
      })}
    </div>
  );
}
