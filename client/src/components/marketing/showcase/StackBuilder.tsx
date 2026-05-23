/**
 * StackBuilder — overlapping translucent cards inside a glassy dark
 * container, communicating "build your own stack" with one of our
 * products plotted at each rank.
 */

import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";
import { Plus } from "lucide-react";

const PRODUCTS = [
  { rank: 1, name: "TRADELINE",      hue: "#0d3cfc" },
  { rank: 2, name: "QUOTEQUICK PRO", hue: "#C5B4FF" },
  { rank: 3, name: "MAPGUARD",       hue: "#FFD66E" },
  { rank: 4, name: "WEBFIX",         hue: "#86EFAC" },
];

export default function StackBuilder() {
  return (
    <div data-theme="dark" className="sb-wrap">
      <style>{CSS}</style>
      <div className="sb-stage">
        {/* Card 1 — sparkline + big metric (top-left) */}
        <div className="sb-card sb-card-revenue">
          <div className="sb-row">
            <span className="sb-label">NET REVENUE</span>
            <span className="sb-pill sb-pill-good">+ 5.7%</span>
          </div>
          <svg className="sb-spark" viewBox="0 0 160 60" preserveAspectRatio="none">
            <defs>
              <linearGradient id="sb-spark-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(13,60,252,0.42)" />
                <stop offset="100%" stopColor="rgba(13,60,252,0)" />
              </linearGradient>
            </defs>
            <path
              d="M2,42 L20,38 L36,30 L52,34 L70,22 L86,28 L104,18 L122,24 L140,12 L158,16 L158,60 L2,60 Z"
              fill="url(#sb-spark-grad)"
            />
            <path
              d="M2,42 L20,38 L36,30 L52,34 L70,22 L86,28 L104,18 L122,24 L140,12 L158,16"
              fill="none" stroke="rgba(13,60,252,0.95)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"
            />
          </svg>
          <div className="sb-big">13.3M</div>
        </div>

        {/* Card 2 — counter (mid-left) */}
        <div className="sb-card sb-card-sims">
          <div className="sb-label">#</div>
          <div className="sb-mid">16</div>
          <div className="sb-sub">SERVICES AVAILABLE</div>
        </div>

        {/* Card 3 — total users (bottom-mid) */}
        <div className="sb-card sb-card-users">
          <div className="sb-row">
            <span className="sb-icon-mini" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5 20c1-4 4-6 7-6s6 2 7 6" />
              </svg>
            </span>
            <span className="sb-pill sb-pill-good">+ 3.2%</span>
          </div>
          <div className="sb-mid">120 547</div>
          <div className="sb-sub">TOTAL USERS</div>
        </div>

        {/* Card 4 — best-performing products (right) */}
        <div className="sb-card sb-card-best">
          <div className="sb-add-slot">
            <Plus size={11} strokeWidth={2} />
            <span>ADD</span>
          </div>
          <div className="sb-best-head">
            BEST PERFORMING<br/>PRODUCTS
          </div>
          <ul className="sb-best-list">
            {PRODUCTS.map((p) => (
              <li key={p.rank} className="sb-best-row">
                <span className="sb-rank" style={{ background: p.hue }}>
                  #{p.rank}
                </span>
                <span className="sb-rank-name">{p.name}</span>
                <span className="sb-rank-spark" style={{ background: p.hue }} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.sb-wrap {
  padding: 48px 24px;
  background: ${mkt.bg};
  display: flex; justify-content: center;
}
.sb-stage {
  position: relative;
  width: 100%;
  max-width: 720px;
  height: 460px;
  background:
    radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px),
    rgba(20,24,27,0.50);
  background-size: 18px 18px, auto;
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,0.06);
}
.sb-card {
  position: absolute;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 18px;
  padding: 16px 18px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: #fff;
  font-family: 'DM Sans', system-ui, sans-serif;
  box-shadow: 0 12px 30px rgba(0,0,0,0.40);
  transition: transform 220ms cubic-bezier(0.22,1,0.36,1);
}
.sb-card:hover { transform: translateY(-2px); }

.sb-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.sb-label {
  font-family: ${MONO};
  font-size: 9px; font-weight: 600; letter-spacing: 0.10em;
  text-transform: uppercase; color: rgba(255,255,255,0.55);
}
.sb-pill {
  font-family: ${MONO};
  font-size: 10px; font-weight: 700;
  padding: 3px 8px; border-radius: 999px;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.sb-pill-good { background: rgba(74,222,128,0.18); color: #4ade80; border: 1px solid rgba(74,222,128,0.32); }
.sb-pill-cyan { background: rgba(13,60,252,0.18); color: ${mkt.accent}; border: 1px solid rgba(13,60,252,0.32); }
.sb-icon-mini {
  display: inline-flex; width: 22px; height: 22px; align-items: center; justify-content: center;
  color: rgba(255,255,255,0.78);
  background: rgba(255,255,255,0.06);
  border-radius: 50%;
}
.sb-icon-mini svg { width: 14px; height: 14px; }

.sb-spark { width: 100%; height: 60px; display: block; margin: 12px 0 10px; }
.sb-big {
  font-size: 30px; font-weight: 700; letter-spacing: -0.02em;
  color: #fff;
}
.sb-mid {
  font-size: 28px; font-weight: 700; letter-spacing: -0.02em;
  color: #fff;
  margin-top: 6px;
}
.sb-sub {
  font-family: ${MONO};
  font-size: 9px; font-weight: 600; letter-spacing: 0.10em;
  text-transform: uppercase; color: rgba(255,255,255,0.55);
  margin-top: 4px;
}

.sb-card-revenue { left: 4%; top: 8%; width: 200px; }
.sb-card-sims    { left: 32%; top: 18%; width: 130px; }
.sb-card-users   { left: 22%; bottom: 10%; width: 220px; }

.sb-card-best {
  right: 4%; top: 14%; width: 230px; height: 380px;
  padding: 14px 16px;
}
.sb-add-slot {
  position: absolute;
  top: -28px; left: 50%; transform: translateX(-50%);
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: 8px;
  border: 1px dashed rgba(255,255,255,0.32);
  background: rgba(255,255,255,0.03);
  font-family: ${MONO};
  font-size: 10px; font-weight: 700; letter-spacing: 0.10em;
  color: rgba(255,255,255,0.65);
  text-transform: uppercase;
}
.sb-add-slot svg { color: rgba(255,255,255,0.65); }
.sb-best-head {
  font-family: ${MONO};
  font-size: 10px; font-weight: 700; letter-spacing: 0.10em;
  text-transform: uppercase; color: rgba(255,255,255,0.55);
  line-height: 1.35;
  margin-bottom: 14px;
}
.sb-best-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.sb-best-row {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 8px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 9px;
}
.sb-rank {
  font-family: ${MONO};
  font-size: 9px; font-weight: 800;
  padding: 3px 7px; border-radius: 6px;
  color: #0a1018;
  flex-shrink: 0;
}
.sb-rank-name {
  flex: 1; font-family: ${MONO};
  font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
  color: #fff;
}
.sb-rank-spark {
  width: 14px; height: 4px; border-radius: 2px;
  opacity: 0.55;
}

@media (max-width: 720px) {
  .sb-stage { height: 540px; }
  .sb-card-revenue { width: 170px; }
  .sb-card-sims    { left: 56%; top: 4%; width: 110px; }
  .sb-card-users   { left: 4%; width: 180px; }
  .sb-card-best    { width: 200px; height: 340px; }
}
`;
