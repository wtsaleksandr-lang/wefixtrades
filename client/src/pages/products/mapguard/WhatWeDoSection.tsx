import { Settings, RefreshCw } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { HEADING_FONT, BODY_FONT, GLASS, GLASS_HOVER, sectionHeading, sectionSub, SECTION_PAD, MAX_W } from "./styles";
import { useState } from "react";

const BLOCKS = [
  {
    icon: Settings,
    label: "SETUP (one-time)",
    title: "We rebuild your profile",
    items: [
      "Full profile audit and optimization",
      "Categories, services, photos and description",
      "Keyword tuning for your trade and area",
      "Before/after visibility report",
    ],
  },
  {
    icon: RefreshCw,
    label: "ONGOING (monthly)",
    title: "We manage and improve it",
    items: [
      "Weekly visibility monitoring and alerts",
      "Regular posts to keep your profile active",
      "We fix issues and optimize your profile continuously",
      "Monthly performance report",
    ],
  },
];

function Block({ block, delay }: { block: typeof BLOCKS[0]; delay: number }) {
  const [hovered, setHovered] = useState(false);
  const Icon = block.icon;

  return (
    <div
      data-reveal="fade-up"
      data-delay={String(delay)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...GLASS,
        padding: "36px 28px",
        transition: "transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease",
        ...(hovered ? GLASS_HOVER : {}),
        cursor: "default",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: mkt.accent,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: 16,
        }}
      >
        {block.label}
      </div>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: mkt.accentTint,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        <Icon size={20} color={mkt.accent} strokeWidth={1.8} />
      </div>
      <h3
        style={{
          fontFamily: HEADING_FONT,
          fontSize: 20,
          fontWeight: 700,
          color: mkt.text,
          marginBottom: 16,
        }}
      >
        {block.title}
      </h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {block.items.map((item) => (
          <li
            key={item}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 14,
              fontFamily: BODY_FONT,
              color: mkt.textMuted,
              lineHeight: 1.5,
            }}
          >
            <div
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: mkt.accent,
                flexShrink: 0,
              }}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function WhatWeDoSection() {
  return (
    <section
      style={{
        ...SECTION_PAD,
        background: `linear-gradient(180deg, ${mkt.dark} 0%, ${mkt.bg} 100%)`,
      }}
    >
      <div style={MAX_W}>
        <div style={{ textAlign: "center", marginBottom: 48 }} data-reveal="fade-up">
          <h2 style={sectionHeading}>
            We Fix It, Manage It,{" "}
            <span style={{ color: mkt.accent }}>and Keep It Growing.</span>
          </h2>
          <p style={sectionSub}>
            MapGuard is a fully managed service. We handle the setup, monitor your visibility, and execute improvements every month.
          </p>
        </div>

        <div
          className="mg-whatwedo-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 20,
            maxWidth: 800,
            margin: "0 auto",
          }}
        >
          {BLOCKS.map((b, i) => (
            <Block key={b.label} block={b} delay={i * 120} />
          ))}
        </div>

        <p style={{ fontSize: 14, color: mkt.textMuted, textAlign: "center", marginTop: 24, lineHeight: 1.6 }}>
          You never need to log in, learn tools, or do any of the work yourself. We handle everything and report the results to you.
        </p>

        <style>{`
          @media (max-width: 768px) {
            .mg-whatwedo-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    </section>
  );
}
