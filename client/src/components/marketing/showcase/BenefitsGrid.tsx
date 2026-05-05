/**
 * BenefitsGrid — Effortel-style card grid. Each card is a fully
 * composed mini-dashboard widget showing a realistic UI fragment for
 * the benefit it represents (incoming call screen, quote calculator,
 * review distribution, map pack, booking calendar, hourly activity
 * heatmap), then a headline + a short paragraph below.
 *
 * Layout: 3 columns on desktop, 2 on tablet, 1 on small mobile.
 * Each card is ~340 px tall so the visual zone has room to read.
 */

import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";
import {
  PhoneCall, Star, MapPin, CalendarCheck,
  TrendingUp, Sparkles,
} from "lucide-react";

const TINT = {
  cyan:     "#66E8FA",
  amber:    "#FBBF24",
  mint:     "#34D399",
  orange:   "#FB923C",
  lavender: "#A78BFA",
  pink:     "#F472B6",
} as const;

export default function BenefitsGrid() {
  return (
    <div className="bg-wrap">
      <style>{CSS}</style>
      <div className="bg-grid">
        <Card
          tint={TINT.cyan}
          visual={<CallsWidget />}
          title="Capture Every Lead"
          desc="AI picks up the calls and chats you'd otherwise miss. No voicemail roulette, no lost revenue at 2 AM."
        />
        <Card
          tint={TINT.amber}
          visual={<QuoteWidget />}
          title="Instant Quotes"
          desc="Customers get a real price the moment they ask — pulled from your live pricing, not a guess."
        />
        <Card
          tint={TINT.mint}
          visual={<ReviewsWidget />}
          title="Reputation On Autopilot"
          desc="Every review gets a thoughtful reply within minutes. 5-stars amplified, 1-stars routed straight to your phone."
        />
        <Card
          tint={TINT.orange}
          visual={<MapPackWidget />}
          title="Win the Local Map"
          desc="Weekly Google Business Profile audits and fixes so you show up first when neighbours search."
        />
        <Card
          tint={TINT.lavender}
          visual={<CalendarWidget />}
          title="Bookings Without Phone Tag"
          desc="Customers pick a slot from your real calendar. You arrive, you work, you get paid — no back-and-forth."
        />
        <Card
          tint={TINT.pink}
          visual={<HoursWidget />}
          title="24/7 Coverage"
          desc="Nights, weekends, holidays. Your AI dispatcher never sleeps, so the next emergency call is yours."
        />
      </div>
    </div>
  );
}

function Card({ tint, visual, title, desc }: {
  tint: string; visual: React.ReactNode; title: string; desc: string;
}) {
  return (
    <article className="bg-card" style={{
      backgroundImage: `radial-gradient(ellipse at 20% 0%, ${tint}14, transparent 60%)`,
    }}>
      <div className="bg-visual">{visual}</div>
      <div className="bg-body">
        <h3 className="bg-title">{title}</h3>
        <p className="bg-desc">{desc}</p>
      </div>
    </article>
  );
}

/* ─── 1. CALLS — incoming-call UI mock with live waveform ──── */
function CallsWidget() {
  const tint = TINT.cyan;
  return (
    <div className="bg-w" style={{ borderColor: `${tint}33` }}>
      {/* Top status bar */}
      <div className="bg-w-top">
        <span className="bg-w-dot" style={{ background: "#10B981" }} />
        <span className="bg-w-mono" style={{ color: tint }}>AI ANSWERING · 0:14</span>
      </div>
      {/* Caller card */}
      <div className="bg-w-row" style={{ marginTop: 10 }}>
        <span className="bg-avatar" style={{ background: `${tint}33`, color: tint }}>
          <PhoneCall size={16} strokeWidth={1.8} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="bg-w-name">Sarah M.</div>
          <div className="bg-w-sub">Emergency drain blockage · Toronto</div>
        </div>
      </div>
      {/* Live waveform */}
      <div className="bg-wave" aria-hidden>
        {[14, 22, 36, 28, 44, 30, 18, 26, 38, 22, 32, 16, 24, 40, 28, 18, 30, 12].map((h, i) => (
          <span
            key={i}
            className="bg-wave-bar"
            style={{
              height: h,
              background: `linear-gradient(180deg, ${tint}, ${tint}66)`,
              animationDelay: `${i * 60}ms`,
            }}
          />
        ))}
      </div>
      {/* Footer stat */}
      <div className="bg-w-foot">
        <span className="bg-w-mono" style={{ color: "rgba(255,255,255,0.4)" }}>CALLS HANDLED TODAY</span>
        <span className="bg-stat-num">147</span>
      </div>
    </div>
  );
}

