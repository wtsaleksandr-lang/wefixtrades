import { useState } from "react";
import { Settings, Eye, Star, TrendingUp } from "lucide-react";
import { mkt } from "@/theme/tokens";
import {
  HEADING_FONT,
  BODY_FONT,
  GLASS,
  GLASS_HOVER,
  sectionHeading,
  sectionSub,
  SECTION_PAD,
  MAX_W,
} from "./styles";

const FEATURES = [
  {
    icon: Settings,
    title: "Profile Optimization",
    desc: "We fully optimize your Google profile so it performs properly.",
    bullets: [
      "Business info setup (categories, services, areas)",
      "Keyword optimization for your trade",
      "Service descriptions written for conversions",
      "Images and content setup",
    ],
  },
  {
    icon: Eye,
    title: "Visibility Boost",
    desc: "We improve how often your business appears in searches.",
    bullets: [
      "Location relevance tuning",
      "Service-area targeting",
      "Competitor gap adjustments",
      "Search visibility improvements",
    ],
  },
  {
    icon: Star,
    title: "Reviews & Reputation",
    desc: "We help you build trust where it matters.",
    bullets: [
      "Review strategy setup",
      "Response templates (done for you)",
      "Rating improvement guidance",
    ],
  },
  {
    icon: TrendingUp,
    title: "Ongoing Growth",
    desc: "Keep your listing active and improving.",
    bullets: [
      "Regular updates",
      "Performance tracking",
      "Continuous improvements",
    ],
  },
];

function FeatureCard({
  feature,
  delay,
}: {
  feature: (typeof FEATURES)[0];
  delay: number;
}) {
  const [hovered, setHovered] = useState(false);
  const Icon = feature.icon;

  return (
    <div
      data-reveal="fade-up"
      data-delay={String(delay)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...GLASS,
        padding: "32px 28px",
        transition: "transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease",
        ...(hovered ? GLASS_HOVER : {}),
        cursor: "default",
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          background: mkt.accentTint,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 20,
        }}
      >
        <Icon size={22} color={mkt.accent} strokeWidth={1.8} />
      </div>

      <h3
        style={{
          fontFamily: HEADING_FONT,
          fontSize: 20,
          fontWeight: 700,
          color: mkt.text,
          marginBottom: 8,
        }}
      >
        {feature.title}
      </h3>

      <p
        style={{
          fontFamily: BODY_FONT,
          fontSize: 14,
          color: mkt.textMuted,
          lineHeight: 1.6,
          marginBottom: 16,
        }}
      >
        {feature.desc}
      </p>

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {feature.bullets.map((b) => (
          <li
            key={b}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              fontSize: 13,
              color: mkt.textFaint,
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
                marginTop: 6,
              }}
            />
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function FeaturesGrid() {
  return (
    <section style={{ ...SECTION_PAD, background: mkt.bg }}>
      <div style={MAX_W}>
        <div style={{ textAlign: "center", marginBottom: 48 }} data-reveal="fade-up">
          <h2 style={sectionHeading}>
            Everything Your Business Needs
            <br />
            <span style={{ color: mkt.accent }}>to Show Up Locally</span>
          </h2>
          <p style={sectionSub}>
            No jargon, no complicated tools. We handle everything so you can
            focus on your work.
          </p>
        </div>

        <div
          className="mapguard-features-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 20,
          }}
        >
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.title} feature={f} delay={i * 100} />
          ))}
        </div>

        <style>{`
          @media (max-width: 768px) {
            .mapguard-features-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>
    </section>
  );
}
