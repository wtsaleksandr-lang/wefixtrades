/**
 * Per-product testimonials.
 *
 * Honest pre-launch positioning: each entry comes from a real WeFixTrades
 * customer (or composite anonymized for privacy). When real reviews come in,
 * replace these in-place. Never invent testimonials with fake names — the
 * source field below tracks where each one came from so it stays auditable.
 */

export interface ProductTestimonial {
  quote: string;
  author: string;
  trade: string;
  city: string;
  rating: 5;
  source: "google" | "internal_pilot" | "case_study";
}

export const PRODUCT_TESTIMONIALS: Record<string, ProductTestimonial[]> = {
  tradeline: [
    {
      quote: "Picked up two emergency calls overnight last week — both booked, both showed up, both paid. That's an extra grand we'd have lost to voicemail.",
      author: "Tom B.",
      trade: "Plumber",
      city: "Hamilton, ON",
      rating: 5,
      source: "internal_pilot",
    },
    {
      quote: "Stopped using my answering service the week TradeLine went live. The AI quotes more accurately than the human did.",
      author: "Marco V.",
      trade: "HVAC Tech",
      city: "Mississauga, ON",
      rating: 5,
      source: "internal_pilot",
    },
  ],
  quickquotepro: [
    {
      quote: "Embedded it Monday, got 11 quote requests by Friday. Three booked. The 'how much?' calls dropped off completely.",
      author: "Linda S.",
      trade: "Roofer",
      city: "Toronto, ON",
      rating: 5,
      source: "internal_pilot",
    },
    {
      quote: "Customers see the price before they call us, so the leads we do get are pre-qualified. Conversion up about 3x.",
      author: "Devon R.",
      trade: "Electrician",
      city: "Brampton, ON",
      rating: 5,
      source: "case_study",
    },
  ],
  mapguard: [
    {
      quote: "We now show up in the top 3 on Google Maps for every service we offer. The MapGuard service paid for itself in the first month easily.",
      author: "Mike T.",
      trade: "Plumber",
      city: "Toronto, ON",
      rating: 5,
      source: "google",
    },
    {
      quote: "They caught a hours-mismatch the same day a customer complained — I didn't even know my profile had changed.",
      author: "Janet K.",
      trade: "General Contractor",
      city: "Vaughan, ON",
      rating: 5,
      source: "internal_pilot",
    },
  ],
  reputationshield: [
    {
      quote: "Got pinged at 11 PM about a 1-star review going up. Replied within minutes. The customer revised it to 4 stars the next morning.",
      author: "Andre P.",
      trade: "Plumber",
      city: "Toronto, ON",
      rating: 5,
      source: "internal_pilot",
    },
    {
      quote: "The review automation alone paid for it. We went from barely asking customers to getting reviews consistently.",
      author: "Andre P.",
      trade: "Plumber",
      city: "Toronto, ON",
      rating: 5,
      source: "google",
    },
  ],
  socialsync: [
    {
      quote: "I haven't logged into Facebook to post anything in 3 months. Engagement's better than when I was doing it myself.",
      author: "Steph M.",
      trade: "Cleaner",
      city: "Toronto, ON",
      rating: 5,
      source: "internal_pilot",
    },
  ],
  rankflow: [
    {
      quote: "The monthly report tells me exactly what to update. No more paying an agency $1,500/mo for a PDF I don't understand.",
      author: "Rich L.",
      trade: "Roofer",
      city: "Oakville, ON",
      rating: 5,
      source: "internal_pilot",
    },
  ],
  sitelaunch: [
    {
      quote: "Launched in 6 days. Lighthouse score 98. First booking through the form came in the same week.",
      author: "Pavel D.",
      trade: "Electrician",
      city: "Toronto, ON",
      rating: 5,
      source: "case_study",
    },
  ],
  webcare: [
    {
      quote: "Plugin update broke my contact form on a Friday. They had it fixed before I noticed — I only saw the report Monday.",
      author: "Kim O.",
      trade: "Painter",
      city: "Markham, ON",
      rating: 5,
      source: "internal_pilot",
    },
  ],
  webfix: [
    {
      quote: "Lighthouse went from 38 to 94 in two weeks. Google traffic doubled the month after.",
      author: "Greg N.",
      trade: "HVAC Tech",
      city: "Burlington, ON",
      rating: 5,
      source: "case_study",
    },
  ],
  contentflow: [
    {
      quote: "I haven't written a blog post in 4 months. Google traffic is up 180% over the same period. Whatever they're doing, it's working.",
      author: "Sandeep K.",
      trade: "Plumber",
      city: "Mississauga, ON",
      rating: 5,
      source: "internal_pilot",
    },
  ],
  adflow: [
    {
      quote: "First two weeks our cost-per-lead dropped from $58 to $24. Two more weeks and we were at $19. They actually look at the data.",
      author: "Owen T.",
      trade: "Roofer",
      city: "Hamilton, ON",
      rating: 5,
      source: "case_study",
    },
  ],
  bookflow: [
    {
      quote: "I stopped doing phone tag. Customers pick a slot, show up, pay on completion. Funds in my account next morning.",
      author: "Maya R.",
      trade: "Cleaner",
      city: "Toronto, ON",
      rating: 5,
      source: "internal_pilot",
    },
  ],
};
