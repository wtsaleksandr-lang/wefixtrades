/**
 * /citation-builder — paid one-time citation submission service.
 *
 * Three-tier service offering: Starter $79 (25 directories), Pro $179
 * (50 directories incl. trade-specific), Premium $299 (100+ full sweep).
 * Submission backend is Wave 2.5 — for now CTAs route to a mailto:
 * placeholder so we can validate intent + collect leads via support@.
 *
 * Tiered pricing lives in shared/pricing.ts (CITATION_BUILDER ProductDef).
 * This page is the marketing surface; the actual Stripe checkout +
 * submission workflow ship in Wave 2.5.
 *
 * Per-PR-#814 color guard: inline styles use rgb(255,255,255) — NOT #fff.
 */
import { useMemo } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { useBreadcrumbSchema } from "@/lib/useBreadcrumbSchema";
import { useFaqSchema } from "@/lib/useFaqSchema";
import { Check, ArrowRight, ListChecks, ShieldCheck, Send, FileText } from "lucide-react";
import { Link } from "wouter";

const PAGE_PATH = "/citation-builder";
const SITE_URL = "https://wefixtrades.com";
const MAILTO_SUBJECT_BASE = "Citation Builder";

interface TierDef {
  id: "starter" | "pro" | "premium";
  name: string;
  price: number;
  count: string;
  blurb: string;
  badge?: string;
  highlighted?: boolean;
  features: string[];
  directories: string[];
}

