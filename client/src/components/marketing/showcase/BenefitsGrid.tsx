/**
 * BenefitsGrid — 3×2 (or 2×3 / 1-col on smaller widths) dark rounded
 * card grid. Each card now leads with a small benefit-specific visual
 * composition (~96 px tall) so the card has actual content above the
 * title instead of dead space.
 */

import { mkt } from "@/theme/tokens";
import {
  PhoneCall, Zap, ShieldCheck, MapPinned, CalendarCheck, MoonStar,
} from "lucide-react";

type Kind = "calls" | "quotes" | "reviews" | "map" | "bookings" | "247";

interface Benefit {
  kind: Kind;
  title: string;
  desc: string;
  tint: string;     // accent colour for the visual
}

const BENEFITS: Benefit[] = [
  {
    kind: "calls",
    title: "Capture Every Lead",
    desc: "AI picks up the calls and chats you'd otherwise miss. No voicemail roulette, no lost revenue at 2 AM.",
    tint: "#66E8FA",
  },
  {
    kind: "quotes",
    title: "Instant Quotes",
    desc: "Customers get a real price the moment they ask — pulled from your live pricing, not a guess.",
    tint: "#FBBF24",
  },
  {
    kind: "reviews",
    title: "Reputation On Autopilot",
    desc: "Every review gets a thoughtful reply within minutes. 5-stars amplified, 1-stars routed straight to your phone.",
    tint: "#34D399",
  },
  {
    kind: "map",
    title: "Win the Local Map",
    desc: "Weekly Google Business Profile audits and fixes so you show up first when neighbours search.",
    tint: "#FB923C",
  },
  {
    kind: "bookings",
    title: "Bookings Without Phone Tag",
    desc: "Customers pick a slot from your real calendar. You arrive, you work, you get paid — no back-and-forth.",
    tint: "#A78BFA",
  },
  {
    kind: "247",
    title: "24/7 Coverage",
    desc: "Nights, weekends, holidays. Your AI dispatcher never sleeps, so the next emergency call is yours.",
    tint: "#F472B6",
  },
];

