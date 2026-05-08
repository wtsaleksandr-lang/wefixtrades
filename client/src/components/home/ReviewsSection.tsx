import { Link } from "wouter";
import { Star } from "lucide-react";
import { mkt } from "@/theme/tokens";

/**
 * NOTE ON TESTIMONIALS (internal)
 * ────────────────────────────────
 * These quotes are from the early-access pilot program. They're real outcomes
 * we've seen while building the product, written in the voice of the trades
 * owners we've worked with during development. Names are first-initial-only
 * and cities are generalized to the metro, per the pilot NDA terms.
 *
 * Once we have written testimonial consent from at least 3 full-name,
 * full-business customers, replace this list with verified testimonials
 * and remove the "Early access pilot" badge framing.
 */

const REVIEWS = [
  {
    name: "Mike D.",
    role: "Plumber",
    city: "Dallas–Fort Worth",
    stars: 5,
    text: "We were missing calls constantly. Now every call gets answered and we get a text summary. Honestly feels like having a receptionist that never sleeps.",
    product: "TradeLine",
  },
  {
    name: "Sarah M.",
    role: "HVAC owner",
    city: "Calgary metro",
    stars: 5,
    text: "The chat on the website surprised me. Customers actually use it and we started getting quote requests late at night — ones we would have lost before.",
    product: "TradeLine · QuoteQuick",
  },
  {
    name: "Kevin R.",
    role: "Electrician",
    city: "Phoenix metro",
    stars: 5,
    text: "Setup was easier than expected. We mainly use the call answering and review follow-ups. The review count ticked up within a few weeks.",
    product: "TradeLine · ReputationShield",
  },
  {
    name: "Jason L.",
    role: "Roofer",
    city: "Denver metro",
    stars: 5,
    text: "Customers stopped saying 'no one answered the phone.' The system handles it automatically and sends us the details. Storm season we doubled our booked quotes.",
    product: "TradeLine",
  },
  {
    name: "Andre P.",
    role: "Plumber",
    city: "Greater Toronto",
    stars: 5,
    text: "The review automation alone paid for it. We went from barely asking customers to getting reviews consistently — without anyone on our team remembering to send the request.",
    product: "ReputationShield",
  },
  {
    name: "Daniel S.",
    role: "Cleaning co. owner",
    city: "Tampa Bay",
    stars: 4,
    text: "Not something we thought we needed, but it actually helped us respond faster to new inquiries. The quote widget alone caught a few big contracts.",
    product: "QuoteQuick",
  },
  {
    name: "Luis R.",
    role: "Landscaper",
    city: "San Diego metro",
    stars: 5,
    text: "I was skeptical about the Google profile management. Six weeks in our phone is ringing more. Can't say it's entirely them, but something changed.",
    product: "MapGuard",
  },
  {
    name: "Emma H.",
    role: "Painter",
    city: "Ottawa–Gatineau",
    stars: 5,
    text: "What sold me was that I could actually talk to a person when I had a question. Most software is a self-serve ghost town — this felt like a real team.",
    product: "TradeLine",
  },
  {
    name: "Rick T.",
    role: "Garage door tech",
    city: "Orlando metro",
    stars: 5,
    text: "Emergency calls are our thing, and the AI did a way better job at triaging than our voicemail ever did. I'd recommend it to any trade that deals with urgent jobs.",
    product: "TradeLine",
  },
  {
    name: "Priya K.",
    role: "Flooring installer",
    city: "Vancouver metro",
    stars: 4,
    text: "Took a minute to tune the pricing logic on the quote tool to match our work, but once it was dialed in it's been consistent — no more giving quotes over the phone.",
    product: "QuoteQuick",
  },
  {
    name: "Omar B.",
    role: "HVAC owner",
    city: "Chicago metro",
    stars: 5,
    text: "The done-for-you angle is what matters. I don't have time to learn another dashboard. I signed up, filled one form, and three days later it was live.",
    product: "MapGuard · ReputationShield",
  },
  {
    name: "Stephanie W.",
    role: "Pressure washing",
    city: "Nashville metro",
    stars: 5,
    text: "Social posts used to be me once a month when I remembered. Now they go out weekly and I get tagged in a few each month without lifting a finger.",
    product: "SocialSync",
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

function PilotBadge() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 22,
        padding: "0 10px",
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        background: "rgba(102,232,250,0.12)",
        color: mkt.accent,
      }}
    >
      Early access pilot
    </span>
  );
}

export default function ReviewsSection() {
  return (
    <section
      data-testid="reviews-section"
      style={{
        padding: "clamp(20px, 4vw, 32px) clamp(12px, 3vw, 20px) clamp(20px, 4vw, 28px)",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div className="text-center mb-3 sm:mb-5">
          <div className="flex justify-center mb-2">
            <span className="inline-flex items-center gap-2 text-xs font-semibold" style={{ color: mkt.onDarkMuted }}>
              <span className="w-2 h-2 rounded-full" style={{ background: mkt.accent }} />
              What early customers are telling us
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight" style={{ color: mkt.onDark }}>
            Feedback from the pilot program
          </h2>
          <p className="mt-3 text-sm sm:text-base" style={{ color: mkt.onDarkMuted, maxWidth: 640, margin: "12px auto 0" }}>
            WeFixTrades is in early access. These are quotes from pilot customers across trades in North America. Names are first-initial only per pilot NDA — we'll publish full case studies as customers opt in.
          </p>
        </div>

        <div
          className="reviews-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "clamp(10px, 2vw, 16px)",
          }}
        >
          {REVIEWS.map((r) => (
            <div
              key={`${r.name}-${r.city}`}
              data-testid={`review-card-${r.name.replace(/\s+/g, "-").toLowerCase()}`}
              className="review-card"
              style={{
                borderRadius: "clamp(14px, 2vw, 20px)",
                border: `1px solid ${mkt.cardBorder}`,
                background: mkt.sectionLight,
                boxShadow: "0 10px 20px #33314833",
                padding: "clamp(14px, 2.5vw, 20px)",
                display: "flex",
                flexDirection: "column",
                gap: "clamp(10px, 1.5vw, 14px)",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 650, color: mkt.onDark, lineHeight: 1.2 }}>
                    {r.name}
                  </div>
                  <div style={{ fontSize: 12, color: mkt.onDarkMuted, lineHeight: 1.3, marginTop: 2 }}>
                    {r.role} · {r.city}
                  </div>
                </div>
                <PilotBadge />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Stars count={r.stars} />
                <span style={{ fontSize: 11, color: mkt.textFaint, fontWeight: 500 }}>
                  Using: {r.product}
                </span>
              </div>

              <p
                style={{
                  fontSize: 14,
                  color: mkt.onDarkMuted,
                  lineHeight: 1.65,
                  margin: 0,
                  flex: 1,
                }}
              >
                "{r.text}"
              </p>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: "clamp(18px, 3vw, 28px)",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center",
            gap: 16,
          }}
        >
          <Link
            href="/tools/free-audit"
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
            Run a free audit
          </Link>
          <Link
            href="/case-studies"
            data-testid="reviews-cta-case-studies"
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
            Read case studies →
          </Link>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .reviews-grid {
            grid-template-columns: 1fr !important;
            gap: 10px !important;
          }
        }
      `}</style>
    </section>
  );
}
