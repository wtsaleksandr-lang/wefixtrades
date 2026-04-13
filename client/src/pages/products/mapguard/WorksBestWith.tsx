import { Link } from "wouter";
import { Star, Share2, ArrowRight } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { HEADING_FONT, BODY_FONT, GLASS, GLASS_HOVER, sectionHeading, sectionSub, SECTION_PAD, MAX_W } from "./styles";
import { useState } from "react";

const COMPANIONS = [
  {
    icon: Star,
    name: "ReputationShield",
    tagline: "Automated review growth",
    desc: "More 5-star reviews make your Google profile stand out and rank higher. Reviews + visibility = more calls.",
    href: "/products/reputationshield",
  },
  {
    icon: Share2,
    name: "SocialSync",
    tagline: "Managed social presence",
    desc: "Active social media profiles reinforce your Google presence and keep your business top of mind locally.",
    href: "/products/socialsync",
  },
];

export default function WorksBestWith() {
  return (
    <section style={{ ...SECTION_PAD, background: mkt.bg }}>
      <div style={MAX_W}>
        <div style={{ textAlign: "center", marginBottom: 40 }} data-reveal="fade-up">
          <h2 style={sectionHeading}>
            Works Best{" "}
            <span style={{ color: mkt.accent }}>With</span>
          </h2>
          <p style={sectionSub}>
            MapGuard handles visibility. Combine it with reviews and social activity for maximum impact.
          </p>
        </div>

        <div
          className="mg-companions-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 20,
            maxWidth: 720,
            margin: "0 auto",
          }}
        >
          {COMPANIONS.map((c, i) => (
            <CompanionCard key={c.name} companion={c} delay={i * 120} />
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: 28 }} data-reveal="fade-up" data-delay="200">
          <Link
            href="/pricing"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 28px",
              borderRadius: 12,
              background: "rgba(255,255,255,0.06)",
              border: `1px solid ${mkt.border}`,
              color: mkt.onDark,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              transition: "background 0.2s ease",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
          >
            See Bundles — Save More <ArrowRight size={14} />
          </Link>
        </div>

        <style>{`
          @media (max-width: 640px) {
            .mg-companions-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    </section>
  );
}

function CompanionCard({ companion, delay }: { companion: typeof COMPANIONS[0]; delay: number }) {
  const [hovered, setHovered] = useState(false);
  const Icon = companion.icon;

  return (
    <Link href={companion.href} style={{ textDecoration: "none" }}>
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
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: mkt.accentTint,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon size={20} color={mkt.accent} strokeWidth={1.8} />
          </div>
          <div>
            <div style={{ fontFamily: HEADING_FONT, fontSize: 16, fontWeight: 700, color: mkt.text }}>{companion.name}</div>
            <div style={{ fontFamily: BODY_FONT, fontSize: 12, color: mkt.accent }}>{companion.tagline}</div>
          </div>
        </div>
        <p style={{ fontFamily: BODY_FONT, fontSize: 14, color: mkt.textMuted, lineHeight: 1.55, margin: 0 }}>
          {companion.desc}
        </p>
      </div>
    </Link>
  );
}
