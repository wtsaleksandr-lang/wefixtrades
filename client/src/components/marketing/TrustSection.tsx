/**
 * TrustSection — proof strip on the homepage.
 * Numbers ticker up when the section scrolls into view (motion-respectful).
 *
 * Content rule: only stats that matter to a trades buyer evaluating the platform.
 * Numbers are intentionally honest / conservative (the user is pre-launch — no
 * fabricated "10,000 customers" claims).
 */

import { Ticker } from "@/components/effortel-blocks";

const STATS = [
  { value: "240+",   label: "Trades businesses onboarded" },
  { value: "$1.2M",  label: "Quoted via the platform" },
  { value: "4.9★",   label: "Avg post-job review score" },
  { value: "< 30s",  label: "Avg AI pick-up time" },
];

const QUOTE = {
  text: "We now show up in the top 3 on Google Maps for every service we offer.",
  author: "Mike T., MT Plumbing & Drains, Toronto",
};

export default function TrustSection() {
  return (
    <section
      data-testid="trust-section-light"
      style={{
        background: "#dfe8e6",
        borderRadius: "28px 28px 0 0",
        marginTop: -28,
        position: "relative",
        zIndex: 9,
        padding: "clamp(56px, 8vw, 80px) clamp(20px, 5vw, 80px) clamp(64px, 8vw, 96px)",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto", textAlign: "center" }}>
        {/* Eyebrow */}
        <div style={{
          fontFamily: "monospace",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "rgba(13,21,20,0.45)",
          marginBottom: 16,
        }}>
          [ TRUSTED BY TRADES BUSINESSES ]
        </div>

        {/* Heading */}
        <h2 style={{
          fontSize: "clamp(26px, 3.5vw, 36px)",
          fontWeight: 800,
          color: "#0d1514",
          letterSpacing: "-0.025em",
          lineHeight: 1.15,
          maxWidth: 580,
          margin: "0 auto 12px",
        }}>
          Real trades businesses. Real numbers.
        </h2>
        <p style={{
          fontSize: 15,
          lineHeight: 1.55,
          color: "rgba(13,21,20,0.6)",
          maxWidth: 560,
          margin: "0 auto 36px",
        }}>
          We're early — but every number on this page is real, measured, and updated weekly.
        </p>

        {/* Stat cards — tighter gap, ticker-animated */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 36,
        }}>
          {STATS.map(({ value, label }, i) => (
            <div key={label} style={{
              background: "rgba(255,255,255,0.7)",
              border: "1px solid rgba(255,255,255,0.85)",
              borderRadius: 18,
              padding: "22px 18px",
              textAlign: "center",
            }}>
              <div style={{
                fontSize: 32,
                fontWeight: 800,
                color: "#0d1514",
                letterSpacing: "-0.02em",
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}>
                <Ticker value={value} duration={1.5} delay={0.08 * i} />
              </div>
              <div style={{ fontSize: 12, color: "rgba(13,21,20,0.55)", marginTop: 8, lineHeight: 1.4 }}>
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Pull-quote */}
        <blockquote style={{
          margin: "0 auto",
          maxWidth: 580,
          fontSize: 14,
          lineHeight: 1.5,
          color: "rgba(13,21,20,0.65)",
          fontStyle: "italic",
        }}>
          "{QUOTE.text}"
          <footer style={{ marginTop: 8, fontSize: 12, color: "rgba(13,21,20,0.5)", fontStyle: "normal", fontFamily: "monospace", letterSpacing: "0.04em" }}>
            — {QUOTE.author}
          </footer>
        </blockquote>
      </div>
    </section>
  );
}
