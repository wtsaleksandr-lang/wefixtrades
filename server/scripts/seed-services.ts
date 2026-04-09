/**
 * Seed the service_catalog table with WeFixTrades core services.
 *
 * Usage:
 *   npx tsx server/scripts/seed-services.ts
 *
 * Safe to run multiple times — uses upsert (INSERT ... ON CONFLICT UPDATE).
 */

import { db } from "../db";
import { serviceCatalog, serviceTaskTemplates, onboardingTemplates } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  ALL_PRODUCTS, ALL_BUNDLES, type ProductDef, type Tier,
} from "@shared/pricing";

/** Build seed rows from pricing data — each tier becomes a service_catalog row */
function buildServiceRows() {
  const rows: Array<{
    id: string;
    name: string;
    tagline: string;
    description: string;
    category: string;
    default_price: number;
    billing_period: string;
    delivery_pattern: string;
    sort_order: number;
  }> = [];
  let order = 0;

  for (const product of ALL_PRODUCTS) {
    for (const tier of product.tiers) {
      order++;
      const deliveryPattern =
        tier.billingPeriod === "one-time" ? "one_time" :
        tier.id.includes("tradeline") ? "always_on" :
        tier.id.includes("quotequick") ? "always_on" :
        tier.id.includes("reputationshield") ? "always_on" :
        "recurring";

      rows.push({
        id: tier.id,
        name: `${product.name}${product.tiers.length > 1 ? ` ${tier.name}` : ""}`,
        tagline: product.tagline,
        description: tier.features.join(". "),
        category: product.category,
        default_price: Math.round(tier.price * 100), // cents
        billing_period: tier.billingPeriod,
        delivery_pattern: deliveryPattern,
        sort_order: order,
      });
    }
  }

  return rows;
}

