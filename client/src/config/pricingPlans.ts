/* ─── SaaS subscription tier definitions (platform plans, NOT trade pricing) ─── */
import { colors, mkt } from '@/theme/tokens';

export interface PlanFeature {
  label: string;
  included: boolean | string; // true = ✓, false = –, string = note
}

export interface Plan {
  id: string;
  name: string;
  tagline: string;
  price: { monthly: number; annual: number };
  highlighted: boolean;
  badge: string | null;
  badgeBg: string;
  badgeColor: string;
  accentBorder: string;
  cta: string;
  ctaStyle: "primary" | "outline";
  features: PlanFeature[];
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Try the platform with no commitment",
    price: { monthly: 0, annual: 0 },
    highlighted: false,
    badge: null,
    badgeBg: "#F1F5F9",
    badgeColor: "#475569",
    accentBorder: colors.widget.border,
    cta: "Start Free",
    ctaStyle: "outline",
    features: [
      { label: "1 calculator", included: true },
      { label: "Hosted quote page", included: true },
      { label: "Basic lead capture", included: true },
      { label: "50 leads / month", included: true },
      { label: "QuickQuotePro branding", included: "Branded" },
      { label: "Email follow-up", included: false },
      { label: "Booking + deposit", included: false },
      { label: "AI Employee (trial)", included: false },
    ],
  },
  {
    id: "starter",
    name: "Starter",
    tagline: "For sole traders ready to convert more leads",
    price: { monthly: 99, annual: 79 },
    highlighted: false,
    badge: null,
    badgeBg: "#EAF1FF",
    badgeColor: "#2F6BFF",
    accentBorder: "#D4E2FF",

    cta: "Start Trial",
    ctaStyle: "outline",
    features: [
      { label: "1 calculator", included: true },
      { label: "Hosted quote page + embed", included: true },
      { label: "Custom branding", included: true },
      { label: "500 leads / month", included: true },
      { label: "Email follow-up sequences", included: true },
      { label: "CSV export", included: true },
      { label: "Booking + deposit", included: false },
      { label: "AI Employee (trial)", included: "14-day trial" },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For growing businesses that want full automation",
    price: { monthly: 199, annual: 159 },
    highlighted: true,
    badge: "Most Popular",
    badgeBg: colors.platform.accent,
    badgeColor: mkt.onDark,
    accentBorder: colors.platform.accent,
    cta: "Start Trial",
    ctaStyle: "primary",
    features: [
      { label: "3 calculators", included: true },
      { label: "Remove branding", included: true },
      { label: "Booking + deposit (Stripe)", included: true },
      { label: "AI Employee — chat + SMS + WA", included: true },
      { label: "Custom domain", included: true },
      { label: "2,000 leads / month", included: true },
      { label: "SMS & WhatsApp follow-ups", included: true },
      { label: "Analytics + weekly reports", included: true },
    ],
  },
  {
    id: "elite",
    name: "Elite",
    tagline: "For agencies and multi-location operations",
    price: { monthly: 299, annual: 239 },
    highlighted: false,
    badge: "Agency",
    badgeBg: "#F59E0B",
    badgeColor: mkt.onDark,
    accentBorder: "#F59E0B",
    cta: "Start Trial",
    ctaStyle: "outline",
    features: [
      { label: "Unlimited calculators", included: true },
      { label: "White-label (your brand, zero mention of us)", included: true },
      { label: "Priority support + onboarding", included: true },
      { label: "Webhook / Zapier / Make integration", included: true },
      { label: "Unlimited leads", included: true },
      { label: "Per-client dashboards", included: true },
      { label: "Custom SLA available", included: true },
      { label: "Done-For-You install (add-on)", included: "Optional" },
    ],
  },
];

export interface ComparisonRow {
  category?: string; // optional section header
  feature: string;
  tooltip?: string;
  free: boolean | string;
  starter: boolean | string;
  pro: boolean | string;
  elite: boolean | string;
}

