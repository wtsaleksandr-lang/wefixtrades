/**
 * ArchitectureCardTradeLine — "How it connects" visual for the TradeLine
 * product page.
 *
 * Adapted from workspace/architecture-card-premium.jsx:
 *   - Top pill:      "YOUR BUSINESS"
 *   - Center card:   Bot / Sparkles lucide icon  (TradeLine AI)
 *   - Center label:  "TRADELINE AI"
 *   - Side tiles:    Phone (left) + CalendarDays (right)
 *   - Accent colour: mkt.accent (#0d3cfc — fix-blue)  replaces original cyan
 *   - Surface:       premium dark — matches marketing dark chrome
 *
 * Animation fix: @keyframes are hoisted to a single module-level <style>
 * block using React.useId() so multiple mounts never duplicate them.
 */

import { useId } from "react";
import { Bot, Phone, CalendarDays } from "lucide-react";
import { mkt } from "@/theme/tokens";

const MONO = "'Et Mono', 'DM Mono', monospace";

// Dark-teal premium surface — kept from the original
const SURFACE       = "#1d2a30";
const SURFACE_TOP   = "#26363c";

// Accent: fix-blue (#0d3cfc) replaces the original cyan (#66e8fa)
const BEAM_COLOR  = mkt.accent;         // #0d3cfc
const DASH_COLOR  = "rgba(13,60,252,0.32)";
const DISC_COLOR  = "rgba(13,60,252,0.18)";
const PILL_FILL   = mkt.accent;         // #0d3cfc
const PILL_TEXT   = "#FFFFFF";
const PILL_ICON_BG = "#0b34d6";         // slightly darker for icon circle

const CENTER_CARD_BG = "rgba(245, 250, 255, 0.92)";
const CENTER_ICON_COLOR = "#0d3cfc";
const CENTER_LABEL_COLOR = "rgba(13, 30, 80, 0.70)";
const ICON_BOX_BG    = "rgba(255,255,255,0.06)";
const ICON_BOX_COLOR = "#c5d4ff";

// Geometry constants
const WIDTH  = 380;
const HEIGHT = 460;
const R      = 18;

const PILL_TOP = 36;
const PILL_W   = 156;
const PILL_H   = 44;

const CONNECTOR_TOP = PILL_TOP + PILL_H + 8;
const CONNECTOR_LEN = 122;
const CENTER_TOP    = CONNECTOR_TOP + CONNECTOR_LEN + 8;
const CENTER_SIZE   = 132;
const LABEL_TOP     = CENTER_TOP + CENTER_SIZE + 18;

const ICON_BOX_SIZE = 46;
const ICON_BOX_Y    = CENTER_TOP + (CENTER_SIZE - ICON_BOX_SIZE) / 2;

const DOT_SIZE   = 8;
const BEAM_TRAVEL = CONNECTOR_LEN - DOT_SIZE - 4;

const DISC_RX = WIDTH  * 0.92;
const DISC_RY = HEIGHT * 0.46;
const DISC_CY = HEIGHT - 150 + DISC_RY;

