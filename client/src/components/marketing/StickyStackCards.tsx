import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/* ── edit content here ───────────────────────────────────────────────── */

const SECTION_HEADING = "After they find you, keep them coming back.";
const SECTION_SUBTITLE = "Four growth tools that quietly run in the background — bringing reviews, rankings, and reach without adding to your day.";

const CARDS_DATA = [
  {
    number: "01",
    // SocialSync — social-content automation
    accentColor: "#2563eb",
    accentBg: "#dbeafe",
    title: "Stay visible without hiring a marketer.",
    description:
      "SocialSync drafts your weekly posts in your voice — Facebook, Instagram, LinkedIn, Google Business. You approve in one tap. We handle the calendar, the captions, and the analytics.",
    reversed: false,
  },
  {
    number: "02",
    // ReputationShield — review handling
    accentColor: "#0891b2",
    accentBg: "#cffafe",
    title: "Every review answered. Even at 11 PM.",
    description:
      "ReputationShield drafts a personal reply to every Google and Facebook review within minutes. 5-stars get amplified. 1-stars get flagged to your phone before they spread.",
    reversed: true,
  },
  {
    number: "03",
    // RankFlow — SEO tracking
    accentColor: "#059669",
    accentBg: "#d1fae5",
    title: "Show up where customers are searching.",
    description:
      "RankFlow tracks every keyword that drives trades work in your service area — weekly. The monthly report tells you exactly which pages to update and which competitors are gaining ground.",
    reversed: false,
  },
  {
    number: "04",
    // ContentFlow — long-form content
    accentColor: "#7c3aed",
    accentBg: "#ede9fe",
    title: "Build authority. Without writing a word.",
    description:
      "ContentFlow drafts trade-specific articles every month — tuned to your service area, your voice, and what's actually ranking. One tap publishes to your site and auto-distributes to your channels.",
    reversed: true,
  },
] as const;

/* ── Effortel color tokens ───────────────────────────────────────────── */
const BG = "#dfe8e6";        // --color--background (section + overlay)
const CARD_BG = "#f5fcff";   // --color--background-secondary (card)
const TEXT = "#22282a";      // --swatch--n-800
const TEXT_MUTED = "#5f6f77"; // --swatch--n-600

/* ── mockup sub-components — on-brand React card visuals ─────────────── */

