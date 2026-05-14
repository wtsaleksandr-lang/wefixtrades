/**
 * ProactiveStats — wide rounded card split 60/40. Left holds a glassy
 * stat-tile composition (donut + counter + sparkline + bars). Right
 * holds the eyebrow heading + paragraph + faint mono section number.
 */

import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function ProactiveStats() {
  return (
    <div className="ps-wrap">
      <style>{CSS}</style>
      <div className="ps-card">
        {/* LEFT — stat composition */}
        <div className="ps-left">
          <span className="ps-cursor" aria-hidden>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="#fff">
              <path d="M2 2 L14 8 L8 9 L6 14 Z" />
            </svg>
          </span>

          {/* Donut: lead-to-booking lift */}
          <div className="ps-tile ps-donut-tile">
            <span className="ps-tile-label">LEAD-TO-BOOKING LIFT</span>
            <Donut percent={84} accent={mkt.accent} />
            <span className="ps-tile-pill ps-pill-cyan">+ 1.3%</span>
          </div>

          {/* Counter: calls handled / total inbound */}
          <div className="ps-tile ps-counter-tile">
            <span className="ps-tile-label">CALLS HANDLED 24/7</span>
            <div className="ps-counter">
              <span className="ps-counter-num">11 357</span>
              <span className="ps-counter-of">/ 15 998</span>
            </div>
            <div className="ps-bar-track"><div className="ps-bar-fill" style={{ width: "71%" }} /></div>
          </div>

          {/* Counter + sparkline: jobs booked MoM */}
          <div className="ps-tile ps-spark-tile">
            <div className="ps-row">
              <span className="ps-tile-label">JOBS BOOKED</span>
              <Sparkline />
            </div>
            <div className="ps-counter">
              <span className="ps-counter-num">120 547</span>
              <span className="ps-tile-pill ps-pill-good">+ 5.7%</span>
            </div>
          </div>

          {/* Bars: avg review rating by quarter */}
          <div className="ps-tile ps-bars-tile">
            <span className="ps-tile-label">AVG REVIEW RATING<br/>BY QUARTER</span>
            <div className="ps-bars">
              <span className="ps-bar" style={{ height: "32%", background: "rgba(255,255,255,0.18)" }} />
              <span className="ps-bar" style={{ height: "62%", background: "#F472B6" }} />
              <span className="ps-bar" style={{ height: "78%", background: "#86EFAC" }} />
              <span className="ps-bar" style={{ height: "92%", background: "#86EFAC" }} />
            </div>
            <div className="ps-bars-labels">
              <span>Q1</span><span>Q2</span><span>Q3</span><span>Q4</span>
            </div>
          </div>
        </div>

        {/* RIGHT — copy column */}
        <div className="ps-right">
          <h3 className="ps-head">Proactive Managed Services</h3>
          <p className="ps-copy">
            Operational excellence on autopilot. Our team monitors every queue, every after-hours call, and every booking handoff across your stack — escalating issues before customers notice and tuning your AI dispatcher weekly so quotes stay sharp and conversion keeps climbing.
          </p>
          <span className="ps-num">05</span>
        </div>
      </div>
    </div>
  );
}

function Donut({ percent, accent }: { percent: number; accent: string }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const off = c - (percent / 100) * c;
  return (
    <div className="ps-donut-wrap">
      <svg viewBox="0 0 100 100" className="ps-donut" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="6" />
        <circle
          cx="50" cy="50" r={r}
          fill="none" stroke={accent} strokeWidth="6"
          strokeDasharray={c} strokeDashoffset={off}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div className="ps-donut-label">{percent}%</div>
    </div>
  );
}

