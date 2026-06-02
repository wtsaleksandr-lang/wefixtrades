import { NICHE_CARDS } from "@/data/tradelineNicheCards";

/**
 * AI Receptionist template catalogue (marketing presentation layer).
 *
 * ONE high-converting card/page template, reused for every trade — only the
 * illustration and copy change per niche. Each entry layers presentation
 * (display label, stylized worker illustration, three plain-English benefits,
 * a "trained" footer line) on top of the canonical receptionist content in
 * `tradelineNicheCards.ts` (the lucide icon + the full 5-bullet feature list,
 * reused on the detail page).
 *
 * Every trade ships with BOTH a male and a female voice; the illustration is
 * just the default face. Covers the full ~40 receptionist niches so no trade
 * is missing its own page.
 */

export interface AiReceptionist {
  /** Receptionist niche id — matches a key in NICHE_CARDS. */
  id: string;
  /** URL slug (hyphenated). */
  slug: string;
  /** Display label, e.g. "Plumbing". */
  label: string;
  /** Stylized worker illustration in /public/ai-personas/{id}.png (transparent PNG). */
  illustration: string;
  /** lucide-react icon name (resolved in the card/page components). */
  icon: string;
  /** Default illustration gender — both voices are always offered. */
  gender: "male" | "female";
  /** Three short, plain-English benefits for the card thumbnail. */
  cardBenefits: [string, string, string];
  /** Short "trained" reassurance line shown in the card footer. */
  trainedLine: string;
}

function r(
  id: string, slug: string, label: string, gender: "male" | "female",
  cardBenefits: [string, string, string], trainedLine: string,
): AiReceptionist {
  return {
    id, slug, label, gender, cardBenefits, trainedLine,
    illustration: `/ai-personas/${id}.webp`,
    icon: NICHE_CARDS[id]?.lucideIcon ?? "Phone",
  };
}

