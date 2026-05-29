/**
 * /citation-tracker — Citation Tracker subscription product (Wave 3).
 *
 * Continuous monitoring across 50+ directories. Distinct from
 * /citation-builder which is the one-shot $79-$299 submission service.
 *
 * Pricing:
 *   $19/mo standalone (or $190/yr — 2 months free)
 *   $5/mo as a MapGuard bundle add-on ($50/yr)
 *
 * Marketing surface only — checkout posts to
 * /api/citation-tracker/subscribe which returns a Stripe Checkout URL.
 */
import { useMemo, useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SuiteBreadcrumb } from "@/components/marketing/SuiteBreadcrumb";
import { PageMeta } from "@/components/seo/PageMeta";
import { useBreadcrumbSchema } from "@/lib/useBreadcrumbSchema";
import { useFaqSchema } from "@/lib/useFaqSchema";
import { Link } from "wouter";
import { Activity, Bell, Globe, Check, ArrowRight, Loader2, AlertTriangle, Code, Wrench } from "lucide-react";
import { mkt } from "@/theme/tokens";

const PAGE_PATH = "/citation-tracker";
const SITE_URL = "https://wefixtrades.com";

const FAQ_ITEMS = [
  {
    question: "How is Citation Tracker different from Citation Builder?",
    answer: "Citation Builder is a one-shot $79–$299 service: we list you on 25–100+ directories. Citation Tracker is recurring $19/mo (or $5/mo as a MapGuard add-on): we continuously monitor those listings for NAP changes, new auto-spawn citations, and removals — and alert you the moment something drifts.",
  },
  {
    question: "How often do you scan?",
    answer: "Every directory is rechecked daily. The first full scan runs within 24 hours of subscribing.",
  },
  {
    question: "Which directories do you cover?",
    answer: "50+ directories spanning general (Yelp, BBB, Yellow Pages, MapQuest), mapping (Bing Places, Apple Maps, HERE, Waze), social (Foursquare, Facebook, LinkedIn), data aggregators (Data Axle, ExpressUpdate), and trade-specific platforms (Angi, Thumbtack, HomeAdvisor, Houzz, Porch, GAF, plus per-trade niches).",
  },
  {
    question: "Can I bundle this with MapGuard?",
    answer: "Yes — that's the discount tier. MapGuard customers pay just $5/mo for Citation Tracker (instead of $19/mo standalone). MapGuard handles your Google Business Profile; Citation Tracker handles the rest of the citation graph.",
  },
  {
    question: "What happens when a NAP change is detected?",
    answer: "You get an email immediately, the alert lands on your dashboard color-coded by severity, and the listing is flagged. You can dismiss alerts after fixing them.",
  },
  {
    question: "Can I cancel anytime?",
    answer: "Yes. One-click via the Stripe customer portal from your dashboard. No annual lock-in even on the yearly plan — yearly is just two months free if you pay up front.",
  },
];

interface PlanOption {
  id: "standalone_monthly" | "standalone_yearly" | "bundle_monthly" | "bundle_yearly";
  title: string;
  priceLabel: string;
  blurb: string;
  features: string[];
  highlight?: boolean;
  badge?: string;
}

const PLANS: PlanOption[] = [
  {
    id: "standalone_monthly",
    title: "Standalone",
    priceLabel: "$19/mo",
    blurb: "Monitor your citations across 50+ directories.",
    features: [
      "Daily scan of 50+ directories",
      "Email alerts on NAP changes",
      "New-citation discovery",
      "Removed-listing alerts",
      "Dashboard with full diff history",
    ],
  },
  {
    id: "bundle_monthly",
    title: "MapGuard bundle add-on",
    priceLabel: "$5/mo",
    blurb: "Already a MapGuard customer? Add Citation Tracker for $5/mo.",
    badge: "Best value",
    highlight: true,
    features: [
      "Everything in Standalone",
      "$24/mo combined vs $19+$19 separately",
      "Unified MapGuard + Citation Tracker alerts",
      "One billing line, one dashboard",
    ],
  },
  {
    id: "standalone_yearly",
    title: "Annual (standalone)",
    priceLabel: "$190/yr",
    blurb: "Pay yearly, get 2 months free.",
    features: [
      "Same as Standalone — paid annually",
      "Two months free vs monthly",
      "Cancel anytime",
    ],
  },
];

