/**
 * /citation-builder — paid one-time citation submission service.
 *
 * Three tiers: Starter $79, Pro $179, Premium $299. Every directory name,
 * every count and every tier bullet on this page is generated from
 * shared/citationBuilder/directories.ts, the registry that also produces the
 * operator's checklist in the admin fulfilment queue. That is deliberate:
 * this page previously named ~80 directories, several of which had been shut
 * for years, while the fulfilment side had no way to submit to any of them.
 *
 * Tiered pricing lives in shared/pricing.ts (CITATIONBUILDER ProductDef) and
 * is asserted against the same registry by
 * `npm run check:citation-builder-fulfilment`.
 *
 * Per-PR-#814 color guard: inline styles use rgb(255,255,255) — NOT #fff.
 */
import { useEffect, useMemo, useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { useBreadcrumbSchema } from "@/lib/useBreadcrumbSchema";
import { useFaqSchema } from "@/lib/useFaqSchema";
import { Check, ArrowRight, ListChecks, ShieldCheck, Send, FileText } from "lucide-react";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mkt } from "@/theme/tokens";
import {
  CITATION_BUILDER_TIER_DIRECTORIES,
  directoryNamesForTier,
} from "@shared/citationBuilder/directories";

const PAGE_PATH = "/citation-builder";
const SITE_URL = "https://wefixtrades.com";
const MAILTO_SUBJECT_BASE = "CiteFlow";

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

/* ─────────────────────────────────────────────────────────────────────
 * HONESTY PASS 2026-08-29.
 *
 * Every directory name below now comes from
 * shared/citationBuilder/directories.ts — the SAME registry that generates
 * the operator's checklist, the Stripe line item and the customer's
 * dashboard. The page can no longer name a directory the operator is not
 * actually sent to, and the counts cannot drift from the work.
 *
 * The list this replaced named ~80 directories and guaranteed 25 / 50 /
 * 100+. Most of it could not be delivered: Angi + HomeAdvisor +
 * ServiceMagic were one company listed three times, ExpressUpdate +
 * DataAxle + Infofree + ReferenceUSA were one company listed four times,
 * Localeze appeared twice, Acxiom had been shut since 2019, Factual was
 * absorbed into Foursquare, Citysearch is a parked page, and roughly a
 * dozen names — "TradeFix Directory", "Trust.com", "PlumbingDirect",
 * "ElectricianFinder" — had no findable submission surface at all. The
 * per-directory reasons are recorded in `nonInclusionNotes` in the
 * registry.
 *
 * Fewer names, all real.
 * ───────────────────────────────────────────────────────────────────── */
const STARTER_LISTINGS = directoryNamesForTier("starter");
const PRO_ADDITIONS = directoryNamesForTier("pro").filter(n => !STARTER_LISTINGS.includes(n));
const PREMIUM_ADDITIONS = directoryNamesForTier("premium").filter(
  n => !STARTER_LISTINGS.includes(n) && !PRO_ADDITIONS.includes(n),
);

const N_STARTER = CITATION_BUILDER_TIER_DIRECTORIES.starter;
const N_PRO = CITATION_BUILDER_TIER_DIRECTORIES.pro;
const N_PREMIUM = CITATION_BUILDER_TIER_DIRECTORIES.premium;