export default function ArchitectureCardTradeLine() {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

  const beamAnim  = `archTL-beam-${uid}`;
  const pulseAnim = `archTL-pulse-${uid}`;
  const discAnim  = `archTL-disc-${uid}`;
  const discId    = `discGrad-${uid}`;

  return (
    <div
      role="img"
      aria-label="Your Business connected to TradeLine AI"
      style={{
        position: "relative",
        width: WIDTH,
        height: HEIGHT,
        background: `linear-gradient(180deg, ${SURFACE_TOP} 0%, ${SURFACE} 60%, ${SURFACE} 100%)`,
        borderRadius: R,
        overflow: "hidden",
        fontFamily: "Inter, -apple-system, system-ui, sans-serif",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.06) inset, 0 0 0 1px rgba(255,255,255,0.04) inset, 0 24px 60px -20px rgba(0,0,0,0.55), 0 4px 14px -6px rgba(0,0,0,0.45)",
        flexShrink: 0,
      }}
    >
      {/* Scoped keyframes — one <style> per mounted instance, keyed by uid */}
      <style data-theme="dark">{`
        @keyframes ${beamAnim} {
          0%   { transform: translate(-50%, 0);                  opacity: 0.4; }
          8%   {                                                  opacity: 1;   }
          50%  { transform: translate(-50%, ${BEAM_TRAVEL}px);   opacity: 1;   }
          92%  {                                                  opacity: 1;   }
          100% { transform: translate(-50%, 0);                  opacity: 0.4; }
        }
        @keyframes ${pulseAnim} {
          0%, 100% { box-shadow: 0 0 8px ${BEAM_COLOR}, 0 0 14px ${BEAM_COLOR}66, 0 0 22px ${BEAM_COLOR}33; }
          50%      { box-shadow: 0 0 14px ${BEAM_COLOR}, 0 0 28px ${BEAM_COLOR}aa, 0 0 44px ${BEAM_COLOR}55; }
        }
        @keyframes ${discAnim} {
          0%, 100% { opacity: 0.85; transform: translateY(0);   }
          50%      { opacity: 1;    transform: translateY(-3px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .archTL-beam-${uid}, .archTL-disc-${uid} { animation: none !important; }
        }
      `}</style>

      {/* Inner highlight overlay */}
      <div aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: `
          radial-gradient(120% 70% at 50% -20%, rgba(255,255,255,0.10), rgba(255,255,255,0) 55%),
          radial-gradient(80% 50% at 50% 110%, rgba(0,0,0,0.30), rgba(0,0,0,0) 60%)
        `,
      }} />
      {/* Hairline inner stroke */}
      <div aria-hidden style={{
        position: "absolute", inset: 0, borderRadius: R, pointerEvents: "none",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05)",
      }} />

      {/* Bottom ambient bloom */}
      <svg
        aria-hidden
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className={`archTL-disc-${uid}`}
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%",
          pointerEvents: "none",
          animation: `${discAnim} 3s ease-in-out infinite`,
        }}
      >
        <defs>
          <radialGradient id={discId} cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor={DISC_COLOR} stopOpacity="1" />
            <stop offset="55%"  stopColor={DISC_COLOR} stopOpacity="0.55" />
            <stop offset="100%" stopColor={DISC_COLOR} stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx={WIDTH / 2} cy={DISC_CY} rx={DISC_RX} ry={DISC_RY} fill={`url(#${discId})`} />
        <ellipse cx={WIDTH / 2} cy={DISC_CY} rx={DISC_RX} ry={DISC_RY}
          fill="none" stroke={BEAM_COLOR} strokeOpacity="0.22" strokeWidth="1" />
      </svg>

      {/* Top pill: "YOUR BUSINESS" */}
      <div style={{
        position: "absolute",
        top: PILL_TOP,
        left: "50%",
        transform: "translateX(-50%)",
        width: PILL_W,
        height: PILL_H,
        borderRadius: PILL_H / 2,
        background: `linear-gradient(180deg, ${PILL_FILL} 0%, ${PILL_FILL} 65%, rgba(0,0,0,0.06) 100%), ${PILL_FILL}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 6px 0 18px",
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.30), inset 0 -1px 0 rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.20), 0 0 18px ${BEAM_COLOR}33`,
      }}>
        <span style={{
          color: PILL_TEXT,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.10em",
          fontFamily: MONO,
          textTransform: "uppercase",
        }}>
          YOUR BUSINESS
        </span>
        <div style={{
          width: PILL_H - 8,
          height: PILL_H - 8,
          borderRadius: "50%",
          background: PILL_ICON_BG,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(255,255,255,0.04)",
        }}>
          <Phone size={16} color={PILL_TEXT} strokeWidth={1.8} />
        </div>
      </div>

      {/* Dashed connector */}
      <div aria-hidden style={{
        position: "absolute",
        top: CONNECTOR_TOP,
        left: "50%",
        transform: "translateX(-50%)",
        width: 2,
        height: CONNECTOR_LEN,
      }}>
        <svg width={2} height={CONNECTOR_LEN} style={{ overflow: "visible", display: "block" }}>
          <line x1={1} y1={0} x2={1} y2={CONNECTOR_LEN}
            stroke={DASH_COLOR} strokeWidth={1.5}
            strokeDasharray="1.5 6" strokeLinecap="round"
          />
        </svg>
        {/* Traveling glow dot */}
        <div style={{
          position: "absolute",
          top: 2,
          left: "50%",
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: "50%",
          background: BEAM_COLOR,
          transform: "translateX(-50%)",
          animation: `${beamAnim} 2.6s cubic-bezier(0.45,0,0.55,1) infinite, ${pulseAnim} 1.3s ease-in-out infinite`,
          willChange: "transform",
        }} />
      </div>

      {/* Side icon tiles */}
      {([
        { side: "left",  icon: <Phone      size={20} color={ICON_BOX_COLOR} strokeWidth={1.6} /> },
        { side: "right", icon: <CalendarDays size={20} color={ICON_BOX_COLOR} strokeWidth={1.6} /> },
      ] as const).map(({ side, icon }) => (
        <div key={side} style={{
          position: "absolute",
          top: ICON_BOX_Y,
          ...(side === "left" ? { left: 36 } : { right: 36 }),
          width: ICON_BOX_SIZE,
          height: ICON_BOX_SIZE,
          borderRadius: 12,
          background: ICON_BOX_BG,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), inset 0 0 0 1px rgba(255,255,255,0.06), 0 6px 14px rgba(0,0,0,0.18)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}>
          {icon}
        </div>
      ))}

      {/* Center card: TradeLine AI */}
      <div style={{
        position: "absolute",
        top: CENTER_TOP,
        left: "50%",
        transform: "translateX(-50%)",
        width: CENTER_SIZE,
        height: CENTER_SIZE,
        borderRadius: 22,
        background: `linear-gradient(180deg, ${CENTER_CARD_BG} 0%, rgba(220,232,255,0.86) 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.85), inset 0 0 0 1px rgba(255,255,255,0.4), 0 2px 4px rgba(0,0,0,0.10), 0 18px 40px -10px rgba(0,0,0,0.45), 0 0 0 4px ${BEAM_COLOR}0f`,
      }}>
        <Bot size={32} color={CENTER_ICON_COLOR} strokeWidth={1.4} />
      </div>

      {/* Center label */}
      <div style={{
        position: "absolute",
        top: LABEL_TOP,
        left: 0,
        right: 0,
        textAlign: "center",
        color: CENTER_LABEL_COLOR,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.18em",
        fontFamily: MONO,
        textTransform: "uppercase",
      }}>
        TRADELINE AI
      </div>
    </div>
  );
}
