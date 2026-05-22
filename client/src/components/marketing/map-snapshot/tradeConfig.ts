/**
 * Wave BF-6 — per-trade SEO landing-page configuration for MapSnapshot.
 *
 * Each entry powers a /tools/map-snapshot/<slug> page with a unique H1,
 * intro paragraphs, success-story placeholders, and meta tags. Slug list
 * is canonical — adding a trade here makes the page route work via the
 * dynamic Route in App.tsx.
 */

export interface TradeConfig {
  slug: string;
  label: string;
  h1: string;
  intro: string;
  intro2: string;
  metaTitle: string;
  metaDescription: string;
  successStories: Array<{ name: string; result: string; quote: string }>;
}

export const TRADE_CONFIGS: Record<string, TradeConfig> = {
  plumbing: {
    slug: "plumbing",
    label: "Plumbing",
    h1: "Free Google Maps audit for plumbers",
    intro:
      "When a pipe bursts at 2am, customers don't scroll past the top three on Google Maps. If you're not in that pack, you're invisible — and your competitor gets the emergency call.",
    intro2:
      "This free snapshot shows exactly where you rank for plumber-related searches across a 5×5 grid around your business, plus the 10 things on your Google Business Profile that are dragging your rank down.",
    metaTitle: "Free Google Maps Audit for Plumbers | MapGuard Snapshot",
    metaDescription:
      "See where your plumbing business ranks on Google Maps across a 5×5 grid, plus 10 GBP fixes to climb into the local pack. Free, no signup.",
    successStories: [
      { name: "RapidFlow Plumbing (Manchester)", result: "Avg rank 14 → 3 in 6 weeks", quote: "We finally show up for 'emergency plumber near me'." },
      { name: "Northgate Pipework (Leeds)", result: "Top-3 pack share 12% → 64%", quote: "Two-thirds of our calls now come from Maps." },
      { name: "BlueWrench (Bristol)", result: "Reviews 18 → 87 in 90 days", quote: "Review velocity unlocked the suburbs we never ranked in." },
    ],
  },
  electrical: {
    slug: "electrical",
    label: "Electrical",
    h1: "Free Google Maps audit for electricians",
    intro:
      "Electrical jobs are time-sensitive and high-trust — customers search 'electrician near me' and call whoever Google puts in the local 3-pack. Everyone below that gets a tiny fraction of the clicks.",
    intro2:
      "Get a free 5×5 rank-grid for your business plus a 10-card audit of every GBP signal Google uses to decide who shows up first.",
    metaTitle: "Free Google Maps Audit for Electricians | MapGuard Snapshot",
    metaDescription:
      "Discover where your electrical business ranks on Google Maps and what's keeping you out of the local 3-pack. Free 5×5 grid + 10-card GBP audit.",
    successStories: [
      { name: "Volt & Wire (Birmingham)", result: "Avg rank 19 → 5 in 8 weeks", quote: "We had no idea we were invisible in half our service area." },
      { name: "CurrentWorks (Sheffield)", result: "Top-3 share 8% → 52%", quote: "Most of our growth this quarter came from this one fix." },
      { name: "Sparks & Co (Liverpool)", result: "GBP completeness 60% → 100%", quote: "Three changes moved us 11 spots." },
    ],
  },
  hvac: {
    slug: "hvac",
    label: "HVAC",
    h1: "Free Google Maps audit for HVAC contractors",
    intro:
      "HVAC is seasonal and intent-heavy. When the heating dies in January or the AC goes in July, the top 3 on Google Maps win the next week of jobs. If you're at rank 7+, you're invisible.",
    intro2:
      "This snapshot maps your rank across a 5×5 grid and gives you the 10 GBP fixes most likely to push you into the local pack before the next seasonal spike.",
    metaTitle: "Free Google Maps Audit for HVAC | MapGuard Snapshot",
    metaDescription:
      "See where your HVAC business ranks on Google Maps. Free 5×5 grid audit + 10 GBP fixes to win seasonal demand.",
    successStories: [
      { name: "ClimateRight (Glasgow)", result: "Avg rank 11 → 2 in 7 weeks", quote: "We doubled summer install bookings." },
      { name: "AirNorth HVAC (Newcastle)", result: "Top-3 share 18% → 71%", quote: "Worth every minute of the cleanup." },
      { name: "FrostStop (Cardiff)", result: "Review velocity ×6", quote: "Steady review flow turned out to be the biggest unlock." },
    ],
  },
  roofing: {
    slug: "roofing",
    label: "Roofing",
    h1: "Free Google Maps audit for roofers",
    intro:
      "Roofing jobs are high-ticket and customers spend more time comparing — but they still start at the local 3-pack on Google Maps. If you're not there, you don't get the quote request.",
    intro2:
      "Get a free 5×5 rank-grid plus a 10-card audit of every signal Google weighs when deciding who shows up first for 'roofer near me' and similar searches.",
    metaTitle: "Free Google Maps Audit for Roofers | MapGuard Snapshot",
    metaDescription:
      "Free Google Maps rank audit for roofers. 5×5 grid + 10 GBP fixes to get into the local pack and win more quote requests.",
    successStories: [
      { name: "Apex Roofing (Edinburgh)", result: "Avg rank 16 → 4 in 9 weeks", quote: "Quote volume up 3× from Maps alone." },
      { name: "SlateSure (Nottingham)", result: "Top-3 share 5% → 48%", quote: "We stopped paying for Google Ads the next month." },
      { name: "RoofRight (Leicester)", result: "Photo freshness 0 → 60/qtr", quote: "Photos turned out to be a free ranking signal." },
    ],
  },
  landscaping: {
    slug: "landscaping",
    label: "Landscaping",
    h1: "Free Google Maps audit for landscapers",
    intro:
      "Landscaping is hyper-local — your buyers want someone within 10 minutes of their postcode. Google Maps is the entire battlefield, and the top 3 take the bulk of leads.",
    intro2:
      "See your live rank across a 5×5 grid plus 10 specific GBP fixes that boost a landscaping business's visibility in the local pack.",
    metaTitle: "Free Google Maps Audit for Landscapers | MapGuard Snapshot",
    metaDescription:
      "Free 5×5 rank-grid + 10 GBP fixes for landscapers. Find out where you're invisible and how to fix it.",
    successStories: [
      { name: "GreenSpan (York)", result: "Avg rank 13 → 3", quote: "We're now the default landscaper in our postcode." },
      { name: "BloomWorks (Oxford)", result: "Top-3 share 22% → 68%", quote: "Lead form fills tripled." },
      { name: "TurfTrust (Reading)", result: "GBP posts 0 → weekly", quote: "Posts are basically free advertising. We had no idea." },
    ],
  },
  painting: {
    slug: "painting",
    label: "Painting",
    h1: "Free Google Maps audit for painters",
    intro:
      "Painting customers shop hard, but they still start in the local 3-pack. Once they pick three businesses to compare, the decision is made — being outside the pack means you're not even considered.",
    intro2:
      "Get a free 5×5 grid showing your rank for painter-related searches plus the 10 GBP fixes most likely to push you into the consideration set.",
    metaTitle: "Free Google Maps Audit for Painters | MapGuard Snapshot",
    metaDescription:
      "Free Google Maps rank audit for painters. See your 5×5 grid + 10 GBP fixes to climb into the local pack.",
    successStories: [
      { name: "BrushCraft (Brighton)", result: "Avg rank 17 → 4", quote: "Booked solid through summer for the first time." },
      { name: "FineFinish Painting (Cambridge)", result: "Top-3 share 11% → 55%", quote: "We finally outrank the franchises." },
      { name: "TrueCoat (Plymouth)", result: "Review response 30% → 100%", quote: "Reply rate was the lever we never knew about." },
    ],
  },
  cleaning: {
    slug: "cleaning",
    label: "Cleaning",
    h1: "Free Google Maps audit for cleaning companies",
    intro:
      "Cleaning is high-frequency and trust-driven. Customers pick from the local 3-pack and rarely revisit the decision for months — so a low Maps rank costs you ongoing contracts, not just one-off jobs.",
    intro2:
      "This free snapshot maps your rank across a 5×5 grid and gives you the 10 GBP fixes most likely to put you in the top 3 for 'cleaning service near me'.",
    metaTitle: "Free Google Maps Audit for Cleaners | MapGuard Snapshot",
    metaDescription:
      "Free Google Maps audit for cleaning companies. 5×5 rank grid + 10 GBP fixes to win recurring contracts.",
    successStories: [
      { name: "SparkleSquad (Bath)", result: "Avg rank 15 → 3", quote: "Three months later we're hiring two more cleaners." },
      { name: "ShineWell (Coventry)", result: "Top-3 share 9% → 61%", quote: "Contract pipeline doubled." },
      { name: "FreshHaus Cleaning (Hull)", result: "Reviews 22 → 110 in 90d", quote: "Review velocity is the single biggest lever." },
    ],
  },
  "pest-control": {
    slug: "pest-control",
    label: "Pest Control",
    h1: "Free Google Maps audit for pest control",
    intro:
      "Pest control is panic-buy territory. When someone sees a rat, they call the first 3 businesses Google shows them. If you're at rank 5+, you don't exist for that customer.",
    intro2:
      "Get a free 5×5 rank-grid plus the 10 GBP fixes most likely to put your pest-control business into the local 3-pack.",
    metaTitle: "Free Google Maps Audit for Pest Control | MapGuard Snapshot",
    metaDescription:
      "Free Google Maps rank audit for pest control businesses. 5×5 grid + 10 GBP fixes to win urgent customer calls.",
    successStories: [
      { name: "ClearGuard Pest (Southampton)", result: "Avg rank 12 → 2", quote: "Phone hasn't stopped ringing." },
      { name: "PestNorth (Sunderland)", result: "Top-3 share 14% → 67%", quote: "The grid view made the problem obvious." },
      { name: "BiteStop (Derby)", result: "GBP completeness 55% → 100%", quote: "Four small fixes moved us 9 spots." },
    ],
  },
  "junk-removal": {
    slug: "junk-removal",
    label: "Junk Removal",
    h1: "Free Google Maps audit for junk removal",
    intro:
      "Junk removal is decided in 60 seconds — customer sees their cluttered garage, taps Maps, picks one of the top 3. Anyone lower than rank 3 might as well not be listed.",
    intro2:
      "Get a free 5×5 rank-grid plus a 10-card GBP audit pointing to the exact fixes that boost junk-removal rankings fastest.",
    metaTitle: "Free Google Maps Audit for Junk Removal | MapGuard Snapshot",
    metaDescription:
      "Free Google Maps rank audit for junk removal. 5×5 grid + 10 GBP fixes to make sure you're in the local 3-pack.",
    successStories: [
      { name: "HaulOut (Portsmouth)", result: "Avg rank 18 → 5", quote: "We saw double the jobs the next week." },
      { name: "GoneInADay (Stoke)", result: "Top-3 share 7% → 50%", quote: "Used to lose every search to the franchises. Not anymore." },
      { name: "ClearTheClutter (Wolverhampton)", result: "Photos 5 → 60", quote: "Fresh photos = free rank lift, who knew." },
    ],
  },
  locksmith: {
    slug: "locksmith",
    label: "Locksmith",
    h1: "Free Google Maps audit for locksmiths",
    intro:
      "Locksmith calls are pure emergency — customer is locked out, taps Maps, calls the first result. The local 3-pack captures essentially 100% of locksmith intent.",
    intro2:
      "Get a free 5×5 rank-grid showing exactly which postcodes you're invisible in, plus 10 GBP fixes to close those gaps before the next emergency.",
    metaTitle: "Free Google Maps Audit for Locksmiths | MapGuard Snapshot",
    metaDescription:
      "Free Google Maps rank audit for locksmiths. 5×5 grid + 10 GBP fixes to win emergency calls.",
    successStories: [
      { name: "KeySafe (Aberdeen)", result: "Avg rank 14 → 2", quote: "We're the default emergency locksmith now." },
      { name: "BoltRight (Swansea)", result: "Top-3 share 10% → 64%", quote: "Massive ROI for fixes that took an hour." },
      { name: "QuickPick Locksmiths (Bolton)", result: "Reviews 30 → 120", quote: "Review velocity beats everything else." },
    ],
  },
  "garage-door": {
    slug: "garage-door",
    label: "Garage Door",
    h1: "Free Google Maps audit for garage door services",
    intro:
      "Garage door repairs are mid-urgency — customers usually search once and pick from the local 3-pack. Being on page two means missing the whole booking window.",
    intro2:
      "Free 5×5 rank-grid for your business plus 10 GBP fixes specifically prioritized for garage-door services.",
    metaTitle: "Free Google Maps Audit for Garage Door | MapGuard Snapshot",
    metaDescription:
      "Free Google Maps rank audit for garage door companies. 5×5 grid + 10 GBP fixes to win local searches.",
    successStories: [
      { name: "DoorWise (Milton Keynes)", result: "Avg rank 16 → 4", quote: "Doubled lead volume from Maps." },
      { name: "RollUp Pros (Northampton)", result: "Top-3 share 8% → 55%", quote: "The grid showed us where we were leaking jobs." },
      { name: "OpenSesame Doors (Luton)", result: "Q&A coverage 0 → 100%", quote: "Seeded Q&As captured a lot of long-tail." },
    ],
  },
  handyman: {
    slug: "handyman",
    label: "Handyman",
    h1: "Free Google Maps audit for handymen",
    intro:
      "Handyman is broad and competitive — but every search still starts in the local 3-pack on Google Maps. Out of the pack, out of the running.",
    intro2:
      "Get a free 5×5 rank-grid plus 10 GBP fixes tailored to multi-service handyman businesses.",
    metaTitle: "Free Google Maps Audit for Handymen | MapGuard Snapshot",
    metaDescription:
      "Free Google Maps rank audit for handyman businesses. 5×5 grid + 10 GBP fixes to climb into the local 3-pack.",
    successStories: [
      { name: "FixItAll (Wakefield)", result: "Avg rank 17 → 5", quote: "We're now the first call for most of our area." },
      { name: "HandyNorth (Doncaster)", result: "Top-3 share 6% → 47%", quote: "Worth it for the secondary-category fix alone." },
      { name: "DoneRight (Preston)", result: "GBP posts 0 → weekly", quote: "Free advertising we ignored for years." },
    ],
  },
};

export const TRADE_SLUGS = Object.keys(TRADE_CONFIGS);
