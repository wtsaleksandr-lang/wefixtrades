/**
 * Outreach Template Library — V2
 *
 * Each offer has 3 angles. Each angle has its own complete message set.
 * No shared bodies. Angle selection changes the entire copy, not just a hook.
 *
 * Merge tokens: {{business_name}} {{first_name}} {{city}} {{state}} {{trade}}
 *               {{review_count}} {{rating}} {{ai_first_line_callout}}
 *               {{ai_first_line}} {{ai_cta_variant}} {{sender_name}}
 */

export type OfferKey = "quotequick" | "reputationshield" | "socialsync" | "tradeline";
export type MessageType =
  | "first_touch"
  | "follow_up_1"
  | "follow_up_2"
  | "breakup"
  | "contact_form"
  | "dm";

export interface MessageConfig {
  subject?: string;
  body: string;
}

export interface AngleConfig {
  id: string;
  label: string;
  bestFor: string;
  hook: string;
  messages: Record<MessageType, MessageConfig>;
}

export interface OfferConfig {
  key: OfferKey;
  label: string;
  tagline: string;
  color: string;
  angles: AngleConfig[];
}

export const MESSAGE_TYPE_LABELS: Record<MessageType, string> = {
  first_touch:  "Email 1",
  follow_up_1:  "Follow-up 1",
  follow_up_2:  "Follow-up 2",
  breakup:      "Breakup",
  contact_form: "Contact Form",
  dm:           "DM",
};

export const OFFER_KEYS: OfferKey[] = ["quotequick", "reputationshield", "socialsync", "tradeline"];