const TIERS: TierDef[] = [
  {
    id: "starter",
    name: "Starter",
    price: 79,
    count: `${N_STARTER} listings`,
    blurb: "The listings that carry real local ranking weight — starting with the maps.",
    features: [
      `${N_STARTER} core listings — Google, Apple, Bing, Yelp, Facebook, BBB and more`,
      "We verify + clean your NAP first",
      "Every submission made by hand, within 7 business days",
      "Live dashboard with a link to each listing",
      "Email support",
    ],
    directories: STARTER_LISTINGS,
  },
  {
    id: "pro",
    name: "Pro",
    price: 179,
    count: `${N_PRO} listings`,
    blurb: "The core set plus the trade platforms and the Canadian directories.",
    badge: "Most Popular",
    highlighted: true,
    features: [
      `Everything in Starter (${N_STARTER} core listings)`,
      `+${N_PRO - N_STARTER} trade and Canadian listings`,
      "Photo + service-list upload where the directory supports it",
      "Every submission made by hand, within 7 business days",
      "Priority email support",
    ],
    directories: [`All ${N_STARTER} Starter listings`, ...PRO_ADDITIONS],
  },
  {
    id: "premium",
    name: "Premium",
    price: 299,
    count: `${N_PREMIUM} listings`,
    blurb: "Everything above plus the aggregator push and the long tail.",
    features: [
      `Everything in Pro (${N_PRO} listings)`,
      `+${N_PREMIUM - N_PRO} aggregator and long-tail listings`,
      "Data Axle + Foursquare aggregator push",
      "Every submission made by hand, within 7 business days",
      "Phone support during business hours",
    ],
    directories: [`All ${N_PRO} Pro listings`, ...PREMIUM_ADDITIONS],
  },
];

const PROCESS_STEPS = [
  {
    icon: Send,
    title: "You give us your business details",
    body: "Business name, address, phone, hours, services. Nothing is submitted anywhere until a person on our side has your details in hand.",
  },
  {
    icon: ShieldCheck,
    title: "We verify + clean your NAP",
    body: "We standardize phone format, fix address typos, and check that every detail matches your Google Business Profile. Mismatched NAP is worse than no listing.",
  },
  {
    icon: ListChecks,
    title: "A person submits each listing by hand",
    body: "Every submission in your tier is filled in manually by a human — nothing is scraped or auto-posted — so it passes each directory's anti-spam checks.",
  },
  {
    icon: FileText,
    title: "You see each listing's real outcome",
    body: "Your dashboard shows every listing with its own status and, once it's live, a direct link. Anything a directory turned down shows the reason instead of quietly disappearing.",
  },
];

const FAQ_ITEMS = [
  {
    question: "How long does this take?",
    answer:
      "We make every submission in your tier within 7 business days. How fast each one publishes after that is the directory's call, not ours — Google verification and BBB review routinely take longer, and your dashboard shows exactly which listings are still waiting.",
  },
  {
    question: "Will the listings stay up forever?",
    answer:
      "These are real citations, not paid placements — once a directory accepts your listing, it stays until you ask for it to be removed, and there's no monthly fee. Directories do sometimes change or drop data on their own, which is what CiteTrack ($19/mo) watches for.",
  },
  {
    question: "What if a directory won't accept my business?",
    answer:
      "It happens, and we tell you. Some platforms route an already-listed contractor through a sales rep, some are region-specific, and some won't apply to your trade at all. Those show in your dashboard as not accepted or not applicable with the reason we hit — we don't quietly substitute a different site to keep a number intact.",
  },
  {
    question: "Why is your list shorter than other citation services advertise?",
    answer:
      "Because most of a long list isn't real. When we checked every directory the industry recommends, a large share turned out to be the same company counted several times, shut down years ago, or with no working submission path left. We name exactly what we submit to on this page, and we'd rather hand you a shorter list that's true than a longer one that isn't.",
  },
  {
    question: "Do I need a Google Business Profile first?",
    answer:
      "No — claiming or creating it is the first item in every tier, including Starter. If you already have a verified profile we won't create a duplicate; we mark it as already handled and move on. If you want the full claim + optimization done properly, our MapSetup service ($397) covers that.",
  },
  {
    question: "How is this different from MapGuard?",
    answer:
      "CiteFlow is a one-time submission service — we get you listed, then you're done. MapGuard is ongoing managed visibility (weekly grid scans, GBP posts, review monitoring) on top of an already-strong citation foundation. Many customers do CiteFlow once, then subscribe to MapGuard.",
  },
  {
    question: "What's the difference between Starter and Pro?",
    answer:
      `Starter (${N_STARTER} listings) is the floor for any local business — the maps and search platforms Google leans on hardest, plus Yelp, Facebook and BBB. Pro adds ${N_PRO - N_STARTER} more: the trade platforms like Houzz, Thumbtack and BuildZoom, and the Canadian directories. Pro is the right pick for a service business; Premium adds the aggregator push on top.`,
  },
  {
    question: "Is checkout secure?",
    answer:
      "Yes — every order goes through Stripe Checkout. We never see or store your card. You'll receive an order confirmation email immediately and a portal login to watch each listing as it goes live.",
  },
];

