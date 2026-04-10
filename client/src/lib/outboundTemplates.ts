/**
 * Outreach Template Library — V1
 *
 * Code-based config. No DB. No versioning.
 * One set of messages per offer, shared across angles.
 * Angles document the framing the operator should have in mind — not separate copy.
 *
 * Merge fields used:
 *   {{business_name}}   prospect.business_name
 *   {{first_name}}      derived: first word of owner_name or contact_name, or "there"
 *   {{city}}            prospect.city
 *   {{state}}           prospect.state
 *   {{trade}}           prospect.trade_category
 *   {{review_count}}    prospect.google_review_count
 *   {{rating}}          prospect.google_rating
 *   {{ai_first_line}}   enrichment.ai_first_line  (AI-generated, lead-specific)
 *   {{ai_offer_angle}}  enrichment.ai_offer_angle (AI-generated, lead-specific)
 *   {{ai_cta_variant}}  enrichment.ai_cta_variant (AI-generated, lead-specific)
 *   {{sender_name}}     operator's first name (passed in at render time)
 */

export type OfferKey = "quotequick" | "reputationshield" | "socialsync" | "tradeline";
export type MessageType =
  | "first_touch"
  | "follow_up_1"
  | "follow_up_2"
  | "breakup"
  | "contact_form"
  | "dm";

export interface AngleConfig {
  id: string;
  label: string;
  bestFor: string;
  hook: string;
}

export interface MessageConfig {
  /** Email subject line. Omitted for DM / contact-form types. */
  subject?: string;
  body: string;
}

export interface OfferConfig {
  key: OfferKey;
  label: string;
  tagline: string;
  /** Tailwind color class for the badge */
  color: string;
  angles: AngleConfig[];
  messages: Record<MessageType, MessageConfig>;
}

/* ═══════════════════════════════════════════════
   QUOTEQUICK
   ═══════════════════════════════════════════════ */

const quotequick: OfferConfig = {
  key: "quotequick",
  label: "QuoteQuick",
  tagline: "Instant online quoting",
  color: "bg-blue-100 text-blue-700",
  angles: [
    {
      id: "wont_wait",
      label: "People won't wait for a quote",
      bestFor: "Has a website with no prices or quote tool visible",
      hook: "You're probably losing 3–5 jobs a week to whoever responds first",
    },
    {
      id: "after_hours",
      label: "After-hours jobs going to voicemail",
      bestFor: "Owner-operators on-site all day who miss calls",
      hook: "Most of your lost jobs aren't lost during business hours",
    },
    {
      id: "speed_wins",
      label: "Speed beats price",
      bestFor: "Competitive markets with many local providers",
      hook: "The fastest quote usually wins — not the cheapest",
    },
  ],
  messages: {
    first_touch: {
      subject: "quick question about {{business_name}}",
      body: `Hey {{first_name}},

Looked up {{business_name}} — great reviews. One thing I noticed: no way for someone to get a quick quote on your site without calling.

Most people won't call. They'll move on to whoever shows them a number first.

{{ai_first_line}}

We built a tool that gives {{trade}} businesses in {{city}} an instant quote calculator on their site. Takes about a day to set up.

{{ai_cta_variant}}

{{sender_name}}`,
    },
    follow_up_1: {
      subject: "Re: quick question about {{business_name}}",
      body: `Hey {{first_name}}, just bumping this up.

{{ai_first_line}}

If you've got 5 minutes this week I can walk you through it — no deck, no sales pitch, just the tool running live.

Worth a look?

{{sender_name}}`,
    },
    follow_up_2: {
      subject: "one thing I noticed",
      body: `{{first_name}} — I checked your site again.

You've got {{review_count}} reviews and a solid rating. The only thing costing you jobs right now is response speed.

People pick whoever responds first. Right now that's not you — it's whoever picks up the phone.

Want me to show you what fixing that looks like?

{{sender_name}}`,
    },
    breakup: {
      subject: "closing this out",
      body: `Hey {{first_name}}, not going to keep nudging you.

If the timing's off, totally fair. I'll leave it here.

If you ever want to see how other {{trade}} businesses in {{city}} are handling quote capture — my door's open.

{{sender_name}}`,
    },
    contact_form: {
      body: `Hi {{first_name}} — I build instant quote tools for {{trade}} businesses. Noticed you don't have one on your site. Most leads won't call — they'll just move on. Worth 5 minutes to show you what it looks like?`,
    },
    dm: {
      body: `Hey {{first_name}} — love the work you guys do. Quick question: do you have a way for people to get a quote from your website without calling? If not, I might be able to help.`,
    },
  },
};

