/**
 * Option A — "30-day checklist" + template copy for updating customer-facing
 * places where the user's old phone number appears. Designed for trades who
 * are time-strapped: each task has a one-line description and a copyable
 * text snippet that's pre-tuned for that surface.
 *
 * Localised eventually — for now USA + Canada both ship the same English copy.
 */

export interface ChecklistItem {
  key: string;
  label: string;
  hint: string;
  templateCopy?: string;
}

export function buildChecklist(newNumber: string, businessName?: string): ChecklistItem[] {
  const biz = businessName || "your business";
  return [
    {
      key: "gbp",
      label: "Update Google Business Profile",
      hint: "Sign in to Google Business Profile → Edit profile → Phone. Use your new number as the primary contact.",
      templateCopy: `Call us anytime at ${newNumber}. We answer 24/7 — even when we're on the job.`,
    },
    {
      key: "website",
      label: "Update your website",
      hint: "Header, footer, and any contact/CTA buttons. If you use WeFixTrades' website builder, this happens automatically.",
      templateCopy: `Call ${newNumber}\n${biz} • Available 24/7`,
    },
    {
      key: "business_cards",
      label: "Update business cards",
      hint: "Order a small batch now; the old number can keep ringing for the rest of your current cards.",
      templateCopy: `${newNumber}`,
    },
    {
      key: "invoices",
      label: "Update invoice templates",
      hint: "QuickBooks, Jobber, ServiceTitan, or whatever you use. Replace the contact number on every template.",
      templateCopy: `Questions? Call us at ${newNumber} anytime.`,
    },
    {
      key: "vehicle_signage",
      label: "Update vehicle signage (optional)",
      hint: "Magnetic decals over the old number work fine for a few months; full wrap on the next vehicle service.",
    },
    {
      key: "social",
      label: "Update social media bios",
      hint: "Facebook, Instagram, LinkedIn, Yelp, Nextdoor — anywhere the old number appears in your contact info.",
      templateCopy: `📞 ${newNumber} • 24/7 AI-assisted answering`,
    },
  ];
}
