/**
 * Competitive comparison data for the TradeLine product page.
 *
 * Each row captures a provider's LOWEST PAID TIER + a 9-column feature
 * grid. Sources verified by web research on 2026-05-13; re-verify any
 * row that's older than ~6 months since competitor pricing pages change.
 *
 * Status values: "yes" | "no" | "limited" | "addon" | "future" | "na"
 *  yes    → fully included at this tier
 *  no     → not offered at this tier (may be available higher)
 *  limited → included but with caveats (per-message fee, count cap, etc.)
 *  addon  → available only as a paid add-on at this tier
 *  future → on roadmap, not shipped (we use this for our IG/FB/WA row)
 *  na     → not applicable (e.g. number-porting on a chat-only product)
 */

export type FeatureStatus = "yes" | "no" | "limited" | "addon" | "future" | "na";

export interface ComparisonRow {
  /** Provider name as it appears in the table */
  provider: string;
  /** Tier label (e.g. "Professional", "Agency Starter") */
  tierName: string;
  /** Monthly price label (e.g. "$97", "$15-39") */
  pricePerMonth: string;
  /** Marks our row for highlight styling */
  isUs?: boolean;
  features: {
    voice: FeatureStatus;
    sms: FeatureStatus;
    chat: FeatureStatus;
    instagram: FeatureStatus;
    facebook: FeatureStatus;
    whatsapp: FeatureStatus;
    payInChat: FeatureStatus;
    booking: FeatureStatus;
    freePorting: FeatureStatus;
  };
  /** Short note shown under provider name (caveats, "annual billing", etc.) */
  caveat?: string;
  /** URL to provider's pricing page */
  sourceUrl: string;
  /** ISO date the source was verified */
  asOf: string;
}

export const COMPARISON_AS_OF = "2026-05-13";