export default function CitationTrackerPage() {
  useBreadcrumbSchema([
    { name: "Home", url: `${SITE_URL}/` },
    { name: "Citation Tracker", url: `${SITE_URL}${PAGE_PATH}` },
  ]);
  const faqSchemaItems = useMemo(
    () => FAQ_ITEMS.map((f) => ({ question: f.question, answer: f.answer })),
    [],
  );
  useFaqSchema(faqSchemaItems);

  return (
    <MarketingLayout>
      <PageMeta
        title="Citation Tracker — continuous NAP drift monitoring across 50+ directories"
        description="Catch NAP changes before they tank your local rankings. Daily monitoring of 50+ business directories. $19/mo standalone or $5/mo as a MapGuard add-on. Two months free annual."
        canonical={PAGE_PATH}
        keywords={["citation tracker", "NAP monitoring", "local citation monitoring", "directory listing monitoring", "yelp BBB listing tracker"]}
      />

      <div data-theme="light">
        <SuiteBreadcrumb productName="Citation Tracker" variant="light" />
        <CitationTrackerHero />
        <CitationTrackerThreeColumnHelps />
        <CitationTrackerFeatures />
        <CitationTrackerPricing />
        <CitationTrackerHowItWorks />
        <CitationTrackerWhyTrustUs />
        <CitationTrackerFAQ />
      </div>

      <StickyCtaBar />
    </MarketingLayout>
  );
}

/* ─── Sections ─── */

