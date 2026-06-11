import { SERVICES, getServicesForIssues, type Service } from "../data/services";
import {
  ALL_PRODUCTS,
  ALL_BUNDLES,
  QUOTEQUICK,
  CONTENTFLOW,
  YEARLY_DISCOUNT_PCT,
  QUOTEQUICK_YEARLY_DISCOUNT_PCT,
  formatPrice,
  bundleSavings,
  getTier,
  type ProductDef,
  type Tier,
} from "@shared/pricing";

/**
 * Extensible knowledge layer.
 *
 * Each knowledge source is a simple function that returns a text block.
 * To add a new source: register it in the KNOWLEDGE_SOURCES array below.
 * The assistant receives all active sources compiled into the system prompt.
 */

/* ─── Source registry ─── */
interface KnowledgeSource {
  id: string;
  label: string;
  compile: () => string;
}

const KNOWLEDGE_SOURCES: KnowledgeSource[] = [
  { id: "services", label: "DONE-FOR-YOU SERVICES & PRICING", compile: compileServices },
  { id: "plans", label: "PRODUCT PLANS & PRICING (ALL TIERS)", compile: compilePlans },
  { id: "bundles", label: "BUNDLE PACKAGES", compile: compileBundles },
  { id: "business", label: "ABOUT WEFIXTRADES", compile: compileBusinessInfo },
  { id: "faq", label: "FREQUENTLY ASKED QUESTIONS", compile: compileFAQs },
  { id: "reviews", label: "CUSTOMER TESTIMONIALS", compile: compileReviews },
];

/* ─── Simple TTL cache for compiled knowledge ─── */
// Knowledge sources are all static data (no DB calls). Caching avoids
// re-concatenating ~3KB of text on every request. 5-minute TTL is short
// enough that any code-level data changes take effect quickly.
let _knowledgeCache: string | null = null;
let _knowledgeCacheExpiry = 0;
const KNOWLEDGE_CACHE_TTL_MS = 5 * 60_000; // 5 minutes

/* ─── Public API ─── */

/** Compile all knowledge into a single text block for the system prompt */
export function compileKnowledge(): string {
  const now = Date.now();
  if (_knowledgeCache && now < _knowledgeCacheExpiry) {
    return _knowledgeCache;
  }
  _knowledgeCache = KNOWLEDGE_SOURCES.map(
    (src) => `=== ${src.label} ===\n${src.compile()}`
  ).join("\n\n");
  _knowledgeCacheExpiry = now + KNOWLEDGE_CACHE_TTL_MS;
  return _knowledgeCache;
}

/** Recommended services for a set of detected issue IDs */
export function getRecommendedServices(issueIds: string[]): Service[] {
  return getServicesForIssues(issueIds);
}

/** Format recommended services for prompt injection */
export function formatRecommendedServices(services: Service[]): string {
  if (!services.length) return "";
  return services
    .map(
      (s) =>
        `• ${s.name} (${s.priceLabel}) — ${s.tagline}. Features: ${s.features.join("; ")}.`
    )
    .join("\n");
}

/* ─── Source: Done-for-you services (from server/data/services.ts) ─── */
function compileServices(): string {
  return SERVICES.map(
    (s) =>
      `• ${s.name} — ${s.tagline}. ${s.priceLabel} (${s.billingPeriod}). Category: ${s.category}. Features: ${s.features.join("; ")}. Addresses: ${s.fixesIssues.join(", ")}.${s.isPopular ? " [Popular]" : ""}`
  ).join("\n");
}

/* ─── Source: Platform subscription plans ─── */

/** Render one tier as "Name $X/mo" (or "$X one-time"), flagging free tiers and badges. */
function describeTier(t: Tier): string {
  const price =
    t.billingPeriod === "monthly"
      ? `${formatPrice(t.price)}/mo`
      : `${formatPrice(t.price)} one-time`;
  const free = t.price === 0 ? " (free tier — no credit card)" : "";
  const badge = t.badge ? ` [${t.badge}]` : "";
  return `${t.name} ${price}${free}${badge}`;
}

function describeProductPlans(product: ProductDef): string {
  const tiers = product.tiers.map(describeTier).join("; ");
  const setup = product.setup
    ? ` Setup fee: ${formatPrice(product.setup)} one-time.`
    : "";
  const overage = product.overageRate
    ? ` Overage: $${product.overageRate.toFixed(2)}/min after included minutes.`
    : "";
  return `• ${product.name} — ${product.tagline.replace(/\.$/, "")}. Plans: ${tiers}.${setup}${overage}`;
}

function compilePlans(): string {
  // GENERATED from @shared/pricing (the single source of truth for all
  // WeFixTrades pricing). Never hardcode plan names or dollar amounts here —
  // anything stated in this block is quoted to customers by the chat AI.
  const yearlyPct = Math.round(YEARLY_DISCOUNT_PCT * 100);
  const qqYearlyPct = Math.round(QUOTEQUICK_YEARLY_DISCOUNT_PCT * 100);
  return (
    ALL_PRODUCTS.map(describeProductPlans).join("\n") +
    `\n\nAll monthly plans are cancel-anytime, no lock-in. Yearly billing saves ${yearlyPct}% on most products (${QUOTEQUICK.name}: ${qqYearlyPct}% — two months free).` +
    `\nNo product has a time-limited promotional period. ${QUOTEQUICK.name} and ${CONTENTFLOW.name} each have a permanent free tier — start free with no credit card, upgrade only when you need more. Never quote a customer any plan, price, or discount that is not listed above.`
  );
}