export const COMPARISON_ROWS: ComparisonRow[] = [
  { category: "Core", feature: "Calculators", free: "1", starter: "1", pro: "3", elite: "Unlimited" },
  { feature: "Hosted quote page", free: true, starter: true, pro: true, elite: true },
  { feature: "Embed script / iframe / button", free: true, starter: true, pro: true, elite: true },
  { feature: "Lead capture + storage", free: "50/mo", starter: "500/mo", pro: "2,000/mo", elite: "Unlimited" },
  { feature: "CSV export", free: false, starter: true, pro: true, elite: true },
  { category: "Branding", feature: "Remove QuickQuotePro branding", free: false, starter: true, pro: true, elite: true },
  { feature: "Custom domain + SSL", free: false, starter: false, pro: true, elite: true },
  { feature: "White-label (zero attribution)", free: false, starter: false, pro: false, elite: true },
  { category: "Automation", feature: "Email follow-up sequences", free: false, starter: true, pro: true, elite: true },
  { feature: "SMS follow-ups (Twilio)", free: false, starter: false, pro: true, elite: true },
  { feature: "WhatsApp follow-ups", free: false, starter: false, pro: true, elite: true },
  { category: "Booking", feature: "Booking calendar", free: false, starter: false, pro: true, elite: true },
  { feature: "Stripe deposit collection", free: false, starter: false, pro: true, elite: true },
  { feature: "Booking confirmation emails", free: false, starter: false, pro: true, elite: true },
  { category: "AI", feature: "AI Employee — web chat", free: false, starter: "14-day trial", pro: true, elite: true },
  { feature: "AI Employee — SMS & WhatsApp", free: false, starter: false, pro: true, elite: true },
  { feature: "AI estimate generation", free: false, starter: "Trial", pro: true, elite: true },
  { category: "Analytics", feature: "Lead dashboard + analytics", free: true, starter: true, pro: true, elite: true },
  { feature: "Conversion funnel view", free: false, starter: true, pro: true, elite: true },
  { feature: "Weekly summary email report", free: false, starter: true, pro: true, elite: true },
  { category: "Integrations", feature: "Webhook / Zapier / Make", free: false, starter: false, pro: false, elite: true },
  { feature: "API access", free: false, starter: false, pro: false, elite: true },
  { category: "Support", feature: "Email support", free: true, starter: true, pro: true, elite: true },
  { feature: "Priority support", free: false, starter: false, pro: false, elite: true },
  { feature: "Done-For-You onboarding", free: false, starter: false, pro: false, elite: "Add-on" },
];

export const FAQS = [
  {
    q: "Can I use one calculator link on multiple websites?",
    a: "Yes. Your hosted calculator URL can be shared anywhere — social media, email, Google Ads, or linked from multiple websites. The embed script can also be pasted into as many pages as you want on websites you own.",
  },
  {
    q: "Can I create multiple calculators?",
    a: "Yes. Free and Starter plans include 1 calculator. Pro includes 3. Elite is unlimited. You can create separate calculators for different services, locations, or trade types.",
  },
  {
    q: "Do I need a custom domain?",
    a: "No. Every calculator gets a free hosted URL (e.g. quickquotepro.com/your-business) that works immediately. Custom domain is an optional Pro+ feature that lets you serve the calculator under your own URL (e.g. quotes.yourbusiness.com).",
  },
  {
    q: "How does booking work?",
    a: "Once a customer sees their estimate, they can pick an available time slot from your calendar and pay a deposit via Stripe. You're notified instantly. Slots are locked to prevent double-booking. Confirmation emails go to both parties automatically.",
  },
  {
    q: "How does the AI Employee trial work?",
    a: "Every account gets a 14-day free trial of the AI Employee on sign-up — no credit card required to activate. After 14 days, you'll need a Pro plan or above to keep it active. You can toggle AI on/off at any time from your dashboard.",
  },
  {
    q: "Can I edit my pricing or calculator after going live?",
    a: "Yes, anytime. Changes take effect immediately. If you've set a quote validity period (e.g. 7 days), existing quotes retain their original price — but new estimates use your updated formula.",
  },
  {
    q: "Do you offer a done-for-you installation service?",
    a: "Yes. Our team can set up your calculator, configure pricing, embed it on your website, and write your follow-up sequences for you. This is available as an optional add-on starting at $297 for Elite customers, and as a standalone service for any plan.",
  },
  {
    q: "What happens to my leads if I downgrade my plan?",
    a: "Your existing leads are always kept — you never lose data. If you downgrade to a plan with a lower lead limit, new leads beyond your plan cap will be held and visible once you upgrade again.",
  },
  {
    q: "Is there a contract or lock-in?",
    a: "No contracts, no lock-in. Monthly plans cancel any time. Annual plans are charged once per year — if you cancel mid-year, we don't offer pro-rated refunds, but you keep access until the period ends.",
  },
  {
    q: "Do SMS follow-ups require Twilio?",
    a: "Yes. SMS and WhatsApp messaging uses Twilio as the carrier. You'll need a free Twilio account and a registered Twilio phone number. We walk you through the setup in under 10 minutes — it's included in Pro onboarding.",
  },
];