const quotequick: OfferConfig = {
  key: "quotequick", label: "QuoteQuick",
  tagline: "Instant online quoting", color: "bg-blue-100 text-blue-700",
  angles: [
    {
      id: "wont_wait", label: "People won't wait for a quote",
      bestFor: "Has a website with no prices or quote tool visible",
      hook: "You're probably losing 3–5 jobs a week to whoever responds first",
      messages: {
        first_touch: {
          subject: "quick question about {{business_name}}",
          body: `Hey {{first_name}},

Looked at {{business_name}} — quick thing:

there's no way for someone to get a price without calling or waiting.

Most people won't do either. They'll just check the next company that shows a number.

We've been adding a simple quote calculator to {{trade}} sites so visitors can see a price instantly — and it captures their details at the same time.

{{ai_first_line_callout}}

Want me to show you what that would look like on your site?

{{sender_name}}`,
        },
        follow_up_1: {
          subject: "Re: quick question about {{business_name}}",
          body: `Hey {{first_name}}, just bumping this.

{{ai_first_line}}

Quick question: how many people do you think visit your site each month and leave without doing anything?

A quote calculator captures their details without needing them to call. Even at 11pm.

Worth a test?

{{sender_name}}`,
        },
        follow_up_2: {
          subject: "one thing I noticed",
          body: `{{first_name}} — one more thing about {{business_name}}:

every time someone lands on your site and leaves without calling, that's a lead you didn't get to pitch.

A calculator fixes that without changing anything else about how you work.

Want to see what it looks like?

{{sender_name}}`,
        },
        breakup: {
          subject: "closing this out",
          body: `Hey {{first_name}}, not going to keep nudging.

If you ever want a quote tool on your site — you know where to find us.

{{sender_name}}`,
        },
        contact_form: { body: `Hi {{first_name}} — I add instant quote tools to {{trade}} sites. Right now {{business_name}} has no way for visitors to get a price without calling — most won't. Worth 5 minutes to show you?` },
        dm: { body: `Hey {{first_name}} — noticed {{business_name}} doesn't have a way for people to get an instant quote on your site. I help {{trade}} businesses add one. Worth a look?` },
      },
    },
    {
      id: "after_hours", label: "After-hours jobs going to voicemail",
      bestFor: "Owner-operators on-site all day who miss evening calls",
      hook: "Most of your lost jobs aren't lost during business hours",
      messages: {
        first_touch: {
          subject: "missed calls — {{business_name}}",
          body: `Hey {{first_name}},

Quick question — what happens when someone tries to get a quote from {{business_name}} after hours?

Most {{trade}} businesses lose a few jobs a week just because nobody answers in the evening.

We've been setting up a simple instant quote tool that works 24/7 — customers get a price and you get their details without picking up the phone.

{{ai_first_line_callout}}

Takes 5 minutes to show you. Worth a look?

{{sender_name}}`,
        },
        follow_up_1: {
          subject: "Re: missed calls — {{business_name}}",
          body: `Hey {{first_name}}, following up.

{{ai_first_line}}

Most of the jobs {{trade}} businesses lose happen between 7pm and 10pm when people are searching from home.

If your site doesn't capture them then, you're starting every next day behind.

Open to a quick demo?

{{sender_name}}`,
        },
        follow_up_2: {
          subject: "after hours",
          body: `{{first_name}} — a lot of {{trade}} owners tell me they're surprised how many after-hours leads they were missing once they set up a 24/7 quote tool.

It's a 5-minute setup. Happy to show you this week.

{{sender_name}}`,
        },
        breakup: {
          subject: "leaving this here",
          body: `Hey {{first_name}}, leaving this here.

If after-hours lead capture ever becomes a priority — reach out.

{{sender_name}}`,
        },
        contact_form: { body: `Hi {{first_name}} — what happens when someone tries to reach {{business_name}} after hours? We add a simple 24/7 quote tool to {{trade}} sites so you capture those leads automatically. Can I show you?` },
        dm: { body: `Hey {{first_name}} — quick question: if someone wants a quote from {{business_name}} at 9pm, what do they do? I help {{trade}} businesses capture after-hours leads without picking up the phone.` },
      },
    },
    {
      id: "speed_wins", label: "Speed beats price",
      bestFor: "Competitive markets with many local providers",
      hook: "The fastest quote usually wins — not the cheapest",
      messages: {
        first_touch: {
          subject: "{{trade}} businesses in {{city}}",
          body: `Hey {{first_name}},

One thing I've been seeing with {{trade}} businesses in {{city}}:

the one who responds first usually gets the job — not the cheapest.

Right now most sites (including {{business_name}}) rely on forms or callbacks, which slows everything down.

We've been helping businesses fix that by adding instant pricing directly on the site.

{{ai_first_line_callout}}

Want me to show you how others are doing it?

{{sender_name}}`,
        },
        follow_up_1: {
          subject: "Re: {{trade}} businesses in {{city}}",
          body: `Hey {{first_name}}, circling back.

{{ai_first_line}}

The businesses winning in {{city}} right now aren't always the best — they're just the fastest to give a number.

If a customer gets a price from you in 30 seconds, they stop looking. Takes me 5 minutes to show you.

Worth it?

{{sender_name}}`,
        },
        follow_up_2: {
          subject: "first to respond",
          body: `{{first_name}} — 80% of homeowners contact only the first business that responds.

Right now {{business_name}} is asking them to wait. That's a solvable problem.

Open to a quick look?

{{sender_name}}`,
        },
        breakup: {
          subject: "closing this out",
          body: `Hey {{first_name}}, I'll stop here.

If you ever want to be the fastest option in {{city}} — reach back out.

{{sender_name}}`,
        },
        contact_form: { body: `Hi {{first_name}} — in {{city}}, the {{trade}} business that responds first usually wins the job. Right now {{business_name}} is asking people to wait. I can fix that with a same-page quote tool. Worth 5 minutes?` },
        dm: { body: `Hey {{first_name}} — in {{city}}, the fastest {{trade}} quote usually wins. {{business_name}} doesn't have instant pricing online yet. I can help with that.` },
      },
    },
  ],
};
const reputationshield: OfferConfig = {
  key: "reputationshield", label: "ReputationShield",
  tagline: "Reviews & reputation management", color: "bg-amber-100 text-amber-700",
  angles: [
    {
      id: "thin_reviews", label: "Thin reviews costing jobs",
      bestFor: "Fewer than 15 reviews, even with a decent rating",
      hook: "Your rating is fine but {{review_count}} reviews doesn't win trust in a crowded market",
      messages: {
        first_touch: {
          subject: "{{business_name}} reviews",
          body: `Hey {{first_name}},

Searched for {{trade}} in {{city}} — {{business_name}} came up, but you've only got {{review_count}} reviews.

The top results have a lot more. Homeowners scan fast: fewer reviews usually means they keep scrolling.

{{ai_first_line_callout}}

We help {{trade}} businesses build review volume from jobs they've already done — without chasing customers manually.

Want to see how it works?

{{sender_name}}`,
        },
        follow_up_1: {
          subject: "Re: {{business_name}} reviews",
          body: `Hey {{first_name}}, bumping this.

{{ai_first_line}}

Most {{trade}} owners are surprised how many customers would leave a review if you just asked at the right moment.

I can show you the setup in 10 minutes. Still interested?

{{sender_name}}`,
        },
        follow_up_2: {
          subject: "review volume",
          body: `{{first_name}} — review volume affects where you rank in local search, not just how trustworthy you look.

At {{review_count}} reviews, there's a lot of ground to close quickly.

Want to see the system?

{{sender_name}}`,
        },
        breakup: {
          subject: "leaving this here",
          body: `Hey {{first_name}}, leaving this here.

If review volume becomes a priority — you know where to find us.

{{sender_name}}`,
        },
        contact_form: { body: `Hi {{first_name}} — {{business_name}} has {{review_count}} reviews, which is holding you back in local search. I help {{trade}} businesses build consistent review volume from jobs already done. Quick call?` },
        dm: { body: `Hey {{first_name}} — saw {{business_name}} has {{review_count}} reviews. I help {{trade}} businesses in {{city}} build more from existing customers. Worth a quick look?` },
      },
    },
    {
      id: "bad_review", label: "One bad review killing first impression",
      bestFor: "Rating 3.8–4.2 with a negative review near the top, no owner response",
      hook: "Most people read the bad ones first — an unanswered one hurts more than the rating itself",
      messages: {
        first_touch: {
          subject: "{{business_name}} — quick thing",
          body: `Hey {{first_name}},

Looked up {{business_name}} — you've got solid work but one thing stands out: there's a negative review near the top with no response.

Most homeowners read the bad ones first. An unanswered one hurts more than the rating itself.

{{ai_first_line_callout}}

We help {{trade}} businesses manage their review profile — responding well, getting more recent positives in front, building a buffer so one bad review doesn't define the first impression.

Worth a look?

{{sender_name}}`,
        },
        follow_up_1: {
          subject: "Re: {{business_name}} — quick thing",
          body: `Hey {{first_name}}, following up.

{{ai_first_line}}

A lot of {{trade}} businesses don't realise: responding to a negative review — even a bad one — builds trust with everyone reading it.

I can show you the playbook in 10 minutes. Still interested?

{{sender_name}}`,
        },
        follow_up_2: {
          subject: "one thing that works",
          body: `{{first_name}} — when you get 5–6 fresh positive reviews above a negative one, the damage drops significantly.

Your {{rating}} rating is fixable. Happy to show you how.

{{sender_name}}`,
        },
        breakup: {
          subject: "leaving this here",
          body: `Hey {{first_name}}, I'll leave it here.

If the reviews ever start affecting bookings — reach out.

{{sender_name}}`,
        },
        contact_form: { body: `Hi {{first_name}} — noticed {{business_name}} has a negative review near the top that's going unanswered. That tends to cost real jobs. I help {{trade}} businesses manage this — quick call?` },
        dm: { body: `Hey {{first_name}} — noticed a negative review near the top of {{business_name}}'s profile. I help {{trade}} businesses push fresh positives above it. Worth a quick chat?` },
      },
    },
    {
      id: "competitor_ranks", label: "Competitor outranking you on reviews",
      bestFor: "Local competitor with 4.7+ stars and 80+ reviews in same market",
      hook: "You're probably losing to them not because they're better — just because they look more established",
      messages: {
        first_touch: {
          subject: "{{trade}} in {{city}}",
          body: `Hey {{first_name}},

Searched {{trade}} in {{city}} — there's a competitor in the top spot with a lot more reviews than {{business_name}}.

They're probably not better than you. They just look more established.

{{ai_first_line_callout}}

We help {{trade}} businesses close that review gap so they stop losing the first impression before the phone even rings.

Want to see what the difference would look like?

{{sender_name}}`,
        },
        follow_up_1: {
          subject: "Re: {{trade}} in {{city}}",
          body: `Hey {{first_name}}, circling back.

{{ai_first_line}}

The gap between your review count and the top result in {{city}} is closeable fast — if you have a system for asking after each job.

Takes me 10 minutes to show you. Worth it?

{{sender_name}}`,
        },
        follow_up_2: {
          subject: "closing the gap",
          body: `{{first_name}} — I'm not saying outrank everyone. Just close the gap enough that you're not being skipped.

When someone compares 3 local {{trade}} businesses and you have the least reviews, you're starting at a disadvantage.

Want to see the system?

{{sender_name}}`,
        },
        breakup: {
          subject: "leaving this here",
          body: `Hey {{first_name}}, not going to keep pushing.

If a competitor ever pulls ahead and it starts showing in bookings — I'm here.

{{sender_name}}`,
        },
        contact_form: { body: `Hi {{first_name}} — the top {{trade}} businesses in {{city}} are outranking {{business_name}} on reviews. That matters more than most owners realise. I help close that gap fast. Quick call?` },
        dm: { body: `Hey {{first_name}} — {{business_name}} is behind the top {{trade}} businesses in {{city}} on reviews. I help close that gap. Interested?` },
      },
    },
  ],
};
const socialsync: OfferConfig = {
  key: "socialsync", label: "SocialSync",
  tagline: "Done-for-you social content", color: "bg-purple-100 text-purple-700",
  angles: [
    {
      id: "dead_page", label: "Dead socials make you look closed",
      bestFor: "Facebook/Instagram page not posted to in 6+ months",
      hook: "When someone gets referred to you, they check your page — a dead one creates doubt",
      messages: {
        first_touch: {
          subject: "{{business_name}} — quick observation",
          body: `Hey {{first_name}},

Checked out {{business_name}} online — your Facebook page hasn't been updated in a while.

When someone gets a referral and looks you up, a dead page raises a question: are they still active?

{{ai_first_line_callout}}

We handle social content for {{trade}} businesses — take job photos, write the posts, publish them consistently. You don't touch it.

Open to seeing what that looks like?

{{sender_name}}`,
        },
        follow_up_1: {
          subject: "Re: {{business_name}} — quick observation",
          body: `Hey {{first_name}}, just following up.

{{ai_first_line}}

A consistent page doesn't need to be fancy — it just needs to signal that you're busy and doing good work.

I can show you what a 30-day content plan looks like for a {{trade}} business in {{state}}. Takes 2 minutes.

{{sender_name}}`,
        },
        follow_up_2: {
          subject: "social and reviews",
          body: `{{first_name}} — when someone searches {{business_name}} and your last post is months ago, it creates doubt even if your Google reviews are solid.

Social and reviews work together. One gap weakens the other.

Want to fix the social side?

{{sender_name}}`,
        },
        breakup: {
          subject: "leaving this with you",
          body: `Hey {{first_name}}, I'll leave you alone after this.

If you ever want the page to work for you again — reach out.

{{sender_name}}`,
        },
        contact_form: { body: `Hi {{first_name}} — {{business_name}}'s social page hasn't been updated in a while. When a referral checks you out, that creates doubt. We handle posting for {{trade}} businesses — you just send photos. Worth 5 minutes?` },
        dm: { body: `Hey {{first_name}} — noticed {{business_name}}'s page has been quiet. I manage social content for {{trade}} businesses — take care of everything so you don't have to. Interested?` },
      },
    },
    {
      id: "doing_the_work", label: "Doing the work, not showing it",
      bestFor: "Busy business with good reviews but almost no social content",
      hook: "Every job you finish is a marketing asset you're throwing away",
      messages: {
        first_touch: {
          subject: "{{business_name}} — {{review_count}} reviews, no posts",
          body: `Hey {{first_name}},

Looking at {{business_name}} — {{review_count}} reviews suggests you're doing a solid volume of work.

But the social page tells a different story.

Every finished job is a before/after, a review quote, a credibility signal — and it's not being used.

{{ai_first_line_callout}}

We pull photos from your jobs and turn them into posts. You send a photo, we handle the rest.

Want to see what that would look like for {{business_name}}?

{{sender_name}}`,
        },
        follow_up_1: {
          subject: "Re: {{business_name}} — {{review_count}} reviews, no posts",
          body: `Hey {{first_name}}, bumping this.

{{ai_first_line}}

A before/after from a {{trade}} job gets more engagement than almost any other type of post — and you're already doing them every week.

I can turn those into a content calendar. Want to see how?

{{sender_name}}`,
        },
        follow_up_2: {
          subject: "the content you're sitting on",
          body: `{{first_name}} — the {{trade}} businesses building the strongest reputation right now are the ones showing their work consistently.

Not fancy content. Just regular proof that they're busy and doing good work.

You've got the work. Want to show it?

{{sender_name}}`,
        },
        breakup: {
          subject: "leaving this here",
          body: `Hey {{first_name}}, leaving this here.

When you're ready to turn your jobs into content — we'll be here.

{{sender_name}}`,
        },
        contact_form: { body: `Hi {{first_name}} — {{business_name}} is doing solid work but not showing it online. I help {{trade}} businesses turn job photos into regular social content — you just send the photo. Worth a look?` },
        dm: { body: `Hey {{first_name}} — you're doing great work but not much is showing up online. I help {{trade}} businesses turn job photos into content automatically. Interested?` },
      },
    },
    {
      id: "social_proof", label: "Social proof is the new business card",
      bestFor: "Newer businesses (under 3 years) building credibility",
      hook: "Referrals now check your social page before calling — a quiet page loses the job before you answer",
      messages: {
        first_touch: {
          subject: "something I keep seeing",
          body: `Hey {{first_name}},

Something I keep seeing with {{trade}} businesses in {{city}}:

a solid Facebook or Instagram presence is now the first thing people check after a referral.

{{business_name}} doesn't have much showing right now. That's a gap that's easy to close.

{{ai_first_line_callout}}

We handle all the content — you just send job photos when you remember to. We turn it into posts.

Worth 5 minutes to see what it could look like?

{{sender_name}}`,
        },
        follow_up_1: {
          subject: "Re: something I keep seeing",
          body: `Hey {{first_name}}, circling back.

{{ai_first_line}}

A lot of {{trade}} owners tell me their referral conversions improve once the page is active again — people trust what they can verify.

I can show you what a clean, consistent presence looks like in 2 minutes.

{{sender_name}}`,
        },
        follow_up_2: {
          subject: "the referral check",
          body: `{{first_name}} — homeowners don't just Google anymore.

They check socials, look for before/afters, see how recently you posted. A dead page can lose the job before you even get the call.

Want to fix that?

{{sender_name}}`,
        },
        breakup: {
          subject: "leaving this with you",
          body: `Hey {{first_name}}, won't keep pushing.

When the page becomes a priority — I'm here.

{{sender_name}}`,
        },
        contact_form: { body: `Hi {{first_name}} — people check social pages after a referral. {{business_name}} doesn't have much showing right now. We handle the content for {{trade}} businesses — you send photos, we do the rest. Worth a look?` },
        dm: { body: `Hey {{first_name}} — referrals check social pages before calling. {{business_name}}'s page is pretty quiet. I handle content for {{trade}} businesses — want to see how it works?` },
      },
    },
  ],
};
const tradeline: OfferConfig = {
  key: "tradeline", label: "TradeLine",
  tagline: "AI voice + missed call recovery", color: "bg-green-100 text-green-700",
  angles: [
    {
      id: "missed_calls", label: "Missed calls after hours",
      bestFor: "Owner-operators on-site all day with no receptionist",
      hook: "You're probably losing 2–3 jobs a week to voicemail",
      messages: {
        first_touch: {
          subject: "missed calls — {{business_name}}",
          body: `Hey {{first_name}},

Quick question for {{business_name}}:

when you're on a job and a call comes in, what happens?

Most {{trade}} operations lose a few jobs a week just because nobody answers. Not because the customer didn't want them — just because someone else picked up first.

{{ai_first_line_callout}}

We set up a simple AI answering system — it handles the call, captures the lead, texts you the details.

Takes 10 minutes to set up. Want me to show you?

{{sender_name}}`,
        },
        follow_up_1: {
          subject: "Re: missed calls — {{business_name}}",
          body: `Hey {{first_name}}, following up.

{{ai_first_line}}

Most people who get voicemail don't leave a message. They call the next number.

I can show you how to make sure that doesn't happen. 5 minutes — want to see it?

{{sender_name}}`,
        },
        follow_up_2: {
          subject: "honest question",
          body: `{{first_name}} — honest question:

How many calls do you think you miss in a week while on jobs?

Most {{trade}} owners guess 3. It's usually higher.

If you want to know your actual number, I can show you how to find out.

{{sender_name}}`,
        },
        breakup: {
          subject: "leaving this here",
          body: `Hey {{first_name}}, I'll stop here.

If a slow month ever hits — reach out. Happy to help turn missed calls into leads.

{{sender_name}}`,
        },
        contact_form: { body: `Hi {{first_name}} — when {{business_name}} is on a job and misses a call, that lead usually goes to a competitor. I set up simple AI answering for {{trade}} businesses that captures it automatically. Quick demo?` },
        dm: { body: `Hey {{first_name}} — quick question: what happens to {{business_name}}'s calls when you're on a job? I set up a system that catches missed calls for {{trade}} businesses. Worth a look?` },
      },
    },
    {
      id: "dont_exist", label: "You don't exist online",
      bestFor: "No website, minimal or zero Google presence",
      hook: "If I search {{trade}} in {{city}} right now, you don't show up",
      messages: {
        first_touch: {
          subject: "{{trade}} in {{city}}",
          body: `Hey {{first_name}},

If I search {{trade}} in {{city}} right now — {{business_name}} is hard to find.

That's not unusual for businesses built on referrals. But it means anyone searching at the right moment isn't finding you.

{{ai_first_line_callout}}

We help {{trade}} businesses get visible and start capturing inbound leads — without a big website build.

Want to see what that looks like?

{{sender_name}}`,
        },
        follow_up_1: {
          subject: "Re: {{trade}} in {{city}}",
          body: `Hey {{first_name}}, bumping this.

{{ai_first_line}}

A referral gets you a warm intro. But when someone in {{city}} searches "{{trade}} near me" — you want to be on that list too.

Takes 10 minutes to show you what's possible.

{{sender_name}}`,
        },
        follow_up_2: {
          subject: "search vs referral",
          body: `{{first_name}} — most people who need a {{trade}} right now aren't going to ask a friend. They search.

If {{business_name}} doesn't show up, someone else gets that job.

Want to fix that?

{{sender_name}}`,
        },
        breakup: {
          subject: "leaving it here",
          body: `Hey {{first_name}}, leaving it here.

If you ever want to get visible beyond referrals — reach out.

{{sender_name}}`,
        },
        contact_form: { body: `Hi {{first_name}} — {{business_name}} is hard to find if you search {{trade}} in {{city}}. I help {{trade}} businesses get visible and start capturing search leads fast. Quick call?` },
        dm: { body: `Hey {{first_name}} — if someone searches {{trade}} in {{city}} right now, {{business_name}} is hard to find. I help with that. Worth a chat?` },
      },
    },
    {
      id: "referral_risk", label: "Referrals are unreliable",
      bestFor: "Established tradesperson fully dependent on word-of-mouth",
      hook: "Referrals are great until they're not — slow months are rough with no other tap to turn on",
      messages: {
        first_touch: {
          subject: "{{business_name}} — quick question",
          body: `Hey {{first_name}},

{{business_name}} looks like a solid operation — but I'm guessing most of your work comes from referrals.

That works until it doesn't. Slow months are rough when there's no other tap to turn on.

{{ai_first_line_callout}}

We help {{trade}} businesses set up a simple inbound channel — AI answering, lead capture, basic visibility — so referrals aren't the only source.

Worth a 10-minute look?

{{sender_name}}`,
        },
        follow_up_1: {
          subject: "Re: {{business_name}} — quick question",
          body: `Hey {{first_name}}, following up.

{{ai_first_line}}

I'm not suggesting replacing referrals — just adding a backup for slower periods.

Happy to show you what a simple inbound setup looks like. 10 minutes.

{{sender_name}}`,
        },
        follow_up_2: {
          subject: "slow months",
          body: `{{first_name}} — seasonal slowdowns hit hardest when referrals are the only channel.

A simple system that captures even 2–3 new inbound leads a week changes the math on slow months.

Want to see what that looks like for {{city}}?

{{sender_name}}`,
        },
        breakup: {
          subject: "last one from me",
          body: `Hey {{first_name}}, last one from me.

If the next slow month hits and you want a backup — I'll be here.

{{sender_name}}`,
        },
        contact_form: { body: `Hi {{first_name}} — great reviews on {{business_name}}. If most of your work is referral-based, I can help add a simple inbound lead channel as a backup. Quick call?` },
        dm: { body: `Hey {{first_name}} — looks like {{business_name}} runs mostly on referrals. I help {{trade}} businesses add a simple inbound lead channel as a backup. Interested?` },
      },
    },
  ],
};

export const OFFER_TEMPLATES: Record<OfferKey, OfferConfig> = {
  quotequick,
  reputationshield,
  socialsync,
  tradeline,
};
