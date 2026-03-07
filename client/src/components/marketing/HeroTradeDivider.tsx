import { mkt } from "@/theme/tokens";

const TRADES = [
  "PLUMBING", "ROOFING", "ELECTRICAL", "PAINTING", "FLOORING",
  "FENCING", "DRYWALL", "CONCRETE", "CLEANING", "LANDSCAPING",
];

const SPACER = "\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0";
const rowText = TRADES.join(SPACER) + SPACER;

const ROW_CONFIG: { opacity: number; dur: string; reverse: boolean }[] = [
  { opacity: 0.16, dur: "32s", reverse: false },
  { opacity: 0.22, dur: "36s", reverse: true },
  { opacity: 0.14, dur: "40s", reverse: false },
];

export default function HeroTradeDivider() {
  return (
    <div
      data-testid="hero-trade-divider"
      className="hero-trade-divider"
      style={{
        width: "100%",
        overflow: "hidden",
        position: "relative",
        zIndex: 1,
        background: `linear-gradient(to bottom, ${mkt.bg} 0%, #2B3840 35%, #56656E 65%, #A7B6BF 100%)`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 5,
      }}
    >
      {ROW_CONFIG.map((cfg, i) => (
        <div
          key={i}
          className="hero-trade-divider__row"
          style={{
            whiteSpace: "nowrap",
            fontSize: "clamp(14px, 2vw, 20px)",
            fontWeight: 500,
            letterSpacing: "0.12em",
            color: `rgba(102,232,250,${cfg.opacity})`,
            overflow: "hidden",
            lineHeight: 1.4,
          }}
        >
          <div
            className={cfg.reverse ? "htd-scroll-right" : "htd-scroll-left"}
            style={{ display: "inline-block", animationDuration: cfg.dur }}
          >
            <span>{rowText}</span>
            <span>{rowText}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
