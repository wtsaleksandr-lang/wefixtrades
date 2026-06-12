/* ─── QuoteQuick marketing FAQs ───
 *
 * Lane A2 (pricing-truth sweep): this file previously exported a fabricated
 * platform plan ladder (Starter $99 / Pro $199 / Elite $299 + "14-day free
 * trial") that never existed in @shared/pricing or Stripe. Those PLANS /
 * COMPARISON_ROWS exports had no consumers and were deleted outright.
 *
 * Only the FAQ copy survives (consumed by pages/marketing/pricing.tsx).
 * Every number below is interpolated from @shared/pricing — the single
 * source of truth. Do NOT hardcode prices or invent plans/trials here.
 */
import { QUOTEQUICK, getTier, formatPrice } from "@shared/pricing";

const qqPro = getTier(QUOTEQUICK, "Pro")!;
const qqBusiness = getTier(QUOTEQUICK, "Business")!;
const qqInstall = getTier(QUOTEQUICK, "Install service")!;

export const FAQS = [
  {
    q: "Can I use one calculator link on multiple websites?",
    a: "Yes. Your hosted calculator URL can be shared anywhere — social media, email, Google Ads, or linked from multiple websites. The embed script can also be pasted into as many pages as you want on websites you own.",
  },
  {
    q: "Can I create multiple calculators?",
    a: `Free and Pro plans include 1 calculator. Business (${formatPrice(qqBusiness.price)}/mo) includes up to 5 — separate calculators for different services, locations, or trade types.`,
  },
  {
    q: "Do I need a custom domain?",
    a: `No. Every calculator gets a free hosted URL that works immediately. Custom domain is an optional Pro (${formatPrice(qqPro.price)}/mo) feature that lets you serve the calculator under your own URL (e.g. quotes.yourbusiness.com).`,
  },
  {
    q: "How does booking work?",
    a: "On the Business plan, once a customer sees their estimate they can pick an available time slot from your calendar and pay a deposit via Stripe. You're notified instantly. Slots are locked to prevent double-booking. Confirmation emails go to both parties automatically.",
  },
  {
    q: "Is there a free trial?",
    a: "Better — QuoteQuick has a permanent Free tier, not a time-limited trial. Build your calculator, publish it, and capture leads at no cost with no credit card. Upgrade only when you need more leads, branding removal, or the AI quote assistant.",
  },
  {
    q: "How do I get the AI quote assistant?",
    a: `The AI quote assistant is included with the Business plan (${formatPrice(qqBusiness.price)}/mo). It answers customer questions on your calculator and helps qualify leads. You can toggle it on or off at any time from your dashboard.`,
  },
  {
    q: "Can I edit my pricing or calculator after going live?",
    a: "Yes, anytime. Changes take effect immediately. If you've set a quote validity period (e.g. 7 days), existing quotes retain their original price — but new estimates use your updated formula.",
  },
  {
    q: "Do you offer a done-for-you installation service?",
    a: `Yes. For ${formatPrice(qqInstall.price)} one-time, our team installs QuoteQuick on your website, configures it for your trade, and verifies it's capturing leads — within 24 hours. Available on any plan.`,
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
    q: "What's the 30-day money-back guarantee?",
    a: "Every paid recurring service (TradeLine, MapGuard, ReputationShield, SocialSync, RankFlow, WebCare) comes with a 30-day money-back guarantee. Email us within 30 days of your first charge and we refund that charge in full — no forms, no phone call required. After 30 days you can still cancel any time, but past charges stay billed. QuoteQuick has a permanent free tier instead of the guarantee — it's free forever, with no time limit and no trial countdown, so you can use it for as long as you like before ever paying.",
  },
  {
    q: "Do SMS follow-ups require Twilio?",
    a: "Yes. SMS messaging uses Twilio as the carrier. You'll need a free Twilio account and a registered Twilio phone number. We walk you through the setup in under 10 minutes — it's included in Pro onboarding.",
  },
];
