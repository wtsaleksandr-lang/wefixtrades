/**
 * Seed the service_catalog table with WeFixTrades core services.
 *
 * Usage:
 *   npx tsx server/scripts/seed-services.ts
 *
 * Safe to run multiple times — uses upsert (INSERT ... ON CONFLICT UPDATE).
 */

import { db } from "../db";
import { serviceCatalog } from "@shared/schema";

const SERVICES = [
  {
    id: "tradeline",
    name: "24/7 TradeLine™",
    tagline: "Chat + Voice + DMs — the full lead engine",
    description: "Every inbound channel covered: website chat, phone calls, and Facebook/Instagram DMs. One unified dashboard. Zero missed leads.",
    category: "leads",
    default_price: 29900, // $299/mo
    billing_period: "monthly",
    sort_order: 1,
  },
  {
    id: "quotequick",
    name: "QuoteQuick Pro™",
    tagline: "Instant quote calculator for your website",
    description: "An embeddable quote calculator that gives visitors instant estimates — turning browsers into warm leads before they pick up the phone.",
    category: "leads",
    default_price: 7900, // $79/mo
    billing_period: "monthly",
    sort_order: 2,
  },
  {
    id: "mapguard-setup",
    name: "MapGuard™ Setup",
    tagline: "One-time Google Business Profile optimisation sprint",
    description: "We audit and rebuild your Google Business Profile from scratch — fixing every gap that's hurting your local ranking and costing you calls.",
    category: "visibility",
    default_price: 29900, // $299 one-time
    billing_period: "one-time",
    sort_order: 3,
  },
  {
    id: "mapguard-ongoing",
    name: "MapGuard™ Ongoing",
    tagline: "Monthly Google Maps maintenance & growth",
    description: "Monthly profile updates, post scheduling, and review strategy to keep your Maps ranking climbing and your profile ahead of competitors.",
    category: "visibility",
    default_price: 14900, // $149/mo
    billing_period: "monthly",
    sort_order: 4,
  },
  {
    id: "reputationshield",
    name: "ReputationShield™",
    tagline: "Review generation & reputation automation",
    description: "Automated review request campaigns, response templates, and monitoring to build trust signals that convert browsers into callers.",
    category: "reputation",
    default_price: 9900, // $99/mo
    billing_period: "monthly",
    sort_order: 5,
  },
  {
    id: "webboost-setup",
    name: "WebBoost™ Setup",
    tagline: "One-time speed & SEO upgrade for your website",
    description: "We audit your site, fix the PageSpeed issues, and resolve Core Web Vitals problems in a single sprint.",
    category: "website",
    default_price: 44900, // $449 one-time
    billing_period: "one-time",
    sort_order: 6,
  },
  {
    id: "webboost-care",
    name: "WebBoost™ Care",
    tagline: "Ongoing website performance & SEO maintenance",
    description: "Monthly checks to keep your site fast, secure, and ranking. We catch regressions before Google does.",
    category: "website",
    default_price: 12900, // $129/mo
    billing_period: "monthly",
    sort_order: 7,
  },
  {
    id: "socialsync",
    name: "SocialSync™",
    tagline: "Social media content & posting for trades",
    description: "Consistent social media presence with trade-specific content, scheduling, and engagement tracking.",
    category: "visibility",
    default_price: 14900, // $149/mo
    billing_period: "monthly",
    sort_order: 8,
  },
  {
    id: "sitelaunch",
    name: "SiteLaunch™",
    tagline: "High-converting website built for trades",
    description: "A fast, mobile-first, SEO-ready website designed to convert visitors into leads. Built and launched within two weeks.",
    category: "website",
    default_price: 99700, // $997 one-time
    billing_period: "one-time",
    sort_order: 9,
  },
  {
    id: "fix-optimize",
    name: "Fix & Optimize™",
    tagline: "Website fixes, tweaks, and optimization",
    description: "One-off or recurring website fixes — broken pages, slow loading, SEO issues, design tweaks, and technical debt cleanup.",
    category: "website",
    default_price: 19900, // $199 starting
    billing_period: "one-time",
    sort_order: 10,
  },
];

async function main() {
  console.log("Seeding service catalog...");

  for (const svc of SERVICES) {
    await db.insert(serviceCatalog).values({
      ...svc,
      is_active: true,
    }).onConflictDoUpdate({
      target: serviceCatalog.id,
      set: {
        name: svc.name,
        tagline: svc.tagline,
        description: svc.description,
        category: svc.category,
        default_price: svc.default_price,
        billing_period: svc.billing_period,
        sort_order: svc.sort_order,
        is_active: true,
        updated_at: new Date(),
      },
    });
    console.log(`  ✓ ${svc.name}`);
  }

  console.log(`\nDone — ${SERVICES.length} services seeded.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to seed services:", err.message);
  process.exit(1);
});