function CitationTrackerHero() {
  return (
    <section
      style={{
        // Wave 6C — BrightLocal-style dark hero. Very dark navy background
        // with a subtle dotted-grid backdrop. No raw #hex — rgb() form per
        // PR #814 color-guard rules.
        background:
          "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(180deg, rgb(10,23,41) 0%, rgb(13,20,36) 100%)",
        backgroundSize: "22px 22px, 100% 100%",
        padding: "72px 16px 56px",
        color: "rgb(255,255,255)",
      }}
      data-testid="citation-tracker-hero"
    >
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 40,
          alignItems: "center",
        }}
        className="citation-hero-grid"
      >
        <div>
          <nav aria-label="breadcrumb" style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 14 }}>
            <Link href="/" style={{ color: "rgba(255,255,255,0.55)", textDecoration: "none" }}>Home</Link>
            <span style={{ margin: "0 6px" }}>›</span>
            <span style={{ color: "rgb(255,255,255)" }}>Citation Tracker</span>
          </nav>
          {/* Pill badge — BrightLocal-style "category" tag. */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 999,
              background: "rgba(34,197,94,0.14)",
              border: "1px solid rgba(34,197,94,0.4)",
              color: "rgb(134,239,172)",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            <Check size={12} /> Local citation tracker &amp; audit tool
          </div>
          <h1 style={{ fontSize: 40, fontWeight: 900, lineHeight: 1.12, margin: "0 0 14px", color: "rgb(255,255,255)" }}>
            Stay accurate everywhere customers find you.
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: "rgba(255,255,255,0.75)", margin: "0 0 22px", maxWidth: 560 }}>
            Citation Tracker watches your business's name, address, and phone across
            50+ directories — Yelp, BBB, Bing Places, Apple Maps, Foursquare, Angi,
            Houzz — and alerts you the moment a listing drifts, a new auto-citation
            appears, or a directory removes you.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Link
              href="/tools/citation-checker"
              data-testid="cta-citation-hero-free-audit"
              style={{
                background: "rgb(22,163,74)",
                color: "rgb(255,255,255)",
                padding: "12px 18px",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 700,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              Start your free citation audit <ArrowRight size={14} />
            </Link>
            <a
              href="#pricing"
              style={{
                background: "transparent",
                color: "rgb(255,255,255)",
                padding: "12px 18px",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
                border: "1px solid rgba(255,255,255,0.3)",
              }}
            >
              See subscription pricing
            </a>
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 14 }}>
            From $5/mo as a MapGuard add-on · $19/mo standalone · cancel anytime
          </div>
        </div>
        <CitationTrackerHeroPreview />
      </div>
      <style>{`
        @media (max-width: 880px) {
          .citation-hero-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}

/**
 * Wave 6C — static dashboard mock for the hero right column. Mirrors
 * BrightLocal's preview card pattern: a NAP-error alert at the top, a
 * "Key Citation Score" widget with circular progress, found / not-found
 * counts, and a Citation Flow Score progress bar.
 *
 * Static / illustrative — the numbers are illustrative defaults that
 * match the screenshots Alex provided (not real customer data). Reuses
 * tokens / rgb() form so the color guard stays happy.
 */
function CitationTrackerHeroPreview() {
  return (
    <div
      data-testid="citation-tracker-hero-preview"
      style={{
        position: "relative",
        borderRadius: 18,
        padding: 20,
        background: "rgb(255,255,255)",
        color: "rgb(17,24,39)",
        boxShadow: "0 20px 50px rgba(0,0,0,0.4)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Suspected NAP error alert. */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "10px 12px",
          borderRadius: 12,
          background: "rgba(251,146,60,0.12)",
          border: "1px solid rgba(251,146,60,0.45)",
          marginBottom: 14,
        }}
      >
        <AlertTriangle size={16} style={{ color: "rgb(234,88,12)", flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 12, lineHeight: 1.45 }}>
          <div style={{ fontWeight: 700, color: "rgb(124,45,18)" }}>Suspected NAP error</div>
          <div style={{ color: "rgba(0,0,0,0.65)" }}>
            BBB listing shows old phone (555-0144) — your canonical is (555-0188).
          </div>
        </div>
      </div>

      {/* Two-column row: key citation score (circular) + found / not-found. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            background: "rgba(248,250,252,1)",
            border: "1px solid rgba(0,0,0,0.06)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          {/* Inline SVG circular progress — 46/100 → ~46% (4.6/10). */}
          <svg width="56" height="56" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="24" stroke="rgba(0,0,0,0.08)" strokeWidth="6" fill="none" />
            <circle
              cx="28" cy="28" r="24"
              stroke="rgb(13,60,252)" strokeWidth="6" fill="none"
              strokeDasharray={`${(46 / 100) * (2 * Math.PI * 24)} ${2 * Math.PI * 24}`}
              transform="rotate(-90 28 28)"
              strokeLinecap="round"
            />
          </svg>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(0,0,0,0.5)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Key Citation Score
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "rgb(17,24,39)" }}>4.6<span style={{ fontSize: 12, color: "rgba(0,0,0,0.5)" }}> / 10</span></div>
          </div>
        </div>
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            background: "rgba(248,250,252,1)",
            border: "1px solid rgba(0,0,0,0.06)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 20, fontWeight: 900, color: "rgb(22,163,74)" }}>19</span>
            <span style={{ fontSize: 11, color: "rgba(0,0,0,0.55)", fontWeight: 600 }}>found</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 20, fontWeight: 900, color: "rgb(220,38,38)" }}>20</span>
            <span style={{ fontSize: 11, color: "rgba(0,0,0,0.55)", fontWeight: 600 }}>not found</span>
          </div>
        </div>
      </div>

      {/* Citation Flow Score with progress bars. */}
      <div style={{ padding: 12, borderRadius: 12, background: "rgba(248,250,252,1)", border: "1px solid rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(0,0,0,0.55)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Citation Flow Score
          </div>
          <div style={{ fontSize: 16, fontWeight: 900, color: "rgb(17,24,39)" }}>27<span style={{ fontSize: 11, color: "rgba(0,0,0,0.5)" }}> / 100</span></div>
        </div>
        {[
          { label: "Mapping", pct: 32 },
          { label: "Social", pct: 22 },
          { label: "Aggregators", pct: 18 },
        ].map((row) => (
          <div key={row.label} style={{ marginTop: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(0,0,0,0.6)" }}>
              <span>{row.label}</span>
              <span>{row.pct}%</span>
            </div>
            <div style={{ height: 6, background: "rgba(0,0,0,0.06)", borderRadius: 999, overflow: "hidden", marginTop: 2 }}>
              <div style={{ width: `${row.pct}%`, height: "100%", background: "rgb(13,60,252)" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Wave 6C — 3-column "How Citation Tracker helps you" section.
   White-card numbered items (01/02/03) — BrightLocal pattern but with our
   tokens. Sits directly under the hero. */
function CitationTrackerThreeColumnHelps() {
  const items = [
    {
      n: "01",
      title: "Fix frustrating errors",
      body: "Wrong number, old address, dropped suite — the kind of errors that turn a paying customer into a missed call. We surface every one within hours.",
    },
    {
      n: "02",
      title: "Analyze the competition",
      body: "See where your competitors are listed (and where you're not). Citation coverage gaps are a common reason a competitor 3 km away outranks you.",
    },
    {
      n: "03",
      title: "Reclaim your time",
      body: "Stop manually re-checking 50 directories every quarter. Citation Tracker does it daily and only pings you when something actually changes.",
    },
  ];
  return (
    <section
      data-testid="citation-tracker-three-column-helps"
      style={{ padding: "60px 16px", background: "rgb(255,255,255)" }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, textAlign: "center", margin: "0 0 32px", color: "rgb(11,18,32)" }}>
          How Citation Tracker helps you
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          {items.map((item) => (
            <div
              key={item.n}
              style={{
                padding: 20,
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.08)",
                background: "rgb(255,255,255)",
                boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
              }}
            >
              <div style={{ fontSize: 28, fontWeight: 900, color: "rgb(13,60,252)", lineHeight: 1, marginBottom: 8 }}>
                {item.n}
              </div>
              <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "rgb(11,18,32)" }}>
                {item.title}
              </h3>
              <p style={{ margin: 0, fontSize: 14, color: "rgba(55,65,81,1)", lineHeight: 1.55 }}>{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* Wave 6C — "Why trust us" section. Replaces the BrightLocal-style fake
   "15,000+ customers / 4.8★" social proof per Alex Q3: borrowed
   credibility only. Tech stack quality + transparency + founder
   positioning, no fabricated numbers. */
function CitationTrackerWhyTrustUs() {
  const reasons = [
    {
      icon: Globe,
      title: "Built on the APIs Google uses",
      body: "We query the same Places + Maps APIs Google's own products use to verify business info — not a scraped index that drifts out of date.",
    },
    {
      icon: Code,
      title: "Audit code is in the open",
      body: "What we check, and how we check it, is in our public repo. You can read exactly what \"missing\", \"found\", or \"inconsistent\" means for every directory we cover.",
    },
    {
      icon: Wrench,
      title: "Designed and tested by working trades",
      body: "We're not marketers selling to trades — we're trades who got tired of paying for tools that didn't catch our own NAP errors. The directory list and severity rubric come from running real plumbing / HVAC / electrical jobs.",
    },
  ];
  return (
    <section
      data-testid="citation-tracker-why-trust-us"
      style={{ padding: "60px 16px", background: "rgba(248,250,252,1)" }}
    >
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, textAlign: "center", margin: "0 0 8px", color: "rgb(11,18,32)" }}>
          Why trust us
        </h2>
        <p style={{ textAlign: "center", color: "rgba(0,0,0,0.6)", fontSize: 14, margin: "0 0 28px" }}>
          We don't have fabricated customer counts or borrowed star ratings. Here's what we do have.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {reasons.map((r) => (
            <div
              key={r.title}
              style={{
                display: "flex",
                gap: 14,
                alignItems: "flex-start",
                padding: 18,
                borderRadius: 12,
                background: "rgb(255,255,255)",
                border: "1px solid rgba(0,0,0,0.06)",
              }}
            >
              <r.icon size={22} style={{ color: "rgb(13,60,252)", flexShrink: 0, marginTop: 2 }} />
              <div>
                <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "rgb(11,18,32)" }}>{r.title}</h3>
                <p style={{ margin: 0, fontSize: 14, color: "rgba(55,65,81,1)", lineHeight: 1.55 }}>{r.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CitationTrackerFeatures() {
  const features = [
    {
      icon: Activity,
      title: "Continuous monitoring",
      body: "Daily scans across 50+ directories. The minute a directory edits your listing — by aggregator-spawn, scraper, or competitor edit — we see it.",
    },
    {
      icon: Bell,
      title: "Instant alerts",
      body: "Email + dashboard alerts within hours of drift, color-coded by severity. Phone or address changes are flagged HIGH; cosmetic changes stay informational.",
    },
    {
      icon: Globe,
      title: "Multi-directory coverage",
      body: "General (Yelp, BBB, YP), mapping (Bing, Apple, HERE), social (Foursquare, FB, LinkedIn), data aggregators, and trade-specific platforms (Angi, Houzz, Thumbtack).",
    },
  ];
  return (
    <section style={{ padding: "60px 16px", background: "rgba(255,255,255,1)" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, textAlign: "center", margin: "0 0 32px", color: "#0b1220" }}>
          Why customers pay for Citation Tracker
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          {features.map((f) => (
            <div key={f.title} style={{
              padding: 20, borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)",
              background: "rgba(248,250,252,1)",
            }}>
              <f.icon size={22} style={{ color: mkt.accent, marginBottom: 10 }} />
              <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "#0b1220" }}>{f.title}</h3>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "#374151" }}>{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CitationTrackerPricing() {
  return (
    <section id="pricing" style={{ padding: "60px 16px", background: "rgba(248,250,252,1)" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, textAlign: "center", margin: "0 0 8px", color: "#0b1220" }}>
          Pricing
        </h2>
        <p style={{ margin: "0 0 28px", textAlign: "center", color: "#6b7280", fontSize: 14 }}>
          Two months free on annual. Cancel anytime from your dashboard.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          {PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PlanCard({ plan }: { plan: PlanOption }) {
  const [loading, setLoading] = useState(false);

  async function start() {
    setLoading(true);
    try {
      const res = await fetch("/api/citation-tracker/subscribe", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plan: plan.id,
          business_name: "(Pending — set on dashboard)",
          nap: {},
        }),
      });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent("/citation-tracker")}`;
        return;
      }
      const json = await res.json();
      if (json.checkout_url) {
        window.location.href = json.checkout_url;
      } else {
        alert(json.error || "Could not start checkout — please try again.");
      }
    } catch (err: any) {
      alert(err?.message || "Could not reach the server — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      padding: 20, borderRadius: 12,
      border: `1px solid ${plan.highlight ? mkt.accent : "rgba(0,0,0,0.08)"}`,
      background: "rgba(255,255,255,1)",
      position: "relative",
      boxShadow: plan.highlight ? "0 8px 24px rgba(13,60,252,0.12)" : "0 1px 2px rgba(0,0,0,0.04)",
    }}>
      {plan.badge && (
        <div style={{ position: "absolute", top: -10, left: 14, background: mkt.accent, color: "rgb(255,255,255)", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {plan.badge}
        </div>
      )}
      <div style={{ fontSize: 14, fontWeight: 600, color: "#0b1220" }}>{plan.title}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#0b1220", margin: "4px 0 8px" }}>{plan.priceLabel}</div>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280", lineHeight: 1.45 }}>{plan.blurb}</p>
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px", display: "grid", gap: 2 }}>
        {plan.features.map((f) => (
          <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "#1f2937", lineHeight: 1.5 }}>
            <Check size={14} style={{ color: mkt.accent, flexShrink: 0, marginTop: 3 }} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={start}
        disabled={loading}
        style={{
          width: "100%",
          padding: "10px 14px",
          background: plan.highlight ? mkt.accent : "#0b1220",
          color: "rgb(255,255,255)",
          border: "none",
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 700,
          cursor: loading ? "wait" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
        Start {plan.title.toLowerCase()}
      </button>
    </div>
  );
}

function CitationTrackerHowItWorks() {
  const steps = [
    { n: 1, title: "Subscribe", body: "Pick standalone or bundle. Stripe handles billing. Setup takes 60 seconds." },
    { n: 2, title: "We scan daily", body: "Every directory in our 50+ registry is checked daily for NAP drift, new auto-citations, and removals." },
    { n: 3, title: "You stay in front", body: "Email + dashboard alerts the moment anything moves. Fix it before Google notices." },
  ];
  return (
    <section style={{ padding: "60px 16px", background: "rgba(255,255,255,1)" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, textAlign: "center", margin: "0 0 32px", color: "#0b1220" }}>How it works</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          {steps.map((s) => (
            <div key={s.n} style={{ padding: 20, borderRadius: 12, background: "rgba(248,250,252,1)", border: "1px solid rgba(0,0,0,0.08)" }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: mkt.accent, textTransform: "uppercase" }}>Step {s.n}</div>
              <h3 style={{ margin: "4px 0 6px", fontSize: 16, fontWeight: 700, color: "#0b1220" }}>{s.title}</h3>
              <p style={{ margin: 0, fontSize: 14, color: "#374151", lineHeight: 1.5 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CitationTrackerFAQ() {
  return (
    <section style={{ padding: "60px 16px", background: "rgba(248,250,252,1)" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, textAlign: "center", margin: "0 0 24px", color: "#0b1220" }}>FAQ</h2>
        <div style={{ display: "grid", gap: 2 }}>
          {FAQ_ITEMS.map((f) => (
            <details key={f.question} style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, padding: "12px 14px", background: "rgba(255,255,255,1)" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14, color: "#0b1220" }}>{f.question}</summary>
              <p style={{ margin: "8px 0 0", fontSize: 14, color: "#374151", lineHeight: 1.55 }}>{f.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function StickyCtaBar() {
  return (
    <div
      style={{
        position: "sticky",
        bottom: 0,
        zIndex: 30,
        background: "rgba(11,18,32,0.96)",
        color: "rgb(255,255,255)",
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        flexWrap: "wrap",
        boxShadow: "0 -6px 24px rgba(0,0,0,0.2)",
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 600 }}>Catch NAP drift before Google does.</span>
      <a
        href="#pricing"
        style={{
          background: mkt.accent,
          color: "rgb(255,255,255)",
          padding: "8px 14px",
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        See pricing
      </a>
    </div>
  );
}
