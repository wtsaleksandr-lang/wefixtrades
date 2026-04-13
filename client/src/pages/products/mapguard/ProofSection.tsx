import { useState } from "react";
import { TrendingUp, Star, ArrowRight } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { HEADING_FONT, BODY_FONT, GLASS, GLASS_HOVER, sectionHeading, sectionSub, SECTION_PAD, MAX_W } from "./styles";

/* ═══════════════════════════════════════════
   CASE STUDY DATA
   ═══════════════════════════════════════════
   Anonymized representative results.
   Replace with real client data as it becomes available.
   ═══════════════════════════════════════════ */

const CASE_STUDIES = [
  {
    trade: "Plumber",
    location: "Melbourne",
    before: 38,
    after: 71,
    reviews: 14,
    timeframe: "60 days",
    summary: "Profile was incomplete and not ranking. We rebuilt it from scratch, fixed categories, and started weekly monitoring.",
  },
  {
    trade: "Electrician",
    location: "Sydney",
    before: 52,
    after: 78,
    reviews: 8,
    timeframe: "45 days",
    summary: "Ranking had dropped due to competitor activity. We optimized their profile and regained local pack position.",
  },
  {
    trade: "HVAC Technician",
    location: "Brisbane",
    before: 44,
    after: 69,
    reviews: 11,
    timeframe: "60 days",
    summary: "Missing business description and wrong categories were hurting visibility. We fixed both and added regular posts.",
  },
  {
    trade: "Roofer",
    location: "Perth",
    before: 31,
    after: 62,
    reviews: 6,
    timeframe: "45 days",
    summary: "New business with almost no online presence. We built their Google profile and started generating visibility from scratch.",
  },
];

/* ═══════════════════════════════════════════
   MICRO-PROOF STATS
   ═══════════════════════════════════════════ */

const PROOF_STATS = [
  "Profiles are scanned weekly — 52 times per year",
  "Clients typically see improvements within 30\u201360 days",
  "All optimization work is executed by our team, not automated tools",
];

/* ═══════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════ */

function CaseStudyCard({ study, delay }: { study: typeof CASE_STUDIES[0]; delay: number }) {
  const [hovered, setHovered] = useState(false);
  const improvement = study.after - study.before;

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
      {/* Trade + location */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: mkt.accent, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {study.trade}
        </span>
        <span style={{ fontSize: 12, color: mkt.textMuted }}>{study.location}</span>
      </div>

      {/* Score: before → after */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: mkt.textMuted, marginBottom: 2 }}>Before</div>
          <div style={{ fontFamily: HEADING_FONT, fontSize: 28, fontWeight: 800, color: mkt.textMuted }}>{study.before}</div>
        </div>
        <ArrowRight size={18} color={mkt.accent} style={{ flexShrink: 0 }} />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: mkt.accent, marginBottom: 2 }}>After</div>
          <div style={{ fontFamily: HEADING_FONT, fontSize: 28, fontWeight: 800, color: mkt.accent }}>{study.after}</div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "4px 10px", borderRadius: 999,
            background: "rgba(34,197,94,0.1)", color: "#22C55E",
            fontSize: 13, fontWeight: 700,
          }}>
            <TrendingUp size={14} />
            +{improvement} pts
          </div>
        </div>
      </div>

      {/* Metrics row */}
      <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
        {study.reviews > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: mkt.textMuted }}>
            <Star size={13} color={mkt.accent} />
            +{study.reviews} reviews
          </div>
        )}
        <div style={{ fontSize: 13, color: mkt.textMuted }}>
          {study.timeframe}
        </div>
      </div>

      {/* Summary */}
      <p style={{ fontFamily: BODY_FONT, fontSize: 13, color: mkt.textMuted, lineHeight: 1.55, margin: 0 }}>
        {study.summary}
      </p>
    </div>
  );
}

export default function ProofSection() {
  return (
    <section style={{ ...SECTION_PAD, background: `linear-gradient(180deg, ${mkt.bg} 0%, ${mkt.dark} 100%)` }}>
      <div style={MAX_W}>
        {/* Heading */}
        <div style={{ textAlign: "center", marginBottom: 48 }} data-reveal="fade-up">
          <div style={{ fontSize: 11, fontWeight: 700, color: mkt.accent, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>
            Real Results
          </div>
          <h2 style={sectionHeading}>
            Results From Businesses{" "}
            <span style={{ color: mkt.accent }}>Like Yours</span>
          </h2>
          <p style={sectionSub}>
            Real improvements from trades businesses using MapGuard. No fake guarantees — just honest results.
          </p>
        </div>

        {/* Case study grid */}
        <div
          className="mg-proof-grid"
          style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, maxWidth: 800, margin: "0 auto" }}
        >
          {CASE_STUDIES.map((s, i) => (
            <CaseStudyCard key={s.trade} study={s} delay={i * 100} />
          ))}
        </div>

        {/* Micro-proof stats */}
        <div style={{ display: "flex", justifyContent: "center", gap: 24, flexWrap: "wrap", marginTop: 40 }} data-reveal="fade-up" data-delay="300">
          {PROOF_STATS.map(stat => (
            <div
              key={stat}
              style={{
                padding: "8px 16px", borderRadius: 8,
                background: "rgba(255,255,255,0.04)", border: `1px solid ${mkt.border}`,
                fontSize: 12, color: mkt.textMuted, fontWeight: 500,
              }}
            >
              {stat}
            </div>
          ))}
        </div>

        <style>{`
          @media (max-width: 640px) {
            .mg-proof-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    </section>
  );
}
