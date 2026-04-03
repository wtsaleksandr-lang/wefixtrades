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

const SERVICES = [
  {
    id: "tradeline",
    name: "TradeLine™",
    tagline: "AI answering, SMS replies & missed call auto-response",
    description: "Never miss a lead. TradeLine handles AI answering, SMS replies, missed call auto-response, and follow-ups. Starter $97/mo (200 mins), Pro $197/mo (600 mins), Premium $347/mo (1500 mins). Overage $0.15/min.",
    category: "leads",
    default_price: 9700,
    billing_period: "monthly",
    delivery_pattern: "always_on",
    sort_order: 1,
  },
  {
    id: "quotequick",
    name: "QuoteQuick™",
    tagline: "Instant quote calculator for your website",
    description: "An embeddable quote calculator that gives visitors instant estimates. Starter $49/mo (basic calculator + lead capture), Pro $79/mo (advanced logic, styling, booking integration).",
    category: "leads",
    default_price: 4900,
    billing_period: "monthly",
    delivery_pattern: "always_on",
    sort_order: 2,
  },
  {
    id: "mapguard-setup",
    name: "MapGuard™ Setup",
    tagline: "One-time Google Business Profile optimisation sprint",
    description: "We audit and rebuild your Google Business Profile from scratch — fixing every gap that's hurting your local ranking and costing you calls.",
    category: "visibility",
    default_price: 39700,
    billing_period: "one-time",
    delivery_pattern: "one_time",
    sort_order: 3,
  },
  {
    id: "mapguard-ongoing",
    name: "MapGuard™ Ongoing",
    tagline: "Monthly Google Maps maintenance & growth",
    description: "Monthly profile updates, post scheduling, and review strategy. Basic $99/mo (2 posts/month, monitoring), Pro $149/mo (4 posts/month, responses, optimization).",
    category: "visibility",
    default_price: 9900,
    billing_period: "monthly",
    delivery_pattern: "recurring",
    sort_order: 4,
  },
  {
    id: "reputationshield",
    name: "ReputationShield™",
    tagline: "Review generation & reputation automation",
    description: "Automated review request campaigns, response templates, and monitoring. Basic $79/mo, Pro $129/mo, Premium $179/mo.",
    category: "reputation",
    default_price: 7900,
    billing_period: "monthly",
    delivery_pattern: "always_on",
    sort_order: 5,
  },
  {
    id: "webboost-setup",
    name: "WebBoost™ Setup",
    tagline: "One-time speed & SEO upgrade for your website",
    description: "We audit your site, fix the PageSpeed issues, and resolve Core Web Vitals problems in a single sprint.",
    category: "website",
    default_price: 34900,
    billing_period: "one-time",
    delivery_pattern: "one_time",
    sort_order: 6,
  },
  {
    id: "webboost-care",
    name: "WebBoost™ Care",
    tagline: "Ongoing website performance & SEO maintenance",
    description: "Monthly checks to keep your site fast, secure, and ranking. Basic $79/mo (monitoring, updates), Pro $129/mo (SEO fixes, optimization).",
    category: "website",
    default_price: 7900,
    billing_period: "monthly",
    delivery_pattern: "recurring",
    sort_order: 7,
  },
  {
    id: "socialsync",
    name: "SocialSync™",
    tagline: "Social media content & posting for trades",
    description: "Consistent social media presence with trade-specific content, scheduling, and engagement tracking. Starter $99/mo, Growth $149/mo, Pro $199/mo.",
    category: "visibility",
    default_price: 9900,
    billing_period: "monthly",
    delivery_pattern: "recurring",
    sort_order: 8,
  },
  {
    id: "sitelaunch",
    name: "SiteLaunch™",
    tagline: "High-converting website built for trades",
    description: "5–7 page website with mobile optimization, speed optimization, basic SEO, contact forms, and QuoteQuick embed. Includes 14-day free trial of TradeLine Starter + QuoteQuick Pro.",
    category: "website",
    default_price: 119700,
    billing_period: "one-time",
    delivery_pattern: "one_time",
    sort_order: 9,
  },
  {
    id: "fix-optimize",
    name: "Fix & Optimize™",
    tagline: "Website fixes, tweaks, and optimization",
    description: "One-off website fixes — broken pages, slow loading, SEO issues, design tweaks, and technical debt cleanup.",
    category: "website",
    default_price: 24900,
    billing_period: "one-time",
    delivery_pattern: "one_time",
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
    "webboost-setup": [
      { title: "Collect access credentials & website URL", sort_order: 1, default_priority: "high", default_handled_by: "internal", default_waiting_on: "client" },
      { title: "Run PageSpeed & Core Web Vitals audit", sort_order: 2, default_handled_by: "internal" },
      { title: "Implement speed fixes", sort_order: 3, default_handled_by: "internal" },
      { title: "Implement SEO fixes", sort_order: 4, default_handled_by: "internal" },
      { title: "Run after audit & verify improvements", sort_order: 5, default_handled_by: "internal" },
      { title: "Send before/after performance report", sort_order: 6, default_handled_by: "internal", human_review_required: true },
    ],
    "webboost-care": [
      { title: "Run monthly performance scan", sort_order: 1, default_handled_by: "internal" },
      { title: "Fix regressions or new issues", sort_order: 2, default_handled_by: "internal" },
      { title: "Apply security & plugin updates", sort_order: 3, default_handled_by: "internal" },
      { title: "Send monthly health report", sort_order: 4, default_handled_by: "internal" },
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
    "fix-optimize": [
      { title: "Collect access & issue list", sort_order: 1, default_priority: "high", default_handled_by: "internal", default_waiting_on: "client" },
      { title: "Audit site for fixable issues", sort_order: 2, default_handled_by: "internal" },
      { title: "Prioritize & scope fixes", sort_order: 3, default_handled_by: "internal" },
      { title: "Implement fixes", sort_order: 4, default_handled_by: "internal" },
      { title: "QA & send completion report", sort_order: 5, default_handled_by: "internal", human_review_required: true },
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
      { title: "Verify calculator created via wizard", sort_order: 1, default_handled_by: "internal" },
      { title: "Review pricing configuration", sort_order: 2, default_handled_by: "internal" },
      { title: "Confirm embed on client website", sort_order: 3, default_handled_by: "internal", default_waiting_on: "client" },
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
      name: "MapGuard Setup Onboarding",
      steps: [
        { key: "gbp_email", label: "Google Business Profile login email", type: "text", required: true },
        { key: "gbp_access", label: "GBP access granted to our team", type: "checkbox", required: true },
        { key: "business_address", label: "Full business address", type: "text", required: true },
        { key: "service_areas", label: "Cities / areas you serve", type: "text", required: true },
        { key: "primary_services", label: "Your top 3-5 services", type: "text", required: true },
        { key: "target_keywords", label: "Keywords you want to rank for", type: "text", required: false },
        { key: "photos_ready", label: "Business photos available", type: "checkbox", required: false },
        { key: "competitors", label: "Top 2-3 local competitors", type: "text", required: false },
      ],
    },
    "sitelaunch": {
      name: "SiteLaunch Onboarding",
      steps: [
        { key: "business_name", label: "Business name as shown on site", type: "text", required: true },
        { key: "services_list", label: "Services to feature on the website", type: "text", required: true },
        { key: "about_story", label: "About / business story", type: "text", required: true },
        { key: "logo_ready", label: "Logo available", type: "checkbox", required: true },
        { key: "brand_colors", label: "Preferred brand colors", type: "text", required: false },
        { key: "photos_ready", label: "Photos available", type: "checkbox", required: false },
        { key: "domain_name", label: "Domain name (existing or to register)", type: "text", required: true },
        { key: "competitor_sites", label: "Competitor websites you like", type: "text", required: false },
        { key: "contact_info", label: "Phone, email, address for site", type: "text", required: true },
      ],
    },
    "tradeline": {
      name: "TradeLine Onboarding",
      steps: [
        { key: "business_hours", label: "Business hours", type: "text", required: true },
        { key: "services_pricing", label: "Services offered with rough pricing", type: "text", required: true },
        { key: "service_area", label: "Service area", type: "text", required: true },
        { key: "tone_preference", label: "Tone preference (friendly/professional/casual)", type: "text", required: false },
        { key: "phone_number", label: "Phone number to forward to", type: "text", required: true },
        { key: "social_access", label: "Facebook/Instagram page access granted", type: "checkbox", required: false },
      ],
    },
    "reputationshield": {
      name: "ReputationShield Onboarding",
      steps: [
        { key: "google_review_link", label: "Google review link", type: "text", required: true },
        { key: "review_platforms", label: "Review platforms to use", type: "text", required: true },
        { key: "contact_method", label: "Customer contact method (SMS/email/both)", type: "text", required: true },
        { key: "request_timing", label: "When to send review requests", type: "text", required: false },
        { key: "response_tone", label: "Response tone preference", type: "text", required: false },
      ],
    },
    "webboost-setup": {
      name: "WebBoost Setup Onboarding",
      steps: [
        { key: "website_url", label: "Website URL", type: "text", required: true },
        { key: "hosting_access", label: "Hosting/CMS login credentials shared", type: "checkbox", required: true },
        { key: "known_issues", label: "Known issues (if any)", type: "text", required: false },
        { key: "priority_pages", label: "Priority pages to optimize", type: "text", required: false },
      ],
    },
    "socialsync": {
      name: "SocialSync Onboarding",
      steps: [
        { key: "social_accounts", label: "Social accounts (Facebook, Instagram, LinkedIn)", type: "text", required: true },
        { key: "brand_guidelines", label: "Brand guidelines / colors / logo", type: "text", required: true },
        { key: "content_preferences", label: "Content preferences (job photos, tips, promos)", type: "text", required: false },
        { key: "posting_frequency", label: "Preferred posting frequency", type: "text", required: false },
        { key: "approval_workflow", label: "Need approval before posting?", type: "checkbox", required: true },
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
