/**
 * EfficientOnboarding — wide rounded card split 60/40. Left holds a
 * horizontal stage strip (numbered tiles + mono labels) on top of a
 * progress rail with start/end labels. Right holds eyebrow heading +
 * paragraph + faint mono section number.
 *
 * Stages reflect the real WeFixTrades onboarding flow:
 *   DISCOVERY → INTAKE → CONFIGURE → REVIEW → GO LIVE
 * The active stage (CONFIGURE in this snapshot) is rendered larger
 * with a cyan-accent icon block; others are muted.
 */

import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";
import { Compass, FileText, Settings, Handshake, Rocket } from "lucide-react";

interface Stage {
  num: string;
  label: string;
  Icon: typeof Compass;
  state: "done" | "active" | "next";
}

const STAGES: Stage[] = [
  { num: "01", label: "DISCOVERY",  Icon: Compass,   state: "done"   },
  { num: "02", label: "INTAKE",     Icon: FileText,  state: "done"   },
  { num: "03", label: "CONFIGURE",  Icon: Handshake, state: "active" },
  { num: "04", label: "REVIEW",     Icon: Settings,  state: "next"   },
  { num: "05", label: "GO LIVE",    Icon: Rocket,    state: "next"   },
];

export default function EfficientOnboarding() {
  // Active stage progress: ~50% along the rail
  const railFill = 50;

  return (
    <div className="eo-wrap">
      <style>{CSS}</style>
      <div className="eo-card">
        {/* LEFT — stage strip */}
        <div className="eo-left">
          <span className="eo-cursor" aria-hidden>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="#fff">
              <path d="M2 2 L14 8 L8 9 L6 14 Z" />
            </svg>
          </span>

          <div className="eo-stages">
            {STAGES.map((s) => {
              const Icon = s.Icon;
              const isActive = s.state === "active";
              return (
                <div key={s.num} className={`eo-stage eo-stage-${s.state}`}>
                  <span className="eo-stage-num">{s.num}</span>
                  <div className="eo-stage-tile">
                    <span className="eo-icon-block">
                      <Icon size={isActive ? 17 : 14} strokeWidth={1.7} />
                    </span>
                    <span className="eo-stage-label">{s.label}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="eo-rail">
            <div className="eo-rail-fill" style={{ width: `${railFill}%` }} />
            <div className="eo-rail-bookends">
              <span>DISCOVERY</span>
              <span>GO LIVE</span>
            </div>
          </div>
        </div>

        {/* RIGHT — copy */}
        <div className="eo-right">
          <h3 className="eo-head">Efficient onboarding</h3>
          <p className="eo-copy">
            Live in days, not months. We run discovery, ingest your real pricing, configure TradeLine to your trade and service area, and walk you through approval before activating — most clients are answering live customer calls within a week.
          </p>
          <span className="eo-num">02</span>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.eo-wrap {
  padding: 48px 24px;
  background: ${mkt.bg};
  display: flex; justify-content: center;
}
.eo-card {
  width: 100%; max-width: 980px;
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  background: rgba(20,24,27,0.65);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 22px;
  background-image: radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px);
  background-size: 18px 18px;
  overflow: hidden;
  font-family: 'DM Sans', system-ui, sans-serif;
}

.eo-left {
  position: relative;
  padding: 36px 28px 32px;
  min-height: 320px;
  display: flex; flex-direction: column;
  justify-content: space-between;
}
.eo-cursor { position: absolute; top: 18px; left: 18px; opacity: 0.78; }

/* Stage strip */
.eo-stages {
  display: flex; align-items: flex-end; gap: 10px;
  margin-top: 20px;
}
.eo-stage {
  display: flex; flex-direction: column; gap: 8px;
  flex: 1; min-width: 0;
}
.eo-stage-num {
  font-family: ${MONO}; font-size: 10px; font-weight: 700;
  color: rgba(255,255,255,0.30); letter-spacing: 0.14em;
}
.eo-stage-active .eo-stage-num { color: ${mkt.accent}; }

.eo-stage-tile {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 14px;
  padding: 14px 12px;
  display: flex; flex-direction: column; gap: 12px;
  align-items: flex-start;
  min-height: 100px;
  transition: transform 220ms cubic-bezier(0.22,1,0.36,1);
}
.eo-icon-block {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  border-radius: 9px;
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.55);
}
.eo-stage-label {
  font-family: ${MONO};
  font-size: 10px; font-weight: 700;
  letter-spacing: 0.10em;
  color: rgba(255,255,255,0.55);
  line-height: 1.25;
}

/* Done */
.eo-stage-done .eo-stage-tile { opacity: 0.55; }
.eo-stage-done .eo-icon-block { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.42); }

/* Active — bigger lifted card */
.eo-stage-active .eo-stage-tile {
  background: rgba(255,255,255,0.08);
  border-color: rgba(13,60,252,0.35);
  transform: translateY(-6px) scale(1.04);
  box-shadow: 0 18px 40px rgba(0,0,0,0.45);
  min-height: 120px;
  padding: 16px 14px;
}
.eo-stage-active .eo-icon-block {
  background: rgba(13,60,252,0.20);
  border: 1px solid rgba(13,60,252,0.45);
  color: ${mkt.accent};
  width: 36px; height: 36px;
}
.eo-stage-active .eo-stage-label {
  font-size: 11px; color: #fff;
}

/* Next — slightly dimmer */
.eo-stage-next .eo-stage-tile { opacity: 0.65; }

/* Progress rail */
.eo-rail {
  position: relative;
  margin-top: 36px;
  padding-top: 14px;
}
.eo-rail::before {
  content: '';
  position: absolute; left: 0; right: 0; top: 14px;
  height: 1px; background: rgba(255,255,255,0.10);
}
.eo-rail-fill {
  position: absolute; left: 0; top: 13px; height: 3px;
  background: linear-gradient(90deg, ${mkt.accent}, rgba(13,60,252,0));
  border-radius: 2px;
}
.eo-rail-bookends {
  display: flex; justify-content: space-between;
  margin-top: 14px;
  font-family: ${MONO};
  font-size: 10px; font-weight: 700;
  letter-spacing: 0.10em;
  color: rgba(255,255,255,0.55);
}
.eo-rail-bookends span:first-child { color: ${mkt.accent}; }

/* RIGHT */
.eo-right {
  padding: 36px 32px;
  background: rgba(0,0,0,0.18);
  border-left: 1px solid rgba(255,255,255,0.05);
  position: relative;
  display: flex; flex-direction: column;
}
.eo-head { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; color: #fff; margin: 0 0 14px; line-height: 1.2; }
.eo-copy { font-size: 14px; line-height: 1.6; color: rgba(255,255,255,0.65); margin: 0; }
.eo-num {
  position: absolute; right: 28px; bottom: 24px;
  font-family: ${MONO}; font-size: 14px; font-weight: 700;
  letter-spacing: 0.10em; color: rgba(255,255,255,0.18);
}

@media (max-width: 880px) {
  .eo-card { grid-template-columns: 1fr; }
  .eo-stages { gap: 6px; }
  .eo-stage-num { font-size: 8px; }
  .eo-stage-label { font-size: 8px; }
  .eo-stage-tile { padding: 10px 8px; min-height: 80px; }
}
`;
