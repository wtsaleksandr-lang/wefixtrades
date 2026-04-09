import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Check, ChevronDown, ArrowRight, Zap, Clock, Users, Shield, MessageSquare, X } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt, colors } from "@/theme/tokens";
import { trackEvent } from "@/lib/trackEvent";

/* ─── FAQ ─── */

const FAQS = [
  { q: "Do I need a website?", a: "No. Every calculator gets a hosted page you can share via link — email, text, social media, Google Business profile. If you do have a website, you can embed it with one line of code." },
  { q: "Can I use this with Jobber or Housecall Pro?", a: "Yes. QuoteQuick works alongside whatever you already use. Leads come to your email and dashboard — no platform switch needed." },
  { q: "How fast can I set it up?", a: "Most users go live in under 5 minutes. Pick your trade, set your rate, and publish. No code, no design skills needed." },
  { q: "What happens after the trial?", a: "After 14 days, choose Solo ($49/mo) or Business ($99/mo). Your calculator stays live — you just pick a plan. No data is lost." },
  { q: "Can I cancel anytime?", a: "Yes. No contracts, no lock-in. Cancel from your dashboard in one click. Annual plans keep access until the period ends." },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: `1px solid ${mkt.border}` }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "18px 0", background: "transparent", border: "none", cursor: "pointer",
          textAlign: "left" as const, gap: 16,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: mkt.text, lineHeight: 1.4 }}>{q}</span>
        <ChevronDown size={16} color={mkt.textMuted} style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </button>
      {open && (
        <p style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.7, margin: "0 0 18px", paddingRight: 32 }}>{a}</p>
      )}
    </div>
  );
}

/* ─── Feature Row ─── */

