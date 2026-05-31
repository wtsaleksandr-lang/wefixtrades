/**
 * competeVariants — "Compete with the big chains" marketing section, FOUR
 * distinct visual treatments (A/B/C/D) of the same story: WeFixTrades gives a
 * solo trades business the full capability set of a national chain, for a
 * fraction of the cost.
 *
 * Shared capability list (icon + label), fixed order, used by all four.
 * All colors route through the `mkt` design tokens (no raw hex in className;
 * inline styles reference token VALUES only). Animations use framer-motion +
 * useReducedMotion() — reduced-motion users snap straight to the final state.
 *
 * Each variant is a self-contained, mobile-first component with no horizontal
 * overflow at 375px. Exports: CompeteToggle (A), CompeteMatrix (B),
 * CompeteRadar (C), CompeteCoverage (D).
 */

import { useRef, useState } from "react";
import {
  motion,
  useInView,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import {
  Calculator,
  PhoneCall,
  Star,
  MapPin,
  Megaphone,
  CalendarCheck,
  Globe,
  Check,
  Minus,
  X,
  Lock,
} from "lucide-react";
import { mkt } from "@/theme/tokens";

// ─── Shared data ──────────────────────────────────────────────────────────

type Cap = {
  label: string;
  Icon: typeof Calculator;
  /** Whether "Just you" (independent today) typically has this. */
  solo: "yes" | "partial" | "no";
};

/** The 7 capabilities, in the canonical order. "Just you" has ~1–2 of them. */
const CAPS: Cap[] = [
  { label: "Instant online quotes & calculators", Icon: Calculator, solo: "no" },
  { label: "24/7 call answering (never miss a job)", Icon: PhoneCall, solo: "no" },
  { label: "Google reviews engine", Icon: Star, solo: "partial" },
  { label: "Top-of-Google-Maps local SEO", Icon: MapPin, solo: "no" },
  { label: "Paid ads running for you", Icon: Megaphone, solo: "no" },
  { label: "Online booking & deposits", Icon: CalendarCheck, solo: "partial" },
  { label: "Professional branded website", Icon: Globe, solo: "yes" },
];

const PRICE = "$99"; // "from ~$X/mo"

// ─── Shared style atoms ────────────────────────────────────────────────────

const SECTION_PAD = "clamp(48px, 6vw, 88px) clamp(16px, 5vw, 64px)";
const MONO = "'DM Mono', ui-monospace, monospace";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: mkt.accent,
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

function SectionHeading({
  title,
  sub,
}: {
  title: string;
  sub: string;
}) {
  return (
    <>
      <h2
        style={{
          fontSize: "clamp(26px, 4vw, 42px)",
          fontWeight: 800,
          color: mkt.onDark,
          letterSpacing: "-0.03em",
          lineHeight: 1.1,
          margin: "0 0 12px",
          maxWidth: 680,
        }}
      >
        {title}
      </h2>
      <p
        style={{
          fontSize: "clamp(15px, 1.6vw, 17px)",
          lineHeight: 1.55,
          color: mkt.textMuted,
          maxWidth: 560,
          margin: "0 0 32px",
        }}
      >
        {sub}
      </p>
    </>
  );
}

/** Standard viewport config for whileInView reveals. */
const VIEWPORT = { once: true, amount: 0.3 } as const;

// ════════════════════════════════════════════════════════════════════════
//  VARIANT A — Toggle / "level up" reveal
// ════════════════════════════════════════════════════════════════════════

export function CompeteToggle() {
  const reduced = useReducedMotion();
  const [leveled, setLeveled] = useState(false);

  // The hero stat: capabilities "covered". Solo ≈ count of yes/partial,
  // leveled = all 7 (matching the chain reference).
  const soloCovered = CAPS.filter((c) => c.solo !== "no").length; // 3
  const heroNow = leveled ? CAPS.length : soloCovered;

  return (
    <section
      style={{ background: mkt.bg, padding: SECTION_PAD }}
      aria-label="Compete with the big chains — level up"
    >
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <Eyebrow>Level the playing field</Eyebrow>
        <SectionHeading
          title="Compete with the big chains"
          sub="Flip the switch and watch a solo trades business pick up every capability a national franchise has — minus the franchise price tag."
        />

        {/* Toggle control */}
        <div
          role="group"
          aria-label="Compare just you versus you plus WeFixTrades"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: 4,
            borderRadius: 999,
            background: mkt.cardBg,
            border: `1px solid ${mkt.cardBorder}`,
            marginBottom: 28,
            maxWidth: "100%",
            flexWrap: "wrap",
          }}
        >
          {[
            { key: false, label: "Just you" },
            { key: true, label: "You + WeFixTrades" },
          ].map((opt) => {
            const active = leveled === opt.key;
            return (
              <button
                key={String(opt.key)}
                type="button"
                aria-pressed={active}
                onClick={() => setLeveled(opt.key)}
                style={{
                  position: "relative",
                  border: "none",
                  cursor: "pointer",
                  borderRadius: 999,
                  padding: "9px 18px",
                  fontFamily: "inherit",
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                  color: active ? mkt.onDark : mkt.textMuted,
                  background: active ? mkt.accent : "transparent",
                  transition: "color 160ms ease, background 160ms ease",
                  whiteSpace: "nowrap",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Hero stat */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 12,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: "clamp(40px, 8vw, 64px)",
              fontWeight: 800,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              color: leveled ? mkt.accent : mkt.textMuted,
              fontVariantNumeric: "tabular-nums",
              transition: "color 200ms ease",
            }}
          >
            {heroNow}/{CAPS.length}
          </span>
          <span style={{ fontSize: 15, color: mkt.textMuted, lineHeight: 1.4 }}>
            capabilities live —{" "}
            <strong style={{ color: leveled ? mkt.success : mkt.onDarkMuted }}>
              {leveled ? "now matching a national chain" : "limited reach today"}
            </strong>
          </span>
        </div>

        {/* Capability grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
            gap: 10,
          }}
        >
          {CAPS.map((cap, i) => {
            const on = leveled || cap.solo !== "no";
            const { Icon } = cap;
            return (
              <motion.div
                key={cap.label}
                initial={false}
                animate={
                  reduced
                    ? { opacity: 1 }
                    : { opacity: on ? 1 : 0.55, scale: on ? 1 : 0.99 }
                }
                transition={{
                  duration: 0.32,
                  delay: reduced ? 0 : leveled ? i * 0.07 : 0,
                  ease: "easeOut",
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 16px",
                  borderRadius: 14,
                  background: on ? mkt.accentTint : mkt.cardBg,
                  border: `1px solid ${on ? mkt.accent : mkt.cardBorder}`,
                  transition: "background 240ms ease, border-color 240ms ease",
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    display: "grid",
                    placeItems: "center",
                    background: on ? mkt.accent : mkt.surfaceAlt,
                    transition: "background 240ms ease",
                  }}
                >
                  {on ? (
                    <Icon size={20} color={mkt.onDark} strokeWidth={2} />
                  ) : (
                    <Lock size={16} color={mkt.textFaint} strokeWidth={2} />
                  )}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 14,
                    fontWeight: 600,
                    lineHeight: 1.3,
                    color: on ? mkt.onDark : mkt.textFaint,
                  }}
                >
                  {cap.label}
                </span>
                {on ? (
                  <Check size={20} color={mkt.success} strokeWidth={2.5} />
                ) : (
                  <Minus size={20} color={mkt.textFaint} strokeWidth={2} />
                )}
              </motion.div>
            );
          })}
        </div>

        <p
          style={{
            marginTop: 24,
            fontSize: 14,
            lineHeight: 1.55,
            color: mkt.textMuted,
          }}
        >
          Everything the chains spend{" "}
          <strong style={{ color: mkt.onDark }}>$100k+/yr</strong> on a team for
          — running for you from{" "}
          <strong style={{ color: mkt.accent }}>~{PRICE}/mo</strong>.
        </p>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════
//  VARIANT B — 3-column comparison matrix
// ════════════════════════════════════════════════════════════════════════

type Col = {
  key: "solo" | "hero" | "chain";
  title: string;
  sub: string;
  hero?: boolean;
};

const COLS: Col[] = [
  { key: "solo", title: "Just you", sub: "Independent today" },
  { key: "hero", title: "You + WeFixTrades", sub: "Everything, done for you", hero: true },
  { key: "chain", title: "National chain", sub: "Big in-house team" },
];

/** Per-cell mark: chain + hero always have it; solo varies. */
function cellMark(col: Col["key"], cap: Cap): "yes" | "partial" | "no" {
  if (col === "solo") return cap.solo;
  return "yes"; // hero + chain both have everything
}

function Mark({ kind }: { kind: "yes" | "partial" | "no" }) {
  if (kind === "yes")
    return <Check size={20} color={mkt.success} strokeWidth={2.5} aria-label="Included" />;
  if (kind === "partial")
    return <Minus size={20} color={mkt.warning} strokeWidth={2.5} aria-label="Partial" />;
  return <X size={20} color={mkt.danger} strokeWidth={2.5} aria-label="Not included" />;
}

export function CompeteMatrix() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, VIEWPORT);

  const rowVariants: Variants = {
    hidden: { opacity: 0, y: reduced ? 0 : 16 },
    show: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { duration: 0.4, delay: reduced ? 0 : i * 0.06, ease: "easeOut" },
    }),
  };

  return (
    <section
      style={{ background: mkt.bg, padding: SECTION_PAD }}
      aria-label="Compete with the big chains — comparison matrix"
    >
      <div style={{ maxWidth: 1040, margin: "0 auto" }} ref={ref}>
        <Eyebrow>Side by side</Eyebrow>
        <SectionHeading
          title="The same toolkit a chain runs on"
          sub="A national franchise pays a whole team to cover these seven things. You get all of them in one platform."
        />

        {/* ── Desktop / wide: real 3-col grid table ── */}
        <div className="cmp-matrix-wide">
          {/* Column headers */}
          <div className="cmp-matrix-grid" role="presentation">
            <div /> {/* capability label spacer */}
            {COLS.map((col) => (
              <div
                key={col.key}
                style={{
                  position: "relative",
                  textAlign: "center",
                  padding: "16px 12px 14px",
                  borderRadius: "14px 14px 0 0",
                  background: col.hero ? mkt.accentTint : "transparent",
                  border: col.hero ? `1px solid ${mkt.accent}` : "1px solid transparent",
                  borderBottom: "none",
                  transform: col.hero ? "scale(1.02)" : "none",
                }}
              >
                {col.hero && (
                  <div
                    style={{
                      position: "absolute",
                      top: -11,
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: mkt.accent,
                      color: mkt.onDark,
                      fontFamily: MONO,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      padding: "3px 10px",
                      borderRadius: 999,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Most coverage
                  </div>
                )}
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    letterSpacing: "-0.01em",
                    color: col.hero ? mkt.accent : mkt.onDark,
                  }}
                >
                  {col.title}
                </div>
                <div style={{ fontSize: 12, color: mkt.textMuted, marginTop: 3 }}>
                  {col.sub}
                </div>
              </div>
            ))}
          </div>

          {/* Rows */}
          {CAPS.map((cap, i) => {
            const { Icon } = cap;
            return (
              <motion.div
                key={cap.label}
                className="cmp-matrix-grid cmp-matrix-row"
                custom={i}
                variants={rowVariants}
                initial="hidden"
                animate={inView ? "show" : "hidden"}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "14px 8px",
                    fontSize: 14,
                    fontWeight: 600,
                    color: mkt.onDark,
                    lineHeight: 1.3,
                  }}
                >
                  <Icon size={20} color={mkt.accent} strokeWidth={2} />
                  <span>{cap.label}</span>
                </div>
                {COLS.map((col) => (
                  <div
                    key={col.key}
                    style={{
                      display: "grid",
                      placeItems: "center",
                      padding: "14px 12px",
                      background: col.hero ? mkt.accentTint : "transparent",
                      borderLeft: col.hero ? `1px solid ${mkt.accent}` : "none",
                      borderRight: col.hero ? `1px solid ${mkt.accent}` : "none",
                    }}
                  >
                    <Mark kind={cellMark(col.key, cap)} />
                  </div>
                ))}
              </motion.div>
            );
          })}

          {/* Price row */}
          <div className="cmp-matrix-grid">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "16px 8px",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.02em",
                textTransform: "uppercase",
                fontFamily: MONO,
                color: mkt.textMuted,
              }}
            >
              What it costs
            </div>
            {COLS.map((col) => (
              <div
                key={col.key}
                style={{
                  display: "grid",
                  placeItems: "center",
                  textAlign: "center",
                  padding: "16px 12px",
                  background: col.hero ? mkt.accent : "transparent",
                  borderRadius: col.hero ? "0 0 14px 14px" : 0,
                  border: col.hero ? `1px solid ${mkt.accent}` : "none",
                  borderTop: "none",
                }}
              >
                <span
                  style={{
                    fontSize: col.key === "chain" ? 16 : 18,
                    fontWeight: 800,
                    letterSpacing: "-0.02em",
                    color:
                      col.key === "chain"
                        ? mkt.danger
                        : col.hero
                          ? mkt.onDark
                          : mkt.textMuted,
                    lineHeight: 1.2,
                  }}
                >
                  {col.key === "solo"
                    ? "Lost jobs"
                    : col.key === "hero"
                      ? `~${PRICE}/mo`
                      : "$100k+/yr"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Mobile: per-capability cards with 3 mini-columns ── */}
        <div className="cmp-matrix-narrow">
          {CAPS.map((cap, i) => {
            const { Icon } = cap;
            return (
              <motion.div
                key={cap.label}
                custom={i}
                variants={rowVariants}
                initial="hidden"
                animate={inView ? "show" : "hidden"}
                style={{
                  padding: 16,
                  borderRadius: 14,
                  background: mkt.cardBg,
                  border: `1px solid ${mkt.cardBorder}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 12,
                    fontSize: 14,
                    fontWeight: 700,
                    color: mkt.onDark,
                    lineHeight: 1.3,
                  }}
                >
                  <Icon size={20} color={mkt.accent} strokeWidth={2} />
                  <span>{cap.label}</span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 8,
                  }}
                >
                  {COLS.map((col) => (
                    <div
                      key={col.key}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 6,
                        padding: "10px 4px",
                        borderRadius: 10,
                        background: col.hero ? mkt.accentTint : mkt.overlay,
                        border: col.hero
                          ? `1px solid ${mkt.accent}`
                          : `1px solid ${mkt.cardBorder}`,
                      }}
                    >
                      <Mark kind={cellMark(col.key, cap)} />
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          textAlign: "center",
                          lineHeight: 1.2,
                          color: col.hero ? mkt.accent : mkt.textMuted,
                        }}
                      >
                        {col.title}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
          <div
            style={{
              padding: 16,
              borderRadius: 14,
              background: mkt.accent,
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 700, color: mkt.onDark }}>
              ~{PRICE}/mo
            </span>
            <span style={{ fontSize: 13, color: mkt.onDarkMuted, display: "block", marginTop: 2 }}>
              vs a chain's $100k+/yr in-house team
            </span>
          </div>
        </div>
      </div>

      <style>{`
        .cmp-matrix-grid {
          display: grid;
          grid-template-columns: minmax(180px, 1.6fr) repeat(3, 1fr);
          align-items: stretch;
        }
        .cmp-matrix-row + .cmp-matrix-row,
        .cmp-matrix-row {
          border-top: 1px solid ${mkt.cardBorder};
        }
        .cmp-matrix-narrow {
          display: none;
          flex-direction: column;
          gap: 12px;
        }
        @media (max-width: 720px) {
          .cmp-matrix-wide { display: none; }
          .cmp-matrix-narrow { display: flex; }
        }
      `}</style>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════
//  VARIANT C — Radar / capability-coverage chart
// ════════════════════════════════════════════════════════════════════════

/** Build a heptagon polygon point string for a given radius fraction (0–1). */
function radarPoints(fracs: number[], cx: number, cy: number, R: number): string {
  const n = fracs.length;
  return fracs
    .map((f, i) => {
      const angle = -Math.PI / 2 + (i / n) * Math.PI * 2; // start at top
      const r = R * f;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function CompeteRadar() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, VIEWPORT);

  const CX = 200;
  const CY = 190;
  const R = 150;
  const n = CAPS.length;

  // Coverage fractions per capability.
  const chainFracs = CAPS.map(() => 1); // full benchmark
  const soloFracs = CAPS.map((c) =>
    c.solo === "yes" ? 0.6 : c.solo === "partial" ? 0.35 : 0.15,
  );
  const heroFracs = CAPS.map(() => 0.92); // fills ~chain outline

  const chainPts = radarPoints(chainFracs, CX, CY, R);
  const soloPts = radarPoints(soloFracs, CX, CY, R);
  const heroPts = radarPoints(heroFracs, CX, CY, R);

  // Axis spokes + labels.
  const axes = CAPS.map((cap, i) => {
    const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const x = CX + R * Math.cos(angle);
    const y = CY + R * Math.sin(angle);
    const lx = CX + (R + 26) * Math.cos(angle);
    const ly = CY + (R + 26) * Math.sin(angle);
    const anchor =
      Math.abs(lx - CX) < 12 ? "middle" : lx > CX ? "start" : "end";
    return { cap, x, y, lx, ly, anchor };
  });

  // Concentric grid rings.
  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <section
      style={{ background: mkt.bg, padding: SECTION_PAD }}
      aria-label="Compete with the big chains — coverage radar"
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }} ref={ref}>
        <Eyebrow>Coverage map</Eyebrow>
        <SectionHeading
          title="Fill the whole map a chain covers"
          sub="The dashed outline is what a national chain covers. On your own you reach a small core — WeFixTrades expands you out to nearly the full footprint."
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 24,
            alignItems: "center",
          }}
          className="cmp-radar-grid"
        >
          <div style={{ width: "100%", maxWidth: 460, margin: "0 auto" }}>
            <svg
              viewBox="0 0 400 380"
              width="100%"
              role="img"
              aria-label="Radar chart comparing capability coverage of just you, you plus WeFixTrades, and a national chain across seven capabilities"
              style={{ display: "block", overflow: "visible" }}
            >
              {/* Grid rings */}
              {rings.map((ring) => (
                <polygon
                  key={ring}
                  points={radarPoints(CAPS.map(() => ring), CX, CY, R)}
                  fill="none"
                  stroke={mkt.cardBorder}
                  strokeWidth={1}
                />
              ))}
              {/* Axis spokes + labels */}
              {axes.map(({ cap, x, y, lx, ly, anchor }) => {
                const { Icon } = cap;
                return (
                  <g key={cap.label}>
                    <line
                      x1={CX}
                      y1={CY}
                      x2={x}
                      y2={y}
                      stroke={mkt.cardBorder}
                      strokeWidth={1}
                    />
                    <foreignObject
                      x={lx - 16}
                      y={ly - 16}
                      width={32}
                      height={32}
                      style={{ overflow: "visible", pointerEvents: "none" }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          display: "grid",
                          placeItems: "center",
                        }}
                        title={cap.label}
                      >
                        <Icon size={16} color={mkt.textMuted} strokeWidth={2} />
                      </div>
                    </foreignObject>
                    <title>{cap.label}</title>
                  </g>
                );
              })}

              {/* Chain benchmark — dashed full polygon */}
              <polygon
                points={chainPts}
                fill="none"
                stroke={mkt.textMuted}
                strokeWidth={1.5}
                strokeDasharray="5 4"
              />

              {/* Solo — small inner polygon */}
              <motion.polygon
                points={soloPts}
                fill="rgba(217,119,6,0.16)"
                stroke={mkt.warning}
                strokeWidth={1.5}
                initial={reduced ? false : { scale: 0.2, opacity: 0 }}
                animate={
                  inView
                    ? { scale: 1, opacity: 1 }
                    : reduced
                      ? { scale: 1, opacity: 1 }
                      : { scale: 0.2, opacity: 0 }
                }
                transition={{ duration: 0.6, ease: "easeOut" }}
                style={{ transformOrigin: `${CX}px ${CY}px` }}
              />

              {/* Hero — expands to fill the chain outline */}
              <motion.polygon
                points={heroPts}
                fill="rgba(13,60,252,0.28)"
                stroke={mkt.accent}
                strokeWidth={2}
                initial={reduced ? false : { scale: 0.2, opacity: 0 }}
                animate={
                  inView
                    ? { scale: 1, opacity: 1 }
                    : reduced
                      ? { scale: 1, opacity: 1 }
                      : { scale: 0.2, opacity: 0 }
                }
                transition={{ duration: 0.7, delay: reduced ? 0 : 0.45, ease: "easeOut" }}
                style={{ transformOrigin: `${CX}px ${CY}px` }}
              />
            </svg>
          </div>

          {/* Legend + caption */}
          <div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
              {[
                { c: mkt.accent, label: "You + WeFixTrades", note: "fills nearly the whole map" },
                { c: mkt.textMuted, label: "National chain", note: "the full benchmark (dashed)", dashed: true },
                { c: mkt.warning, label: "Just you", note: "a small core today" },
              ].map((item) => (
                <li
                  key={item.label}
                  style={{ display: "flex", alignItems: "center", gap: 12 }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      width: 22,
                      height: 0,
                      borderTop: `3px ${item.dashed ? "dashed" : "solid"} ${item.c}`,
                    }}
                  />
                  <span>
                    <strong style={{ color: mkt.onDark, fontSize: 14 }}>{item.label}</strong>
                    <span style={{ color: mkt.textMuted, fontSize: 13 }}> — {item.note}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p
              style={{
                marginTop: 20,
                fontSize: 14,
                lineHeight: 1.55,
                color: mkt.textMuted,
              }}
            >
              Same coverage a chain pays a{" "}
              <strong style={{ color: mkt.onDark }}>$100k+/yr</strong> team for —
              yours from{" "}
              <strong style={{ color: mkt.accent }}>~{PRICE}/mo</strong>.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @media (min-width: 720px) {
          .cmp-radar-grid {
            grid-template-columns: 1.1fr 0.9fr !important;
          }
        }
      `}</style>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════
//  VARIANT D — Head-to-head coverage bars
// ════════════════════════════════════════════════════════════════════════

export function CompeteCoverage() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, VIEWPORT);

  // Solo fill per capability (15–60%); WeFixTrades closes the rest to 100%.
  const soloPct = (cap: Cap) =>
    cap.solo === "yes" ? 55 : cap.solo === "partial" ? 30 : 15;

  const soloCovered = CAPS.filter((c) => c.solo !== "no").length; // 3

  return (
    <section
      style={{ background: mkt.bg, padding: SECTION_PAD }}
      aria-label="Compete with the big chains — coverage bars"
    >
      <div style={{ maxWidth: 880, margin: "0 auto" }} ref={ref}>
        <Eyebrow>Close the gap</Eyebrow>
        <SectionHeading
          title="WeFixTrades closes the gap to the chains"
          sub="On every capability you're starting from a sliver. We fill the rest of the bar — up to the same 100% a national chain runs at."
        />

        {/* Hero meter: 2/7 → 7/7 */}
        <div
          style={{
            padding: "20px 22px",
            borderRadius: 18,
            background: mkt.cardBg,
            border: `1px solid ${mkt.cardBorder}`,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 12,
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 700, color: mkt.onDark }}>
              Capabilities matched vs a national chain
            </span>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 14,
                fontWeight: 700,
                color: mkt.accent,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {soloCovered}/{CAPS.length} → {CAPS.length}/{CAPS.length}
            </span>
          </div>
          <div
            style={{
              position: "relative",
              height: 16,
              borderRadius: 999,
              background: mkt.surfaceAlt,
              overflow: "hidden",
            }}
          >
            {/* solo base */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                width: `${(soloCovered / CAPS.length) * 100}%`,
                background: mkt.textFaint,
                borderRadius: 999,
              }}
            />
            {/* WeFixTrades fill to 100% */}
            <motion.div
              initial={reduced ? false : { width: `${(soloCovered / CAPS.length) * 100}%` }}
              animate={
                inView || reduced ? { width: "100%" } : { width: `${(soloCovered / CAPS.length) * 100}%` }
              }
              transition={{ duration: 0.9, ease: "easeOut" }}
              style={{
                position: "absolute",
                inset: 0,
                background: mkt.accent,
                borderRadius: 999,
                opacity: 0.85,
              }}
            />
          </div>
          <div
            style={{
              marginTop: 10,
              fontSize: 13,
              color: mkt.success,
              fontWeight: 600,
            }}
          >
            You're now matching a national chain.
          </div>
        </div>

        {/* Per-capability bars */}
        <div style={{ display: "grid", gap: 18 }}>
          {CAPS.map((cap, i) => {
            const { Icon } = cap;
            const solo = soloPct(cap);
            return (
              <div key={cap.label}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 8,
                  }}
                >
                  <Icon size={16} color={mkt.accent} strokeWidth={2} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: mkt.onDark }}>
                    {cap.label}
                  </span>
                </div>
                <div
                  style={{
                    position: "relative",
                    height: 28,
                    borderRadius: 8,
                    background: mkt.surfaceAlt,
                    overflow: "hidden",
                  }}
                >
                  {/* solo fill */}
                  <motion.div
                    initial={reduced ? false : { width: 0 }}
                    animate={inView || reduced ? { width: `${solo}%` } : { width: 0 }}
                    transition={{ duration: 0.6, delay: reduced ? 0 : i * 0.05, ease: "easeOut" }}
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      background: mkt.textFaint,
                      display: "flex",
                      alignItems: "center",
                      paddingLeft: 10,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: mkt.onDark,
                        whiteSpace: "nowrap",
                      }}
                    >
                      You
                    </span>
                  </motion.div>
                  {/* gap fill (WeFixTrades closes it) */}
                  <motion.div
                    initial={reduced ? false : { width: 0 }}
                    animate={inView || reduced ? { width: `${100 - solo}%` } : { width: 0 }}
                    transition={{
                      duration: 0.6,
                      delay: reduced ? 0 : i * 0.05 + 0.25,
                      ease: "easeOut",
                    }}
                    style={{
                      position: "absolute",
                      right: 0,
                      top: 0,
                      bottom: 0,
                      background: mkt.accent,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      paddingRight: 10,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: mkt.onDark,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      WeFixTrades closes the gap
                    </span>
                  </motion.div>
                </div>
              </div>
            );
          })}
        </div>

        <p
          style={{
            marginTop: 28,
            fontSize: 14,
            lineHeight: 1.55,
            color: mkt.textMuted,
          }}
        >
          Full coverage the chains spend{" "}
          <strong style={{ color: mkt.onDark }}>$100k+/yr</strong> on a team for —
          running for you from{" "}
          <strong style={{ color: mkt.accent }}>~{PRICE}/mo</strong>.
        </p>
      </div>
    </section>
  );
}
