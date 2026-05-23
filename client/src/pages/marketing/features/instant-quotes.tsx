import { Zap, Clock, TrendingUp, Code2, Shield } from "lucide-react";
import FeaturePage, { type FeaturePageConfig } from "@/components/marketing/FeaturePage";
import { mkt, colors, shadows } from "@/theme/tokens";

/* ── Mockup ──────────────────────────────────── */
function QuoteMockup() {
  return (
    <div data-theme="light"
      style={{
        background: mkt.bg,
        border: `1px solid ${mkt.onDarkBorder}`,
        borderRadius: 20,
        padding: 28,
        width: "100%",
        maxWidth: 400,
        boxShadow: shadows.xl,
      }}
    >
      {/* Form header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22, paddingBottom: 16, borderBottom: `1px solid ${mkt.borderLight}` }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(13,60,252,0.10)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Zap size={20} color={mkt.accent} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: mkt.text }}>Get an Instant Quote</div>
          <div style={{ fontSize: 11, color: mkt.onDarkMuted }}>Bathroom Renovation Calculator</div>
        </div>
      </div>

      {/* Fields */}
      {[
        { label: "Room Size", value: "12 m²", type: "range", pct: 40 },
        { label: "Finish Grade", value: "Standard", type: "select" },
        { label: "Tiles Supplied", value: "By contractor", type: "select" },
      ].map(({ label, value, type, pct }) => (
        <div key={label} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: mkt.onDarkMuted, marginBottom: 6 }}>{label}</div>
          {type === "range" ? (
            <div>
              <div style={{ height: 6, background: mkt.sectionLight, borderRadius: 3, marginBottom: 6, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${mkt.accent}, ${mkt.accent})`, borderRadius: 3 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: mkt.onDarkMuted }}>5 m²</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: mkt.accent }}>{value}</span>
                <span style={{ fontSize: 11, color: mkt.onDarkMuted }}>50 m²</span>
              </div>
            </div>
          ) : (
            <div style={{ background: mkt.sectionLight, border: `1px solid ${mkt.onDarkBorder}`, borderRadius: 9, padding: "9px 14px", fontSize: 13, fontWeight: 500, color: mkt.onDark, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{value}</span>
              <span style={{ color: mkt.onDarkMuted, fontSize: 10 }}>▾</span>
            </div>
          )}
        </div>
      ))}

      {/* Result */}
      <div style={{ background: "rgba(13,60,252,0.10)", borderRadius: 14, padding: "20px 22px", marginTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span style={{ background: "rgba(13,60,252,0.10)", borderRadius: 20, fontSize: 11, fontWeight: 700, color: mkt.accent, padding: "2px 10px" }}>
            ✓ Estimate Ready
          </span>
          <span style={{ fontSize: 11, color: mkt.onDarkMuted, marginLeft: "auto" }}>Calculated in 0.2s</span>
        </div>
        <div style={{ fontSize: 34, fontWeight: 800, color: mkt.accent, letterSpacing: "-0.02em" }}>$1,240 – $1,680</div>
        <div style={{ fontSize: 12, color: mkt.onDarkMuted, marginTop: 4 }}>Valid for 7 days · Includes GST</div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <div style={{ flex: 1, background: mkt.accent, borderRadius: 9, padding: "10px", textAlign: "center", fontSize: 13, fontWeight: 700, color: "#FFFFFF" }}>
            Book Now
          </div>
          <div style={{ flex: 1, background: "rgba(13,60,252,0.10)", border: `1px solid ${mkt.accent}30`, borderRadius: 9, padding: "10px", textAlign: "center", fontSize: 12, fontWeight: 600, color: mkt.accent }}>
            Get Quote PDF
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Config ──────────────────────────────────── */
const config: FeaturePageConfig = {
  meta: { title: "Instant Quotes — QuoteQuick™ | Your Customers Get Prices, You Get Leads" },
  hero: {
    badge: "QuoteQuick",
    badgeColor: mkt.accent,
    headline: "Your Customers Get Instant Prices. You Get Qualified Leads.",
    highlightedWords: ["Instant Prices", "Qualified Leads"],
    sub: "Add an instant quote calculator to your website. Customers price their job in seconds. You get their details automatically. Live in 5 minutes.",
    accentColor: mkt.accent,
  },
  demo: {
    label: "Try a Live Demo",
    title: "Real pricing, not a contact form",
    description: "QuoteQuick uses your actual rates and pricing logic to show customers a real estimate — not a generic \"we'll get back to you.\" They see a number they can act on immediately.",
    bullets: [
      "Instant results based on your real pricing",
      "10 pricing models: hourly, per sqft, tiered packages, and more",
      "Every quote captures a lead automatically",
      "Works alongside Jobber, Housecall Pro, or any tool you already use",
    ],
    bulletColor: mkt.accent,
    mockup: QuoteMockup,
  },
  benefits: [
    {
      icon: Clock,
      title: "Customers stop calling for prices",
      body: "Your website answers the #1 question: \"how much?\" Instantly, 24/7, even when you're on a job.",
      color: mkt.accent, bg: mkt.accentTint,
    },
    {
      icon: TrendingUp,
      title: "More leads from the same traffic",
      body: "Visitors who see a price are far more likely to leave their details than those who see a contact form.",
      color: colors.accent.blue, bg: colors.accent.blueTint,
    },
    {
      icon: Shield,
      title: "No platform switch required",
      body: "Already using Jobber or Housecall Pro? Great. QuoteQuick adds to your website — leads go to your email. Nothing to switch.",
      color: "#7C3AED", bg: "#F5F3FF",
    },
    {
      icon: Code2,
      title: "Booking + follow-up included",
      body: "Customers can book an appointment after their quote. Automated email and SMS follow-ups keep leads warm.",
      color: mkt.orange, bg: mkt.orangeTint,
    },
  ],
  steps: [
    { num: "01", title: "Pick your trade, set your rates", body: "Choose your pricing model. Our AI helps configure your rates in minutes — no formulas to write." },
    { num: "02", title: "Embed on your website", body: "Paste one line of code into WordPress, Wix, Squarespace, or any site. Or share a hosted link — no website needed." },
    { num: "03", title: "Leads come to you", body: "Every quote captures contact details and notifies you instantly by email. Follow-ups happen automatically." },
  ],
  faqs: [
    { q: "How accurate are the estimates?", a: "They use your exact rates and pricing rules — the same logic you use to quote manually. You set the numbers, QuoteQuick does the math." },
    { q: "I already use Jobber / Housecall Pro. Do I need to switch?", a: "No. QuoteQuick is a standalone widget that works alongside whatever you already use. Leads come to your email and dashboard — no platform switch needed." },
    { q: "Can I update prices after going live?", a: "Yes. Change your rates once in the dashboard and every embed updates automatically." },
    { q: "Is booking included?", a: "Yes, on the Pro plan. Customers can pick a date and time right after their quote. Deposit payments via Stripe are supported." },
    { q: "Can I try it free?", a: "Yes. 14-day free trial, no credit card required. Build your calculator and see it work before you commit." },
  ],
  cta: {
    headline: "Start Getting Leads From Your Website Today",
    sub: "14-day free trial. No credit card. No code. Live in 5 minutes.",
  },
};

export default function InstantQuotesPage() {
  return <FeaturePage config={config} />;
}
