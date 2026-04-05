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
  { icon: MapPin, title: "Show up when customers search nearby", desc: "Appear in Google Maps results for your services and service area." },
  { icon: Phone, title: "Get more calls without paying for ads", desc: "Organic visibility that brings in leads every month." },
  { icon: ShieldCheck, title: "Build trust before they even click", desc: "Reviews, photos, and activity make customers choose you." },
  { icon: CalendarCheck, title: "Stay active and visible every week", desc: "Regular posts and updates keep your profile fresh." },
  { icon: Trophy, title: "Beat competitors in your area", desc: "Optimized profiles outrank incomplete ones." },
  { icon: UserCheck, title: "Everything handled for you", desc: "We do the work. You focus on the job." },
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
            What You Get{" "}
            <span style={{ color: mkt.accent }}>With MapGuard</span>
          </h2>
          <p style={sectionSub}>
            No jargon. No complicated tools. Simple outcomes for your business.
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
