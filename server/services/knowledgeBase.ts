import { SERVICES, getServicesForIssues, type Service } from "../data/services";

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
  { id: "plans", label: "PLATFORM SUBSCRIPTION PLANS", compile: compilePlans },
  { id: "bundles", label: "BUNDLE PACKAGES", compile: compileBundles },
  { id: "business", label: "ABOUT WEFIXTRADES", compile: compileBusinessInfo },
  { id: "faq", label: "FREQUENTLY ASKED QUESTIONS", compile: compileFAQs },
  { id: "reviews", label: "CUSTOMER TESTIMONIALS", compile: compileReviews },
];

/* ─── Public API ─── */

/** Compile all knowledge into a single text block for the system prompt */
export function compileKnowledge(): string {
  return KNOWLEDGE_SOURCES.map(
    (src) => `=== ${src.label} ===\n${src.compile()}`
  ).join("\n\n");
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
function compilePlans(): string {
  // Mirrors client/src/config/pricingPlans.ts — kept as structured data here
  // so the assistant always has accurate plan info without importing client code.
  const plans = [
    { name: "Free", monthly: "$0/mo", features: "1 calculator, hosted quote page, basic lead capture, 50 leads/month" },
    { name: "Starter", monthly: "$99/mo (or $79/mo annual)", features: "1 calculator, custom branding, 500 leads/month, email follow-ups, embed on site, 14-day AI trial" },
    { name: "Pro", monthly: "$199/mo (or $159/mo annual)", features: "3 calculators, remove branding, booking + Stripe deposits, AI Employee (chat + SMS + WhatsApp), custom domain, 2,000 leads/month, analytics + weekly reports. [Most Popular]" },
    { name: "Elite", monthly: "$299/mo (or $239/mo annual)", features: "Unlimited calculators, white-label, webhook/Zapier/Make, unlimited leads, per-client dashboards, priority support, optional Done-For-You install" },
  ];
  return plans.map((p) => `• ${p.name}: ${p.monthly} — ${p.features}`).join("\n") +
    "\n\nAll monthly plans are cancel-anytime, no lock-in. Annual plans save ~15%.";
}

/* ─── Source: Bundle packages ─── */
function compileBundles(): string {
  return `• Growth Bundle: $349/mo — Includes QuickQuotePro Starter, Google Maps optimization, reputation management, monthly performance report. Saves $149/mo vs buying separately.
• Autopilot System: $599/mo — Includes QuickQuotePro Pro + AI Employee, Google Maps optimization, website SEO + speed, reputation management, social media automation, done-for-you AI training, monthly strategy call. [Most Popular]

Setup takes ~5 business days. No long-term contracts.`;
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
A: No contracts. Monthly plans cancel anytime. Annual plans are prepaid with a 30-day money-back guarantee.

Q: What trades do you work with?
A: All trades — plumbing, electrical, HVAC, roofing, painting, landscaping, cleaning, flooring, and more.

Q: How does the AI assistant work?
A: Our AI handles website chat and phone calls 24/7, qualifies leads, captures contact info, and sends you instant summaries.

Q: How does booking work?
A: Customers pick an available time slot and pay a deposit via Stripe. You're notified instantly. Slots are locked to prevent double-booking.

Q: How does the AI Employee trial work?
A: Every account gets a 14-day free trial — no credit card required. After that, you need Pro or above.

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