/* ─── Source: Bundle packages ─── */
function compileBundles(): string {
  // GENERATED from @shared/pricing ALL_BUNDLES — never hardcode bundle
  // names or prices here.
  const lines = ALL_BUNDLES.map((b) => {
    const price =
      b.billingPeriod === "monthly"
        ? `${formatPrice(b.price)}/mo`
        : `${formatPrice(b.price)} one-time`;
    const includes = b.includes.map((i) => i.label).join("; ");
    const savings = bundleSavings(b);
    const savingsNote =
      savings > 0
        ? ` Saves ${formatPrice(savings)}${b.billingPeriod === "monthly" ? "/mo" : ""} vs buying separately.`
        : "";
    const badge = b.badge ? ` [${b.badge}]` : "";
    return `• ${b.name}: ${price} — ${b.tagline}. Includes: ${includes}.${savingsNote}${badge}`;
  });
  return lines.join("\n") + "\n\nSetup takes ~5 business days. No long-term contracts.";
}

/* ─── Source: Business info ─── */
function compileBusinessInfo(): string {
  return `WeFixTrades helps trades businesses (electricians, plumbers, HVAC, roofers, landscapers, cleaners, painters, flooring pros, and similar local service businesses) get more customers and grow with done-for-you digital marketing, AI tools, and lead generation systems.

Key value propositions:
- Get found on Google Maps and local search
- Never miss a lead with 24/7 AI chat and call answering
- Build trust with automated review generation
- Convert more website visitors with instant quote calculators
- Fast, mobile-optimized websites built for trades

Contact: Visit wefixtrades.com/contact or book a free strategy call.
Free audit: Get a free online presence audit at wefixtrades.com/free-audit
Demo: Try tools at wefixtrades.com/demo`;
}

/* ─── Source: FAQs (merged from plans, bundles, products) ─── */
function compileFAQs(): string {
  return `Q: How quickly will I see results?
A: Most clients see improved visibility within 2-4 weeks. Lead generation improvements typically show within the first month.

Q: Do I need a website?
A: Having a website helps, but we can build one for you with SiteLaunch™. Our tools also work with Google Business Profile alone.

Q: Is there a contract or lock-in?
A: No contracts, no lock-in. Monthly plans cancel any time from the portal. Annual plans are charged once a year — cancel mid-year and you keep access until the period ends, but we don't pro-rate refunds.

Q: Can I try it before paying, and is there a money-back guarantee?
A: QuoteQuick and ContentFlow each have a permanent free tier — start free with no credit card and upgrade when you need more. Every other paid recurring service (TradeLine, MapGuard, ReputationShield, SocialSync, RankFlow, WebCare) ships with a 30-day money-back guarantee — if it's not working, email support within 30 days of your first charge and we refund it in full.

Q: What trades do you work with?
A: All trades — plumbing, electrical, HVAC, roofing, painting, landscaping, cleaning, flooring, and more.

Q: How does the AI assistant work?
A: Our AI handles website chat and phone calls 24/7, qualifies leads, captures contact info, and sends you instant summaries.

Q: How does booking work?
A: Customers pick an available time slot and pay a deposit via Stripe. You're notified instantly. Slots are locked to prevent double-booking.

Q: How do I get the AI quote assistant?
A: The AI quote assistant is included with the QuoteQuick Business plan ($${getTier(QUOTEQUICK, "Business")?.price ?? 79}/mo). The QuoteQuick Free tier lets you try the calculator and lead capture first — no credit card required.

Q: Can I edit my pricing after going live?
A: Yes, anytime. Changes take effect immediately. Existing quotes keep their original price.

Q: What happens to my leads if I downgrade?
A: Existing leads are always kept. New leads beyond your plan cap are held until you upgrade.

Q: Do SMS follow-ups require Twilio?
A: Yes. We walk you through the 10-minute setup during onboarding.

Q: How long does bundle setup take?
A: Most businesses are live within 5 business days. Our onboarding team handles the heavy lifting.`;
}

/* ─── Source: Customer reviews / social proof ─── */
function compileReviews(): string {
  return `Customer feedback (real reviews):
• Mike D., Precision Plumbing (Dallas, TX): "We were missing calls constantly before. Now every call gets answered and we get a text summary. Feels like having a receptionist that never sleeps." (5 stars)
• Sarah M., Arctic Air HVAC (Calgary, AB): "The chat on the website surprised me. Customers actually use it and we started getting quote requests late at night." (5 stars)
• Kevin R., R&K Electrical (Phoenix, AZ): "Setup was easier than expected. We mainly use the call answering and review follow-ups. Reviews increased pretty quickly." (4 stars)
• Jason L., Peak Roofing (Denver, CO): "Customers stopped saying 'no one answered the phone'. The system handles it automatically and sends us the details." (5 stars)
• Andre P., ClearFlow Plumbing (Toronto, ON): "The review automation alone paid for it. We went from barely asking customers to getting reviews consistently." (5 stars)

Average rating: 4.7/5 across Trustpilot and Facebook reviews.`;
}
