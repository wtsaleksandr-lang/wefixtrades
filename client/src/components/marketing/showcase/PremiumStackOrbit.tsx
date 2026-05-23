/**
 * PremiumStackOrbit — concentric-orbit composition with the client's
 * business at the center and the suppliers/tools we use orbiting around.
 * Brand tiles use stylized letter marks in brand colors (not official
 * logo artwork) — they're identifying chips, not pixel-perfect logos.
 */

import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";
import { Wrench } from "lucide-react";

interface OrbitTile {
  label: string;
  mark: string;
  bg: string;
  ink: string;
  r: number;
  angle: number;
}

const TILES: OrbitTile[] = [
  { label: "Anthropic",  mark: "A",  bg: "#D97757", ink: "#fff",     r: 0.92, angle: -38 },
  { label: "OpenAI",     mark: "O",  bg: "#10A37F", ink: "#fff",     r: 0.55, angle: 64  },
  { label: "Vapi",       mark: "V",  bg: "#5DFF6F", ink: "#0a1018", r: 0.76, angle: -110 },
  { label: "Cloudflare", mark: "CF", bg: "#F38020", ink: "#fff",     r: 0.92, angle: 132 },
  { label: "Stripe",     mark: "S",  bg: "#635BFF", ink: "#fff",     r: 0.62, angle: 168 },
  { label: "Twilio",     mark: "T",  bg: "#F22F46", ink: "#fff",     r: 0.55, angle: -154 },
  { label: "Google",     mark: "G",  bg: "#1a1a1a", ink: "#fff",     r: 0.86, angle: 30  },
];

export default function PremiumStackOrbit() {
  return (
    <div data-theme="dark" className="psorbit-wrap">
      <style>{CSS}</style>
      <div className="psorbit-card">
        {/* LEFT — orbit */}
        <div className="psorbit-stage">
          <svg className="psorbit-rings" viewBox="0 0 600 600" aria-hidden>
            <circle cx="300" cy="300" r="100" fill="none" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 4" />
            <circle cx="300" cy="300" r="180" fill="none" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 4" />
            <circle cx="300" cy="300" r="260" fill="none" stroke="rgba(255,255,255,0.04)" strokeDasharray="3 4" />
          </svg>

          {/* Center — client business */}
          <div className="psorbit-center">
            <div className="psorbit-center-ring" />
            <div className="psorbit-center-tile">
              <Wrench size={22} strokeWidth={1.6} />
            </div>
          </div>

          {/* Brand tiles */}
          {TILES.map((t) => {
            const rad = (t.angle * Math.PI) / 180;
            const radius = t.r * 220;
            const x = Math.sin(rad) * radius;
            const y = -Math.cos(rad) * radius;
            return (
              <div
                key={t.label}
                className="psorbit-tile"
                style={{
                  left: `calc(50% + ${x}px)`,
                  top: `calc(50% + ${y}px)`,
                  background: t.bg,
                  color: t.ink,
                }}
                title={t.label}
                aria-label={t.label}
              >
                <span>{t.mark}</span>
              </div>
            );
          })}
        </div>

        {/* RIGHT — copy */}
        <div className="psorbit-right">
          <h3 className="psorbit-head">Premium stack, fully integrated</h3>
          <p className="psorbit-copy">
            Your business runs on the same enterprise-grade infrastructure that powers global SaaS — Anthropic + OpenAI for AI, Vapi for voice, Cloudflare at the edge, Stripe + Twilio for ops. We wire it together, you get the leverage without the integration tax.
          </p>
          <span className="psorbit-num">07</span>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.psorbit-wrap {
  padding: 48px 24px;
  background: ${mkt.bg};
  display: flex; justify-content: center;
}
.psorbit-card {
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
.psorbit-stage {
  position: relative;
  aspect-ratio: 1 / 1;
  min-height: 380px;
}
.psorbit-rings { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }

.psorbit-center {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
  width: 96px; height: 96px;
}
.psorbit-center-ring {
  position: absolute; inset: -10px;
  border-radius: 50%;
  border: 2px solid rgba(13,60,252,0.55);
  box-shadow: 0 0 24px rgba(13,60,252,0.30), inset 0 0 14px rgba(13,60,252,0.12);
}
.psorbit-center-tile {
  position: absolute; inset: 0;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, rgba(13,60,252,0.30), rgba(20,24,27,0.95) 70%);
  border: 1px solid rgba(13,60,252,0.50);
  display: flex; align-items: center; justify-content: center;
  color: ${mkt.accent};
  box-shadow: 0 18px 40px rgba(0,0,0,0.45);
}

.psorbit-tile {
  position: absolute;
  width: 50px; height: 50px;
  margin-left: -25px; margin-top: -25px;
  border-radius: 13px;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Inter', system-ui, sans-serif;
  font-weight: 800; font-size: 18px;
  letter-spacing: -0.02em;
  box-shadow: 0 10px 24px rgba(0,0,0,0.40), 0 0 0 1px rgba(255,255,255,0.06) inset;
  transition: transform 220ms cubic-bezier(0.22,1,0.36,1);
}
.psorbit-tile:hover { transform: translate(0, -2px) scale(1.06); }

.psorbit-right {
  padding: 36px 32px;
  background: rgba(0,0,0,0.18);
  border-left: 1px solid rgba(255,255,255,0.05);
  position: relative;
  display: flex; flex-direction: column;
}
.psorbit-head { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; color: #fff; margin: 0 0 14px; line-height: 1.2; }
.psorbit-copy { font-size: 14px; line-height: 1.6; color: rgba(255,255,255,0.65); margin: 0; }
.psorbit-num {
  position: absolute; right: 28px; bottom: 24px;
  font-family: ${MONO}; font-size: 14px; font-weight: 700;
  letter-spacing: 0.10em; color: rgba(255,255,255,0.18);
}

@media (max-width: 880px) {
  .psorbit-card { grid-template-columns: 1fr; }
  .psorbit-stage { min-height: 320px; }
}
`;
