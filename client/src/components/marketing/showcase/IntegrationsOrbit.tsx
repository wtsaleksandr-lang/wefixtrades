/**
 * IntegrationsOrbit — circular constellation of brand-colored tiles
 * orbiting a central "Integrations" panel. Effortel-inspired; brand tiles
 * use simple stylized letterforms in brand colors (not official logo
 * artwork) — they're identifying chips, not pixel-perfect logos.
 *
 * Usage: drop into any marketing page section to communicate the
 * platform's premium integration layer.
 */

import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

interface OrbitTile {
  /** Display label / brand name */
  label: string;
  /** Single-letter or 2-letter mark shown on the colored tile */
  mark: string;
  /** Tile fill color */
  bg: string;
  /** Mark text color (auto-contrast) */
  ink: string;
  /** Polar position: distance from center (0–1) and angle (deg, 0=top) */
  r: number;
  angle: number;
}

const TILES: OrbitTile[] = [
  { label: "Stripe",     mark: "S",  bg: "#635BFF", ink: "#fff",     r: 0.78, angle: -52 },
  { label: "OpenAI",     mark: "O",  bg: "#10A37F", ink: "#fff",     r: 0.92, angle: 30  },
  { label: "Anthropic",  mark: "A",  bg: "#D97757", ink: "#fff",     r: 0.46, angle: -98 },
  { label: "Cloudflare", mark: "CF", bg: "#F38020", ink: "#fff",     r: 0.95, angle: -132 },
  { label: "PayPal",     mark: "P",  bg: "#003087", ink: "#FFC439", r: 0.95, angle: 152 },
  { label: "Google",     mark: "G",  bg: "#1a1a1a", ink: "#fff",     r: 0.55, angle: -18 },
  { label: "DeepSeek",   mark: "DS", bg: "#4D6BFE", ink: "#fff",     r: 0.70, angle: 62  },
  { label: "xAI",        mark: "X",  bg: "#0a0a0a", ink: "#fff",     r: 0.60, angle: -160 },
];

export default function IntegrationsOrbit() {
  return (
    <div className="iorbit-wrap">
      <style>{CSS}</style>
      <div className="iorbit-stage">
        {/* Concentric rings */}
        <svg className="iorbit-rings" viewBox="0 0 600 600" aria-hidden>
          <circle cx="300" cy="300" r="120" fill="none" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 4" />
          <circle cx="300" cy="300" r="200" fill="none" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 4" />
          <circle cx="300" cy="300" r="280" fill="none" stroke="rgba(255,255,255,0.04)" strokeDasharray="3 4" />
        </svg>

        {/* Brand tiles, polar-positioned */}
        {TILES.map((t) => {
          const rad = (t.angle * Math.PI) / 180;
          const radius = t.r * 280;
          const x = Math.sin(rad) * radius;
          const y = -Math.cos(rad) * radius;
          return (
            <div
              key={t.label}
              className="iorbit-tile"
              style={{
                left: `calc(50% + ${x}px)`,
                top: `calc(50% + ${y}px)`,
                background: t.bg,
                color: t.ink,
              }}
              title={t.label}
              aria-label={t.label}
            >
              <span className="iorbit-mark">{t.mark}</span>
            </div>
          );
        })}

        {/* Central integrations panel */}
        <div className="iorbit-center">
          <div className="iorbit-center-head">
            <span className="iorbit-tab active">Integrations</span>
          </div>
          <div className="iorbit-center-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="iorbit-center-cell">
                <span className="iorbit-cell-mark" />
                <span className="iorbit-cell-bar" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.iorbit-wrap {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  background: ${mkt.bg};
  position: relative;
}
.iorbit-stage {
  position: relative;
  width: 100%;
  max-width: 640px;
  aspect-ratio: 1 / 1;
  background:
    radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px),
    radial-gradient(ellipse 60% 50% at 50% 50%, rgba(102,232,250,0.05) 0%, transparent 70%);
  background-size: 18px 18px, auto;
  border-radius: 22px;
}
.iorbit-rings {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none;
}
.iorbit-tile {
  position: absolute;
  width: 56px; height: 56px;
  margin-left: -28px; margin-top: -28px;
  border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Inter', system-ui, sans-serif;
  font-weight: 800; font-size: 20px;
  letter-spacing: -0.02em;
  box-shadow: 0 12px 28px rgba(0,0,0,0.40), 0 0 0 1px rgba(255,255,255,0.06) inset;
  transition: transform 220ms cubic-bezier(0.22,1,0.36,1);
}
.iorbit-tile:hover { transform: translate(0, -2px) scale(1.06); }
.iorbit-mark { display: inline-block; transform: translateY(-1px); }

.iorbit-center {
  position: absolute;
  left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  width: 220px; height: 220px;
  border-radius: 16px;
  background: rgba(20, 24, 27, 0.94);
  border: 1px solid rgba(255,255,255,0.10);
  box-shadow: 0 24px 60px rgba(0,0,0,0.55);
  display: flex; flex-direction: column;
  overflow: hidden;
  backdrop-filter: blur(8px);
}
.iorbit-center-head {
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  display: flex; align-items: center; gap: 8px;
}
.iorbit-tab {
  font-family: ${MONO};
  font-size: 11px; font-weight: 700; letter-spacing: 0.05em;
  color: #fff;
}
.iorbit-tab.active::before {
  content: ''; display: inline-block;
  width: 6px; height: 6px; border-radius: 50%;
  background: ${mkt.accent};
  margin-right: 6px; vertical-align: middle;
  box-shadow: 0 0 8px rgba(102,232,250,0.55);
}
.iorbit-center-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding: 10px;
}
.iorbit-center-cell {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 8px;
  padding: 8px;
  display: flex; flex-direction: column; gap: 6px; justify-content: space-between;
}
.iorbit-cell-mark {
  display: block;
  width: 14px; height: 14px;
  background: rgba(102,232,250,0.18);
  border: 1px solid rgba(102,232,250,0.32);
  border-radius: 4px;
}
.iorbit-cell-bar {
  display: block;
  width: 60%; height: 4px;
  background: rgba(255,255,255,0.10);
  border-radius: 2px;
}

@media (max-width: 540px) {
  .iorbit-stage { max-width: 100%; }
  .iorbit-tile { width: 48px; height: 48px; font-size: 16px; }
  .iorbit-center { width: 180px; height: 180px; }
}
`;