function CustomerPortalMockup() {
  // SocialSync — content calendar with multi-channel posts queued/published
  const POSTS = [
    { day: "Mon", time: "9:00", channels: ["F", "I"], status: "posted", title: "Drain unblock 101 — what to try first" },
    { day: "Wed", time: "12:00", channels: ["F", "I", "L"], status: "posted", title: "Why your hot water keeps running cold" },
    { day: "Fri", time: "15:00", channels: ["F", "I", "G"], status: "scheduled", title: "Burst pipe? Here's the 60-second fix" },
    { day: "Sun", time: "10:00", channels: ["L"], status: "draft", title: "Behind the scenes: a 5-star plumber's day" },
  ];
  const channelColor = (c: string) => c === "F" ? "#1877F2" : c === "I" ? "#E4405F" : c === "L" ? "#0A66C2" : "#EA4335";
  const statusBadge = (s: string) =>
    s === "posted" ? { label: "Posted", bg: "#d1fae5", color: "#059669" }
    : s === "scheduled" ? { label: "Scheduled", bg: "#dbeafe", color: "#2563eb" }
    : { label: "Drafting", bg: "#fef3c7", color: "#d97706" };
  return (
    <div style={{ padding: 28, height: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>SocialSync · This Week</div>
        <div style={{ fontSize: 11, background: "#dbeafe", color: "#2563eb", borderRadius: 6, padding: "3px 10px", fontWeight: 600 }}>4 / wk</div>
      </div>
      <div style={{ background: "#fff", borderRadius: 14, padding: "12px 14px", flex: 1, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
        {POSTS.map((p) => {
          const b = statusBadge(p.status);
          return (
            <div key={p.day} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #f0f4f6" }}>
              <div style={{ width: 36, fontSize: 10, fontWeight: 700, color: TEXT_MUTED, fontFamily: "monospace" }}>{p.day}<br />{p.time}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  {p.channels.map((c) => (
                    <span key={c} style={{ width: 16, height: 16, borderRadius: 4, background: channelColor(c), color: "#fff", fontSize: 9, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{c}</span>
                  ))}
                </div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: b.bg, color: b.color }}>{b.label}</span>
            </div>
          );
        })}
      </div>
      <div style={{ background: "#fff", borderRadius: 12, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <div style={{ fontSize: 12, color: TEXT_MUTED }}>Engagement vs last month</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#059669" }}>+340%</div>
      </div>
    </div>
  );
}

function DashboardMockup() {
  // ReputationShield — review feed with AI-drafted replies
  const REVIEWS = [
    { name: "Sarah K.", stars: 5, text: "Same-day fix on a burst pipe. Saved us thousands.", status: "replied", color: "#059669" },
    { name: "Mike R.", stars: 2, text: "Took longer than expected and the price went up mid-job.", status: "flagged", color: "#dc2626" },
    { name: "Diana L.", stars: 5, text: "Polite, fast, and explained everything. Will recommend!", status: "replied", color: "#059669" },
  ];
  return (
    <div style={{ padding: 28, height: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 10 }}>
        {[
          { label: "Avg rating", val: "4.9★", delta: "+1.2★ 30d", color: "#059669" },
          { label: "Reply time", val: "< 30m", delta: "AI-drafted", color: "#0891b2" },
          { label: "1-star caught", val: "100%", delta: "Flagged", color: "#dc2626" },
        ].map(kpi => (
          <div key={kpi.label} style={{ flex: 1, background: "#fff", borderRadius: 12, padding: "12px 14px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: 10, color: TEXT_MUTED, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 4 }}>{kpi.label}</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: TEXT }}>{kpi.val}</div>
            <div style={{ fontSize: 11, color: kpi.color, fontWeight: 600, marginTop: 2 }}>{kpi.delta}</div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, background: "#fff", borderRadius: 14, padding: "14px 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, marginBottom: 4 }}>Latest reviews</div>
        {REVIEWS.map((r) => (
          <div key={r.name} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid #f0f4f6" }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#e4edf1", color: TEXT, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
              {r.name.charAt(0)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: TEXT }}>{r.name}</span>
                <span style={{ fontSize: 10, color: "#f59e0b" }}>{"★".repeat(r.stars)}{"☆".repeat(5 - r.stars)}</span>
              </div>
              <div style={{ fontSize: 11, color: TEXT_MUTED, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}>
                "{r.text}"
              </div>
              <div style={{ fontSize: 9, color: r.color, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 3 }}>
                {r.status === "replied" ? "● AI replied" : "● Flagged for you"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CatalogMockup() {
  // RankFlow — keyword search rank list with deltas
  const KEYWORDS = [
    { q: "emergency plumber austin", pos: 3, delta: -2 },
    { q: "drain cleaning 78704", pos: 1, delta: -4 },
    { q: "water heater repair", pos: 7, delta: -1 },
    { q: "burst pipe weekend", pos: 12, delta: 0 },
  ];
  return (
    <div style={{ padding: 28, height: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>RankFlow · Top keywords</div>
        <div style={{ fontSize: 11, background: "#d1fae5", color: "#059669", borderRadius: 6, padding: "3px 10px", fontWeight: 700 }}>+18 page-1</div>
      </div>
      <div style={{ flex: 1, background: "#fff", borderRadius: 14, padding: "14px 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        {KEYWORDS.map((k) => (
          <div key={k.q} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid #f0f4f6" }}>
            <span style={{ fontSize: 12, color: TEXT, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              {k.q}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: TEXT, fontFamily: "Inter", letterSpacing: "-0.01em" }}>#{k.pos}</span>
              <span style={{
                fontSize: 10, fontFamily: "monospace", fontWeight: 600,
                padding: "2px 7px", borderRadius: 999,
                background: k.delta < 0 ? "#d1fae5" : k.delta > 0 ? "#fee2e2" : "#f3f4f6",
                color: k.delta < 0 ? "#059669" : k.delta > 0 ? "#dc2626" : TEXT_MUTED,
              }}>
                {k.delta < 0 ? "↑" : k.delta > 0 ? "↓" : "—"} {Math.abs(k.delta) || "0"}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ background: "#fff", borderRadius: 12, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <div style={{ fontSize: 12, color: TEXT_MUTED }}>Organic clicks · 30 days</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#059669" }}>+38%</div>
      </div>
    </div>
  );
}

function WorkflowMockup() {
  // ContentFlow — article draft + auto-distribution pipeline
  const steps = [
    { icon: "📝", label: "Article drafted by AI", status: "done", color: "#059669", meta: "1,240 words · trade-tuned" },
    { icon: "✅", label: "Reviewed & approved", status: "done", color: "#059669", meta: "1 click" },
    { icon: "🌐", label: "Published to your site", status: "done", color: "#059669", meta: "your-trade.com/blog" },
    { icon: "📣", label: "Auto-distributed to 4 channels", status: "active", color: "#7c3aed", meta: "FB · IG · LinkedIn · GBP" },
    { icon: "📈", label: "Tracking traffic + leads", status: "pending", color: "#d1d5db", meta: "data lands tomorrow" },
  ];
  return (
    <div style={{ padding: 28, height: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 6 }}>ContentFlow · This week's article</div>
      <div style={{ background: "#fff", borderRadius: 14, padding: "16px 18px", flex: 1, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        {steps.map((step, i) => (
          <div key={step.label}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: step.status === "done" ? "#d1fae5" : step.status === "active" ? "#ede9fe" : "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                {step.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: step.status === "pending" ? "#9ca3af" : TEXT }}>{step.label}</div>
                <div style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 1 }}>{step.meta}</div>
              </div>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: step.color }} />
            </div>
            {i < steps.length - 1 && (
              <div style={{ marginLeft: 16, width: 1, height: 16, background: "#d5e1e7" }} />
            )}
          </div>
        ))}
      </div>
      <div style={{ background: "#fff", borderRadius: 12, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
        <div style={{ fontSize: 12, color: TEXT_MUTED }}>Organic traffic vs prior 90 days</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#059669" }}>+184%</div>
      </div>
    </div>
  );
}

const MOCKUPS = {
  "01": CustomerPortalMockup,
  "02": DashboardMockup,
  "03": CatalogMockup,
  "04": WorkflowMockup,
} as const;

/* ── main component ──────────────────────────────────────────────────── */
export default function StickyStackCards() {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const overlayRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isMobile = useRef(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      const m = window.innerWidth < 768;
      isMobile.current = m;
      setMobile(m);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    isMobile.current = window.innerWidth < 768;
    if (isMobile.current) return; // no sticky stacking on mobile

    const timelines: gsap.core.Timeline[] = [];

    CARDS_DATA.forEach((_, i) => {
      if (i === CARDS_DATA.length - 1) return;
      const nextCard = cardRefs.current[i + 1];
      const card = cardRefs.current[i];
      const overlay = overlayRefs.current[i];
      if (!card || !overlay || !nextCard) return;

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: nextCard,
          start: "top 88%",
          end: "top 24%",
          scrub: 0.6,
        },
      });
      tl.to(card, { scale: 0.9, y: -16, transformOrigin: "50% 0", ease: "none" }, 0);
      tl.to(overlay, { opacity: 0.6, ease: "none" }, 0);
      timelines.push(tl);
    });

    return () => {
      timelines.forEach(tl => tl.scrollTrigger?.kill());
      timelines.forEach(tl => tl.kill());
    };
  }, []);

  return (
    <section
      data-testid="sticky-stack-cards"
      style={{
        background: BG,
        padding: mobile ? "64px 16px" : "96px 28px",
        borderRadius: "28px 28px 0 0",
        marginTop: -28,
        position: "relative",
        zIndex: 2,
      }}
    >
      {/* ── heading ────────────────────────────────────────────── */}
      <div style={{ maxWidth: 720, margin: "0 auto 96px", textAlign: "center" }}>
        <div style={{ fontSize: 12, letterSpacing: "0.18em", fontWeight: 600, textTransform: "uppercase" as const, color: TEXT_MUTED, marginBottom: 18 }}>
          {"{ Customer Experience }"}
        </div>
        <h2 style={{ margin: 0, fontSize: "clamp(30px, 4vw, 50px)", fontWeight: 400, lineHeight: 1.1, letterSpacing: "-0.025em", color: TEXT }}>
          {SECTION_HEADING}
        </h2>
        <p style={{ margin: "18px auto 0", maxWidth: 500, fontSize: 17, lineHeight: 1.65, color: TEXT_MUTED }}>
          {SECTION_SUBTITLE}
        </p>
      </div>

      {/* ── sticky card stack ───────────────────────────────────── */}
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: mobile ? 32 : 192, // 12em on desktop, compact on mobile
        }}
      >
        {CARDS_DATA.map((card, i) => {
          const VisualMockup = MOCKUPS[card.number as keyof typeof MOCKUPS];
          return (
            <div
              key={card.number}
              ref={(el) => { cardRefs.current[i] = el; }}
              style={{
                position: mobile ? "relative" : "sticky",
                top: mobile ? "auto" : 96,
                transformOrigin: "50% 0",
                willChange: mobile ? "auto" : "transform",
              }}
            >
              {/* .large__card */}
              <div
                style={{
                  background: CARD_BG,
                  borderRadius: 24,
                  padding: 2,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: mobile ? "column" : (card.reversed ? "row-reverse" : "row") as "row" | "row-reverse" | "column",
                  minHeight: mobile ? "auto" : 420,
                  boxShadow: "0 4px 32px rgba(34,40,42,0.08)",
                  border: "1px solid rgba(213,225,231,0.6)",
                }}
              >
                {/* col-33: text */}
                <div
                  style={{
                    width: mobile ? "100%" : "33.333%",
                    flexShrink: 0,
                    padding: mobile ? "28px 24px" : "36px 36px 36px 36px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    borderRight: (!mobile && !card.reversed) ? "1px solid rgba(213,225,231,0.7)" : "none",
                    borderLeft: (!mobile && card.reversed) ? "1px solid rgba(213,225,231,0.7)" : "none",
                    borderBottom: mobile ? "1px solid rgba(213,225,231,0.7)" : "none",
                  }}
                >
                  {/* number badge */}
                  <div>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        background: card.accentBg,
                        fontSize: 14,
                        fontWeight: 800,
                        color: card.accentColor,
                        letterSpacing: "0.04em",
                        marginBottom: 28,
                      }}
                    >
                      {card.number}
                    </div>
                    <h3
                      style={{
                        margin: "0 0 16px",
                        fontSize: "clamp(18px, 1.8vw, 24px)",
                        fontWeight: 700,
                        lineHeight: 1.25,
                        letterSpacing: "-0.02em",
                        color: TEXT,
                      }}
                    >
                      {card.title}
                    </h3>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 14,
                        lineHeight: 1.75,
                        color: TEXT_MUTED,
                      }}
                    >
                      {card.description}
                    </p>
                  </div>
                  {/* accent line */}
                  <div
                    style={{
                      marginTop: 32,
                      height: 3,
                      width: 40,
                      borderRadius: 3,
                      background: card.accentColor,
                      opacity: 0.5,
                    }}
                  />
                </div>

                {/* col-66: visual */}
                <div
                  style={{
                    flex: 1,
                    position: "relative",
                    background: "#fff",
                    borderRadius: mobile ? "0 0 22px 22px" : (card.reversed ? "22px 0 0 22px" : "0 22px 22px 0"),
                    overflow: "hidden",
                    minHeight: mobile ? 280 : 380,
                  }}
                >
                  {/* Card visual — on-brand React mockup (see MOCKUPS map).
                      Built in-repo so the section needs no external animation
                      assets or extra runtime dependency. */}
                  <VisualMockup />
                </div>
              </div>

              {/* overlay — GSAP animates opacity 0 → 0.6 */}
              <div
                ref={(el) => { overlayRefs.current[i] = el; }}
                style={{
                  position: "absolute",
                  inset: 0,
                  background: BG,
                  borderRadius: 24,
                  pointerEvents: "none",
                  zIndex: 5,
                  opacity: 0,
                }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
