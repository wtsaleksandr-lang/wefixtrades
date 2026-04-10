import { useState } from "react";
import { MapPin, Phone, ShieldCheck, CalendarCheck, Trophy, UserCheck } from "lucide-react";
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

const BENEFITS = [
  { icon: MapPin, title: "Show up when customers search nearby", desc: "We optimize your profile so you appear in Google Maps when people search for your trade in your area." },
  { icon: Phone, title: "More calls without running ads", desc: "Organic Google Maps visibility brings in leads every month without ad spend." },
  { icon: ShieldCheck, title: "Problems detected and fixed for you", desc: "Our monitoring catches ranking drops, review issues, and profile problems \u2014 and our team fixes them." },
  { icon: CalendarCheck, title: "Your profile stays active and fresh", desc: "Regular posts and profile updates keep your listing engaged and performing." },
  { icon: Trophy, title: "Stay ahead of local competitors", desc: "We track your competitors and adjust your strategy so you maintain your position." },
  { icon: UserCheck, title: "Fully managed \u2014 you do nothing", desc: "We handle the optimization, monitoring, fixes, and reporting. You focus on running your business." },
];

function BenefitCard({ benefit, delay }: { benefit: typeof BENEFITS[0]; delay: number }) {
  const [hovered, setHovered] = useState(false);
  const Icon = benefit.icon;

  return (
    <div
      data-reveal="fade-up"
      data-delay={String(delay)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...GLASS,
        padding: "28px 24px",
        transition: "transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease",
        ...(hovered ? GLASS_HOVER : {}),
        cursor: "default",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
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
          fontSize: 17,
          fontWeight: 700,
          color: mkt.text,
          marginBottom: 6,
        }}
      >
        {benefit.title}
      </h3>
      <p
        style={{
          fontFamily: BODY_FONT,
          fontSize: 14,
          color: mkt.textMuted,
          lineHeight: 1.55,
          margin: 0,
        }}
      >
        {benefit.desc}
      </p>
    </div>
  );
}

export default function FeaturesGrid() {
  return (
    <section style={{ ...SECTION_PAD, background: mkt.bg }}>
      <div style={MAX_W}>
        <div style={{ textAlign: "center", marginBottom: 48 }} data-reveal="fade-up">
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: mkt.accent,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            Benefits
          </div>
          <h2 style={sectionHeading}>
            What MapGuard{" "}
            <span style={{ color: mkt.accent }}>Does For You</span>
          </h2>
          <p style={sectionSub}>
            No tools to learn. No work on your end. Just results delivered to you every month.
          </p>
        </div>

        <div
          className="mapguard-features-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
          }}
        >
          {BENEFITS.map((b, i) => (
            <BenefitCard key={b.title} benefit={b} delay={i * 80} />
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