function mailto(tierName: string): string {
  return `mailto:sales@wefixtrades.com?subject=${encodeURIComponent(`${MAILTO_SUBJECT_BASE} — ${tierName}`)}&body=${encodeURIComponent("Hi WeFixTrades team,\n\nI'd like to start the CiteFlow " + tierName + " tier. Here's my business info:\n\nBusiness name:\nWebsite:\nPhone:\nAddress:\n\nLooking forward to next steps.")}`;
}

/**
 * Wave 3.5 launch-wiring — drives the tier CTA to Stripe Checkout via
 * /api/citation-builder/checkout. Mailto fallback retained for legacy
 * customers / when JS is disabled.
 *
 * Wave 39 — collects business name + email through a combined in-page
 * dialog (see <CheckoutDetailsDialog>) instead of two stacked
 * window.prompt() calls. The network shape is unchanged.
 */
async function startCheckout(
  tierSlug: "starter" | "pro" | "premium",
  tierName: string,
  businessName: string,
  email: string,
): Promise<void> {
  try {
    const res = await fetch("/api/citation-builder/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tier: tierSlug,
        business_info: { name: businessName.trim() },
        email: email.trim() || undefined,
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

function TierCard({
  tier,
  onSelect,
}: {
  tier: TierDef;
  onSelect: (tier: TierDef) => void;
}) {
  const isHighlighted = !!tier.highlighted;
  return (
    <div
      data-testid={`tier-card-${tier.id}`}
      style={{
        background: "rgb(255,255,255)",
        border: isHighlighted ? `1px solid ${mkt.accent}` : "1px solid rgba(0,0,0,0.08)",
        borderRadius: 12,
        padding: 20,
        boxShadow: isHighlighted
          ? "0 8px 24px rgba(13,60,252,0.12)"
          : "0 1px 2px rgba(0,0,0,0.04)",
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
            top: -10,
            left: 14,
            background: mkt.accent,
            color: "rgb(255,255,255)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            padding: "3px 10px",
            borderRadius: 999,
          }}
        >
          {tier.badge}
        </div>
      )}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: mkt.accent, letterSpacing: "0.06em", textTransform: "uppercase" }}>
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
        onClick={() => onSelect(tier)}
        data-testid={`button-tier-${tier.id}-cta`}
        style={{
          width: "100%",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          background: isHighlighted ? mkt.accent : "#0b1220",
          color: "rgb(255,255,255)",
          border: "none",
          padding: "10px 14px",
          borderRadius: 8,
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
        Secure Stripe checkout · submitted within 7 business days
      </div>
    </div>
  );
}

/**
 * Wave 39 — checkout-details dialog. Collects business name + email in a
 * single combined form (was two stacked window.prompt() calls). Follows
 * the locked input-field rules: <Label> sits top-left of the field, gap
 * is 2px, no native browser dialogs anywhere in the flow.
 */
function CheckoutDetailsDialog({
  tier,
  open,
  onOpenChange,
  onSubmit,
}: {
  tier: TierDef | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (businessName: string, email: string) => void;
}) {
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset fields whenever the dialog opens for a new tier.
  const tierId = tier?.id ?? null;
  useEffect(() => {
    if (open) {
      setBusinessName("");
      setEmail("");
      setSubmitting(false);
    }
  }, [open, tierId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) return;
    setSubmitting(true);
    onSubmit(businessName.trim(), email.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="citation-checkout-dialog">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              Start CiteFlow{tier ? ` · ${tier.name}` : ""}
            </DialogTitle>
            <DialogDescription>
              We just need a name to put on the order. The rest of your
              business details (website, phone, address) are collected
              after payment.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-3">
            <div className="flex flex-col" style={{ gap: 2 }}>
              <Label htmlFor="citation-business-name" className="text-xs text-muted-foreground">
                Business name
              </Label>
              <Input
                id="citation-business-name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Acme Plumbing"
                autoFocus
                required
                data-testid="citation-business-name-input"
              />
            </div>
            <div className="flex flex-col" style={{ gap: 2 }}>
              <Label htmlFor="citation-email" className="text-xs text-muted-foreground">
                Email for receipt + completion report (optional)
              </Label>
              <Input
                id="citation-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                data-testid="citation-email-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!businessName.trim() || submitting}
              data-testid="citation-checkout-submit"
            >
              {submitting ? "Loading…" : tier ? `Continue · $${tier.price}` : "Continue"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function CitationBuilderPage() {
  useBreadcrumbSchema([
    { name: "Home", url: `${SITE_URL}/` },
    { name: "CiteFlow", url: `${SITE_URL}${PAGE_PATH}` },
  ]);
  const faqSchemaItems = useMemo(
    () => FAQ_ITEMS.map((f) => ({ question: f.question, answer: f.answer })),
    [],
  );
  useFaqSchema(faqSchemaItems);

  // Wave 39 — replaces the two stacked window.prompt() calls in startCheckout.
  const [activeTier, setActiveTier] = useState<TierDef | null>(null);

  return (
    <MarketingLayout>
      <PageMeta
        title={`CiteFlow — get listed on the ${N_PREMIUM} local listings that actually count`}
        description={`Done-for-you citation submission, by hand. Starter $79 (${N_STARTER} core listings), Pro $179 (${N_PRO} incl. trade + Canada), Premium $299 (${N_PREMIUM} incl. aggregators). Every directory named on the page, every outcome reported.`}
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
          textAlign: "left",
        }}
      >
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          {/* Wave 11D D5 — CiteFlow is part of the MapGuard Suite. */}
          <nav aria-label="breadcrumb" style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
            <Link href="/" style={{ color: "#6b7280", textDecoration: "none" }}>Home</Link>
            <span style={{ margin: "0 6px" }}>/</span>
            <Link href="/mapguard-suite" style={{ color: "#6b7280", textDecoration: "none" }}>MapGuard Suite</Link>
            <span style={{ margin: "0 6px" }}>/</span>
            <span style={{ color: "#111827" }}>CiteFlow</span>
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
              color: mkt.accent,
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
              color: "#0b1220",
              margin: "0 0 14px",
              lineHeight: 1.05,
            }}
          >
            Get listed where it counts — every submission made by hand
          </h1>
          <p
            style={{
              fontSize: 17,
              color: "rgba(0,0,0,0.62)",
              maxWidth: "60ch",
              margin: "0 0 24px",
              lineHeight: 1.6,
            }}
          >
            Local citations are one of the top 3 ranking factors for local SEO.
            We manually submit your business to the directories that actually
            move the needle for trades — NAP-clean, no spam, completion report
            when every listing is live.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-start" }}>
            <a
              href="#tiers"
              data-testid="cta-hero-start"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: mkt.accent,
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
                color: mkt.accent,
                border: `1.5px solid ${mkt.accent}`,
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
            One-time payment · No subscription · Submitted within 7 business days
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
              color: "#0b1220",
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
              <TierCard key={t.id} tier={t} onSelect={setActiveTier} />
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
              color: "#0b1220",
              marginTop: 0,
              marginBottom: 8,
            }}
          >
            Exactly what we submit to
          </h2>
          <p style={{ textAlign: "center", fontSize: 15, color: "rgba(0,0,0,0.62)", maxWidth: 580, margin: "0 auto 36px" }}>
            No padding and no placeholders — every listing in every tier is named below,
            and a person fills in each form by hand.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 20,
            }}
          >
            {TIERS.map((t) => (
              <details
                key={t.id}
                style={{
                  background: "rgb(255,255,255)",
                  border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 14,
                  padding: 20,
                }}
              >
                <summary style={{ cursor: "pointer", listStyle: "none" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: mkt.accent, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
                    {t.name} · ${t.price}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", display: "flex", alignItems: "center", gap: 6 }}>
                    {t.count}
                    <span style={{ fontSize: 12, fontWeight: 600, color: mkt.accent }}>· tap to view list</span>
                  </div>
                </summary>
                <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "flex", flexDirection: "column", gap: 4 }}>
                  {t.directories.map((d) => (
                    <li key={d} style={{ fontSize: 13, color: "rgba(0,0,0,0.72)", lineHeight: 1.6, display: "flex", gap: 6 }}>
                      <Check size={14} color="#16A34A" style={{ flexShrink: 0, marginTop: 4 }} />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </details>
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
              color: "#0b1220",
              marginTop: 0,
              marginBottom: 8,
            }}
          >
            How it works
          </h2>
          <p style={{ textAlign: "center", fontSize: 15, color: "rgba(0,0,0,0.62)", maxWidth: 580, margin: "0 auto 36px" }}>
            From your details to a dashboard of real outcomes.
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
                      color: mkt.accent,
                      marginBottom: 12,
                    }}
                  >
                    <Icon size={20} strokeWidth={2} />
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: mkt.accent, letterSpacing: "0.06em", marginBottom: 4 }}>
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
              color: "#0b1220",
              marginTop: 0,
              marginBottom: 36,
            }}
          >
            Frequently asked questions
          </h2>
          <div style={{ display: "grid", gap: 2 }}>
            {FAQ_ITEMS.map((item, i) => (
              <details
                key={i}
                style={{
                  background: "rgb(255,255,255)",
                  border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 8,
                  padding: "12px 14px",
                }}
              >
                <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14, color: "#0b1220" }}>
                  {item.question}
                </summary>
                <p style={{ margin: "8px 0 0", color: "#374151", fontSize: 14, lineHeight: 1.55 }}>
                  {item.answer}
                </p>
              </details>
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
            Ready to get listed?
          </h2>
          <p style={{ fontSize: 15, color: "rgba(0,0,0,0.62)", maxWidth: 480, margin: "0 auto 20px", lineHeight: 1.55 }}>
            Pick a tier above and send us your business details. We submit every listing in it
            by hand within 7 business days, and you see the real outcome of each one.
          </p>
          <button
            type="button"
            onClick={() => setActiveTier(TIERS[0])}
            data-testid="cta-footer-start"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: mkt.accent,
              color: "rgb(255,255,255)",
              padding: "12px 22px",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
            }}
          >
            Start at $79 <ArrowRight size={14} />
          </button>
        </div>
      </section>

      {/* ── CiteTrack cross-CTA ──────────────────────────────── */}
      {/* Wave 39 — funnel bridge: after listings are created, keep them accurate. */}
      <section
        data-testid="citation-builder-tracker-cta"
        style={{ padding: "64px 16px", background: "rgba(236,242,244,0.5)" }}
      >
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div
            style={{
              padding: "28px 24px",
              borderRadius: 16,
              background: "rgb(255,255,255)",
              border: "1px solid rgba(0,0,0,0.08)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.04)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: mkt.accent,
                marginBottom: 8,
              }}
            >
              After you're listed
            </div>
            <h3
              style={{
                margin: "0 0 10px",
                fontSize: 20,
                fontWeight: 800,
                color: "#111827",
                lineHeight: 1.2,
              }}
            >
              Keep them accurate with CiteTrack
            </h3>
            <p
              style={{
                margin: "0 0 18px",
                fontSize: 14,
                color: "rgba(0,0,0,0.62)",
                lineHeight: 1.6,
                maxWidth: 520,
              }}
            >
              Directories drift. CiteTrack rechecks your monitored listings daily and alerts you the moment something changes — $19/mo, or $5/mo as a MapGuard add-on.
            </p>
            <Link
              href="/citation-tracker"
              data-testid="cta-builder-to-tracker"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "#0b1220",
                color: "rgb(255,255,255)",
                padding: "10px 18px",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Monitor citations from $19/mo <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      <CheckoutDetailsDialog
        tier={activeTier}
        open={activeTier !== null}
        onOpenChange={(o) => { if (!o) setActiveTier(null); }}
        onSubmit={(businessName, email) => {
          if (!activeTier) return;
          void startCheckout(activeTier.id, activeTier.name, businessName, email);
        }}
      />
    </MarketingLayout>
  );
}