/* ─── 2. QUOTES — quote calculator producing a price ────────── */
function QuoteWidget() {
  const tint = TINT.amber;
  return (
    <div className="bg-w" style={{ borderColor: `${tint}33` }}>
      <div className="bg-w-top">
        <span className="bg-w-mono" style={{ color: "rgba(255,255,255,0.5)" }}>QUOTEQUICK PRO</span>
        <span className="bg-w-mono" style={{ color: tint }}>2.3s</span>
      </div>
      <div className="bg-q-row"><span>Service</span><span>Drain cleaning</span></div>
      <div className="bg-q-row"><span>Area</span><span>Downtown · 2 storey</span></div>
      <div className="bg-q-row"><span>Add-ons</span><span>Camera inspection</span></div>
      <div className="bg-q-price" style={{ borderColor: `${tint}55`, background: `${tint}14` }}>
        <span className="bg-w-mono" style={{ color: "rgba(255,255,255,0.45)" }}>YOUR QUOTE</span>
        <span style={{ color: tint }}>$1,247</span>
      </div>
      <div className="bg-w-foot">
        <span className="bg-w-mono" style={{ color: "rgba(255,255,255,0.4)" }}>SENT TO CUSTOMER</span>
        <span className="bg-stat-num" style={{ color: tint }}>✓</span>
      </div>
    </div>
  );
}

