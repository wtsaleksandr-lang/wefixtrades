import { Link } from "wouter";
import { Star } from "lucide-react";
import { mkt } from "@/theme/tokens";

const REVIEWS = [
  {
    name: "Mike D.",
    company: "Precision Plumbing",
    location: "Dallas, TX",
    platform: "trustpilot" as const,
    stars: 5,
    text: "We were missing calls constantly before. Now every call gets answered and we get a text summary. Honestly feels like having a receptionist that never sleeps.",
    time: "2 weeks ago",
    avatar: "https://i.pravatar.cc/150?img=12",
  },
  {
    name: "Sarah M.",
    company: "Arctic Air HVAC",
    location: "Calgary, AB",
    platform: "facebook" as const,
    stars: 5,
    text: "The chat on the website surprised me. Customers actually use it and we started getting quote requests late at night.",
    time: "1 month ago",
    avatar: "https://i.pravatar.cc/150?img=23",
  },
  {
    name: "Kevin R.",
    company: "R&K Electrical",
    location: "Phoenix, AZ",
    platform: "trustpilot" as const,
    stars: 4,
    text: "Setup was easier than expected. We mainly use the call answering and review follow-ups. Reviews increased pretty quickly.",
    time: "3 weeks ago",
    avatar: "https://i.pravatar.cc/150?img=36",
  },
  {
    name: "Jason L.",
    company: "Peak Roofing",
    location: "Denver, CO",
    platform: "facebook" as const,
    stars: 5,
    text: "Customers stopped saying 'no one answered the phone'. The system handles it automatically and sends us the details.",
    time: "2 months ago",
    avatar: "https://i.pravatar.cc/150?img=44",
  },
  {
    name: "Andre P.",
    company: "ClearFlow Plumbing",
    location: "Toronto, ON",
    platform: "trustpilot" as const,
    stars: 5,
    text: "The review automation alone paid for it. We went from barely asking customers to getting reviews consistently.",
    time: "1 month ago",
    avatar: "https://i.pravatar.cc/150?img=52",
  },
  {
    name: "Daniel S.",
    company: "Swift Cleaning Services",
    location: "Tampa, FL",
    platform: "facebook" as const,
    stars: 4,
    text: "Not something we thought we needed, but it actually helped us respond faster to new inquiries.",
    time: "3 weeks ago",
    avatar: "https://i.pravatar.cc/150?img=68",
  },
];

function Stars({ count }: { count: number }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={15}
          strokeWidth={0}
          fill={i < count ? "#F59E0B" : "rgba(255,255,255,0.15)"}
        />
      ))}
    </div>
  );
}

function PlatformBadge({ platform }: { platform: "trustpilot" | "facebook" }) {
  const isTp = platform === "trustpilot";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 22,
        padding: "0 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.02em",
        background: isTp ? "rgba(0,176,80,0.15)" : "rgba(24,119,242,0.15)",
        color: isTp ? "#4ADE80" : "#60A5FA",
      }}
    >
      {isTp ? "Trustpilot" : "Facebook Review"}
    </span>
  );
}

export default function ReviewsSection() {
  return (
    <section
      data-testid="reviews-section"
      style={{
        padding: "32px 20px 28px",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div className="text-center mb-5 sm:mb-6">
          <div className="flex justify-center mb-2">
            <span className="inline-flex items-center gap-2 text-xs font-semibold" style={{ color: mkt.textMuted }}>
              <span className="w-2 h-2 rounded-full" style={{ background: mkt.accent }} />
              Customer feedback
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight" style={{ color: mkt.text }}>
            Trusted by trades across North America
          </h2>
          <p className="mt-2 text-sm sm:text-base max-w-xl mx-auto leading-relaxed" style={{ color: mkt.textMuted }}>
            Real feedback from service businesses using WeFixTrades to capture leads,
            respond faster, and keep customers from slipping through the cracks.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 16,
          }}
        >
          {REVIEWS.map((r) => (
            <div
              key={r.name}
              data-testid={`review-card-${r.name.replace(/\s+/g, "-").toLowerCase()}`}
              style={{
                borderRadius: 20,
                border: `1px solid ${mkt.cardBorder}`,
                background: mkt.surface,
                boxShadow: "0 10px 20px #33314833",
                padding: "20px 20px 18px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <img
                  src={r.avatar}
                  alt={r.name}
                  width={44}
                  height={44}
                  style={{
                    borderRadius: "50%",
                    border: `2px solid ${mkt.border}`,
                    objectFit: "cover",
                    flexShrink: 0,
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 650, color: mkt.onDark, lineHeight: 1.2 }}>
                    {r.name}
                  </div>
                  <div style={{ fontSize: 12, color: mkt.textMuted, lineHeight: 1.3, marginTop: 2 }}>
                    {r.company} · {r.location}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Stars count={r.stars} />
                <PlatformBadge platform={r.platform} />
              </div>

              <p
                style={{
                  fontSize: 14,
                  color: mkt.textMuted,
                  lineHeight: 1.65,
                  margin: 0,
                  flex: 1,
                }}
              >
                "{r.text}"
              </p>

              <div style={{ fontSize: 12, color: mkt.textFaint }}>
                {r.time}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 28,
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center",
            gap: 16,
          }}
        >
          <Link
            href="/Wizard"
            data-testid="reviews-cta-start"
            className="mkt-btn-primary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 48,
              padding: "0 28px",
              fontSize: 15,
              fontWeight: 500,
              textDecoration: "none",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Start Free
          </Link>
          <Link
            href="/plans"
            data-testid="reviews-cta-plans"
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: mkt.accent,
              textDecoration: "none",
              transition: "opacity 0.15s ease",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.75"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
          >
            View Plans →
          </Link>
        </div>
      </div>
    </section>
  );
}
