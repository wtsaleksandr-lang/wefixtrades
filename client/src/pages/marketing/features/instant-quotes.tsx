import { Zap, Clock, TrendingUp, Code2, Shield } from "lucide-react";
import FeaturePage, { C, SHADOW, type FeaturePageConfig } from "@/components/marketing/FeaturePage";

/* ── Mockup ──────────────────────────────────── */
function QuoteMockup() {
  return (
    <div
      style={{
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 20,
        padding: 28,
        width: "100%",
        maxWidth: 400,
        boxShadow: SHADOW.hero,
      }}
    >
      {/* Form header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22, paddingBottom: 16, borderBottom: `1px solid ${C.borderLight}` }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: C.sageTint, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Zap size={18} color={C.sage} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.heading }}>Get an Instant Quote</div>
          <div style={{ fontSize: 11, color: C.muted }}>Bathroom Renovation Calculator</div>
        </div>
      </div>

      {/* Fields */}
      {[
        { label: "Room Size", value: "12 m²", type: "range", pct: 40 },
        { label: "Finish Grade", value: "Standard", type: "select" },
        { label: "Tiles Supplied", value: "By contractor", type: "select" },
      ].map(({ label, value, type, pct }) => (
        <div key={label} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6 }}>{label}</div>
          {type === "range" ? (
            <div>
              <div style={{ height: 6, background: C.bgGray, borderRadius: 3, marginBottom: 6, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${C.sage}, ${C.sageLight})`, borderRadius: 3 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: C.muted }}>5 m²</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.sage }}>{value}</span>
                <span style={{ fontSize: 11, color: C.muted }}>50 m²</span>
              </div>
            </div>
          ) : (
            <div style={{ background: C.bgGray, border: `1px solid ${C.border}`, borderRadius: 9, padding: "9px 14px", fontSize: 13, fontWeight: 500, color: C.heading, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{value}</span>
              <span style={{ color: C.muted, fontSize: 10 }}>▾</span>
            </div>
          )}
        </div>
      ))}

      {/* Result */}
      <div style={{ background: C.sageTint, borderRadius: 14, padding: "20px 22px", marginTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span style={{ background: C.sageAccent, borderRadius: 20, fontSize: 11, fontWeight: 700, color: C.sage, padding: "2px 10px" }}>
            ✓ Estimate Ready
          </span>
          <span style={{ fontSize: 11, color: C.muted, marginLeft: "auto" }}>Calculated in 0.2s</span>
        </div>
        <div style={{ fontSize: 34, fontWeight: 800, color: C.sage, letterSpacing: "-0.02em" }}>$1,240 – $1,680</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Valid for 7 days · Includes GST</div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <div style={{ flex: 1, background: C.sage, borderRadius: 9, padding: "10px", textAlign: "center", fontSize: 13, fontWeight: 700, color: "#FFFFFF" }}>
            Book Now
          </div>
          <div style={{ flex: 1, background: C.sageAccent, border: `1px solid ${C.sage}30`, borderRadius: 9, padding: "10px", textAlign: "center", fontSize: 12, fontWeight: 600, color: C.sage }}>
            Get Quote PDF
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Config ──────────────────────────────────── */
const config: FeaturePageConfig = {
  meta: { title: "Instant Quotes — QuickQuotePro | Accurate Estimates in Seconds" },
  hero: {
    badge: "Instant Quote Engine",
    badgeColor: C.sage,
    headline: "Turn 'How Much?' Into a Signed Job In Seconds",
    highlightedWords: ["Signed Job", "Seconds"],
    sub: "Customers get a real, accurate estimate the moment they finish your calculator — no phone tag, no waiting, no guessing.",
    accentColor: C.sage,
  },
  demo: {
    label: "See It In Action",
    title: "An estimate your customer trusts — in under a second",
    description: "QuickQuotePro's engine uses your actual pricing formulas to calculate a real quote range based on the customer's inputs. Not a ballpark. Not 'we'll call you.' A real number they can act on immediately.",
    bullets: [
      "Results displayed in under 0.3 seconds",
      "Price range accounts for variation (materials, finish grade, complexity)",
      "Customisable validity period with optional countdown badge",
      "PDF quote download option (Pro+)",
    ],
    bulletColor: C.sage,
    mockup: QuoteMockup,
  },
  benefits: [
    {
      icon: Clock,
      title: "No More Phone Tag",
      body: "Customers get their answer online, instantly — instead of waiting for a callback that might never come.",
      color: C.sage, bg: C.sageTint,
    },
    {
      icon: TrendingUp,
      title: "Higher Conversion Rate",
      body: "Leads who've already seen a price are 3× more likely to book than those who've only submitted a contact form.",
      color: C.blue, bg: C.blueTint,
    },
    {
      icon: Shield,
      title: "AI-Validated Accuracy",
      body: "Before you go live, AI reviews your pricing formulas and flags anything that looks off — protecting your margins.",
      color: C.purple, bg: C.purpleTint,
    },
    {
      icon: Code2,
      title: "Embed Anywhere",
      body: "Hosted page, script snippet, iframe, or button popup — paste one line of code into any website builder.",
      color: C.orange, bg: C.orangeTint,
    },
  ],
  steps: [
    { num: "01", title: "Define Your Pricing", body: "Set up your pricing formula using our guided wizard. Choose from 10 formula types — fixed, hourly, area-based, tiered, and more." },
    { num: "02", title: "Test & Validate", body: "Run 3 test scenarios and compare against what you'd actually charge. AI flags issues and suggests improvements." },
    { num: "03", title: "Publish & Embed", body: "Get a hosted URL or embed snippet. Share on social, embed in your website, or link from Google Ads in minutes." },
  ],
  faqs: [
    { q: "How accurate are the estimates?", a: "The engine uses your exact pricing formulas — the same logic you use to quote manually. Accuracy is directly tied to the quality of your formula setup, which our AI helps you validate before going live." },
    { q: "What pricing formula types are supported?", a: "We support 10 formula families: fixed price, hourly rate, area-based (m²), room count, item count, tiered ranges, base + addon, percentage markup, custom formula combinations, and package selection." },
    { q: "Can I update prices after going live?", a: "Yes. Price changes take effect immediately and apply to all future estimates. Old estimates retain their original price if you've set a validity period." },
    { q: "What happens after a customer sees their estimate?", a: "They can request a booking, submit their details as a lead, download a PDF quote, or start a conversation with your AI employee — all configurable." },
    { q: "Can I embed this on any website?", a: "Yes. The embed script works with WordPress, Squarespace, Wix, Webflow, custom HTML sites, and any platform that allows HTML/script injection." },
  ],
  cta: {
    headline: "Build Your Quote Calculator Today",
    sub: "Takes 10 minutes. No code. No credit card. Start capturing better leads today.",
  },
};

export default function InstantQuotesPage() {
  return <FeaturePage config={config} />;
}