const SERVICES = buildServiceRows();

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
        delivery_pattern: (svc as any).delivery_pattern || "one_time",
        sort_order: svc.sort_order,
        is_active: true,
        updated_at: new Date(),
      },
    });
    console.log(`  ✓ ${svc.name}`);
  }

  console.log(`\n${SERVICES.length} services seeded.`);

  // ─── Task Templates ───
  console.log("\nSeeding task templates...");

  const TASK_TEMPLATES: Record<string, Array<{
    title: string; description?: string; sort_order: number;
    default_priority?: string; default_handled_by?: string;
    default_waiting_on?: string; human_review_required?: boolean;
    is_recurring?: boolean; // false = setup-only, true (default) = included in monthly gen
  }>> = {
    "mapguard-setup": [
      { title: "Collect onboarding info from client", sort_order: 1, default_priority: "high", default_handled_by: "internal", default_waiting_on: "client" },
      { title: "Audit current GBP profile", sort_order: 2, default_handled_by: "internal" },
      { title: "Rebuild GBP profile (description, categories, areas)", sort_order: 3, default_handled_by: "internal" },
      { title: "Upload photos & schedule initial posts", sort_order: 4, default_handled_by: "internal" },
      { title: "QA review & send delivery report", sort_order: 5, default_priority: "high", default_handled_by: "internal", human_review_required: true },
    ],
    "mapguard-ongoing": [
      { title: "Monthly GBP check (rankings, reviews, accuracy)", sort_order: 1, default_handled_by: "internal" },
      { title: "Create & schedule 4 posts", sort_order: 2, default_handled_by: "internal" },
      { title: "Update profile if seasonal changes needed", sort_order: 3, default_handled_by: "internal" },
      { title: "Send monthly performance report", sort_order: 4, default_handled_by: "internal" },
    ],
    "reputationshield": [
      { title: "Collect onboarding info", sort_order: 1, default_priority: "high", default_handled_by: "internal", default_waiting_on: "client" },
      { title: "Set up review request automation", sort_order: 2, default_handled_by: "internal" },
      { title: "Configure monitoring alerts", sort_order: 3, default_handled_by: "internal" },
      { title: "Create response templates", sort_order: 4, default_handled_by: "internal" },
      { title: "Test review request flow", sort_order: 5, default_handled_by: "internal" },
      { title: "Go live & send first review batch", sort_order: 6, default_handled_by: "internal", human_review_required: true },
    ],
    "webfix": [
      { title: "Collect access credentials & website URL", sort_order: 1, default_priority: "high", default_handled_by: "internal", default_waiting_on: "client" },
      { title: "Run speed & SEO audit", sort_order: 2, default_handled_by: "internal" },
      { title: "Implement Core Web Vitals fixes", sort_order: 3, default_handled_by: "internal" },
      { title: "Implement technical SEO fixes", sort_order: 4, default_handled_by: "internal" },
      { title: "GBP audit + quick fixes", sort_order: 5, default_handled_by: "internal" },
      { title: "Send completion report", sort_order: 6, default_handled_by: "internal", human_review_required: true },
    ],
    "socialsync": [
      { title: "Collect onboarding info & brand assets", sort_order: 1, default_priority: "high", default_handled_by: "internal", default_waiting_on: "client", is_recurring: false },
      { title: "Create monthly content calendar", sort_order: 2, default_handled_by: "internal" },
      { title: "Design & write post content", sort_order: 3, default_handled_by: "supplier" },
      { title: "Get client approval", sort_order: 4, default_waiting_on: "client" },
      { title: "Schedule posts", sort_order: 5, default_handled_by: "automation" },
      { title: "Send monthly engagement report", sort_order: 6, default_handled_by: "internal" },
    ],
    "sitelaunch": [
      { title: "Collect onboarding info & content brief", sort_order: 1, default_priority: "high", default_handled_by: "internal", default_waiting_on: "client" },
      { title: "Domain & hosting setup", sort_order: 2, default_handled_by: "internal" },
      { title: "Design homepage mockup", sort_order: 3, default_handled_by: "supplier" },
      { title: "Client approves design", sort_order: 4, default_waiting_on: "client" },
      { title: "Build all 5 pages", sort_order: 5, default_handled_by: "supplier" },
      { title: "Add contact forms & CTAs", sort_order: 6, default_handled_by: "internal" },
      { title: "On-page SEO setup", sort_order: 7, default_handled_by: "internal" },
      { title: "Client review & revision round", sort_order: 8, default_waiting_on: "client" },
      { title: "Launch & DNS cutover", sort_order: 9, default_handled_by: "internal", human_review_required: true },
      { title: "Post-launch QA & handoff", sort_order: 10, default_handled_by: "internal", human_review_required: true },
    ],
    "tradeline": [
      { title: "Collect onboarding info", sort_order: 1, default_priority: "high", default_handled_by: "internal", default_waiting_on: "client" },
      { title: "Configure AI assistant profile", sort_order: 2, default_handled_by: "internal" },
      { title: "Set up phone forwarding / Twilio number", sort_order: 3, default_handled_by: "internal" },
      { title: "Deploy chat widget on client website", sort_order: 4, default_handled_by: "internal" },
      { title: "Connect Facebook/Instagram DMs", sort_order: 5, default_handled_by: "internal" },
      { title: "Test all channels", sort_order: 6, default_handled_by: "internal" },
      { title: "Go live & client confirmation", sort_order: 7, default_handled_by: "internal", human_review_required: true },
    ],
    "quotequick": [
      { title: "Collect onboarding info from client", sort_order: 1, default_priority: "high", default_handled_by: "internal", default_waiting_on: "client" },
      { title: "Create calculator via wizard (or on behalf)", sort_order: 2, default_handled_by: "internal" },
      { title: "Review and validate pricing configuration", sort_order: 3, default_handled_by: "internal" },
      { title: "Configure lead form and follow-up settings", sort_order: 4, default_handled_by: "internal" },
      { title: "Embed widget on client website", sort_order: 5, default_handled_by: "internal", default_waiting_on: "client" },
      { title: "Test full flow: quote → lead → notification", sort_order: 6, default_handled_by: "internal" },
      { title: "Go live & send confirmation to client", sort_order: 7, default_handled_by: "internal", human_review_required: true },
    ],
  };

  for (const [serviceId, tasks] of Object.entries(TASK_TEMPLATES)) {
    // Delete existing templates for this service, then re-insert
    await db.delete(serviceTaskTemplates).where(eq(serviceTaskTemplates.service_id, serviceId));
    for (const t of tasks) {
      await db.insert(serviceTaskTemplates).values({
        service_id: serviceId,
        title: t.title,
        description: t.description,
        sort_order: t.sort_order,
        default_priority: t.default_priority || "normal",
        default_handled_by: t.default_handled_by || null,
        default_waiting_on: t.default_waiting_on || null,
        human_review_required: t.human_review_required || false,
        is_recurring: t.is_recurring !== false, // default true unless explicitly false
      });
    }
    console.log(`  ✓ ${serviceId} (${tasks.length} tasks)`);
  }

  // ─── Onboarding Templates ───
  console.log("\nSeeding onboarding templates...");

  const ONBOARDING: Record<string, { name: string; steps: Array<{ key: string; label: string; type: string; required: boolean }> }> = {
    "mapguard-setup": {
      name: "MapSetup Onboarding",
      steps: [
        { key: "business_name", label: "Business name", type: "text", required: true },
        { key: "business_address", label: "Full business address", type: "text", required: true },
        { key: "service_areas", label: "Areas you serve", type: "text", required: true },
        { key: "services", label: "Your main services", type: "text", required: true },
        { key: "google_account_email", label: "Google account email (for GBP access)", type: "text", required: true },
        { key: "keywords", label: "Keywords you want to rank for", type: "text", required: false },
        { key: "competitors", label: "Top 2-3 local competitors", type: "text", required: false },
        { key: "photos", label: "Business photos available", type: "checkbox", required: false },
      ],
    },
    "mapguard-ongoing": {
      name: "MapGuard Ongoing Onboarding",
      steps: [
        { key: "business_name", label: "Business name", type: "text", required: true },
        { key: "business_address", label: "Full business address", type: "text", required: true },
        { key: "service_areas", label: "Areas you serve", type: "text", required: true },
        { key: "services", label: "Your main services", type: "text", required: true },
        { key: "google_account_email", label: "Google account email (for GBP access)", type: "text", required: true },
        { key: "keywords", label: "Keywords you want to rank for", type: "text", required: false },
        { key: "competitors", label: "Top 2-3 local competitors", type: "text", required: false },
        { key: "photos", label: "Business photos available", type: "checkbox", required: false },
      ],
    },
    "tradeline": {
      name: "TradeLine Onboarding",
      steps: [
        { key: "phone_number", label: "Business phone number", type: "text", required: true },
        { key: "business_hours", label: "Business hours", type: "text", required: true },
        { key: "services", label: "Services you offer", type: "text", required: true },
        { key: "service_area", label: "Service area", type: "text", required: true },
        { key: "tone", label: "Communication tone", type: "select", required: true },
        { key: "pricing_examples", label: "Rough pricing examples", type: "text", required: false },
        { key: "faqs", label: "Common questions from customers", type: "text", required: false },
        { key: "after_hours_rules", label: "After-hours handling rules", type: "text", required: false },
      ],
    },
    "quotequick": {
      name: "QuoteQuick Onboarding",
      steps: [
        { key: "trade_type", label: "What trade/service do you offer?", type: "text", required: true },
        { key: "pricing_model", label: "How do you charge? (hourly, per sqft, flat rate, packages, etc.)", type: "text", required: true },
        { key: "base_pricing", label: "Your typical rates or starting prices", type: "text", required: true },
        { key: "service_area", label: "Service area / cities covered", type: "text", required: true },
        { key: "website_url", label: "Website URL (for embed)", type: "text", required: true },
        { key: "addons", label: "Common upsells or add-ons you offer", type: "text", required: false },
        { key: "booking_preference", label: "Do you want customers to book online after getting a quote?", type: "select", required: false },
        { key: "notification_email", label: "Where should lead notifications go?", type: "text", required: true },
      ],
    },
    "webfix": {
      name: "WebFix Onboarding",
      steps: [
        { key: "website_url", label: "Website URL", type: "text", required: true },
        { key: "access_available", label: "Can you provide hosting/CMS access?", type: "select", required: true },
        { key: "main_issue", label: "Main issue", type: "select", required: true },
        { key: "keywords", label: "Target keywords", type: "text", required: false },
      ],
    },
    "reputationshield": {
      name: "ReputationShield Onboarding",
      steps: [
        { key: "business_name", label: "Business name", type: "text", required: true },
        { key: "google_profile_link", label: "Google Business Profile link", type: "text", required: true },
        { key: "review_strategy", label: "Review request approach", type: "select", required: true },
        { key: "tone", label: "Response tone preference", type: "text", required: false },
        { key: "platforms", label: "Other review platforms", type: "text", required: false },
      ],
    },
    "socialsync": {
      name: "SocialSync Onboarding",
      steps: [
        { key: "platforms", label: "Social media platforms", type: "text", required: true },
        { key: "posting_frequency", label: "Preferred posting frequency", type: "text", required: true },
        { key: "business_type", label: "Type of business", type: "text", required: true },
        { key: "content_style", label: "Content style", type: "text", required: true },
        { key: "photos", label: "Photos or brand assets available", type: "checkbox", required: false },
        { key: "branding_notes", label: "Branding notes or guidelines", type: "text", required: false },
      ],
    },
    "sitelaunch": {
      name: "SiteLaunch Onboarding",
      steps: [
        { key: "business_name", label: "Business name", type: "text", required: true },
        { key: "services", label: "Services to feature", type: "text", required: true },
        { key: "service_area", label: "Service area", type: "text", required: true },
        { key: "contact_info", label: "Phone, email, address for the site", type: "text", required: true },
        { key: "style_preference", label: "Style preference", type: "text", required: true },
        { key: "logo", label: "Logo available", type: "checkbox", required: false },
        { key: "competitors", label: "Competitor websites you like", type: "text", required: false },
        { key: "extra_pages", label: "Extra pages needed", type: "text", required: false },
      ],
    },
  };

  for (const [serviceId, template] of Object.entries(ONBOARDING)) {
    // Delete existing, re-insert
    await db.delete(onboardingTemplates).where(eq(onboardingTemplates.service_id, serviceId));
    await db.insert(onboardingTemplates).values({
      service_id: serviceId,
      name: template.name,
      steps: template.steps,
      is_active: true,
    });
    console.log(`  ✓ ${template.name}`);
  }

  console.log(`\nDone — services, task templates, and onboarding templates seeded.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to seed services:", err.message);
  process.exit(1);
});