export default function BenefitsGrid() {
  return (
    <div className="bg-wrap">
      <style>{CSS}</style>
      <div className="bg-grid">
        {BENEFITS.map((b) => (
          <article key={b.kind} className="bg-card">
            <BenefitVisual kind={b.kind} tint={b.tint} />
            <h3 className="bg-title">{b.title}</h3>
            <p className="bg-desc">{b.desc}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

/* ─── Per-benefit visual compositions ───────────────────────── */

function BenefitVisual({ kind, tint }: { kind: Kind; tint: string }) {
  return (
    <div
      className="bg-visual"
      style={{
        background: `radial-gradient(circle at 30% 30%, ${tint}22, transparent 70%)`,
      }}
    >
      <svg
        width="100%"
        height="100"
        viewBox="0 0 240 100"
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block" }}
      >
        {kind === "calls"    && <CallsViz tint={tint} />}
        {kind === "quotes"   && <QuotesViz tint={tint} />}
        {kind === "reviews"  && <ReviewsViz tint={tint} />}
        {kind === "map"      && <MapViz tint={tint} />}
        {kind === "bookings" && <BookingsViz tint={tint} />}
        {kind === "247"      && <TwentyFourSevenViz tint={tint} />}
      </svg>
    </div>
  );
}

function IconTile({
  cx, cy, tint, children,
}: { cx: number; cy: number; tint: string; children: React.ReactNode }) {
  return (
    <g transform={`translate(${cx - 22},${cy - 22})`}>
      <rect x="0" y="0" width="44" height="44" rx="12"
            fill={`${tint}1f`} stroke={`${tint}55`} strokeWidth="1" />
      <g transform="translate(22,22)" stroke={tint} strokeWidth="1.7"
         fill="none" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </g>
  );
}

/* CALLS — phone icon with 3 ripple rings + LIVE pill + missed-call bubble */
function CallsViz({ tint }: { tint: string }) {
  return (
    <>
      {[28, 38, 50].map((r, i) => (
        <circle key={i} cx="120" cy="50" r={r} fill="none"
                stroke={`${tint}${i === 2 ? "22" : i === 1 ? "33" : "55"}`} />
      ))}
      <IconTile cx={120} cy={50} tint={tint}>
        <PhoneCall size={20} strokeWidth={1.7} />
      </IconTile>
      {/* LIVE pill */}
      <g transform="translate(176, 14)">
        <rect x="0" y="0" width="50" height="18" rx="9"
              fill="rgba(16,185,129,0.18)" stroke="rgba(16,185,129,0.45)" strokeWidth="0.9" />
        <circle cx="9" cy="9" r="2.6" fill="#10B981" />
        <text x="32" y="12" textAnchor="middle"
              fontFamily="'DM Mono', monospace" fontSize="8" fontWeight="700"
              fill="#10B981" letterSpacing="0.6">LIVE</text>
      </g>
      {/* missed-call indicator */}
      <g transform="translate(14, 76)">
        <circle cx="4" cy="4" r="3" fill="#EF4444" />
        <text x="12" y="7" fontFamily="'DM Mono', monospace" fontSize="8"
              fill="rgba(255,255,255,0.55)" letterSpacing="0.5">2 ANSWERED</text>
      </g>
    </>
  );
}

/* QUOTES — bolt icon with a price card pop-out + sparkle */
function QuotesViz({ tint }: { tint: string }) {
  return (
    <>
      <IconTile cx={84} cy={50} tint={tint}>
        <Zap size={20} strokeWidth={1.7} />
      </IconTile>
      {/* Price card */}
      <g transform="translate(126, 28)">
        <rect x="0" y="0" width="92" height="44" rx="10"
              fill="rgba(255,255,255,0.04)" stroke={`${tint}55`} strokeWidth="1" />
        <text x="10" y="16" fontFamily="'DM Mono', monospace" fontSize="7"
              fill="rgba(255,255,255,0.45)" letterSpacing="0.6">QUOTE</text>
        <text x="10" y="34" fontFamily="'Inter', system-ui, sans-serif"
              fontSize="16" fontWeight="800" fill={tint} letterSpacing="-0.02em">
          $1,247
        </text>
      </g>
      {/* sparkle */}
      <g stroke={tint} strokeWidth="1.4" strokeLinecap="round">
        <line x1="200" y1="12" x2="200" y2="20" />
        <line x1="196" y1="16" x2="204" y2="16" />
      </g>
      <g stroke={tint} strokeWidth="1.2" strokeLinecap="round" opacity="0.6">
        <line x1="64" y1="84" x2="64" y2="90" />
        <line x1="60" y1="87" x2="68" y2="87" />
      </g>
    </>
  );
}

/* REVIEWS — shield icon + 5-star row + 4.9 stat */
function ReviewsViz({ tint }: { tint: string }) {
  const stars = [0, 1, 2, 3, 4];
  return (
    <>
      <IconTile cx={42} cy={50} tint={tint}>
        <ShieldCheck size={20} strokeWidth={1.7} />
      </IconTile>
      {/* 5 stars */}
      <g transform="translate(82, 36)" fill="#F5C544">
        {stars.map((i) => (
          <path
            key={i}
            transform={`translate(${i * 22}, 0)`}
            d="M 8 0 L 10 5 L 16 5.6 L 11.5 9.6 L 13 15.5 L 8 12.5 L 3 15.5 L 4.5 9.6 L 0 5.6 L 6 5 Z"
          />
        ))}
      </g>
      <text x="82" y="74" fontFamily="'Inter', system-ui, sans-serif"
            fontSize="14" fontWeight="800" fill="#fff">4.9</text>
      <text x="106" y="74" fontFamily="'DM Mono', monospace" fontSize="9"
            fill="rgba(255,255,255,0.5)" letterSpacing="0.6">AVG · 60+ REVIEWS</text>
    </>
  );
}

/* MAP — pin tile + miniature map-pack list */
function MapViz({ tint }: { tint: string }) {
  return (
    <>
      <IconTile cx={42} cy={50} tint={tint}>
        <MapPinned size={20} strokeWidth={1.7} />
      </IconTile>
      {/* Map-pack list — three rows, top one highlighted */}
      <g transform="translate(80, 18)">
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(0, ${i * 22})`}>
            <rect x="0" y="0" width="146" height="18" rx="6"
                  fill={i === 0 ? `${tint}22` : "rgba(255,255,255,0.04)"}
                  stroke={i === 0 ? `${tint}88` : "rgba(255,255,255,0.08)"}
                  strokeWidth="1" />
            <text x="8" y="12" fontFamily="'DM Mono', monospace" fontSize="8"
                  fontWeight="700"
                  fill={i === 0 ? tint : "rgba(255,255,255,0.45)"}
                  letterSpacing="0.6">
              #{i + 1}
            </text>
            <rect x="22" y="6" width={i === 0 ? 80 : i === 1 ? 60 : 50}
                  height="6" rx="3"
                  fill={i === 0 ? `${tint}88` : "rgba(255,255,255,0.18)"} />
          </g>
        ))}
      </g>
    </>
  );
}

/* BOOKINGS — calendar icon + 3 slot rows with one CONFIRMED */
function BookingsViz({ tint }: { tint: string }) {
  return (
    <>
      <IconTile cx={42} cy={50} tint={tint}>
        <CalendarCheck size={20} strokeWidth={1.7} />
      </IconTile>
      {/* Slot list */}
      <g transform="translate(80, 18)">
        {[
          { label: "9:30 AM",  state: "done" },
          { label: "11:00 AM", state: "now" },
          { label: "2:30 PM",  state: "next" },
        ].map((s, i) => (
          <g key={s.label} transform={`translate(0, ${i * 22})`}>
            <rect x="0" y="0" width="146" height="18" rx="6"
                  fill={s.state === "now" ? `${tint}22` : "rgba(255,255,255,0.04)"}
                  stroke={s.state === "now" ? `${tint}88` : "rgba(255,255,255,0.08)"}
                  strokeWidth="1" />
            <text x="10" y="12" fontFamily="'DM Mono', monospace" fontSize="8"
                  fontWeight="700"
                  fill={s.state === "now" ? tint : s.state === "done" ? "rgba(52,211,153,0.85)" : "rgba(255,255,255,0.55)"}
                  letterSpacing="0.6">
              {s.label}
            </text>
            <text x="86" y="12" fontFamily="'DM Mono', monospace" fontSize="7"
                  fontWeight="700"
                  fill={s.state === "now" ? tint : s.state === "done" ? "rgba(52,211,153,0.85)" : "rgba(255,255,255,0.35)"}
                  letterSpacing="0.6">
              {s.state === "done" ? "✓ DONE" : s.state === "now" ? "BOOKED" : "OPEN"}
            </text>
          </g>
        ))}
      </g>
    </>
  );
}

/* 24/7 — moon icon + clock face showing 02:47 + ALWAYS-ON pill */
function TwentyFourSevenViz({ tint }: { tint: string }) {
  return (
    <>
      <IconTile cx={42} cy={50} tint={tint}>
        <MoonStar size={20} strokeWidth={1.7} />
      </IconTile>
      {/* Mini clock face */}
      <g transform="translate(120, 50)">
        <circle cx="0" cy="0" r="26" fill="rgba(255,255,255,0.04)"
                stroke={`${tint}55`} strokeWidth="1" />
        {/* tick marks at 12, 3, 6, 9 */}
        {[0, 90, 180, 270].map((deg) => {
          const a = (deg * Math.PI) / 180;
          return (
            <line key={deg}
                  x1={Math.cos(a) * 22} y1={Math.sin(a) * 22}
                  x2={Math.cos(a) * 26} y2={Math.sin(a) * 26}
                  stroke={`${tint}88`} strokeWidth="1" strokeLinecap="round" />
          );
        })}
        {/* hour hand pointing at ~2 (60deg from 12 = -30deg from horiz) */}
        <line x1="0" y1="0" x2="9" y2="-9" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
        {/* minute hand pointing near 9 (~270deg) */}
        <line x1="0" y1="0" x2="-14" y2="2" stroke={tint} strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="0" cy="0" r="1.6" fill="#fff" />
      </g>
      {/* ALWAYS ON pill */}
      <g transform="translate(170, 22)">
        <rect x="0" y="0" width="60" height="18" rx="9"
              fill={`${tint}22`} stroke={`${tint}66`} strokeWidth="0.9" />
        <text x="30" y="12" textAnchor="middle"
              fontFamily="'DM Mono', monospace" fontSize="8" fontWeight="700"
              fill={tint} letterSpacing="0.6">02:47 AM</text>
      </g>
      <text x="170" y="58" fontFamily="'DM Mono', monospace" fontSize="8"
            fill="rgba(255,255,255,0.5)" letterSpacing="0.6">ALWAYS ON</text>
    </>
  );
}

const CSS = `
.bg-wrap {
  padding: 48px 24px;
  background: ${mkt.bg};
  display: flex; justify-content: center;
}
.bg-grid {
  width: 100%; max-width: 980px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  font-family: 'DM Sans', system-ui, sans-serif;
}
.bg-card {
  background: rgba(20,24,27,0.55);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 22px;
  padding: 18px 22px 24px;
  display: flex; flex-direction: column;
  transition: transform 220ms cubic-bezier(0.22,1,0.36,1), border-color 220ms ease;
  overflow: hidden;
}
.bg-card:hover {
  transform: translateY(-2px);
  border-color: rgba(102,232,250,0.18);
}
.bg-visual {
  border-radius: 14px;
  overflow: hidden;
  margin: 0 -6px 16px;
  padding: 6px 4px 4px;
  background-color: rgba(255,255,255,0.02);
}
.bg-title {
  font-size: 17px; font-weight: 700; letter-spacing: -0.01em;
  color: #fff; margin: 0 0 8px;
}
.bg-desc {
  font-size: 13.5px; line-height: 1.55; color: rgba(255,255,255,0.55);
  margin: 0;
}

@media (max-width: 760px) { .bg-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 480px) { .bg-grid { grid-template-columns: 1fr; } }
`;
