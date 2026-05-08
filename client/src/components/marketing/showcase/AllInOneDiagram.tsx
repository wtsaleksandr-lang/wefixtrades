/**
 * AllInOneDiagram — three-element diagram (left stack, center node,
 * right outcomes) connected by hairline rails around a central gear,
 * with a docked dashboard panel below. Soft pastel surface with dotted
 * grid texture.
 */

import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";
import {
  Cpu, Cloud, Server, Settings, User, Phone, CalendarCheck, Star,
  LayoutDashboard, MessageSquare, BarChart3, Bell, Bot,
} from "lucide-react";

export default function AllInOneDiagram() {
  return (
    <div className="aio-wrap">
      <style>{CSS}</style>
      <div className="aio-stage">
        <div className="aio-eyebrow">All-in-one</div>
        <p className="aio-sub">
          One platform. AI dispatch, automation, and live ops glued to your tools — so trades businesses run on autopilot without giving up control.
        </p>

        <div className="aio-canvas">
          {/* Hairline rails connecting elements */}
          <svg className="aio-rails" viewBox="0 0 720 360" preserveAspectRatio="none" aria-hidden>
            <path d="M 130 110 L 360 130" stroke="rgba(20,40,60,0.20)" strokeWidth="1" fill="none" strokeDasharray="3 3" />
            <path d="M 360 130 L 590 110" stroke="rgba(20,40,60,0.20)" strokeWidth="1" fill="none" strokeDasharray="3 3" />
            <path d="M 360 170 L 360 250" stroke="rgba(20,40,60,0.20)" strokeWidth="1" fill="none" strokeDasharray="3 3" />
          </svg>

          {/* LEFT: stack of premium tools (rack) */}
          <div className="aio-rack" aria-label="Premium stack">
            {[
              { Icon: Bot,    label: "AI" },
              { Icon: Cloud,  label: "Cloud" },
              { Icon: Cpu,    label: "Voice" },
              { Icon: Server, label: "Auto" },
            ].map(({ Icon, label }) => (
              <div className="aio-rack-row" key={label}>
                <span className="aio-rack-dots" aria-hidden>
                  <i /><i /><i />
                </span>
                <Icon size={14} strokeWidth={1.6} className="aio-rack-icon" />
              </div>
            ))}
            <div className="aio-rack-cap">PREMIUM STACK</div>
          </div>

          {/* CENTER: gear node = customer's business */}
          <div className="aio-node" aria-label="Your business">
            <div className="aio-node-ring" />
            <Settings size={18} strokeWidth={1.6} />
            <div className="aio-node-cap">YOUR BUSINESS</div>
          </div>

          {/* RIGHT: outcomes cloud (calls, bookings, reviews) */}
          <div className="aio-outcomes" aria-label="Customer-facing outcomes">
            <svg viewBox="0 0 100 70" className="aio-outcomes-cloud" preserveAspectRatio="none">
              <path
                d="M 18,52 Q 4,52 4,40 Q 4,28 18,28 Q 18,12 36,12 Q 50,4 62,14 Q 80,12 84,28 Q 96,30 96,42 Q 96,52 82,52 Z"
                fill="rgba(255,255,255,0.78)"
                stroke="rgba(20,40,60,0.10)"
                strokeWidth="0.8"
              />
            </svg>
            <div className="aio-outcomes-icons">
              <Phone size={16} strokeWidth={1.7} />
              <CalendarCheck size={16} strokeWidth={1.7} />
              <Star size={16} strokeWidth={1.7} />
            </div>
            <div className="aio-outcomes-cap">CUSTOMER OUTCOMES</div>
          </div>

          {/* BOTTOM dashboard dock = WeFixTrades console */}
          <div className="aio-dash">
            <div className="aio-dash-tabs">
              <span className="aio-dash-tab"><LayoutDashboard size={11} /></span>
              <span className="aio-dash-tab"><MessageSquare size={11} /></span>
              <span className="aio-dash-tab"><BarChart3 size={11} /></span>
              <span className="aio-dash-tab"><Bell size={11} /></span>
              <span className="aio-dash-tab"><User size={11} /></span>
            </div>
            <div className="aio-dash-head">
              <span className="aio-dash-name">WeFixTrades</span>
              <span className="aio-dash-dot" />
              <span className="aio-dash-dot" />
              <span className="aio-dash-dot" />
            </div>
            <div className="aio-dash-body">
              <div className="aio-dash-row" />
              <div className="aio-dash-row short" />
              <div className="aio-dash-row" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.aio-wrap {
  padding: 48px 24px;
  background: ${mkt.bg};
  display: flex; justify-content: center;
}
.aio-stage {
  width: 100%; max-width: 760px;
  background:
    radial-gradient(circle, rgba(20,40,60,0.10) 1px, transparent 1px),
    linear-gradient(180deg, #d3dadb 0%, #c2cccd 100%);
  background-size: 16px 16px, auto;
  border-radius: 22px;
  padding: 36px 32px 220px;
  color: #1a2a30;
  font-family: 'DM Sans', system-ui, sans-serif;
  position: relative;
  overflow: hidden;
}
.aio-eyebrow {
  font-size: 22px; font-weight: 700; letter-spacing: -0.01em; margin-bottom: 8px;
}
.aio-sub {
  font-size: 14px; line-height: 1.55; color: #34464d;
  max-width: 480px; margin: 0 0 28px;
}
.aio-canvas { position: relative; height: 200px; margin-bottom: 12px; }
.aio-rails { position: absolute; inset: 0; width: 100%; height: 100%; }

/* RACK (left) */
.aio-rack {
  position: absolute; left: 4%; top: 18px;
  display: flex; flex-direction: column; gap: 4px;
  background: rgba(255,255,255,0.72);
  border: 1px solid rgba(20,40,60,0.10);
  border-radius: 12px;
  padding: 10px 12px;
  width: 130px;
  box-shadow: 0 6px 16px rgba(20,40,60,0.06);
}
.aio-rack-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 4px 6px;
  background: rgba(255,255,255,0.55);
  border-radius: 6px;
  color: #4a5e66;
}
.aio-rack-dots { display: inline-flex; gap: 3px; }
.aio-rack-dots i { width: 5px; height: 5px; border-radius: 50%; background: ${mkt.accent}; opacity: 0.78; }
.aio-rack-dots i:nth-child(2) { background: #C5B4FF; }
.aio-rack-dots i:nth-child(3) { background: #4ade80; }
.aio-rack-icon { color: #4a5e66; }
.aio-rack-cap {
  font-family: ${MONO};
  font-size: 8px; letter-spacing: 0.15em; text-transform: uppercase;
  text-align: center; color: #6a7a82; margin-top: 6px;
}

/* CENTER NODE */
.aio-node {
  position: absolute; left: 50%; top: 60px;
  transform: translateX(-50%);
  width: 56px; height: 56px;
  background: rgba(255,255,255,0.85);
  border: 1px solid rgba(20,40,60,0.14);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: #1a2a30;
  box-shadow: 0 6px 14px rgba(20,40,60,0.10);
}
.aio-node-ring {
  position: absolute; inset: -6px;
  border-radius: 50%;
  border: 1px dashed rgba(20,40,60,0.22);
  pointer-events: none;
}
.aio-node-cap {
  position: absolute; bottom: -22px; left: 50%; transform: translateX(-50%);
  font-family: ${MONO};
  font-size: 8px; letter-spacing: 0.15em; text-transform: uppercase;
  white-space: nowrap; color: #6a7a82;
}

/* OUTCOMES (right) */
.aio-outcomes {
  position: absolute; right: 4%; top: 8px;
  width: 150px;
  display: flex; flex-direction: column; align-items: center;
}
.aio-outcomes-cloud { width: 140px; height: 96px; display: block; }
.aio-outcomes-icons {
  position: absolute; top: 28px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 14px; color: #1a2a30;
}
.aio-outcomes-cap {
  font-family: ${MONO};
  font-size: 8px; letter-spacing: 0.15em; text-transform: uppercase;
  color: #6a7a82; margin-top: 4px;
}

/* DASHBOARD (bottom) */
.aio-dash {
  position: absolute; left: 16%; right: 16%;
  bottom: 28px;
  background: rgba(20, 28, 32, 0.97);
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.06);
  padding: 0;
  display: grid;
  grid-template-columns: 36px 1fr;
  height: 168px;
  overflow: hidden;
  box-shadow: 0 16px 40px rgba(20,40,60,0.18);
}
.aio-dash-tabs {
  display: flex; flex-direction: column; align-items: center;
  gap: 12px; padding: 14px 0;
  background: rgba(255,255,255,0.02);
  border-right: 1px solid rgba(255,255,255,0.05);
}
.aio-dash-tab {
  width: 22px; height: 22px; border-radius: 6px;
  background: rgba(255,255,255,0.04);
  display: inline-flex; align-items: center; justify-content: center;
  color: rgba(255,255,255,0.65);
}
.aio-dash-tab:first-child { background: rgba(102,232,250,0.18); color: ${mkt.accent}; border: 1px solid rgba(102,232,250,0.32); }
.aio-dash-head {
  grid-column: 2;
  display: flex; align-items: center; gap: 6px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.aio-dash-name {
  font-size: 13px; font-weight: 700; color: #fff; letter-spacing: -0.01em;
}
.aio-dash-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: rgba(255,255,255,0.18);
}
.aio-dash-body { grid-column: 2; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
.aio-dash-row {
  height: 14px; border-radius: 4px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.05);
}
.aio-dash-row.short { width: 60%; }

@media (max-width: 640px) {
  .aio-stage { padding: 28px 18px 200px; }
  .aio-rack { width: 110px; }
  .aio-outcomes { width: 120px; }
  .aio-dash { left: 6%; right: 6%; }
}
`;