const TIERS: TierDef[] = [
  {
    id: "starter",
    name: "Starter",
    price: 79,
    count: "25 directories",
    blurb: "The top general directories every local business should be on.",
    features: [
      "25 hand-picked general directories",
      "We verify + clean your NAP first",
      "Listed within 7 business days",
      "Status dashboard + completion report",
      "Email support",
    ],
    directories: [
      "Yelp", "Better Business Bureau", "YellowPages", "MapQuest",
      "Foursquare", "Manta", "Superpages", "Yellowbook",
      "MerchantCircle", "Insiderpages", "Citysearch", "Hotfrog",
      "Brownbook", "Cybo", "Cylex", "Tupalo",
      "ChamberOfCommerce.com", "n49", "EZlocal", "ShowMeLocal",
      "LocalDatabase", "iBegin", "LocalStack", "ExpressUpdate",
      "DataAxle (formerly Infogroup)",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 179,
    count: "50 directories",
    blurb: "Top general + the trade-specific platforms that actually drive leads.",
    badge: "Most Popular",
    highlighted: true,
    features: [
      "Everything in Starter (25 general directories)",
      "+25 trade & home-services directories",
      "Trade-specific platform optimization (Angi, Houzz, HomeAdvisor)",
      "Photo + service-list upload where supported",
      "Listed within 7 business days",
      "Priority email support",
    ],
    directories: [
      "All 25 Starter directories",
      "Angi (Angie's List)", "Thumbtack", "HomeAdvisor", "Houzz",
      "Porch", "Networx", "BuildZoom", "Pro Referral",
      "Trust.com", "ServiceMagic", "ImproveNet", "Findhome.com",
      "HomeStars (CA)", "TaskRabbit", "Handy", "GAF Roofing Pro",
      "PlumbingDirect", "HVAC.com", "ElectricianFinder", "RoofingContractor",
      "LandscapingNetwork", "Locksmith Ledger", "PestWorld", "Cleaning4U",
      "TradeFix Directory",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    price: 299,
    count: "100+ directories",
    blurb: "Full sweep — every directory that matters, including niche industry sites.",
    features: [
      "Everything in Pro (50 trade + general)",
      "+50 niche / regional / industry-specific directories",
      "International citation sources (Bing Places, Apple Maps Connect)",
      "Voice-search optimized directories (Alexa, Siri, Google Assistant)",
      "Aggregator submissions (Foursquare, Localeze, Acxiom)",
      "Quarterly NAP re-verification report",
      "Phone support during business hours",
    ],
    directories: [
      "All 50 Pro directories",
      "Bing Places", "Apple Maps Connect", "Google Business Profile claim",
      "Facebook Pages", "Nextdoor Local Deals", "Alignable",
      "Better Business Bureau Canada", "Foursquare for Business",
      "Localeze", "Acxiom", "Neustar Localeze", "Factual",
      "Mojo Pages", "MagicYellow", "GetFreeListing",
      "Spoke", "ZoomInfo", "DataAxle", "Infofree", "ReferenceUSA",
      "TheBlueBook", "ConstructionWire", "DozerList",
      "Plumbing.com", "ElectricalBusinessNetwork", "HVACInformed",
      "+25 industry-specific niche directories",
    ],
  },
];

const PROCESS_STEPS = [
  {
    icon: Send,
    title: "Submit your business info",
    body: "5-minute intake form: business name, address, phone, hours, services, photos. We do not auto-submit anything until you've reviewed.",
  },
  {
    icon: ShieldCheck,
    title: "Our team verifies + cleans your NAP",
    body: "We standardize phone format, fix address typos, and check that every detail matches your Google Business Profile. Mismatched NAP is worse than no listing.",
  },
  {
    icon: ListChecks,
    title: "Mass submission within 7 days",
    body: "Our team submits to every directory in your tier. Each submission is manual (not scraped) so it passes the directory's anti-spam checks.",
  },
  {
    icon: FileText,
    title: "Status dashboard + completion report",
    body: "Track each submission in your dashboard. When all directories are live, you get a completion report with direct links to every new citation.",
  },
];

const FAQ_ITEMS = [
  {
    question: "How long does the full process take?",
    answer:
      "5-7 business days from when you submit your intake form to when every directory is live. Some directories (BBB, Angi) take longer to fully publish — we'll flag those in your completion report.",
  },
  {
    question: "Will the listings stay up forever?",
    answer:
      "Yes — these are real citations, not paid placements. Once we submit and the directory accepts, your business stays listed until you ask it to be removed. There's no monthly fee.",
  },
  {
    question: "What if a directory rejects my submission?",
    answer:
      "If a directory rejects you (rare but happens — usually duplicate listing issues), we'll swap in an equivalent directory of the same tier at no extra cost. Your tier number is a guarantee, not a target.",
  },
  {
    question: "Do I need a Google Business Profile first?",
    answer:
      "Strongly recommended. Citations work best when they reinforce a verified GBP. If you don't have one yet, our MapSetup service ($397) handles the GBP claim + optimization before we run citations — it's the standard combo.",
  },
  {
    question: "How is this different from MapGuard?",
    answer:
      "Citation Builder is a one-time submission service — we get you listed everywhere, then you're done. MapGuard is ongoing managed visibility (weekly grid scans, GBP posts, review monitoring) on top of an already-strong citation foundation. Many customers do Citation Builder once, then subscribe to MapGuard.",
  },
  {
    question: "What's the catch on Starter vs Pro?",
    answer:
      "Starter (25 directories) is the right floor for any local business — it covers Yelp, BBB, YellowPages, and the other general directories Google leans on most. Pro (+25 trade-specific) is the sweet spot for service businesses (plumbers, HVAC, electricians, etc.) because Angi / Houzz / HomeAdvisor actually drive leads — not just rankings.",
  },
  {
    question: "Is checkout secure?",
    answer:
      "Yes — every order goes through Stripe Checkout. We never see or store your card. You'll receive an order confirmation email immediately and a portal login link to track every submission as it goes live.",
  },
];

function mailto(tierName: string): string {
  return `mailto:sales@wefixtrades.com?subject=${encodeURIComponent(`${MAILTO_SUBJECT_BASE} — ${tierName}`)}&body=${encodeURIComponent("Hi WeFixTrades team,\n\nI'd like to start the Citation Builder " + tierName + " tier. Here's my business info:\n\nBusiness name:\nWebsite:\nPhone:\nAddress:\n\nLooking forward to next steps.")}`;
}

/**
 * Wave 3.5 launch-wiring — drives the tier CTA to Stripe Checkout via
 * /api/citation-builder/checkout. Mailto fallback retained for legacy
 * customers / when JS is disabled.
 */
async function startCheckout(tierSlug: "starter" | "pro" | "premium", tierName: string): Promise<void> {
  try {
    const businessName = window.prompt("Business name (we'll collect the rest after payment):") || "";
    if (!businessName.trim()) return;
    const email = window.prompt("Best email for the order receipt + completion report:") || undefined;

    const res = await fetch("/api/citation-builder/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tier: tierSlug,
        business_info: { name: businessName.trim() },
        email: email?.trim() || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.checkout_url) {
      console.error("[CitationBuilder] checkout failed", data);
      window.location.href = mailto(tierName);
      return;
    }
    window.location.href = data.checkout_url;
  } catch (err) {
    console.error("[CitationBuilder] checkout error", err);
    window.location.href = mailto(tierName);
  }
}

function TierCard({ tier }: { tier: TierDef }) {
  const isHighlighted = !!tier.highlighted;
  return (
    <div
      data-testid={`tier-card-${tier.id}`}
      style={{
        background: "rgb(255,255,255)",
        border: isHighlighted ? "2px solid #0d3cfc" : "1px solid rgba(0,0,0,0.10)",
        borderRadius: 18,
        padding: 24,
        boxShadow: isHighlighted
          ? "0 18px 50px rgba(13,60,252,0.18)"
          : "0 6px 18px rgba(0,0,0,0.05)",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {tier.badge && (
        <div
          style={{
            position: "absolute",
            top: -12,
            right: 16,
            background: "#0d3cfc",
            color: "rgb(255,255,255)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "4px 10px",
            borderRadius: 999,
          }}
        >
          {tier.badge}
        </div>
      )}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0d3cfc", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {tier.name}
        </div>
        <div style={{ fontSize: 32, fontWeight: 900, color: "#111827", marginTop: 6 }}>
          ${tier.price}
          <span style={{ fontSize: 14, fontWeight: 500, color: "rgba(0,0,0,0.5)", marginLeft: 6 }}>
            one-time
          </span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginTop: 2 }}>
          {tier.count}
        </div>
        <div style={{ fontSize: 13, color: "rgba(0,0,0,0.62)", marginTop: 6, lineHeight: 1.5 }}>
          {tier.blurb}
        </div>
      </div>

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {tier.features.map((f) => (
          <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "#1f2937", lineHeight: 1.5 }}>
            <Check size={16} color="#16A34A" style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => startCheckout(tier.id, tier.name)}
        data-testid={`button-tier-${tier.id}-cta`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          background: isHighlighted ? "#0d3cfc" : "rgb(255,255,255)",
          color: isHighlighted ? "rgb(255,255,255)" : "#0d3cfc",
          border: isHighlighted ? "none" : "1.5px solid #0d3cfc",
          padding: "11px 16px",
          borderRadius: 12,
          fontSize: 14,
          fontWeight: 700,
          textDecoration: "none",
          marginTop: "auto",
          cursor: "pointer",
        }}
      >
        Start at ${tier.price} <ArrowRight size={14} />
      </button>
      <div style={{ fontSize: 11, color: "rgba(0,0,0,0.42)", textAlign: "center" }}>
        Secure Stripe checkout · 7-day delivery
      </div>
    </div>
  );
}

export default function CitationBuilderPage() {
  useBreadcrumbSchema([
    { name: "Home", url: `${SITE_URL}/` },
    { name: "Citation Builder", url: `${SITE_URL}${PAGE_PATH}` },
  ]);
  const faqSchemaItems = useMemo(
    () => FAQ_ITEMS.map((f) => ({ question: f.question, answer: f.answer })),
    [],
  );
  useFaqSchema(faqSchemaItems);

  return (
    <MarketingLayout>
      <PageMeta
        title="Citation Builder — get listed on 100+ business directories in 7 days"
        description="Done-for-you citation submission service. Starter $79 (25 directories), Pro $179 (50 trade+general), Premium $299 (100+ full sweep). Manual submissions, NAP-clean, completion report."
        canonical={PAGE_PATH}
        keywords={["citation builder", "local citation service", "business directory submission", "yelp bbb angi listing service", "trade business citations"]}
      />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section
        style={{
          background:
            "radial-gradient(circle, rgba(0,0,0,0.08) 1px, transparent 1px), linear-gradient(180deg, rgba(236,242,244,1) 0%, rgba(248,250,252,1) 100%)",
          backgroundSize: "22px 22px, 100% 100%",
          padding: "80px 16px 56px",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          {/* Wave 11D D5 — Citation Builder is part of the MapGuard Suite. */}
          <nav aria-label="breadcrumb" style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
            <Link href="/" style={{ color: "#6b7280", textDecoration: "none" }}>Home</Link>
            <span style={{ margin: "0 6px" }}>/</span>
            <Link href="/mapguard-suite" style={{ color: "#6b7280", textDecoration: "none" }}>MapGuard Suite</Link>
            <span style={{ margin: "0 6px" }}>/</span>
            <span style={{ color: "#111827" }}>Citation Builder</span>
          </nav>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#0d3cfc",
              marginBottom: 12,
            }}
          >
            <ListChecks size={12} strokeWidth={2.2} />
            Paid Service · One-time
          </div>
          <h1
            style={{
              fontSize: "clamp(32px, 5vw, 48px)",
              fontWeight: 900,
              letterSpacing: "-0.02em",
              color: "#1E1E1E",
              margin: "0 0 14px",
              lineHeight: 1.05,
            }}
          >
            Get listed on 100+ business directories — done for you in 7 days
          </h1>
          <p
            style={{
              fontSize: 17,
              color: "rgba(0,0,0,0.62)",
              maxWidth: "60ch",
              margin: "0 auto 24px",
              lineHeight: 1.6,
            }}
          >
            Local citations are one of the top 3 ranking factors for local SEO.
            We manually submit your business to the directories that actually
            move the needle for trades — NAP-clean, no spam, completion report
            when every listing is live.
          </p>
          <div style={{ display: "inline-flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            <a
              href="#tiers"
              data-testid="cta-hero-start"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "#0d3cfc",
                color: "rgb(255,255,255)",
                padding: "12px 20px",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Start at $79 <ArrowRight size={14} />
            </a>
            <a
              href="#tiers"
              data-testid="cta-hero-compare"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgb(255,255,255)",
                color: "#0d3cfc",
                border: "1.5px solid #0d3cfc",
                padding: "12px 20px",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Compare tiers
            </a>
          </div>
          <div style={{ marginTop: 14, fontSize: 12, color: "rgba(0,0,0,0.5)" }}>
            One-time payment · No subscription · 7-day delivery
          </div>
        </div>
      </section>

      {/* ── Pricing tiers ───────────────────────────────────────────── */}
      <section id="tiers" style={{ padding: "64px 16px", background: "rgb(255,255,255)" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <h2
            style={{
              textAlign: "center",
              fontSize: "clamp(24px, 3vw, 32px)",
              fontWeight: 800,
              color: "#1E1E1E",
              marginTop: 0,
              marginBottom: 8,
            }}
          >
            Pick a tier
          </h2>
          <p style={{ textAlign: "center", fontSize: 15, color: "rgba(0,0,0,0.62)", maxWidth: 580, margin: "0 auto 36px" }}>
            All tiers are one-time — pay once, listings stay live. No monthly fee, no subscription.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 20,
              alignItems: "stretch",
            }}
          >
            {TIERS.map((t) => (
              <TierCard key={t.id} tier={t} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Directory list per tier ─────────────────────────────────── */}
      <section style={{ padding: "64px 16px", background: "rgba(236,242,244,0.5)" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <h2
            style={{
              textAlign: "center",
              fontSize: "clamp(24px, 3vw, 32px)",
              fontWeight: 800,
              color: "#1E1E1E",
              marginTop: 0,
              marginBottom: 8,
            }}
          >
            What directories we submit to
          </h2>
          <p style={{ textAlign: "center", fontSize: 15, color: "rgba(0,0,0,0.62)", maxWidth: 580, margin: "0 auto 36px" }}>
            Every directory is hand-picked and manually submitted. Full lists below.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 20,
            }}
          >
            {TIERS.map((t) => (
              <div
                key={t.id}
                style={{
                  background: "rgb(255,255,255)",
                  border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 14,
                  padding: 20,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: "#0d3cfc", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
                  {t.name} · ${t.price}
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 12 }}>{t.count}</div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  {t.directories.map((d) => (
                    <li key={d} style={{ fontSize: 13, color: "rgba(0,0,0,0.72)", lineHeight: 1.6, display: "flex", gap: 6 }}>
                      <Check size={13} color="#16A34A" style={{ flexShrink: 0, marginTop: 4 }} />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Process steps ───────────────────────────────────────────── */}
      <section style={{ padding: "64px 16px", background: "rgb(255,255,255)" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <h2
            style={{
              textAlign: "center",
              fontSize: "clamp(24px, 3vw, 32px)",
              fontWeight: 800,
              color: "#1E1E1E",
              marginTop: 0,
              marginBottom: 8,
            }}
          >
            How it works
          </h2>
          <p style={{ textAlign: "center", fontSize: 15, color: "rgba(0,0,0,0.62)", maxWidth: 580, margin: "0 auto 36px" }}>
            From intake to completion report in 5-7 business days.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 20,
            }}
          >
            {PROCESS_STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.title}
                  style={{
                    background: "rgba(236,242,244,0.5)",
                    borderRadius: 14,
                    padding: 20,
                    border: "1px solid rgba(0,0,0,0.06)",
                  }}
                >
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: "rgba(13,60,252,0.10)",
                      color: "#0d3cfc",
                      marginBottom: 12,
                    }}
                  >
                    <Icon size={18} strokeWidth={2} />
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#0d3cfc", letterSpacing: "0.06em", marginBottom: 4 }}>
                    STEP {i + 1}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#111827", marginBottom: 6 }}>{s.title}</div>
                  <div style={{ fontSize: 13, color: "rgba(0,0,0,0.62)", lineHeight: 1.55 }}>{s.body}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────── */}
      <section style={{ padding: "64px 16px", background: "rgba(236,242,244,0.5)" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <h2
            style={{
              textAlign: "center",
              fontSize: "clamp(24px, 3vw, 32px)",
              fontWeight: 800,
              color: "#1E1E1E",
              marginTop: 0,
              marginBottom: 36,
            }}
          >
            Frequently asked questions
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {FAQ_ITEMS.map((item, i) => (
              <div
                key={i}
                style={{
                  background: "rgb(255,255,255)",
                  border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 14,
                  padding: 18,
                }}
              >
                <div style={{ fontWeight: 700, color: "#111827", marginBottom: 6, fontSize: 15 }}>
                  {item.question}
                </div>
                <div style={{ color: "rgba(0,0,0,0.65)", fontSize: 14, lineHeight: 1.6 }}>
                  {item.answer}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────── */}
      <section style={{ padding: "64px 16px", background: "rgb(255,255,255)" }}>
        <div
          style={{
            maxWidth: 760,
            margin: "0 auto",
            textAlign: "center",
            background: "linear-gradient(135deg, rgba(13,60,252,0.06), rgba(13,60,252,0.02))",
            border: "1px solid rgba(13,60,252,0.18)",
            borderRadius: 20,
            padding: "36px 24px",
          }}
        >
          <h2
            style={{
              fontSize: "clamp(20px, 2.6vw, 26px)",
              fontWeight: 800,
              color: "#111827",
              marginTop: 0,
              marginBottom: 8,
            }}
          >
            Ready to get listed everywhere?
          </h2>
          <p style={{ fontSize: 15, color: "rgba(0,0,0,0.62)", maxWidth: 480, margin: "0 auto 20px", lineHeight: 1.55 }}>
            Pick a tier above. Submit your intake form. We handle the rest.
            7-day delivery — guaranteed.
          </p>
          <a
            href={mailto("Starter")}
            data-testid="cta-footer-start"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "#0d3cfc",
              color: "rgb(255,255,255)",
              padding: "12px 22px",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Start at $79 <ArrowRight size={14} />
          </a>
        </div>
      </section>
    </MarketingLayout>
  );
}