export const AI_RECEPTIONISTS: AiReceptionist[] = [
  r("plumbing", "plumbing", "Plumbing", "male", [
    "Answers burst-pipe calls day or night",
    "Gives callout prices & books the slot",
    "Knows your rates, areas & after-hours fees",
  ], "Pre-trained for plumbing · learns your business"),

  r("electrical", "electrical", "Electrical", "female", [
    "Books fault-finding & inspection visits",
    "Sorts the real emergencies from the rest",
    "Quotes from your pricing & service area",
  ], "Knows electrical work out of the box"),

  r("hvac", "hvac", "HVAC", "male", [
    "Catches every “AC is down” call in a heatwave",
    "Books installs, services & tune-ups",
    "Signs customers up to your maintenance plans",
  ], "Custom-trained on your services"),

  r("roofing", "roofing", "Roofing", "female", [
    "Captures storm-damage leads around the clock",
    "Schedules roof inspections & estimates",
    "Chases the job and asks for the 5-star review",
  ], "Gets sharper with every call"),

  r("landscaping", "landscaping", "Landscaping", "male", [
    "Books recurring mowing & cleanup routes",
    "Quotes design & install jobs on the spot",
    "Keeps regulars booked season after season",
  ], "Knows green-trade work from day one"),

  r("house_cleaning", "house-cleaning", "House Cleaning", "female", [
    "Books one-off, deep & recurring cleans",
    "Captures home size, pets & access notes",
    "Fills your calendar with repeat customers",
  ], "Trained on your services · remembers regulars"),

  r("painting", "painting", "Painting", "male", [
    "Quotes interior, exterior & cabinet jobs",
    "Books estimates around the weather",
    "Turns “just looking” into booked walk-throughs",
  ], "Speaks paint — pre-loaded with the trade"),

  r("handyman", "handyman", "Handyman", "male", [
    "Bundles the little jobs into one visit",
    "Gives honest ballpark prices up front",
    "Books half- and full-day slots that pay",
  ], "Learns your jobs and avoids past mistakes"),

  r("garage_door", "garage-door", "Garage Door", "male", [
    "Handles broken-spring emergencies same day",
    "Captures door & opener details before dispatch",
    "Books after-hours without waking your tech",
  ], "Pre-trained for garage-door work"),

  r("pest_control", "pest-control", "Pest Control", "female", [
    "Jumps on bed-bug, termite & rodent calls",
    "Books one-off & recurring treatment plans",
    "Captures the pest & problem area up front",
  ], "Knows the pest trade inside out"),

  r("appliance_repair", "appliance-repair", "Appliance Repair", "male", [
    "Captures make, model & error code first",
    "Books in- vs out-of-warranty the right way",
    "Confirms arrival windows & texts the ETA",
  ], "Pre-trained on every major appliance brand"),

  r("cabinet_installer", "cabinet-installation", "Cabinet Installation", "female", [
    "Qualifies kitchen, bath & built-in scope",
    "Books measure & design consults to your calendar",
    "Filters tyre-kickers by budget before you quote",
  ], "Knows cabinetry from the first call"),

  r("carpenter", "carpentry", "Carpentry", "male", [
    "Sorts framing, finish & repair to the right crew",
    "Captures sizes, materials & photos up front",
    "Books estimates without ever double-booking",
  ], "Pre-trained for carpentry work"),

  r("chimney_sweep", "chimney-sweep", "Chimney Sweep", "male", [
    "Books pre-season sweeps before the rush",
    "Flags creosote & blockages as urgent safety",
    "Upsells Level-2 inspections for home sales",
  ], "Knows chimney & fireplace work cold"),

  r("concrete", "concrete", "Concrete", "male", [
    "Qualifies driveways, slabs, patios & pours",
    "Captures square footage & access up front",
    "Reschedules pours around the forecast",
  ], "Pre-trained for concrete & flatwork"),

  r("countertop_installer", "countertop-installation", "Countertop Installation", "female", [
    "Qualifies granite, quartz & laminate scope",
    "Books template & install around your cabinets",
    "Routes slab-selection to your showroom",
  ], "Speaks stone & surfaces from day one"),

  r("deck_builder", "deck-building", "Deck Building", "male", [
    "Qualifies build, repair & refinish jobs",
    "Captures material & railing preferences",
    "Flags permit & HOA projects for the office",
  ], "Pre-trained for decks & outdoor builds"),

  r("door_installation", "door-installation", "Door Installation", "female", [
    "Tells entry, patio, interior & storm apart",
    "Captures size, swing & finish on the call",
    "Fast-tracks security-emergency replacements",
  ], "Knows doors & openings out of the box"),

  r("drywall", "drywall", "Drywall", "male", [
    "Sorts patch, full-room & new-build jobs",
    "Fast-tracks water-damage repairs",
    "Books around your hangers' real availability",
  ], "Pre-trained for drywall & finishing"),

  r("fencing_contractor", "fencing", "Fencing", "male", [
    "Qualifies wood, vinyl, chain-link & aluminium",
    "Captures footage, gates & property lines",
    "Flags HOA, permit & survey needs early",
  ], "Knows fencing work from the first call"),

  r("flooring", "flooring", "Flooring", "female", [
    "Qualifies hardwood, LVP, tile & carpet",
    "Captures footage & subfloor condition",
    "Books showroom & in-home consults",
  ], "Pre-trained across every floor type"),

  r("foundation_repair", "foundation-repair", "Foundation Repair", "male", [
    "Triages active cracking as priority work",
    "Captures crack photos & water history",
    "Books inspections to the right estimator",
  ], "Speaks structural work with confidence"),

  r("general_contractor", "general-contractor", "General Contractor", "male", [
    "Qualifies budget, timeline & scope first",
    "Routes kitchen, bath & addition leads",
    "Filters shoppers from serious buyers",
  ], "Pre-trained for whole-home projects"),

  r("gutter_services", "gutter-services", "Gutter Services", "female", [
    "Qualifies cleaning, repair & new installs",
    "Books seasonal routes by neighbourhood",
    "Flags ice-dam & overflow damage as urgent",
  ], "Knows gutters & drainage from day one"),

  r("insulation_contractor", "insulation", "Insulation", "male", [
    "Qualifies attic, wall & crawlspace scope",
    "Flags rebate & tax-credit eligibility",
    "Books energy assessments to your tech",
  ], "Pre-trained on insulation & efficiency"),

  r("junk_removal", "junk-removal", "Junk Removal", "male", [
    "Quotes by volume from photos on the call",
    "Books same- & next-day pickups by route",
    "Flags e-waste & mattresses for disposal",
  ], "Knows the hauling trade inside out"),

  r("locksmith", "locksmith", "Locksmith", "female", [
    "Triages lockouts 24/7 with verified ID",
    "Quotes call-out minimums to filter shoppers",
    "Routes rekey, smart-lock & safe jobs",
  ], "Pre-trained for lock & security work"),

  r("masonry", "masonry", "Masonry", "male", [
    "Qualifies brick, stone, block & chimney",
    "Captures photos of cracks & mortar joints",
    "Books restoration around weather windows",
  ], "Speaks masonry from the first call"),

  r("mold_remediation", "mold-remediation", "Mold Remediation", "female", [
    "Triages active mould as an urgent hazard",
    "Captures water source & growth photos",
    "Gathers adjuster info for insurance claims",
  ], "Pre-trained on remediation & safety"),

  r("moving_services", "moving-services", "Moving Services", "male", [
    "Qualifies local, long-distance & labour-only",
    "Captures bedrooms, stairs & specialty items",
    "Books pack, load & unload days by crew",
  ], "Knows the moving trade from day one"),

  r("pool_service", "pool-service", "Pool Service", "female", [
    "Qualifies opens, closes, service & repairs",
    "Books recurring routes by neighbourhood",
    "Flags green pools for priority response",
  ], "Pre-trained for pool & spa care"),

  r("septic_services", "septic-services", "Septic Services", "male", [
    "Triages backups & overflows same day",
    "Captures tank size & last-pump date",
    "Books routine pumping by efficient route",
  ], "Knows septic systems out of the box"),

  r("siding_contractor", "siding", "Siding", "male", [
    "Qualifies vinyl, fibre-cement, wood & metal",
    "Captures footage, storeys, trim & soffit",
    "Flags storm & insurance jobs for adjusters",
  ], "Pre-trained for siding & exteriors"),

  r("solar_installer", "solar-installation", "Solar Installation", "female", [
    "Qualifies roof age, shading & utility bill",
    "Books design consults with serious buyers",
    "Explains tax credits so buyers arrive ready",
  ], "Speaks solar & savings from day one"),

  r("tile_installer", "tile-installation", "Tile Installation", "male", [
    "Qualifies floor, shower & backsplash scope",
    "Captures footage, substrate & waterproofing",
    "Books template & install around the trades",
  ], "Pre-trained for tile & stone work"),

  r("tree_service", "tree-service", "Tree Service", "male", [
    "Triages storm-down & hazard trees as urgent",
    "Captures size, species & nearby structures",
    "Books removal, trim & stump-grind jobs",
  ], "Knows arborist work from the first call"),

  r("water_damage_restoration", "water-damage-restoration", "Water Damage Restoration", "female", [
    "Triages active flooding 24/7, dispatches fast",
    "Captures source, footage & water category",
    "Coordinates the insurance-claim intake",
  ], "Pre-trained for restoration & mitigation"),

  r("waterproofing", "waterproofing", "Waterproofing", "male", [
    "Qualifies basement, crawlspace & foundation",
    "Captures water-entry points & sump status",
    "Books free inspections by route density",
  ], "Knows waterproofing work out of the box"),

  r("well_water", "well-water", "Well & Water Systems", "male", [
    "Triages no-water & pump failures same day",
    "Captures well type, depth & tank symptoms",
    "Books testing, filtration & softener consults",
  ], "Pre-trained for well & water systems"),

  r("window_installation", "window-installation", "Window Installation", "female", [
    "Qualifies full-frame, insert & storm windows",
    "Captures count, style & efficiency goals",
    "Books in-home measures around your route",
  ], "Speaks windows & glazing from day one"),
];

export function getReceptionist(slug: string): AiReceptionist | undefined {
  return AI_RECEPTIONISTS.find((r) => r.slug === slug);
}

/** Full feature-bullet list from the canonical niche data (detail page). */
export function receptionistFeatures(id: string): string[] {
  return NICHE_CARDS[id]?.bullets ?? [];
}