/* ═══════════════════════════════════════════════
   REPUTATIONSHIELD
   ═══════════════════════════════════════════════ */

const reputationshield: OfferConfig = {
  key: "reputationshield",
  label: "ReputationShield",
  tagline: "Reviews & reputation management",
  color: "bg-amber-100 text-amber-700",
  angles: [
    {
      id: "thin_reviews",
      label: "Thin reviews costing jobs",
      bestFor: "Fewer than 15 reviews, even with a decent rating",
      hook: "Your rating is fine but 8 reviews doesn't win trust in a crowded market",
    },
    {
      id: "bad_review",
      label: "One bad review costing you",
      bestFor: "Rating 3.8–4.2 with visible negative reviews and no owner response",
      hook: "Most people read the bad ones first. If you're not managing it, someone else's opinion is doing your sales pitch",
    },
    {
      id: "competitor_ranks",
      label: "Competitor ranks higher",
      bestFor: "Local competitors with 4.7+ stars and 80+ reviews",
      hook: "You're probably losing to them not because they're better — just because they look better",
    },
  ],
  messages: {
    first_touch: {
      subject: "{{business_name}} reviews",
      body: `Hey {{first_name}},

Searched for {{trade}} in {{city}} — you came up, but you're sitting at {{review_count}} reviews. The top result has a lot more.

In a crowded market, that gap costs real jobs. Homeowners scan fast and trust whoever looks most established.

{{ai_first_line}}

We help {{trade}} businesses get a consistent flow of reviews from jobs they've already done.

{{ai_cta_variant}}

{{sender_name}}`,
    },
    follow_up_1: {
      subject: "Re: {{business_name}} reviews",
      body: `Hey {{first_name}}, circling back.

{{ai_first_line}}

Happy to show you the system. Takes about 10 minutes — still interested?

{{sender_name}}`,
    },
    follow_up_2: {
      subject: "one number that matters",
      body: `{{first_name}} — one thing that matters more than most people think: review velocity.

Google ranks businesses that get reviews consistently, not just businesses that have a lot.

If you're not asking every customer for a review, you're leaving your ranking up to chance.

Want to see what a simple ask-after-every-job system looks like?

{{sender_name}}`,
    },
    breakup: {
      subject: "last one from me",
      body: `Hey {{first_name}}, I'll stop following up after this.

If the review situation ever becomes a problem — or you notice a competitor pulling ahead — feel free to reach out.

We'll be here.

{{sender_name}}`,
    },
    contact_form: {
      body: `Hi {{first_name}} — I help {{trade}} businesses get more Google reviews from jobs they've already done. You've got solid work but {{review_count}} reviews is holding you back in search. Happy to show you the system — quick call?`,
    },
    dm: {
      body: `Hey {{first_name}} — saw your business page. Great reviews but not many. I help {{trade}} businesses fix that with a simple after-job review system. Worth a quick look?`,
    },
  },
};

/* ═══════════════════════════════════════════════
   SOCIALSYNC
   ═══════════════════════════════════════════════ */

const socialsync: OfferConfig = {
  key: "socialsync",
  label: "SocialSync",
  tagline: "Done-for-you social content",
  color: "bg-purple-100 text-purple-700",
  angles: [
    {
      id: "dead_page",
      label: "Dead socials make you look closed",
      bestFor: "Facebook/Instagram page not posted to in 6+ months",
      hook: "When someone gets referred to you, the first thing they do is Google you. The second is check your Facebook",
    },
    {
      id: "doing_the_work",
      label: "You're doing the work but not showing it",
      bestFor: "Busy business with great reviews but no social content",
      hook: "Every job you finish is a marketing asset you're throwing away",
    },
    {
      id: "social_proof",
      label: "Social proof is the new business card",
      bestFor: "Newer businesses (under 3 years) building credibility",
      hook: "You can't hand out a business card to a homeowner scrolling Google at 9pm",
    },
  ],
  messages: {
    first_touch: {
      subject: "{{business_name}} — quick observation",
      body: `Hey {{first_name}},

Your last Facebook post was a while ago. Your work looks solid from your reviews — just not visible online.

When someone gets referred to you, the first thing they do is check your page. Right now it's not helping.

{{ai_first_line}}

We handle social content for {{trade}} businesses — pull photos from jobs, write the posts, publish them. You don't touch it.

{{ai_cta_variant}}

{{sender_name}}`,
    },
    follow_up_1: {
      subject: "Re: {{business_name}} — quick observation",
      body: `Hey {{first_name}}, just following up.

{{ai_first_line}}

I can show you what this looks like for another {{trade}} business in {{state}} — 2-minute overview, no commitment.

Worth it?

{{sender_name}}`,
    },
    follow_up_2: {
      subject: "the before/after post",
      body: `{{first_name}} — before/after photos are the highest-performing content for {{trade}} businesses. Every job you do is one.

You're probably doing 10–20 jobs a month. That's 10–20 posts you could have without writing a single word.

Want me to show you how it works?

{{sender_name}}`,
    },
    breakup: {
      subject: "leaving this with you",
      body: `Hey {{first_name}}, won't keep bothering you.

If you ever want to turn the work you're already doing into something that shows up online — reach out anytime.

{{sender_name}}`,
    },
    contact_form: {
      body: `Hi {{first_name}} — I manage social content for {{trade}} businesses. You do great work but your last post was months ago. We handle everything — you just send us job photos. Open to seeing how it works?`,
    },
    dm: {
      body: `Hey {{first_name}} — I help {{trade}} businesses turn job photos into social posts. Looks like your page has been quiet — I can fix that without you having to write anything. Interested?`,
    },
  },
};

