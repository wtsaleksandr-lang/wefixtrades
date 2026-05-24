import { useState, useEffect } from "react";
import { Check, ChevronDown, ArrowRight, Zap, Clock, Users, Shield, MessageSquare, X } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { V7Hero, V7PageShell } from "@/components/marketing/v7";
import { mkt, colors } from "@/theme/tokens";
import { trackEvent } from "@/lib/trackEvent";
import { QUOTEQUICK, getTier, qqYearlyMonthlyEquiv } from "@shared/pricing";

/* Canonical QuoteQuick pricing — single source of truth (shared/pricing.ts).
   Wave Q — three-tier ladder: Free (badge shown) / Pro $29 (badge removed,
   custom domain, SMS) / Business $79 (+AI, +bookings, +CRM, +5 calcs).
   Annual = 17% off (industry-standard "two months free"). */
const FREE = getTier(QUOTEQUICK, "Free")!;
const PRO = getTier(QUOTEQUICK, "Pro")!;
const BUSINESS = getTier(QUOTEQUICK, "Business")!;

/* ─── FAQ ─── */

const FAQS = [
  { q: "Do I need a website?", a: "No. Every calculator gets a hosted page you can share via link — email, text, social media, Google Business profile. If you do have a website, you can embed it with one line of code." },
  { q: "Can I use this with Jobber or Housecall Pro?", a: "Yes. QuoteQuick works alongside whatever you already use. Leads come to your email and dashboard — no platform switch needed." },
  { q: "How fast can I set it up?", a: "Most users go live in under 5 minutes. Pick your trade, set your rate, and publish. No code, no design skills needed." },
  { q: "What happens if I don't upgrade?", a: "Your calculator stays on the Free plan forever — hosted link works, embed works, leads flow in. You'll see a small 'QuoteQuick by WeFixTrades' badge on the widget. Upgrade to Pro any time to remove it; downgrade any time to put it back." },
  { q: "What's the difference between Pro and Business?", a: "Pro ($29/mo) removes the WeFixTrades badge, adds a custom domain, SMS follow-ups, and unlimited slug reservation. Business ($79/mo) adds up to 5 calculators, online booking + deposits, the AI quote assistant, and CRM webhooks." },
  { q: "Can I cancel anytime?", a: "Yes. No contracts, no lock-in. Cancel from your dashboard in one click. Annual plans keep access until the period ends." },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: `1px solid ${mkt.onDarkBorder}` }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "18px 0", background: "transparent", border: "none", cursor: "pointer",
          textAlign: "left" as const, gap: 16,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: mkt.onDark, lineHeight: 1.4 }}>{q}</span>
        <ChevronDown size={16} color={mkt.onDarkMuted} style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </button>
      {open && (
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.7, margin: "0 0 18px", paddingRight: 32 }}>{a}</p>
      )}
    </div>
  );
}

/* ─── Feature Row ─── */

function Feature({ text, highlight }: { text: string; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 0" }}>
      <Check size={16} style={{ flexShrink: 0, marginTop: 2, color: highlight ? mkt.accent : "#4ade80" }} />
      <span style={{ fontSize: 14, color: highlight ? mkt.text : mkt.onDarkMuted, fontWeight: highlight ? 600 : 400, lineHeight: 1.5 }}>{text}</span>
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
        <p style={{ fontSize: 13, color: mkt.onDarkMuted, margin: 0, textDecoration: "line-through", opacity: 0.6 }}>{before}</p>
        <p style={{ fontSize: 14, color: mkt.onDark, margin: "2px 0 0", fontWeight: 500 }}>{after}</p>
      </div>
    </div>
  );
}

/* ─── Page ─── */