export const COMPARISON_ROWS: ComparisonRow[] = [
  {
    provider: "WeFixTrades TradeLine",
    tierName: "Starter",
    pricePerMonth: "$97",
    isUs: true,
    features: {
      voice: "yes",
      sms: "yes",
      chat: "yes",
      instagram: "future",
      facebook: "future",
      whatsapp: "future",
      payInChat: "yes",
      booking: "yes",
      freePorting: "yes",
    },
    caveat: "Pro tier ($197) unlocks IG/FB DMs (waitlist while Meta API approval pending), Stripe-in-chat, advanced training, priority support.",
    sourceUrl: "https://wefixtrades.com/products/tradeline",
    asOf: COMPARISON_AS_OF,
  },
  {
    provider: "Rosie AI",
    tierName: "Professional",
    pricePerMonth: "$49",
    features: {
      voice: "yes",
      sms: "addon",
      chat: "no",
      instagram: "no",
      facebook: "no",
      whatsapp: "no",
      payInChat: "no",
      booking: "no",
      freePorting: "no",
    },
    caveat: "Voice-only at this tier. SMS is +$50/mo add-on. Booking only on the Scale plan.",
    sourceUrl: "https://heyrosie.com/pricing",
    asOf: COMPARISON_AS_OF,
  },
  {
    provider: "Goodcall",
    tierName: "Starter",
    pricePerMonth: "$79 / agent",
    features: {
      voice: "yes",
      sms: "no",
      chat: "no",
      instagram: "no",
      facebook: "no",
      whatsapp: "no",
      payInChat: "no",
      booking: "yes",
      freePorting: "no",
    },
    caveat: "Per-agent pricing — costs scale with team size.",
    sourceUrl: "https://goodcall.com/pricing",
    asOf: COMPARISON_AS_OF,
  },
  {
    provider: "Dialzara",
    tierName: "Business Lite",
    pricePerMonth: "$29",
    features: {
      voice: "yes",
      sms: "no",
      chat: "no",
      instagram: "no",
      facebook: "no",
      whatsapp: "no",
      payInChat: "no",
      booking: "no",
      freePorting: "no",
    },
    caveat: "60-minute monthly cap; overage at $0.48/min. Voice-only.",
    sourceUrl: "https://dialzara.com/pricing",
    asOf: COMPARISON_AS_OF,
  },
  {
    provider: "Smith.ai",
    tierName: "AI Receptionist",
    pricePerMonth: "$95",
    features: {
      voice: "yes",
      sms: "yes",
      chat: "limited",
      instagram: "no",
      facebook: "no",
      whatsapp: "no",
      payInChat: "no",
      booking: "yes",
      freePorting: "yes",
    },
    caveat: "Web chat available on a separate Live Chat tier. Free number porting on all paid plans.",
    sourceUrl: "https://smith.ai/pricing",
    asOf: COMPARISON_AS_OF,
  },
  {
    provider: "Trillet",
    tierName: "Basic",
    pricePerMonth: "$49",
    features: {
      voice: "yes",
      sms: "yes",
      chat: "no",
      instagram: "no",
      facebook: "no",
      whatsapp: "no",
      payInChat: "no",
      booking: "limited",
      freePorting: "no",
    },
    caveat: "150-minute cap. IG/FB require the $99 Studio tier.",
    sourceUrl: "https://www.trillet.ai/pricing",
    asOf: COMPARISON_AS_OF,
  },
  {
    provider: "My AI Front Desk",
    tierName: "Business-in-a-Box",
    pricePerMonth: "$99",
    features: {
      voice: "yes",
      sms: "yes",
      chat: "limited",
      instagram: "no",
      facebook: "no",
      whatsapp: "no",
      payInChat: "no",
      booking: "yes",
      freePorting: "no",
    },
    caveat: "200 min voice + 400 SMS + 100 web-chat conversations/mo caps. $79/mo annual.",
    sourceUrl: "https://www.myaifrontdesk.com/pricing",
    asOf: COMPARISON_AS_OF,
  },
  {
    provider: "Manychat",
    tierName: "Pro",
    pricePerMonth: "$15-39",
    features: {
      voice: "no",
      sms: "limited",
      chat: "no",
      instagram: "yes",
      facebook: "yes",
      whatsapp: "limited",
      payInChat: "no",
      booking: "limited",
      freePorting: "na",
    },
    caveat: "$15 = 500 contacts; $39 = 2,500. WhatsApp + SMS incur per-message fees on top. No voice channel.",
    sourceUrl: "https://manychat.com/pricing",
    asOf: COMPARISON_AS_OF,
  },
  {
    provider: "Chatfuel",
    tierName: "AI Business Assistant",
    pricePerMonth: "$69",
    features: {
      voice: "no",
      sms: "no",
      chat: "yes",
      instagram: "yes",
      facebook: "yes",
      whatsapp: "yes",
      payInChat: "no",
      booking: "yes",
      freePorting: "na",
    },
    caveat: "Strong social-DM bundle but zero voice or two-way SMS.",
    sourceUrl: "https://chatfuel.com/pricing",
    asOf: COMPARISON_AS_OF,
  },
  {
    provider: "Hootsuite",
    tierName: "Standard",
    pricePerMonth: "$99 / user",
    features: {
      voice: "no",
      sms: "no",
      chat: "no",
      instagram: "limited",
      facebook: "limited",
      whatsapp: "no",
      payInChat: "no",
      booking: "no",
      freePorting: "na",
    },
    caveat: "$99/user/mo annual ($149 monthly). Social-inbox only; no SMS, voice, payments.",
    sourceUrl: "https://www.hootsuite.com/plans",
    asOf: COMPARISON_AS_OF,
  },
  {
    provider: "HighLevel",
    tierName: "Agency Starter",
    pricePerMonth: "$97",
    features: {
      voice: "addon",
      sms: "yes",
      chat: "yes",
      instagram: "addon",
      facebook: "addon",
      whatsapp: "addon",
      payInChat: "yes",
      booking: "yes",
      freePorting: "yes",
    },
    caveat: "Voice AI is pay-per-use (~$0.16/min) or +$97/sub-account. WhatsApp is +$10/mo per sub-account. The bundle ladders up to $297 and $497 tiers.",
    sourceUrl: "https://www.gohighlevel.com/pricing",
    asOf: COMPARISON_AS_OF,
  },
];

/** Feature column metadata for rendering. Order = column order in table. */
export const COMPARISON_FEATURES: Array<{
  key: keyof ComparisonRow["features"];
  label: string;
  shortLabel: string;
  hint?: string;
}> = [
  { key: "voice", label: "AI voice receptionist", shortLabel: "Voice", hint: "Inbound AI call answering" },
  { key: "sms", label: "AI SMS (two-way)", shortLabel: "SMS", hint: "Real two-way texting, not just notifications" },
  { key: "chat", label: "Web chat widget", shortLabel: "Chat", hint: "Embeddable on your own website" },
  { key: "instagram", label: "Instagram DMs", shortLabel: "IG DMs" },
  { key: "facebook", label: "Facebook Messenger", shortLabel: "FB Msgr" },
  { key: "whatsapp", label: "WhatsApp", shortLabel: "WhatsApp" },
  { key: "payInChat", label: "Stripe payments in chat", shortLabel: "Pay-in-chat", hint: "Customers pay invoices inside a conversation" },
  { key: "booking", label: "Appointment booking", shortLabel: "Booking" },
  { key: "freePorting", label: "Free number porting", shortLabel: "Free porting", hint: "Bring your existing business number at no charge" },
];