/* ═══════════════════════════════════════════════
   TRADELINE
   ═══════════════════════════════════════════════ */

const tradeline: OfferConfig = {
  key: "tradeline",
  label: "TradeLine",
  tagline: "AI voice + missed call recovery",
  color: "bg-green-100 text-green-700",
  angles: [
    {
      id: "missed_calls",
      label: "Missed calls after hours",
      bestFor: "Owner-operators on-site all day with no receptionist",
      hook: "You're probably losing 2–3 jobs a week to voicemail",
    },
    {
      id: "dont_exist",
      label: "You don't exist online",
      bestFor: "No website, minimal Google presence",
      hook: "If I search {{trade}} in {{city}} right now, you don't show up",
    },
    {
      id: "referral_risk",
      label: "Referrals are unreliable",
      bestFor: "Experienced tradespeople who've been fully referral-based for years",
      hook: "Referrals are great until they're not. What's the plan for a slow month?",
    },
  ],
  messages: {
    first_touch: {
      subject: "missed calls — {{business_name}}",
      body: `Hey {{first_name}},

If you're on a job and a call comes in, what happens?

Most small {{trade}} operations lose 2–3 jobs a week to voicemail. Not because the customer didn't want them — just because someone else picked up first.

{{ai_first_line}}

We set up a simple AI answering system for {{trade}} businesses. It handles after-hours calls, captures the lead, and texts you.

{{ai_cta_variant}}

{{sender_name}}`,
    },
    follow_up_1: {
      subject: "Re: missed calls — {{business_name}}",
      body: `Hey {{first_name}}, bumping this.

{{ai_first_line}}

I can show you the setup in under 5 minutes. No contract, no tech headache.

Open to a quick look?

{{sender_name}}`,
    },
    follow_up_2: {
      subject: "one question",
      body: `{{first_name}} — honest question: how many calls do you think you miss in a week while on jobs?

Most {{trade}} owners I talk to guess 3–5. The actual number is usually higher.

If you want to know yours, I can show you how to find out.

{{sender_name}}`,
    },
    breakup: {
      subject: "last message",
      body: `Hey {{first_name}}, I'll leave it here.

If you ever have a slow month and want to turn on a new source of leads — reach back out. Happy to help.

{{sender_name}}`,
    },
    contact_form: {
      body: `Hi {{first_name}} — I set up AI phone answering for {{trade}} businesses. If you're on a job and miss a call, that lead usually goes to a competitor. Takes 10 minutes to set up. Can I show you?`,
    },
    dm: {
      body: `Hey {{first_name}} — quick question. When you're on a job and miss a call, what happens to that lead? I have a fix that takes 10 minutes to set up. Worth a look?`,
    },
  },
};

/* ─── Export map ─── */

export const OFFER_TEMPLATES: Record<OfferKey, OfferConfig> = {
  quotequick,
  reputationshield,
  socialsync,
  tradeline,
};

export const OFFER_KEYS: OfferKey[] = ["quotequick", "reputationshield", "socialsync", "tradeline"];

export const MESSAGE_TYPE_LABELS: Record<MessageType, string> = {
  first_touch:  "Email 1",
  follow_up_1:  "Follow-up 1",
  follow_up_2:  "Follow-up 2",
  breakup:      "Breakup",
  contact_form: "Contact Form",
  dm:           "DM",
};