export default function QuoteQuickPricing() {
  const [annual, setAnnual] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  useEffect(() => { trackEvent('pricing_page_viewed'); }, []);

  // Detect if an existing calculator owner is visiting (via URL params)
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const calcToken = params.get('token');
  const calcId = params.get('cid');
  const hasCalc = !!(calcToken && calcId);

  // Wave Q — plan now spans free / pro / business. Free has no Stripe
  // checkout (just routes the user into the wizard). The 'starter' value
  // is kept in the union for the legacy "Quote Pro" CTA at the bottom of
  // the page, which the server still maps to the new pro tier.
  const startCheckout = async (plan: 'free' | 'pro' | 'business' | 'starter') => {
    if (plan === 'free') {
      window.location.href = '/Wizard';
      return;
    }
    if (!hasCalc) {
      // New user — go to wizard first so a calculator + edit_token exist.
      window.location.href = '/Wizard';
      return;
    }
    setCheckoutLoading(plan);
    try {
      const res = await fetch('/api/calculators/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calculator_id: parseInt(calcId!),
          token: calcToken,
          plan,
          billing: annual ? 'annual' : 'monthly',
        }),
      });
      const data = await res.json();
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        setCheckoutLoading(null);
      }
    } catch {
      setCheckoutLoading(null);
    }
  };

  // Derived from canonical pricing. Annual = yearly total / 12 (17% off).
  const proPrice = annual ? qqYearlyMonthlyEquiv(PRO.price) : PRO.price;
  const businessPrice = annual ? qqYearlyMonthlyEquiv(BUSINESS.price) : BUSINESS.price;

  return (
    <MarketingLayout>
      <PageMeta
        title="QuoteQuick pricing — free quote calculator, $29/mo Pro"
        description="QuoteQuick pricing for trades: Free for unlimited quotes, Pro at $29/mo for booking + deposits, Business for multi-location teams. No credit card required to start."
        canonical="/pricing/quotequick"
        keywords={["quotequick pricing", "quote calculator pricing"]}
      />
      <V7PageShell data-theme="light">
        <V7Hero
          productName="QuoteQuick Pricing"
          eyebrow="One booked job pays for your entire month."
          headline={<>Instant quotes on your website.<br/><span style={{ color: mkt.accent }}>Leads captured. Jobs booked.</span></>}
          sub="Free forever plan · No credit card · Works with Jobber, Housecall Pro, or whatever you use."
        />
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 20px 64px" }}>

        {/* ─── BILLING TOGGLE ─── */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 12,
            padding: "6px 8px", borderRadius: 999, background: mkt.sectionLight,
            border: `1px solid ${mkt.onDarkBorder}`,
          }}>
            <button
              onClick={() => setAnnual(false)}
              style={{
                padding: "8px 18px", borderRadius: 999, border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 600,
                background: !annual ? mkt.accent : "transparent",
                color: !annual ? mkt.dark : mkt.onDarkMuted,
                transition: "all 0.2s",
              }}
            >Monthly</button>
            <button
              onClick={() => setAnnual(true)}
              style={{
                padding: "8px 18px", borderRadius: 999, border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 600,
                background: annual ? mkt.accent : "transparent",
                color: annual ? mkt.dark : mkt.onDarkMuted,
                transition: "all 0.2s",
              }}
            >
              Annual
              <span style={{ fontSize: 11, fontWeight: 700, marginLeft: 6, color: annual ? mkt.dark : mkt.accent }}>Save 17%</span>
            </button>
          </div>
        </div>

        {/* ─── PRICING CARDS (Wave Q — three-tier ladder) ─── */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 20, marginBottom: "clamp(48px, 6vw, 72px)", maxWidth: 980, margin: "0 auto",
        }}>

          {/* FREE */}
          <div style={{
            borderRadius: 16, padding: "32px 28px",
            background: mkt.sectionLight, border: `1px solid ${mkt.onDarkBorder}`,
          }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: mkt.onDarkMuted, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 4px" }}>Free</p>
            <p style={{ fontSize: 13, color: mkt.onDarkMuted, margin: "0 0 20px" }}>Try, ship, and share at zero cost</p>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginBottom: 4 }}>
              <span style={{ fontSize: 40, fontWeight: 700, color: mkt.onDark, letterSpacing: "-0.02em", lineHeight: 1 }}>$0</span>
              <span style={{ fontSize: 14, color: mkt.onDarkMuted, marginBottom: 6 }}>/mo</span>
            </div>
            <p style={{ fontSize: 12, color: mkt.onDarkMuted, margin: "0 0 20px" }}>Forever — no credit card required</p>

            <button
              onClick={() => startCheckout('free')}
              disabled={!!checkoutLoading}
              style={{
                width: "100%", padding: "14px", borderRadius: 10, border: `1px solid ${mkt.onDarkBorder}`,
                background: "transparent", color: mkt.onDark, cursor: "pointer",
                fontSize: 14, fontWeight: 700, marginBottom: 6, transition: "all 0.15s",
                opacity: checkoutLoading ? 0.6 : 1,
              }}
              onMouseEnter={e => { if (!checkoutLoading) { e.currentTarget.style.borderColor = mkt.accent; e.currentTarget.style.color = mkt.accent; } }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = mkt.border as string; e.currentTarget.style.color = mkt.text; }}
            >
              {checkoutLoading === 'free' ? 'Loading...' : 'Start free'}
            </button>
            <p style={{ fontSize: 11, color: mkt.onDarkMuted, textAlign: "center", margin: "0 0 20px" }}>No card required</p>

            <div style={{ borderTop: `1px solid ${mkt.onDarkBorder}`, paddingTop: 16 }}>
              <Feature text="1 instant quote calculator" />
              <Feature text="Hosted page on {your-name}.your-quote.net" />
              <Feature text="Embed snippet for any website" />
              <Feature text="Lead capture with every quote" />
              <Feature text="50 leads/month" />
              <Feature text="QuoteQuick by WeFixTrades branding shown" />
            </div>
          </div>

          {/* PRO */}
          <div style={{
            borderRadius: 16, padding: "32px 28px",
            background: mkt.sectionLight,
            border: `2px solid ${mkt.accent}`,
            position: "relative",
          }}>
            <div style={{
              position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)",
              padding: "4px 16px", borderRadius: 999,
              background: mkt.accent, color: "#FFFFFF",
              fontSize: 11, fontWeight: 700, letterSpacing: "0.03em",
            }}>
              MOST POPULAR
            </div>

            <p style={{ fontSize: 13, fontWeight: 700, color: mkt.accent, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 4px" }}>Pro</p>
            <p style={{ fontSize: 13, color: mkt.onDarkMuted, margin: "0 0 20px" }}>Look professional. No branding.</p>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginBottom: 4 }}>
              <span style={{ fontSize: 40, fontWeight: 700, color: mkt.onDark, letterSpacing: "-0.02em", lineHeight: 1 }}>${proPrice}</span>
              <span style={{ fontSize: 14, color: mkt.onDarkMuted, marginBottom: 6 }}>/mo</span>
            </div>
            {annual && <p style={{ fontSize: 12, color: mkt.accent, margin: "0 0 20px" }}>Billed yearly (${proPrice * 12}/yr)</p>}
            {!annual && <p style={{ fontSize: 12, color: mkt.onDarkMuted, margin: "0 0 20px" }}>${qqYearlyMonthlyEquiv(PRO.price)}/mo billed annually</p>}

            <button
              onClick={() => startCheckout('pro')}
              disabled={!!checkoutLoading}
              style={{
                width: "100%", padding: "14px", borderRadius: 10, border: "none",
                background: mkt.ctaBg, color: mkt.ctaText, cursor: "pointer",
                fontSize: 14, fontWeight: 500, marginBottom: 6, transition: "background 0.15s",
                opacity: checkoutLoading ? 0.6 : 1,
              }}
              onMouseEnter={e => { if (!checkoutLoading) e.currentTarget.style.background = mkt.ctaBgHover; }}
              onMouseLeave={e => { e.currentTarget.style.background = mkt.ctaBg; }}
            >
              {checkoutLoading === 'pro' ? 'Redirecting...' : hasCalc ? 'Choose Pro' : 'Start Pro'}
            </button>
            <p style={{ fontSize: 11, color: mkt.onDarkMuted, textAlign: "center", margin: "0 0 20px" }}>{hasCalc ? 'Instant activation' : 'Cancel any time'}</p>

            <div style={{ borderTop: `1px solid ${mkt.onDarkBorder}`, paddingTop: 16 }}>
              <Feature text="Everything in Free, plus:" />
              <Feature text="Remove WeFixTrades branding" highlight />
              <Feature text="Custom domain (quotes.yoursite.com)" highlight />
              <Feature text="1,000 leads/month" />
              <Feature text="Email + SMS follow-ups" />
              <Feature text="Indefinite hosted-link reservation" />
              <Feature text="Priority email support" />
            </div>
          </div>

          {/* BUSINESS */}
          <div style={{
            borderRadius: 16, padding: "32px 28px",
            background: mkt.sectionLight, border: `1px solid ${mkt.onDarkBorder}`,
          }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: mkt.onDarkMuted, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 4px" }}>Business</p>
            <p style={{ fontSize: 13, color: mkt.onDarkMuted, margin: "0 0 20px" }}>Run a real operation</p>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginBottom: 4 }}>
              <span style={{ fontSize: 40, fontWeight: 700, color: mkt.onDark, letterSpacing: "-0.02em", lineHeight: 1 }}>${businessPrice}</span>
              <span style={{ fontSize: 14, color: mkt.onDarkMuted, marginBottom: 6 }}>/mo</span>
            </div>
            {annual && <p style={{ fontSize: 12, color: mkt.accent, margin: "0 0 20px" }}>Billed yearly (${businessPrice * 12}/yr)</p>}
            {!annual && <p style={{ fontSize: 12, color: mkt.onDarkMuted, margin: "0 0 20px" }}>${qqYearlyMonthlyEquiv(BUSINESS.price)}/mo billed annually</p>}

            <button
              onClick={() => startCheckout('business')}
              disabled={!!checkoutLoading}
              style={{
                width: "100%", padding: "14px", borderRadius: 10, border: `1px solid ${mkt.onDarkBorder}`,
                background: "transparent", color: mkt.onDark, cursor: "pointer",
                fontSize: 14, fontWeight: 700, marginBottom: 6, transition: "all 0.15s",
                opacity: checkoutLoading ? 0.6 : 1,
              }}
              onMouseEnter={e => { if (!checkoutLoading) { e.currentTarget.style.borderColor = mkt.accent; e.currentTarget.style.color = mkt.accent; } }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = mkt.border as string; e.currentTarget.style.color = mkt.text; }}
            >
              {checkoutLoading === 'business' ? 'Redirecting...' : hasCalc ? 'Choose Business' : 'Start Business'}
            </button>
            <p style={{ fontSize: 11, color: mkt.onDarkMuted, textAlign: "center", margin: "0 0 20px" }}>Cancel any time</p>

            <div style={{ borderTop: `1px solid ${mkt.onDarkBorder}`, paddingTop: 16 }}>
              <Feature text="Everything in Pro, plus:" />
              <Feature text="Up to 5 calculators" highlight />
              <Feature text="Online booking + deposits" highlight />
              <Feature text="AI quote assistant" highlight />
              <Feature text="Webhook / CRM (Zapier, Stripe, HubSpot)" />
              <Feature text="Promo code support at checkout" />
              <Feature text="5,000 leads/month" />
            </div>
          </div>
        </div>

        {/* ─── VALUE STRIP ─── */}
        <div style={{
          maxWidth: 700, margin: "0 auto clamp(48px, 6vw, 72px)",
          padding: "28px 24px", borderRadius: 16,
          background: mkt.accentTint, border: `1px solid rgba(13,60,252,0.15)`,
          textAlign: "center",
        }}>
          <p style={{ fontSize: "clamp(16px, 2.5vw, 20px)", fontWeight: 700, color: mkt.onDark, margin: "0 0 6px" }}>
            Most users recover the cost with their first lead.
          </p>
          <p style={{ fontSize: 14, color: mkt.onDarkMuted, margin: "0 0 20px", lineHeight: 1.6 }}>
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
                <p style={{ fontSize: 14, fontWeight: 600, color: mkt.onDark, margin: "0 0 2px" }}>{v.label}</p>
                <p style={{ fontSize: 12, color: mkt.onDarkMuted, margin: 0 }}>{v.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ─── WHAT THIS REPLACES ─── */}
        <div style={{ maxWidth: 560, margin: "0 auto clamp(48px, 6vw, 72px)" }}>
          <h2 style={{ fontSize: "clamp(20px, 3vw, 26px)", fontWeight: 700, color: mkt.onDark, textAlign: "center", margin: "0 0 24px", letterSpacing: "-0.01em" }}>
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
          <h2 style={{ fontSize: "clamp(20px, 3vw, 26px)", fontWeight: 700, color: mkt.onDark, textAlign: "center", margin: "0 0 24px", letterSpacing: "-0.01em" }}>
            Common questions
          </h2>
          {FAQS.map(f => <FAQItem key={f.q} q={f.q} a={f.a} />)}
        </div>

        {/* ─── BOTTOM CTA ─── */}
        <div style={{ textAlign: "center", marginTop: "clamp(48px, 6vw, 72px)" }}>
          <p style={{ fontSize: "clamp(18px, 3vw, 24px)", fontWeight: 700, color: mkt.onDark, margin: "0 0 8px" }}>
            Ready to start getting leads?
          </p>
          <p style={{ fontSize: 14, color: mkt.onDarkMuted, margin: "0 0 20px" }}>
            14 days free. No credit card. Live in 5 minutes.
          </p>
          <button
            onClick={() => hasCalc ? startCheckout('starter') : (window.location.href = '/Wizard')}
            style={{
              padding: "16px 40px", borderRadius: 10, border: "none",
              background: mkt.ctaBg, color: mkt.ctaText, cursor: "pointer",
              fontSize: 15, fontWeight: 500, transition: "background 0.15s",
              display: "inline-flex", alignItems: "center", gap: 8,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = mkt.ctaBgHover; }}
            onMouseLeave={e => { e.currentTarget.style.background = mkt.ctaBg; }}
          >
            {hasCalc ? 'Choose a Plan' : 'Start Free Trial'} <ArrowRight size={16} />
          </button>
        </div>
      </div>
      </V7PageShell>
    </MarketingLayout>
  );
}