function Feature({ text, highlight }: { text: string; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 0" }}>
      <Check size={16} style={{ flexShrink: 0, marginTop: 2, color: highlight ? mkt.accent : "#4ade80" }} />
      <span style={{ fontSize: 14, color: highlight ? mkt.text : mkt.textMuted, fontWeight: highlight ? 600 : 400, lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

/* ─── Replace Item ─── */

function ReplaceItem({ icon: Icon, before, after }: { icon: any; before: string; after: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 0" }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: mkt.accentTint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={16} color={mkt.accent} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, color: mkt.textMuted, margin: 0, textDecoration: "line-through", opacity: 0.6 }}>{before}</p>
        <p style={{ fontSize: 14, color: mkt.text, margin: "2px 0 0", fontWeight: 500 }}>{after}</p>
      </div>
    </div>
  );
}

/* ─── Page ─── */

export default function QuoteQuickPricing() {
  const [annual, setAnnual] = useState(false);
  useEffect(() => { trackEvent('pricing_page_viewed'); }, []);

  const soloPrice = annual ? 39 : 49;
  const bizPrice = annual ? 79 : 99;

  return (
    <MarketingLayout>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "clamp(48px, 8vw, 80px) 20px 64px" }}>

        {/* ─── HERO ─── */}
        <div style={{ textAlign: "center", marginBottom: "clamp(40px, 6vw, 64px)" }}>
          <h1 style={{
            fontSize: "clamp(28px, 5vw, 42px)", fontWeight: 700, color: mkt.text,
            lineHeight: 1.15, letterSpacing: "-0.025em", margin: "0 0 14px",
          }}>
            One job pays for your entire month.
          </h1>
          <p style={{ fontSize: "clamp(15px, 2vw, 18px)", color: mkt.textMuted, lineHeight: 1.6, margin: "0 0 20px", maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
            Instant quotes on your website. Leads captured. Jobs booked.
          </p>
          <p style={{ fontSize: 13, color: mkt.textMuted, opacity: 0.7 }}>
            14-day free trial &middot; No credit card &middot; Works with Jobber, Housecall Pro, or whatever you use
          </p>
        </div>

        {/* ─── BILLING TOGGLE ─── */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 12,
            padding: "6px 8px", borderRadius: 999, background: mkt.surface,
            border: `1px solid ${mkt.border}`,
          }}>
            <button
              onClick={() => setAnnual(false)}
              style={{
                padding: "8px 18px", borderRadius: 999, border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 600,
                background: !annual ? mkt.accent : "transparent",
                color: !annual ? mkt.dark : mkt.textMuted,
                transition: "all 0.2s",
              }}
            >Monthly</button>
            <button
              onClick={() => setAnnual(true)}
              style={{
                padding: "8px 18px", borderRadius: 999, border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 600,
                background: annual ? mkt.accent : "transparent",
                color: annual ? mkt.dark : mkt.textMuted,
                transition: "all 0.2s",
              }}
            >
              Annual
              <span style={{ fontSize: 11, fontWeight: 700, marginLeft: 6, color: annual ? mkt.dark : mkt.accent }}>Save 20%</span>
            </button>
          </div>
        </div>

        {/* ─── PRICING CARDS ─── */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 20, marginBottom: "clamp(48px, 6vw, 72px)", maxWidth: 700, margin: "0 auto",
        }}>

          {/* SOLO */}
          <div style={{
            borderRadius: 16, padding: "32px 28px",
            background: mkt.surface, border: `1px solid ${mkt.border}`,
          }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: mkt.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 4px" }}>Solo</p>
            <p style={{ fontSize: 13, color: mkt.textMuted, margin: "0 0 20px" }}>For one-person trades</p>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginBottom: 4 }}>
              <span style={{ fontSize: 40, fontWeight: 700, color: mkt.text, letterSpacing: "-0.02em", lineHeight: 1 }}>${soloPrice}</span>
              <span style={{ fontSize: 14, color: mkt.textMuted, marginBottom: 6 }}>/mo</span>
            </div>
            {annual && <p style={{ fontSize: 12, color: mkt.accent, margin: "0 0 20px" }}>Billed yearly (${soloPrice * 12}/yr)</p>}
            {!annual && <p style={{ fontSize: 12, color: mkt.textMuted, margin: "0 0 20px" }}>${39}/mo billed annually</p>}

            <Link href="/Wizard">
              <button style={{
                width: "100%", padding: "14px", borderRadius: 10, border: `1px solid ${mkt.border}`,
                background: "transparent", color: mkt.text, cursor: "pointer",
                fontSize: 14, fontWeight: 700, marginBottom: 6, transition: "all 0.15s",
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = mkt.accent; e.currentTarget.style.color = mkt.accent; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = mkt.border as string; e.currentTarget.style.color = mkt.text; }}
              >
                Start Free Trial
              </button>
            </Link>
            <p style={{ fontSize: 11, color: mkt.textMuted, textAlign: "center", margin: "0 0 20px" }}>No credit card required</p>

            <div style={{ borderTop: `1px solid ${mkt.border}`, paddingTop: 16 }}>
              <Feature text="1 instant quote calculator" />
              <Feature text="Embed on any website" />
              <Feature text="Hosted quote page (no website needed)" />
              <Feature text="Lead capture with every quote" />
              <Feature text="Email follow-up sequences" />
              <Feature text="Online booking + deposits" />
              <Feature text="Your branding (logo, colors)" />
              <Feature text="1,000 leads/month" />
            </div>
          </div>

          {/* BUSINESS */}
          <div style={{
            borderRadius: 16, padding: "32px 28px",
            background: mkt.surface,
            border: `2px solid ${mkt.accent}`,
            position: "relative",
          }}>
            <div style={{
              position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)",
              padding: "4px 16px", borderRadius: 999,
              background: mkt.accent, color: mkt.dark,
              fontSize: 11, fontWeight: 700, letterSpacing: "0.03em",
            }}>
              MOST POPULAR
            </div>

            <p style={{ fontSize: 13, fontWeight: 700, color: mkt.accent, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 4px" }}>Business</p>
            <p style={{ fontSize: 13, color: mkt.textMuted, margin: "0 0 20px" }}>For teams &amp; multi-service</p>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginBottom: 4 }}>
              <span style={{ fontSize: 40, fontWeight: 700, color: mkt.text, letterSpacing: "-0.02em", lineHeight: 1 }}>${bizPrice}</span>
              <span style={{ fontSize: 14, color: mkt.textMuted, marginBottom: 6 }}>/mo</span>
            </div>
            {annual && <p style={{ fontSize: 12, color: mkt.accent, margin: "0 0 20px" }}>Billed yearly (${bizPrice * 12}/yr)</p>}
            {!annual && <p style={{ fontSize: 12, color: mkt.textMuted, margin: "0 0 20px" }}>${79}/mo billed annually</p>}

            <Link href="/Wizard">
              <button style={{
                width: "100%", padding: "14px", borderRadius: 10, border: "none",
                background: mkt.accent, color: mkt.dark, cursor: "pointer",
                fontSize: 14, fontWeight: 700, marginBottom: 6, transition: "all 0.15s",
              }}
                onMouseEnter={e => { e.currentTarget.style.background = mkt.accentHover; }}
                onMouseLeave={e => { e.currentTarget.style.background = mkt.accent; }}
              >
                Start Free Trial
              </button>
            </Link>
            <p style={{ fontSize: 11, color: mkt.textMuted, textAlign: "center", margin: "0 0 20px" }}>No credit card required</p>

            <div style={{ borderTop: `1px solid ${mkt.border}`, paddingTop: 16 }}>
              <Feature text="Everything in Solo, plus:" />
              <Feature text="Up to 5 calculators" highlight />
              <Feature text="SMS + WhatsApp follow-ups" highlight />
              <Feature text="Remove all QuoteQuick branding" highlight />
              <Feature text="Custom domain (quotes.you.com)" />
              <Feature text="Coupon codes + promotions" />
              <Feature text="Webhook / CRM integration" />
              <Feature text="Priority support" />
            </div>
          </div>
        </div>

        {/* ─── VALUE STRIP ─── */}
        <div style={{
          maxWidth: 700, margin: "0 auto clamp(48px, 6vw, 72px)",
          padding: "28px 24px", borderRadius: 16,
          background: mkt.accentTint, border: `1px solid rgba(102,232,250,0.15)`,
          textAlign: "center",
        }}>
          <p style={{ fontSize: "clamp(16px, 2.5vw, 20px)", fontWeight: 700, color: mkt.text, margin: "0 0 6px" }}>
            Most users recover the cost with their first lead.
          </p>
          <p style={{ fontSize: 14, color: mkt.textMuted, margin: "0 0 20px", lineHeight: 1.6 }}>
            The average plumbing job is $200+. The average cleaning booking is $150+. One lead pays for itself.
          </p>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 16, textAlign: "center",
          }}>
            {[
              { icon: Zap, label: "Instant prices", sub: "Customers see pricing in seconds" },
              { icon: Users, label: "Every lead captured", sub: "Name, email, phone — automatically" },
              { icon: Clock, label: "Jobs booked", sub: "Customers book right after their quote" },
            ].map(v => (
              <div key={v.label} style={{ padding: "12px 8px" }}>
                <v.icon size={20} color={mkt.accent} style={{ margin: "0 auto 8px", display: "block" }} />
                <p style={{ fontSize: 14, fontWeight: 600, color: mkt.text, margin: "0 0 2px" }}>{v.label}</p>
                <p style={{ fontSize: 12, color: mkt.textMuted, margin: 0 }}>{v.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ─── WHAT THIS REPLACES ─── */}
        <div style={{ maxWidth: 560, margin: "0 auto clamp(48px, 6vw, 72px)" }}>
          <h2 style={{ fontSize: "clamp(20px, 3vw, 26px)", fontWeight: 700, color: mkt.text, textAlign: "center", margin: "0 0 24px", letterSpacing: "-0.01em" }}>
            What this replaces
          </h2>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <ReplaceItem icon={X} before="Contact forms that don't convert" after="Instant quotes that capture every lead" />
            <ReplaceItem icon={Clock} before="Slow manual quoting" after="Automated pricing in seconds" />
            <ReplaceItem icon={MessageSquare} before="Missed leads after hours" after="24/7 quotes on your website" />
            <ReplaceItem icon={Users} before="Answering the same questions repeatedly" after="Customers self-serve their estimate" />
          </div>
          <p style={{ fontSize: 14, color: mkt.accent, textAlign: "center", margin: "24px 0 0", fontWeight: 600 }}>
            QuoteQuick handles it automatically.
          </p>
        </div>

        {/* ─── FAQ ─── */}
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(20px, 3vw, 26px)", fontWeight: 700, color: mkt.text, textAlign: "center", margin: "0 0 24px", letterSpacing: "-0.01em" }}>
            Common questions
          </h2>
          {FAQS.map(f => <FAQItem key={f.q} q={f.q} a={f.a} />)}
        </div>

        {/* ─── BOTTOM CTA ─── */}
        <div style={{ textAlign: "center", marginTop: "clamp(48px, 6vw, 72px)" }}>
          <p style={{ fontSize: "clamp(18px, 3vw, 24px)", fontWeight: 700, color: mkt.text, margin: "0 0 8px" }}>
            Ready to start getting leads?
          </p>
          <p style={{ fontSize: 14, color: mkt.textMuted, margin: "0 0 20px" }}>
            14 days free. No credit card. Live in 5 minutes.
          </p>
          <Link href="/Wizard">
            <button style={{
              padding: "16px 40px", borderRadius: 12, border: "none",
              background: mkt.accent, color: mkt.dark, cursor: "pointer",
              fontSize: 15, fontWeight: 700, transition: "all 0.15s",
              display: "inline-flex", alignItems: "center", gap: 8,
            }}
              onMouseEnter={e => { e.currentTarget.style.background = mkt.accentHover; }}
              onMouseLeave={e => { e.currentTarget.style.background = mkt.accent; }}
            >
              Start Free Trial <ArrowRight size={16} />
            </button>
          </Link>
        </div>
      </div>
    </MarketingLayout>
  );
}