function Sparkline() {
  return (
    <svg viewBox="0 0 80 24" preserveAspectRatio="none" className="ps-mini-spark" aria-hidden>
      <path
        d="M2,18 L12,14 L22,16 L32,10 L42,12 L52,6 L62,8 L72,4 L78,5"
        fill="none" stroke="#86EFAC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

const CSS = `
.ps-wrap {
  padding: 48px 24px;
  background: ${mkt.bg};
  display: flex; justify-content: center;
}
.ps-card {
  width: 100%; max-width: 980px;
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  background: rgba(20,24,27,0.65);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 22px;
  background-image: radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px);
  background-size: 18px 18px;
  overflow: hidden;
  font-family: 'DM Sans', system-ui, sans-serif;
}
.ps-left {
  position: relative;
  padding: 32px 28px;
  min-height: 360px;
  display: grid;
  grid-template-columns: 170px 170px 1fr;
  grid-template-rows: 200px 130px;
  gap: 12px;
}
.ps-cursor { position: absolute; top: 18px; left: 18px; opacity: 0.78; }
.ps-tile {
  position: relative;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 14px;
  padding: 14px;
  color: #fff;
  display: flex; flex-direction: column; gap: 8px;
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
}
.ps-tile-label {
  font-family: ${MONO};
  font-size: 9px; font-weight: 700; letter-spacing: 0.10em;
  text-transform: uppercase; color: rgba(255,255,255,0.55);
  line-height: 1.35;
}
.ps-tile-pill {
  position: absolute; bottom: 12px; left: 14px;
  font-family: ${MONO}; font-size: 9px; font-weight: 700;
  padding: 3px 8px; border-radius: 999px; letter-spacing: 0.04em;
}
.ps-pill-cyan { background: rgba(13,60,252,0.18); color: ${mkt.accent}; border: 1px solid rgba(13,60,252,0.32); }
.ps-pill-good { background: rgba(74,222,128,0.18); color: #4ade80; border: 1px solid rgba(74,222,128,0.32); position: static; }

.ps-donut-tile { grid-row: 1; grid-column: 1; }
.ps-donut-wrap { position: relative; display: flex; align-items: center; justify-content: center; flex: 1; }
.ps-donut { width: 110px; height: 110px; }
.ps-donut-label {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
  font-size: 22px; font-weight: 700; letter-spacing: -0.02em;
}

.ps-counter-tile { grid-row: 1; grid-column: 2; padding: 14px; align-self: end; height: 130px; align-self: center; margin-top: 70px; }
.ps-counter { display: inline-flex; gap: 6px; align-items: baseline; }
.ps-counter-num { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
.ps-counter-of  { font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.45); }
.ps-bar-track { height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden; }
.ps-bar-fill  { height: 100%; background: ${mkt.accent}; border-radius: 2px; }

.ps-spark-tile { grid-row: 2; grid-column: 1 / span 2; }
.ps-row { display: flex; align-items: center; gap: 10px; justify-content: space-between; }
.ps-mini-spark { width: 80px; height: 24px; }

.ps-bars-tile { grid-row: 1 / span 2; grid-column: 3; align-self: center; }
.ps-bars { display: flex; align-items: flex-end; gap: 6px; height: 80px; }
.ps-bar { flex: 1; border-radius: 3px; min-height: 6px; }
.ps-bars-labels {
  display: flex; gap: 6px; margin-top: 6px;
  font-family: ${MONO}; font-size: 9px; color: rgba(255,255,255,0.4);
  letter-spacing: 0.10em;
}
.ps-bars-labels span { flex: 1; text-align: center; }

.ps-right {
  padding: 36px 32px;
  background: rgba(0,0,0,0.18);
  border-left: 1px solid rgba(255,255,255,0.05);
  position: relative;
  display: flex; flex-direction: column;
}
.ps-head {
  font-size: 22px; font-weight: 700; letter-spacing: -0.01em;
  color: #fff; margin: 0 0 14px;
  line-height: 1.2;
}
.ps-copy {
  font-size: 14px; line-height: 1.6; color: rgba(255,255,255,0.65);
  margin: 0;
}
.ps-num {
  position: absolute; right: 28px; bottom: 24px;
  font-family: ${MONO};
  font-size: 14px; font-weight: 700; letter-spacing: 0.10em;
  color: rgba(255,255,255,0.18);
}

@media (max-width: 720px) {
  .ps-card { grid-template-columns: 1fr; }
  .ps-left {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto auto auto;
  }
  .ps-counter-tile { margin-top: 0; height: auto; }
  .ps-bars-tile { grid-row: auto; grid-column: 1 / span 2; }
}
`;
