/**
 * TRADES — single source of truth for the 40 trade solutions.
 *
 * This lightweight index powers cross-cutting navigation/IA surfaces (nav
 * search, a future `/solutions` catalogue page) WITHOUT importing the heavy
 * React `SolutionPage.tsx` (which pulls in lucide + hero animations). Each
 * entry is a plain data record.
 *
 * ⚠️ MUST STAY IN SYNC with the `SOLUTIONS` array in
 *    `client/src/pages/solutions/SolutionPage.tsx` — every `slug` here MUST
 *    correspond to a route slug rendered there, and the counts must match (40).
 *    The guard `npm run check:trades-sync`
 *    (client/src/site/__tests__/trades.sync.test.ts) enforces this and will
 *    fail CI if the two lists drift. When you add/remove/rename a trade in
 *    SolutionPage, update this file in the same change.
 *
 * Fields:
 *  - slug        route slug, exactly as in SolutionPage (e.g. "for-roofers").
 *  - label       nav/display label (e.g. "For Roofers").
 *  - shortLabel  bare trade name (e.g. "Roofers").
 *  - description short tagline (SolutionPage `subheadline`).
 *  - icon        a valid NavIconKey (closest match from the nav icon set).
 *  - category    catalogue grouping for a future /solutions page.
 *  - roofWidget  true only for trades that get the 3D roof/solar quote shortcut.
 */
import type { NavIconKey } from "@/site/navigation";

export type TradeCategory =
  | "Exterior"
  | "Interior"
  | "Specialty"
  | "Restoration"
  | "Outdoor"
  | "Mechanical";

export type Trade = {
  slug: string;
  label: string;
  shortLabel: string;
  description: string;
  icon: NavIconKey;
  category: TradeCategory;
  /** Trades that surface the 3D roof/solar instant-quote widget shortcut. */
  roofWidget?: boolean;
};

