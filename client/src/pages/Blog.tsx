import { useEffect } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt, shadows } from "@/theme/tokens";
import { ArrowRight } from "lucide-react";

const PLACEHOLDER_POSTS = [
  { title: "5 Ways to Turn Website Visitors into Booked Jobs", category: "Growth", date: "Coming Soon" },
  { title: "Why Every Plumber Needs an Instant Quote Widget", category: "Product", date: "Coming Soon" },
  { title: "Google Maps Ranking: The Trades Business Playbook", category: "SEO", date: "Coming Soon" },
  { title: "How to Automate Follow-Ups Without Losing the Personal Touch", category: "Automation", date: "Coming Soon" },
  { title: "Reputation Management 101 for Home-Service Pros", category: "Marketing", date: "Coming Soon" },
  { title: "The True Cost of Not Having an Online Booking System", category: "Strategy", date: "Coming Soon" },
];

export default function BlogPage() {
  useEffect(() => {
    document.title = "Blog — WeFixTrades";
  }, []);

  return (
    <MarketingLayout>
      <div
        data-testid="section-blog-hero"
        style={{
          background: `linear-gradient(135deg, ${mkt.dark}, ${mkt.darkHover})`,
          padding: "100px 24px 60px",
          textAlign: "center",
        }}
      >
        <h1
          data-testid="text-blog-title"
          style={{
            fontSize: "clamp(32px, 5vw, 48px)",
            fontWeight: 700,
            color: mkt.onDark,
            margin: "0 0 16px",
            letterSpacing: "-0.025em",
          }}
        >
          Blog
        </h1>
        <p
          data-testid="text-blog-subtitle"
          style={{ fontSize: 18, color: mkt.onDarkMuted, margin: 0, maxWidth: 560, marginInline: "auto" }}
        >
          Tips, strategies, and product updates to help your trades business grow.
        </p>
      </div>

      <section
        data-testid="section-blog-posts"
        style={{ background: mkt.surface, padding: "60px 24px" }}
      >
        <div
          style={{
            maxWidth: 1120,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 24,
          }}
        >
          {PLACEHOLDER_POSTS.map((post, i) => (
            <div
              key={i}
              data-testid={`card-blog-post-${i}`}
              style={{
                background: mkt.bg,
                borderRadius: 16,
                boxShadow: shadows.card,
                border: `1px solid ${mkt.border}`,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  height: 160,
                  borderRadius: "16px 16px 0 0",
                  background: `linear-gradient(135deg, ${mkt.accentTint}, ${mkt.surface})`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: mkt.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {post.category}
                </span>
              </div>
              <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                <span style={{ fontSize: 12, color: mkt.textMuted, fontWeight: 500 }}>{post.date}</span>
                <h3 style={{ fontSize: 17, fontWeight: 650, color: mkt.text, margin: 0, lineHeight: 1.3 }}>{post.title}</h3>
                <div style={{ flex: 1 }} />
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 13,
                    fontWeight: 600,
                    color: mkt.accent,
                  }}
                >
                  Read More <ArrowRight size={13} />
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        data-testid="section-blog-cta"
        style={{ padding: "60px 24px", textAlign: "center" }}
      >
        <h2 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, color: mkt.text, margin: "0 0 12px", letterSpacing: "-0.02em" }}>
          Stay in the loop
        </h2>
        <p style={{ fontSize: 16, color: mkt.textMuted, margin: "0 0 28px", maxWidth: 480, marginInline: "auto" }}>
          New articles and product updates are on the way. Check back soon.
        </p>
        <Link
          href="/"
          data-testid="link-blog-home"
          style={{
            display: "inline-block",
            padding: "12px 28px",
            borderRadius: 14,
            background: mkt.dark,
            color: mkt.onDark,
            fontSize: 15,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Back to Home
        </Link>
      </section>
    </MarketingLayout>
  );
}
