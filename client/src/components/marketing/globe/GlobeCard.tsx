import type { CSSProperties } from "react";

interface GlobeCardProps {
  stat: string;
  label: string;
  visible: boolean;
  style?: CSSProperties;
  className?: string;
}

export default function GlobeCard({ stat, label, visible, style, className }: GlobeCardProps) {
  return (
    <div
      className={`globe-card ${className || ""}`}
      style={{
        position: "absolute",
        pointerEvents: "none",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(6px)",
        transition: "opacity 0.5s ease, transform 0.5s ease",
        background: "rgba(34,40,42,0.82)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14,
        padding: "12px 16px",
        minWidth: 180,
        maxWidth: 230,
        boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
        zIndex: 10,
        ...style,
      }}
    >
      <div
        className="globe-card-stat"
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "#fff",
          lineHeight: 1.3,
          marginBottom: 4,
        }}
      >
        {stat}
      </div>
      <div
        className="globe-card-label"
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: "rgba(255,255,255,0.45)",
          lineHeight: 1.3,
        }}
      >
        {label}
      </div>
    </div>
  );
}