export const TRADES: Trade[] = [
  {
    slug: "for-plumbers",
    label: "For Plumbers",
    shortLabel: "Plumbers",
    description: "Stop missing calls. Automate quotes, reviews, and follow-ups so you can focus on the job site.",
    icon: "wrench",
    category: "Mechanical",
  },
  {
    slug: "for-hvac",
    label: "For HVAC",
    shortLabel: "HVAC",
    description: "AI answers after-hours calls, quotes AC installs instantly, and keeps your Google profile dominating local search.",
    icon: "fan",
    category: "Mechanical",
  },
  {
    slug: "for-electricians",
    label: "For Electricians",
    shortLabel: "Electricians",
    description: "From panel upgrades to EV charger installs, capture every lead and close faster with AI-powered automation.",
    icon: "zap",
    category: "Mechanical",
  },
  {
    slug: "for-roofers",
    label: "For Roofers",
    shortLabel: "Roofers",
    description: "Dominate local search, capture storm-damage leads instantly, and automate follow-ups that close big-ticket jobs.",
    icon: "home",
    category: "Exterior",
    roofWidget: true,
  },
  {
    slug: "for-cleaners",
    label: "For Cleaners",
    shortLabel: "Cleaners",
    description: "Instant quotes, AI chat booking, and reputation management that keeps your schedule full without cold calling.",
    icon: "sparkles",
    category: "Specialty",
  },
  {
    slug: "for-landscapers",
    label: "For Landscapers",
    shortLabel: "Landscapers",
    description: "Instant lawn-care + maintenance quotes, automated scheduling, and Google rankings that pull in seasonal work all year.",
    icon: "trees",
    category: "Outdoor",
  },
  {
    slug: "for-pest-control",
    label: "For Pest Control",
    shortLabel: "Pest Control",
    description: "Customers want it gone TODAY. AI answers, quotes, and books — even when your techs are knee-deep in a callout.",
    icon: "bug",
    category: "Specialty",
  },
  {
    slug: "for-garage-door",
    label: "For Garage Door",
    shortLabel: "Garage Door",
    description: "When their door is stuck open at midnight, the first responder wins. AI picks up, quotes, dispatches.",
    icon: "warehouse",
    category: "Exterior",
  },
  {
    slug: "for-locksmiths",
    label: "For Locksmiths",
    shortLabel: "Locksmiths",
    description: "Locked out, lost keys, broken deadbolt — they search, click the first listing, and call. Be the first listing AND the call gets answered.",
    icon: "keyRound",
    category: "Specialty",
  },
  {
    slug: "for-painters",
    label: "For Painters",
    shortLabel: "Painters",
    description: "Drive more interior + exterior estimate requests, qualify them automatically, and stack 5-star portfolio reviews.",
    icon: "paintbrush",
    category: "Interior",
  },
  {
    slug: "for-remodelers",
    label: "For Remodelers",
    shortLabel: "Remodelers",
    description: "Big-ticket projects need polish: a beautiful site, fast quoting, and authority content that signals trust before the consult.",
    icon: "hammer",
    category: "Interior",
  },
  {
    slug: "for-general-contractors",
    label: "For General Contractors",
    shortLabel: "General Contractors",
    description: "Multi-trade, multi-stage projects — managed in one inbox. AI qualifies leads, books consults, and never lets a follow-up slip.",
    icon: "building2",
    category: "Specialty",
  },
  {
    slug: "for-carpenters",
    label: "For Carpenters",
    shortLabel: "Carpenters",
    description: "Sort framing from finish work, capture measurements before the visit, and quote built-ins faster than the next bid.",
    icon: "hammer",
    category: "Interior",
  },
  {
    slug: "for-cabinet-installers",
    label: "For Cabinet Installers",
    shortLabel: "Cabinet Installers",
    description: "Filter design-only shoppers from real buyers, capture scope before the site visit, and protect install-day calendar.",
    icon: "hammer",
    category: "Interior",
  },
  {
    slug: "for-chimney-sweeps",
    label: "For Chimney Sweeps",
    shortLabel: "Chimney Sweeps",
    description: "Book chimney cleanings and inspections by neighborhood, flag safety calls fast, and stay top-3 on Google Maps.",
    icon: "home",
    category: "Exterior",
  },
  {
    slug: "for-concrete",
    label: "For Concrete Contractors",
    shortLabel: "Concrete Contractors",
    description: "Qualify decorative vs structural pours, capture access constraints, and reschedule pours around the weather automatically.",
    icon: "layers",
    category: "Outdoor",
  },
  {
    slug: "for-countertop-installers",
    label: "For Countertop Installers",
    shortLabel: "Countertop Installers",
    description: "Qualify granite vs quartz vs laminate scope, route slab selections to your showroom, and lock install dates clean.",
    icon: "layout",
    category: "Interior",
  },
  {
    slug: "for-deck-builders",
    label: "For Deck Builders",
    shortLabel: "Deck Builders",
    description: "Qualify composite vs pressure-treated, flag permits and HOAs early, and let spring estimates fill from inspiration links.",
    icon: "hammer",
    category: "Outdoor",
  },
  {
    slug: "for-door-installers",
    label: "For Door Installers",
    shortLabel: "Door Installers",
    description: "Triage security emergencies same-day, send product brochures pre-visit, and route to the right installer's calendar.",
    icon: "home",
    category: "Exterior",
  },
  {
    slug: "for-drywall",
    label: "For Drywall Contractors",
    shortLabel: "Drywall Contractors",
    description: "Photos do the qualifying — patch vs full-room vs new-construction routed to the right crew with the right tools.",
    icon: "layout",
    category: "Interior",
  },
  {
    slug: "for-fencing",
    label: "For Fencing Contractors",
    shortLabel: "Fencing Contractors",
    description: "Qualify wood vs vinyl vs aluminum scope, flag HOAs and surveys, and pack installer routes by density.",
    icon: "home",
    category: "Exterior",
  },
  {
    slug: "for-flooring",
    label: "For Flooring Contractors",
    shortLabel: "Flooring Contractors",
    description: "Showroom + in-home consults to the right product expert, subfloor + moisture flags up front, prep checklists pre-install.",
    icon: "layout",
    category: "Interior",
  },
  {
    slug: "for-foundation-repair",
    label: "For Foundation Repair",
    shortLabel: "Foundation Repair",
    description: "Triage active settlement as priority, capture photos and history in the intake, and expedite pre-sale inspection reports.",
    icon: "building2",
    category: "Restoration",
  },
  {
    slug: "for-gutter-services",
    label: "For Gutter Services",
    shortLabel: "Gutter Services",
    description: "Cleaning + repair + new-install in one intake, neighborhood route clustering, before-storm reminders.",
    icon: "home",
    category: "Exterior",
  },
  {
    slug: "for-insulation",
    label: "For Insulation Contractors",
    shortLabel: "Insulation Contractors",
    description: "Qualify retrofit vs new-construction, flag rebate eligibility up front, and book energy assessments tightly routed.",
    icon: "layers",
    category: "Interior",
  },
  {
    slug: "for-masonry",
    label: "For Masonry Contractors",
    shortLabel: "Masonry Contractors",
    description: "Photo-driven qualification, weather-aware scheduling, and clean repair-vs-rebuild pricing tiers.",
    icon: "layers",
    category: "Exterior",
  },
  {
    slug: "for-mold-remediation",
    label: "For Mold Remediation",
    shortLabel: "Mold Remediation",
    description: "Triage active mold as urgent, coordinate testing + containment + remediation in one intake, capture adjuster info early.",
    icon: "shieldCheck",
    category: "Restoration",
  },
  {
    slug: "for-moving-services",
    label: "For Moving Services",
    shortLabel: "Moving Services",
    description: "Bedroom count + stairs + specialty items in one intake, pack/load/unload calendar coordination, prep checklists pre-move.",
    icon: "warehouse",
    category: "Specialty",
  },
  {
    slug: "for-pool-service",
    label: "For Pool Service",
    shortLabel: "Pool Service",
    description: "Open + close + weekly service in one intake, equipment history captured up front, seasonal reminders before customers forget.",
    icon: "trees",
    category: "Outdoor",
  },
  {
    slug: "for-septic-services",
    label: "For Septic Services",
    shortLabel: "Septic Services",
    description: "Triage backups as urgent, capture tank size and last-pump date up front, route routine pumps by neighborhood.",
    icon: "wrench",
    category: "Mechanical",
  },
  {
    slug: "for-siding",
    label: "For Siding Contractors",
    shortLabel: "Siding Contractors",
    description: "Vinyl + fiber-cement + metal scope qualification, storm-damage insurance coordination, weather-window scheduling.",
    icon: "building2",
    category: "Exterior",
  },
  {
    slug: "for-solar",
    label: "For Solar Installers",
    shortLabel: "Solar Installers",
    description: "Roof age + shading + utility bill in one call, satellite-based design pre-visit, financing + credits explained early.",
    icon: "home",
    category: "Exterior",
    roofWidget: true,
  },
  {
    slug: "for-tile-installers",
    label: "For Tile Installers",
    shortLabel: "Tile Installers",
    description: "Floor + shower + backsplash + outdoor scope sorted up front, plumbing/demo coordination tight, material prep guidance.",
    icon: "layout",
    category: "Interior",
  },
  {
    slug: "for-tree-service",
    label: "For Tree Service",
    shortLabel: "Tree Service",
    description: "Storm-down + hazard prioritized, AI prune planning from photos, permit + protected-species flags up front.",
    icon: "trees",
    category: "Outdoor",
  },
  {
    slug: "for-water-damage-restoration",
    label: "For Water Damage Restoration",
    shortLabel: "Water Damage Restoration",
    description: "24/7 triage, insurance-claim coordination, mitigation → demo → reconstruction in one handoff.",
    icon: "shieldCheck",
    category: "Restoration",
  },
  {
    slug: "for-waterproofing",
    label: "For Waterproofing Contractors",
    shortLabel: "Waterproofing Contractors",
    description: "Water-entry mapping in the intake, sump + storm history captured up front, dry-out guidance pre-visit.",
    icon: "shieldCheck",
    category: "Restoration",
  },
  {
    slug: "for-well-water",
    label: "For Well Water Services",
    shortLabel: "Well Water Services",
    description: "Same-day priority for no-water calls, well-type + depth + symptoms in the intake, contamination alerts to the right tech.",
    icon: "wrench",
    category: "Mechanical",
  },
  {
    slug: "for-window-installers",
    label: "For Window Installers",
    shortLabel: "Window Installers",
    description: "Full-frame + insert + storm scope qualification, rebate + tax-credit eligibility, route measures by installer density.",
    icon: "home",
    category: "Exterior",
  },
  {
    slug: "for-appliance-repair",
    label: "For Appliance Repair",
    shortLabel: "Appliance Repair",
    description: "Make + model + error code in one intake, in-warranty vs out routing, 2-hour arrival windows with ETA texts.",
    icon: "wrench",
    category: "Mechanical",
  },
  {
    slug: "for-junk-removal",
    label: "For Junk Removal",
    shortLabel: "Junk Removal",
    description: "Photos during the call, same-day route optimization, hazardous + e-waste pricing baked in.",
    icon: "warehouse",
    category: "Specialty",
  },
];
