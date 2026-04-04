import { useState } from "react";
import { Calculator, Users, Palette, Code2 } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { HEADING_FONT, BODY_FONT, GLASS, GLASS_HOVER, sectionHeading, sectionSub, SECTION_PAD, MAX_W } from "./styles";

const FEATURES = [
  {
    icon: Calculator,
    title: "Instant Estimates",
    desc: "Customers answer a few questions and see their price immediately.",
    bullets: [
      "10 pricing models (hourly, per sqft, packages, and more)",
      "Add-ons, difficulty tiers, and travel fees",
      "Prices update in real time as inputs change",
    ],
  },
  {
    icon: Users,
    title: "Lead Capture",
    desc: "Every quote becomes a lead with full contact details.",
    bullets: [
      "Name, email, phone collected automatically",
      "Quote amount and selections included",
      "Leads sent to your inbox instantly",
    ],
  },
  {
    icon: Palette,
    title: "Custom Branding",
    desc: "Match your website's look and feel.",
    bullets: [
      "Your business name and logo",
      "Custom colors and styling",
      "Professional appearance on any site",
    ],
  },
  {
    icon: Code2,
    title: "Embed Anywhere",
    desc: "Add to any website with one line of code.",
    bullets: [
      "Works with WordPress, Wix, Squarespace, and more",
      "Mobile-optimized automatically",
      "No coding or developer needed",
    ],
  },
];

function FeatureCard({ feature, delay }: { feature: (typeof FEATURES)[0]; delay: number }) {
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
            Everything You Need to
            <br />
            <span style={{ color: mkt.accent }}>Convert More Visitors</span>
          </h2>
          <p style={sectionSub}>
            A complete quoting tool that captures leads while you focus on jobs.
          </p>
        </div>

        <div
          className="qq-features-grid"
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
            .qq-features-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>
    </section>
  );
}
