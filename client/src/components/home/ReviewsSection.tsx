import { Link } from "wouter";
import { Star } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { HorizontalCarousel } from "@/components/marketing/HorizontalCarousel";

/**
 * Customer testimonials. Wave L H3 — stripped all "pilot program" / "early
 * access" / "founding customer" framing; we ship as a finished product. Names
 * remain first-initial-only per the customer NDAs collected during onboarding.
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

export default function ReviewsSection() {
  return (
    <section
      data-testid="reviews-section"
      style={{
        /* P2 UX — vertical padding trimmed ~40% (was ~32px top / 28px bottom
         * via clamp(); now ~20px top / 16px bottom). Section above ends
         * with its own padding so this can be tighter without crowding. */
        padding: "clamp(12px, 2.5vw, 20px) clamp(12px, 3vw, 20px) clamp(10px, 2vw, 16px)",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Carousel header bar — heading on the left, prev/next arrows on
         * the right (same arrows used on the blog page + per-product
         * Reviews row). The row keeps its scroll-snap + edge-bleed
         * margins via HorizontalCarousel's rowStyle prop so the visual
         * doesn't regress vs. the pre-carousel layout. */}
        <HorizontalCarousel
          arrowTheme="dark"
          rowClassName="reviews-grid reviews-grid--scroll"
          data-testid="reviews-carousel"
          heading={
            <h2
              className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight leading-tight whitespace-nowrap"
              style={{ color: mkt.onDark, margin: 0 }}
            >
              What customers say
            </h2>
          }
          rowStyle={{
            /* Wave AE — horizontal scroller (was a vertical grid that grew
               into a "long sheet" as more reviews landed). Each card snaps
               to the start of the scroll port; cards keep a generous fixed
               width so two are visible on desktop and the next peeks in. */
            gap: "clamp(10px, 2vw, 16px)",
            paddingBottom: 6,
            /* Negative side margins so the scroller can bleed into the
               container padding on mobile and feel edge-aligned. */
            marginLeft: "calc(clamp(12px, 3vw, 20px) * -1)",
            marginRight: "calc(clamp(12px, 3vw, 20px) * -1)",
            paddingLeft: "clamp(12px, 3vw, 20px)",
            paddingRight: "clamp(12px, 3vw, 20px)",
          }}
        >
          {REVIEWS.map((r) => (
            <div
              key={`${r.name}-${r.city}`}
              data-testid={`review-card-${r.name.replace(/\s+/g, "-").toLowerCase()}`}
              className="review-card"
              style={{
                /* Fixed flex width — desktop sees ~3 cards at a time, mobile
                   sees one with the next peeking past the right edge. */
                flex: "0 0 clamp(280px, 78vw, 360px)",
                scrollSnapAlign: "start",
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
                {/* Wave L H3 — pilot badge removed entirely. */}
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
        </HorizontalCarousel>

        {/* Wave L H3 — CTA row. Wave G mobile-fit pattern: flex:1 + min-w:0 +
         * shrink labels so both CTAs sit on a single line on small screens. */}
        <div
          className="reviews-cta-row"
          style={{
            marginTop: "clamp(18px, 3vw, 28px)",
            display: "flex",
            flexWrap: "nowrap",
            justifyContent: "center",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Link
            href="/tools/free-audit"
            data-testid="reviews-cta-start"
            className="mkt-btn-primary reviews-cta-btn"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 48,
              padding: "0 18px",
              fontSize: 15,
              fontWeight: 500,
              textDecoration: "none",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              flex: "1 1 0",
              minWidth: 0,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            Run a free audit
          </Link>
          <Link
            href="/case-studies"
            data-testid="reviews-cta-case-studies"
            className="reviews-cta-secondary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              /* P2 UX — outline-style button so it visually reads as a
               * button (was unstyled text, hard to distinguish from the
               * solid primary next to it). Height + radius match the
               * primary CTA above; padding bumped slightly to compensate
               * for the 1px border so the two CTAs align in height. */
              height: 48,
              padding: "0 18px",
              fontSize: 15,
              fontWeight: 600,
              /* Wave AE-3 — brand blue (#0d3cfc) on the dark slate review
               * card surface (rgb(36,45,48)) computed to a 2.06 ratio, well
               * below WCAG AA. Flip to mkt.onDark (near-white) which sits
               * comfortably above the 4.5 threshold and keeps the secondary
               * link visually distinct from the cream primary CTA next to it. */
              color: mkt.onDark,
              textDecoration: "none",
              background: "transparent",
              border: "1px solid rgba(255, 255, 255, 0.18)",
              borderRadius: 10,
              transition: "border-color 0.15s ease, background 0.15s ease",
              flex: "1 1 0",
              minWidth: 0,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.borderColor = "rgba(255, 255, 255, 0.32)";
              el.style.background = "rgba(255, 255, 255, 0.04)";
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.borderColor = "rgba(255, 255, 255, 0.18)";
              el.style.background = "transparent";
            }}
          >
            Read case studies →
          </Link>
        </div>
      </div>

      <style>{`
        /* Wave L H3 — testimonial containers wider on mobile (full content
         * width minus 16px symmetric padding) — already mostly true via
         * clamp() above; reinforce here so the auto-fit doesn't shrink past
         * single-column on phones. */
        @media (max-width: 640px) {
          .reviews-grid {
            grid-template-columns: 1fr !important;
            gap: 10px !important;
          }
          .review-card {
            margin-left: 0 !important;
            margin-right: 0 !important;
          }
          /* Mobile: shrink CTA labels if needed to keep them on one line. */
          .reviews-cta-btn,
          .reviews-cta-secondary {
            font-size: 13px !important;
            padding-left: 10px !important;
            padding-right: 10px !important;
            letter-spacing: 0.02em !important;
          }
        }
      `}</style>
    </section>
  );
}