/* ─── 3. REVIEWS — 5-star distribution + auto-reply preview ── */
function ReviewsWidget() {
  const tint = TINT.mint;
  const dist = [
    { stars: 5, pct: 88 },
    { stars: 4, pct:  9 },
    { stars: 3, pct:  2 },
    { stars: 2, pct:  1 },
    { stars: 1, pct:  0 },
  ];
  return (
    <div className="bg-w" style={{ borderColor: `${tint}33` }}>
      <div className="bg-w-top">
        <span className="bg-w-mono" style={{ color: "rgba(255,255,255,0.5)" }}>RATING DISTRIBUTION</span>
        <span className="bg-w-mono" style={{ color: tint }}>+18 THIS MO</span>
      </div>
      <div className="bg-rev-head">
        <span className="bg-rev-num">4.9</span>
        <Star size={14} fill="#F5C544" stroke="#F5C544" />
        <span className="bg-w-mono" style={{ color: "rgba(255,255,255,0.45)" }}>· 247 REVIEWS</span>
      </div>
      <div className="bg-bars">
        {dist.map((d) => (
          <div key={d.stars} className="bg-bar-row">
            <span className="bg-bar-label">{d.stars}★</span>
            <div className="bg-bar-track">
              <div className="bg-bar-fill" style={{
                width: `${Math.max(d.pct, 1)}%`,
                background: d.stars >= 4 ? tint : "rgba(255,255,255,0.18)",
              }} />
            </div>
            <span className="bg-bar-pct">{d.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── 4. MAP — map pack with our biz at #1 + small map dots ── */
function MapPackWidget() {
  const tint = TINT.orange;
  return (
    <div className="bg-w" style={{ borderColor: `${tint}33` }}>
      <div className="bg-w-top">
        <span className="bg-w-mono" style={{ color: "rgba(255,255,255,0.5)" }}>GOOGLE MAP PACK</span>
        <span className="bg-w-mono" style={{ color: tint }}>RANK +2</span>
      </div>
      <div className="bg-mp-row">
        {/* Mini map */}
        <div className="bg-mini-map">
          {/* roads */}
          <span className="bg-road bg-road-h" style={{ top: "30%" }} />
          <span className="bg-road bg-road-h" style={{ top: "65%" }} />
          <span className="bg-road bg-road-v" style={{ left: "40%" }} />
          <span className="bg-road bg-road-v" style={{ left: "75%" }} />
          {/* pins */}
          <span className="bg-pin" style={{ top: "26%", left: "36%", background: tint, color: "#0E1116" }}>1</span>
          <span className="bg-pin" style={{ top: "60%", left: "70%", background: "rgba(255,255,255,0.20)" }}>2</span>
          <span className="bg-pin" style={{ top: "70%", left: "20%", background: "rgba(255,255,255,0.14)" }}>3</span>
        </div>
        {/* Pack list */}
        <div className="bg-pack">
          {[
            { rank: 1, name: "Your Business", active: true },
            { rank: 2, name: "Drain Pro Co." },
            { rank: 3, name: "City Plumbing" },
          ].map((r) => (
            <div key={r.rank} className="bg-pack-row" style={{
              background: r.active ? `${tint}1f` : "transparent",
              borderColor: r.active ? `${tint}66` : "rgba(255,255,255,0.08)",
            }}>
              <span className="bg-pack-rank" style={{ color: r.active ? tint : "rgba(255,255,255,0.5)" }}>#{r.rank}</span>
              <span className="bg-pack-name" style={{ color: r.active ? "#fff" : "rgba(255,255,255,0.55)" }}>{r.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── 5. CALENDAR — week of slots, some booked, some open ──── */
function CalendarWidget() {
  const tint = TINT.lavender;
  // Each cell: B = booked, O = open, X = unavailable
  const week: { day: string; cells: string[] }[] = [
    { day: "M", cells: ["B", "B", "O", "O"] },
    { day: "T", cells: ["B", "O", "B", "O"] },
    { day: "W", cells: ["B", "B", "B", "O"] },
    { day: "T", cells: ["O", "B", "O", "O"] },
    { day: "F", cells: ["B", "B", "B", "B"] },
    { day: "S", cells: ["X", "B", "O", "X"] },
    { day: "S", cells: ["X", "X", "X", "X"] },
  ];
  return (
    <div className="bg-w" style={{ borderColor: `${tint}33` }}>
      <div className="bg-w-top">
        <span className="bg-w-mono" style={{ color: "rgba(255,255,255,0.5)" }}>THIS WEEK</span>
        <span className="bg-w-mono" style={{ color: tint }}>12 BOOKED</span>
      </div>
      <div className="bg-cal">
        {week.map((d) => (
          <div key={d.day + Math.random()} className="bg-cal-col">
            <span className="bg-cal-day">{d.day}</span>
            {d.cells.map((c, i) => (
              <span key={i} className="bg-cal-cell" style={{
                background:
                  c === "B" ? tint :
                  c === "O" ? "rgba(255,255,255,0.10)" :
                              "rgba(255,255,255,0.04)",
                opacity: c === "X" ? 0.5 : 1,
              }} />
            ))}
          </div>
        ))}
      </div>
      <div className="bg-w-foot" style={{ marginTop: 10 }}>
        <span className="bg-w-mono" style={{ color: "rgba(255,255,255,0.4)" }}>NEXT</span>
        <span className="bg-w-mono" style={{ color: "#fff" }}>
          <CalendarCheck size={11} style={{ verticalAlign: "-2px", marginRight: 4 }} />
          TUE 11:00 AM
        </span>
      </div>
    </div>
  );
}

/* ─── 6. HOURS — 24-hour activity heatmap with night peak ──── */
function HoursWidget() {
  const tint = TINT.pink;
  // 24 bars for hours, varying intensity. Overnight (22-06) shaded.
  const intensities = [
    8, 6, 5, 7, 9, 12,            // 0–5 (overnight)
    18, 32, 56, 72, 80, 76,       // 6–11 morning peak
    60, 70, 78, 84, 82, 70,       // 12–17 afternoon peak
    52, 38, 26, 18, 14, 10,       // 18–23 evening
  ];
  const max = Math.max(...intensities);
  return (
    <div className="bg-w" style={{ borderColor: `${tint}33` }}>
      <div className="bg-w-top">
        <span className="bg-w-mono" style={{ color: "rgba(255,255,255,0.5)" }}>CALLS BY HOUR · LAST 7D</span>
        <span className="bg-w-mono" style={{ color: tint }}>OVERNIGHT 428</span>
      </div>
      <div className="bg-hours">
        {intensities.map((v, i) => {
          const isNight = i < 6 || i >= 22;
          return (
            <span
              key={i}
              className="bg-hour-bar"
              style={{
                height: `${(v / max) * 100}%`,
                background: isNight
                  ? `linear-gradient(180deg, ${tint}, ${tint}33)`
                  : "linear-gradient(180deg, rgba(255,255,255,0.32), rgba(255,255,255,0.10))",
                border: isNight ? `1px solid ${tint}44` : "1px solid rgba(255,255,255,0.06)",
              }}
              title={`${i}:00 · ${v}`}
            />
          );
        })}
      </div>
      <div className="bg-hour-axis">
        <span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>12a</span>
      </div>
    </div>
  );
}

const CSS = `
.bg-wrap {
  padding: 48px 24px;
  background: ${mkt.bg};
  display: flex; justify-content: center;
}
.bg-grid {
  width: 100%; max-width: 1080px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  font-family: 'DM Sans', system-ui, sans-serif;
}
.bg-card {
  position: relative;
  background: rgba(20,24,27,0.55);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 22px;
  padding: 14px 14px 18px;
  display: flex; flex-direction: column; gap: 14px;
  min-height: 360px;
  transition: transform 220ms cubic-bezier(0.22,1,0.36,1), border-color 220ms ease;
  overflow: hidden;
}
.bg-card:hover {
  transform: translateY(-2px);
  border-color: rgba(102,232,250,0.18);
}
.bg-visual { flex: 1; display: flex; }
.bg-body { padding: 0 8px; }
.bg-title {
  font-size: 17px; font-weight: 700; letter-spacing: -0.01em;
  color: #fff; margin: 0 0 6px;
}
.bg-desc {
  font-size: 13px; line-height: 1.55; color: rgba(255,255,255,0.55);
  margin: 0;
}

/* ── Widget shell ── */
.bg-w {
  width: 100%;
  background: rgba(10,14,18,0.55);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 14px;
  padding: 12px 12px 10px;
  display: flex; flex-direction: column;
  gap: 8px;
  font-family: 'DM Sans', system-ui, sans-serif;
}
.bg-w-top {
  display: flex; justify-content: space-between; align-items: center;
  gap: 8px;
}
.bg-w-mono {
  font-family: ${MONO};
  font-size: 9px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase;
}
.bg-w-dot {
  width: 6px; height: 6px; border-radius: 999px; display: inline-block;
  margin-right: 6px;
}
.bg-w-row {
  display: flex; align-items: center; gap: 10px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
  padding: 8px 10px;
}
.bg-avatar {
  width: 30px; height: 30px; border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.bg-w-name {
  font-size: 13px; font-weight: 700; color: #fff;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.bg-w-sub {
  font-size: 11px; color: rgba(255,255,255,0.45);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.bg-w-foot {
  display: flex; justify-content: space-between; align-items: center;
  padding-top: 4px;
}
.bg-stat-num {
  font-size: 18px; font-weight: 800; color: #fff; letter-spacing: -0.02em;
}

/* ── Calls — waveform ── */
.bg-wave {
  display: flex; align-items: center; justify-content: space-between;
  height: 48px; padding: 0 4px;
}
.bg-wave-bar {
  width: 3px; border-radius: 2px;
  animation: bgwave 1.4s ease-in-out infinite;
}
@keyframes bgwave {
  0%, 100% { transform: scaleY(0.5); }
  50%      { transform: scaleY(1); }
}

/* ── Quote rows ── */
.bg-q-row {
  display: flex; justify-content: space-between;
  font-size: 11px;
  padding: 4px 4px;
}
.bg-q-row > span:first-child { color: rgba(255,255,255,0.45); font-family: ${MONO}; letter-spacing: 0.06em; text-transform: uppercase; font-size: 9px; }
.bg-q-row > span:last-child  { color: rgba(255,255,255,0.85); font-weight: 500; }
.bg-q-price {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-top: 4px;
  padding: 10px 12px;
  border: 1px solid; border-radius: 10px;
}
.bg-q-price > span:last-child { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }

/* ── Reviews bars ── */
.bg-rev-head { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
.bg-rev-num  { font-size: 26px; font-weight: 800; color: #fff; letter-spacing: -0.02em; }
.bg-bars { display: flex; flex-direction: column; gap: 4px; }
.bg-bar-row { display: grid; grid-template-columns: 18px 1fr 26px; gap: 6px; align-items: center; }
.bg-bar-label { font-family: ${MONO}; font-size: 9px; color: rgba(255,255,255,0.55); }
.bg-bar-track { height: 6px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; }
.bg-bar-fill  { height: 100%; border-radius: 999px; transition: width 600ms ease; }
.bg-bar-pct   { font-family: ${MONO}; font-size: 9px; color: rgba(255,255,255,0.45); text-align: right; }

/* ── Map pack ── */
.bg-mp-row { display: grid; grid-template-columns: 80px 1fr; gap: 10px; align-items: stretch; }
.bg-mini-map {
  position: relative; height: 100%;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px; overflow: hidden;
  min-height: 90px;
}
.bg-road { position: absolute; background: rgba(255,255,255,0.10); }
.bg-road-h { left: 0; right: 0; height: 1px; }
.bg-road-v { top: 0; bottom: 0; width: 1px; }
.bg-pin {
  position: absolute; transform: translate(-50%, -50%);
  width: 18px; height: 18px; border-radius: 999px;
  display: inline-flex; align-items: center; justify-content: center;
  font-family: ${MONO}; font-size: 9px; font-weight: 800;
  color: #fff;
  border: 1.5px solid rgba(0,0,0,0.6);
}
.bg-pack { display: flex; flex-direction: column; gap: 4px; }
.bg-pack-row {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px;
  border: 1px solid;
  border-radius: 8px;
}
.bg-pack-rank { font-family: ${MONO}; font-size: 10px; font-weight: 800; }
.bg-pack-name { font-size: 12px; font-weight: 600; }

/* ── Calendar grid ── */
.bg-cal {
  display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px;
}
.bg-cal-col { display: flex; flex-direction: column; gap: 3px; align-items: center; }
.bg-cal-day { font-family: ${MONO}; font-size: 9px; color: rgba(255,255,255,0.45); margin-bottom: 2px; }
.bg-cal-cell { width: 100%; height: 14px; border-radius: 3px; }

/* ── Hours bars ── */
.bg-hours {
  display: grid; grid-template-columns: repeat(24, 1fr); gap: 2px;
  height: 70px; align-items: end;
  padding: 4px 2px 0;
}
.bg-hour-bar { display: block; border-radius: 2px 2px 0 0; min-height: 4px; }
.bg-hour-axis {
  display: flex; justify-content: space-between;
  font-family: ${MONO}; font-size: 8px; color: rgba(255,255,255,0.35);
  letter-spacing: 0.08em; text-transform: uppercase;
  padding: 0 2px; margin-top: 2px;
}

@media (max-width: 880px) { .bg-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 520px) { .bg-grid { grid-template-columns: 1fr; } }
`;
