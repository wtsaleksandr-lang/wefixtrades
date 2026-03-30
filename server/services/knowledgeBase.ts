import { SERVICES, getServicesForIssues, type Service } from "../data/services";

/* ─── Compiled knowledge for AI context injection ─── */

export function getServicesKnowledge(): string {
  return SERVICES.map(
    (s) =>
      `• ${s.name} — ${s.tagline}. ${s.priceLabel}. Category: ${s.category}. Fixes: ${s.fixesIssues.join(", ")}.`
  ).join("\n");
}

export function getRecommendedServices(issueIds: string[]): Service[] {
  return getServicesForIssues(issueIds);
}

export function formatRecommendedServices(services: Service[]): string {
  if (!services.length) return "";
  return services
    .map(
      (s) =>
        `• ${s.name} (${s.priceLabel}) — ${s.tagline}. Features: ${s.features.join("; ")}.`
    )
    .join("\n");
}

/* ─── Business info ─── */
export function getBusinessInfo(): string {
  return `WeFixTrades helps trades businesses (electricians, plumbers, HVAC, roofers, landscapers, cleaners, and similar local service businesses) get more customers and grow with done-for-you digital marketing, AI tools, and lead generation systems.

Key value propositions:
- Get found on Google Maps and local search
- Never miss a lead with 24/7 AI chat and call answering
- Build trust with automated review generation
- Convert more website visitors with instant quote calculators
- Fast, mobile-optimized websites built for trades

Contact: Visit wefixtrades.com/contact or book a free strategy call.
Booking: Users can request a free consultation at wefixtrades.com/demo`;
}

/* ─── FAQ knowledge ─── */
export function getFAQKnowledge(): string {
  return `Common questions:
Q: How quickly will I see results?
A: Most clients see improved visibility within 2-4 weeks. Lead generation improvements typically show within the first month.

Q: Do I need a website?
A: Having a website helps, but we can build one for you with SiteLaunch™. Our tools also work with Google Business Profile alone.

Q: Is there a contract?
A: Monthly services are month-to-month with no long-term contracts. One-time services are paid upfront.

Q: Can I cancel anytime?
A: Yes, monthly services can be cancelled anytime. No cancellation fees.

Q: What trades do you work with?
A: We work with all trades — plumbing, electrical, HVAC, roofing, painting, landscaping, cleaning, flooring, and more.

Q: How does the AI assistant work?
A: Our AI handles website chat and phone calls 24/7, qualifies leads, captures contact info, and sends you instant summaries.`;
}

/* ─── Full knowledge compilation ─── */
export function compileKnowledge(): string {
  return `=== WEFIXTRADES SERVICES & PRICING ===
${getServicesKnowledge()}

=== ABOUT WEFIXTRADES ===
${getBusinessInfo()}

=== FREQUENTLY ASKED QUESTIONS ===
${getFAQKnowledge()}`;
}
