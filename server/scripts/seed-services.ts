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

/* ─── Operational service variants (not in public pricing, selectable by admin) ─── */
const TRADELINE_VARIANTS = [
  {
    id: "tradeline-call-backup",
    name: "TradeLine Call Backup",
    tagline: "AI phone fallback & missed-call handling",
    description: "Phone call backup with AI answering when you miss. SMS notifications for every call. No website widget required.",
    category: "leads",
    default_price: 9700, // $97 — same as starter tier by default
    billing_period: "monthly",
    delivery_pattern: "always_on",
    sort_order: 200,
  },
  {
    id: "tradeline-chat",
    name: "TradeLine Chat",
    tagline: "Website chat & voice widget for leads",
    description: "AI chat and voice widget for your website. Hosted fallback available. No phone call handling required.",
    category: "leads",
    default_price: 9700,
    billing_period: "monthly",
    delivery_pattern: "always_on",
    sort_order: 201,
  },
  {
    id: "tradeline-complete",
    name: "TradeLine Complete",
    tagline: "Full AI employee — calls, chat, voice & hosted fallback",
    description: "Call backup + website chat + hosted fallback. Full TradeLine core experience across all channels.",
    category: "leads",
    default_price: 19700, // $197 — pro tier by default
    billing_period: "monthly",
    delivery_pattern: "always_on",
    sort_order: 202,
  },
  {
    id: "sitelaunch-template",
    name: "SiteLaunch (Template)",
    tagline: "Fast-launch site from a proven trade template",
    description: "Website built from a pre-built trade template. Content inserted from onboarding, brand color matched. 3-5 day turnaround.",
    category: "website",
    default_price: 49700, // $497 — template path, cheaper than custom
    billing_period: "one-time",
    delivery_pattern: "one_time",
    sort_order: 210,
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

  // Seed TradeLine variants
  for (const svc of TRADELINE_VARIANTS) {
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
        delivery_pattern: svc.delivery_pattern,
        sort_order: svc.sort_order,
        is_active: true,
        updated_at: new Date(),
      },
    });
    console.log(`  ✓ ${svc.name} (variant)`);
  }

  console.log(`\n${SERVICES.length + TRADELINE_VARIANTS.length} services seeded.`);

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
      { title: "Collect onboarding info", sort_order: 1, default_priority: "high", default_handled_by: "internal", default_waiting_on: "client", is_recurring: false },
      { title: "Configure AI assistant profile", sort_order: 2, default_handled_by: "internal", is_recurring: false },
      { title: "Set up phone forwarding / Twilio number", sort_order: 3, default_handled_by: "internal", is_recurring: false },
      { title: "Deploy chat widget on client website", sort_order: 4, default_handled_by: "internal", is_recurring: false },
      { title: "Connect Facebook/Instagram DMs", sort_order: 5, default_handled_by: "internal", is_recurring: false },
      { title: "Test all channels", sort_order: 6, default_handled_by: "internal", is_recurring: false },
      { title: "Go live & client confirmation", sort_order: 7, default_handled_by: "internal", human_review_required: true, is_recurring: false },
    ],
    "tradeline-call-backup": [
      { title: "Collect onboarding details", description: "Wait for client to submit the onboarding form. Includes business name, phone number, forwarding preference, services offered, and tone. Done = form status is 'submitted'.", sort_order: 1, default_priority: "high", default_handled_by: "internal", default_waiting_on: "client", is_recurring: false },
      { title: "Configure TradeLine assistant", description: "Build the AI assistant from onboarding data. Run POST /build-assistant or click Process. Done = assistant.status is 'built'.", sort_order: 2, default_handled_by: "automation", is_recurring: false },
      { title: "Configure phone routing / fallback settings", description: "Set primaryBusinessNumber, forwardingMode (no_answer/immediate/after_hours_only), and ringTimeoutSeconds in config. Verify with a test call if possible. Done = phoneRouting fields populated.", sort_order: 3, default_handled_by: "internal", is_recurring: false },
      { title: "Configure notifications", description: "Set notifications.sms and notifications.email arrays with recipient numbers/addresses. Verify at least one notification channel is configured. Done = notifications populated.", sort_order: 4, default_handled_by: "automation", is_recurring: false },
      { title: "Test missed-call handling", description: "Call the client's business number and let it ring past timeout. Verify AI answers, captures caller info, and sends notification. Done = test call logged in call history.", sort_order: 5, default_handled_by: "internal", is_recurring: false },
      { title: "QA review + go live", description: "Run GET /readiness — all issues must be resolved. Mark setupStage as ready_for_testing, verify with client, then POST /go-live. Done = setupStage is 'live'.", sort_order: 6, default_handled_by: "internal", human_review_required: true, is_recurring: false },
    ],
    "tradeline-chat": [
      { title: "Collect onboarding details", description: "Wait for client to submit the onboarding form. Includes business name, website URL, install preference, services, and tone. Done = form status is 'submitted'.", sort_order: 1, default_priority: "high", default_handled_by: "internal", default_waiting_on: "client", is_recurring: false },
      { title: "Configure TradeLine assistant", description: "Build the AI assistant from onboarding data. Run POST /build-assistant or click Process. Done = assistant.status is 'built'.", sort_order: 2, default_handled_by: "automation", is_recurring: false },
      { title: "Prepare widget or hosted fallback", description: "Decide install path: if client has website access → direct_embed, otherwise → hosted_fallback. Call POST /install-path. If hosted, create the hosted page. Done = embedMode set.", sort_order: 3, default_handled_by: "internal", is_recurring: false },
      { title: "Install widget / provision hosted link", description: "For direct_embed: get CMS/hosting access, add widget script to site footer, verify it loads. For hosted_fallback: confirm hostedUrl is accessible and domainStatus is 'connected'. Done = widget visible or hosted page verified.", sort_order: 4, default_handled_by: "internal", is_recurring: false },
      { title: "Configure lead notifications", description: "Set notifications.sms and notifications.email arrays with recipient numbers/addresses. Done = notifications populated.", sort_order: 5, default_handled_by: "automation", is_recurring: false },
      { title: "QA review + go live", description: "Run GET /readiness — all issues must be resolved. Mark setupStage as ready_for_testing, verify with client, then POST /go-live. Done = setupStage is 'live'.", sort_order: 6, default_handled_by: "internal", human_review_required: true, is_recurring: false },
    ],
    "tradeline-complete": [
      { title: "Collect onboarding details", description: "Wait for client to submit the onboarding form. Includes business name, phone, website, install preference, services, and tone. Done = form status is 'submitted'.", sort_order: 1, default_priority: "high", default_handled_by: "internal", default_waiting_on: "client", is_recurring: false },
      { title: "Configure TradeLine assistant", description: "Build the AI assistant from onboarding data. Run POST /build-assistant or click Process. Done = assistant.status is 'built'.", sort_order: 2, default_handled_by: "automation", is_recurring: false },
      { title: "Configure phone routing", description: "Set primaryBusinessNumber, forwardingMode (no_answer/immediate/after_hours_only), and ringTimeoutSeconds in config. Done = phoneRouting fields populated.", sort_order: 3, default_handled_by: "internal", is_recurring: false },
      { title: "Prepare website widget or hosted fallback", description: "Decide install path: if client has website access → direct_embed, otherwise → hosted_fallback. Call POST /install-path. Done = embedMode set, hosted page live if applicable.", sort_order: 4, default_handled_by: "internal", is_recurring: false },
      { title: "Configure notifications + callback flow", description: "Set notifications.sms and notifications.email. If escalation_number provided in onboarding, note it for future callback routing. Done = notifications populated.", sort_order: 5, default_handled_by: "automation", is_recurring: false },
      { title: "End-to-end testing", description: "Test the full flow: place a call → verify AI answers → verify notification sent. Send a chat message → verify response. Check that leads appear in dashboard. Done = all channels tested.", sort_order: 6, default_handled_by: "internal", is_recurring: false },
      { title: "QA review + go live", description: "Run GET /readiness — all issues must be resolved. Mark setupStage as ready_for_testing, verify with client, then POST /go-live. Done = setupStage is 'live'.", sort_order: 7, default_handled_by: "internal", human_review_required: true, is_recurring: false },
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
    "rankflow-starter": [
      { title: "Collect onboarding info & site access", sort_order: 1, default_priority: "high", default_handled_by: "internal", default_waiting_on: "client", is_recurring: false },
      { title: "Set up Google Search Console", sort_order: 2, default_handled_by: "internal", is_recurring: false },
      { title: "Keyword research & targeting", sort_order: 3, default_handled_by: "internal" },
      { title: "On-page SEO optimization", sort_order: 4, default_handled_by: "internal" },
      { title: "Monthly content recommendations", sort_order: 5, default_handled_by: "internal" },
      { title: "Google Search Console monitoring & fixes", sort_order: 6, default_handled_by: "internal" },
      { title: "Send monthly ranking report", sort_order: 7, default_handled_by: "internal" },
    ],
    "rankflow-growth": [
      { title: "Collect onboarding info & site access", sort_order: 1, default_priority: "high", default_handled_by: "internal", default_waiting_on: "client", is_recurring: false },
      { title: "Set up Google Search Console", sort_order: 2, default_handled_by: "internal", is_recurring: false },
      { title: "Keyword research & gap analysis", sort_order: 3, default_handled_by: "internal" },
      { title: "On-page SEO optimization", sort_order: 4, default_handled_by: "internal" },
      { title: "Content creation (2 pages)", sort_order: 5, default_handled_by: "internal" },
      { title: "Link building outreach", sort_order: 6, default_handled_by: "internal" },
      { title: "Competitor analysis update", sort_order: 7, default_handled_by: "internal" },
      { title: "Local SEO optimization", sort_order: 8, default_handled_by: "internal" },
      { title: "Send bi-weekly ranking report", sort_order: 9, default_handled_by: "internal" },
    ],
    "rankflow-pro": [
      { title: "Collect onboarding info & site access", sort_order: 1, default_priority: "high", default_handled_by: "internal", default_waiting_on: "client", is_recurring: false },
      { title: "Set up Google Search Console", sort_order: 2, default_handled_by: "internal", is_recurring: false },
      { title: "Keyword research & gap analysis", sort_order: 3, default_handled_by: "internal" },
      { title: "On-page SEO optimization", sort_order: 4, default_handled_by: "internal" },
      { title: "Content creation (4 pages)", sort_order: 5, default_handled_by: "internal" },
      { title: "Link building outreach", sort_order: 6, default_handled_by: "internal" },
      { title: "Technical SEO audit", sort_order: 7, default_handled_by: "internal", human_review_required: true },
      { title: "Schema markup review & implementation", sort_order: 8, default_handled_by: "internal" },
      { title: "Competitor analysis update", sort_order: 9, default_handled_by: "internal" },
      { title: "Local SEO optimization", sort_order: 10, default_handled_by: "internal" },
      { title: "Send weekly ranking report", sort_order: 11, default_handled_by: "internal" },
    ],
    "adflow-starter": [
      { title: "Collect onboarding info & ad goals", sort_order: 1, default_priority: "high", default_handled_by: "internal", default_waiting_on: "client", is_recurring: false },
      { title: "Brief white-label agency on campaign goals", sort_order: 2, default_priority: "high", default_handled_by: "internal", is_recurring: false },
      { title: "Agency sets up ad account + conversion tracking", sort_order: 3, default_handled_by: "supplier", is_recurring: false },
      { title: "Agency designs ad creatives & copy", sort_order: 4, default_handled_by: "supplier" },
      { title: "Client approves creatives", sort_order: 5, default_waiting_on: "client" },
      { title: "Launch campaigns (1 platform)", sort_order: 6, default_handled_by: "supplier" },
      { title: "Weekly bid / audience optimization", sort_order: 7, default_handled_by: "supplier" },
      { title: "Monthly performance report (internal QA)", sort_order: 8, default_handled_by: "internal", human_review_required: true },
    ],
    "adflow-growth": [
      { title: "Collect onboarding info & ad goals", sort_order: 1, default_priority: "high", default_handled_by: "internal", default_waiting_on: "client", is_recurring: false },
      { title: "Brief white-label agency on campaign goals", sort_order: 2, default_priority: "high", default_handled_by: "internal", is_recurring: false },
      { title: "Agency sets up ad accounts + conversion tracking", sort_order: 3, default_handled_by: "supplier", is_recurring: false },
      { title: "Agency designs ad creatives & copy (A/B pairs)", sort_order: 4, default_handled_by: "supplier" },
      { title: "Client approves creatives", sort_order: 5, default_waiting_on: "client" },
      { title: "Launch campaigns (Google + Meta)", sort_order: 6, default_handled_by: "supplier" },
      { title: "Weekly optimization + creative refresh", sort_order: 7, default_handled_by: "supplier" },
      { title: "A/B test analysis & winner rollout", sort_order: 8, default_handled_by: "supplier" },
      { title: "Monthly performance report (internal QA + forward to client)", sort_order: 9, default_handled_by: "internal", human_review_required: true },
    ],
    "adflow-pro": [
      { title: "Collect onboarding info & ad goals", sort_order: 1, default_priority: "high", default_handled_by: "internal", default_waiting_on: "client", is_recurring: false },
      { title: "Brief white-label agency on multi-platform strategy", sort_order: 2, default_priority: "high", default_handled_by: "internal", is_recurring: false },
      { title: "Agency sets up all ad accounts + advanced tracking", sort_order: 3, default_handled_by: "supplier", is_recurring: false },
      { title: "Agency designs ad creatives & video assets", sort_order: 4, default_handled_by: "supplier" },
      { title: "Client approves creatives", sort_order: 5, default_waiting_on: "client" },
      { title: "Launch multi-platform campaigns (Google + Meta + YouTube)", sort_order: 6, default_handled_by: "supplier" },
      { title: "Daily optimization + bid management", sort_order: 7, default_handled_by: "supplier" },
      { title: "Weekly A/B test cycles + creative rotation", sort_order: 8, default_handled_by: "supplier" },
      { title: "Landing page conversion optimization", sort_order: 9, default_handled_by: "supplier" },
      { title: "Bi-weekly performance review call with client", sort_order: 10, default_handled_by: "internal", human_review_required: true },
      { title: "Monthly performance report (internal QA + forward to client)", sort_order: 11, default_handled_by: "internal", human_review_required: true },
    ],
    "sitelaunch-template": [
      { title: "Collect onboarding info & content brief", sort_order: 1, default_priority: "high", default_handled_by: "internal", default_waiting_on: "client", is_recurring: false },
      { title: "Pick matching trade template from library", sort_order: 2, default_handled_by: "internal", is_recurring: false },
      { title: "Domain & hosting setup", sort_order: 3, default_handled_by: "internal", is_recurring: false },
      { title: "Populate template with onboarding content", sort_order: 4, default_handled_by: "automation", is_recurring: false },
      { title: "Apply brand colors + logo", sort_order: 5, default_handled_by: "automation", is_recurring: false },
      { title: "Add contact forms, CTAs & lead capture", sort_order: 6, default_handled_by: "automation", is_recurring: false },
      { title: "On-page SEO (title, meta, schema)", sort_order: 7, default_handled_by: "automation", is_recurring: false },
      { title: "Client review & revision round", sort_order: 8, default_waiting_on: "client", is_recurring: false },
      { title: "Launch & DNS cutover", sort_order: 9, default_handled_by: "internal", human_review_required: true, is_recurring: false },
      { title: "Post-launch QA & handoff", sort_order: 10, default_handled_by: "internal", human_review_required: true, is_recurring: false },
    ],
  };

  for (const [serviceId, tasks] of Object.entries(TASK_TEMPLATES)) {
    // Skip if service doesn't exist in catalog (avoids FK violation)
    const svc = await db.select({ id: serviceCatalog.id }).from(serviceCatalog).where(eq(serviceCatalog.id, serviceId)).limit(1);
    if (svc.length === 0) {
      console.log(`  ○ ${serviceId} — skipped (not in service_catalog)`);
      continue;
    }
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
      name: "MapGuard Ongoing — Monthly Check-in",
      steps: [
        { key: "any_changes", label: "Any changes since last month? (new services, pricing, hours, areas)", type: "text", required: false },
        { key: "promotions_next_30_days", label: "Seasonal offers or promotions for the next 30 days", type: "text", required: false },
        { key: "new_photos", label: "New work/business photos available to upload?", type: "checkbox", required: false },
        { key: "focus_keyword", label: "Any keyword you'd like us to focus on this cycle?", type: "text", required: false },
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
    "tradeline-call-backup": {
      name: "TradeLine Call Backup Onboarding",
      steps: [
        { key: "business_name", label: "Business name", type: "text", required: true },
        { key: "trade_type", label: "Trade type", type: "text", required: true },
        { key: "service_area", label: "Service area", type: "text", required: true },
        { key: "business_hours", label: "Business hours", type: "text", required: true },
        { key: "primary_phone", label: "Primary phone number", type: "text", required: true },
        { key: "forwarding_preference", label: "Forwarding preference (no-answer / immediate / after-hours only)", type: "select", required: true },
        { key: "ring_timeout", label: "Ring timeout (seconds before AI answers)", type: "text", required: false },
        { key: "top_services", label: "Top services you offer", type: "text", required: true },
        { key: "pricing_ranges", label: "Rough pricing / quote ranges", type: "text", required: false },
        { key: "callback_number", label: "Callback number (if different)", type: "text", required: false },
        { key: "escalation_number", label: "Escalation number (urgent calls)", type: "text", required: false },
        { key: "tone", label: "Tone preference (professional / friendly / casual)", type: "select", required: true },
      ],
    },
    "tradeline-chat": {
      name: "TradeLine Chat Onboarding",
      steps: [
        { key: "business_name", label: "Business name", type: "text", required: true },
        { key: "trade_type", label: "Trade type", type: "text", required: true },
        { key: "website_url", label: "Website URL", type: "text", required: true },
        { key: "website_access", label: "Can you provide website access for install?", type: "select", required: true },
        { key: "install_mode", label: "Preferred install mode (direct embed / hosted fallback)", type: "select", required: true },
        { key: "brand_colors", label: "Brand colors / logo URL", type: "text", required: false },
        { key: "top_services", label: "Top services you offer", type: "text", required: true },
        { key: "pricing_ranges", label: "Rough pricing / quote ranges", type: "text", required: false },
        { key: "lead_destination", label: "Where should leads go? (email / phone / both)", type: "select", required: true },
        { key: "booking_enabled", label: "Enable booking requests?", type: "checkbox", required: false },
        { key: "tone", label: "Tone preference (professional / friendly / casual)", type: "select", required: true },
      ],
    },
    "tradeline-complete": {
      name: "TradeLine Complete Onboarding",
      steps: [
        { key: "business_name", label: "Business name", type: "text", required: true },
        { key: "trade_type", label: "Trade type", type: "text", required: true },
        { key: "service_area", label: "Service area", type: "text", required: true },
        { key: "business_hours", label: "Business hours", type: "text", required: true },
        { key: "primary_phone", label: "Primary phone number", type: "text", required: true },
        { key: "forwarding_preference", label: "Forwarding preference (no-answer / immediate / after-hours only)", type: "select", required: true },
        { key: "ring_timeout", label: "Ring timeout (seconds before AI answers)", type: "text", required: false },
        { key: "website_url", label: "Website URL", type: "text", required: true },
        { key: "website_access", label: "Can you provide website access for install?", type: "select", required: true },
        { key: "install_mode", label: "Preferred install mode (direct embed / hosted fallback)", type: "select", required: true },
        { key: "brand_colors", label: "Brand colors / logo URL", type: "text", required: false },
        { key: "top_services", label: "Top services you offer", type: "text", required: true },
        { key: "pricing_ranges", label: "Rough pricing / quote ranges", type: "text", required: false },
        { key: "lead_destination", label: "Where should leads go? (email / phone / both)", type: "select", required: true },
        { key: "escalation_number", label: "Escalation number (urgent calls)", type: "text", required: false },
        { key: "booking_enabled", label: "Enable booking requests?", type: "checkbox", required: false },
        { key: "tone", label: "Tone preference (professional / friendly / casual)", type: "select", required: true },
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
        { key: "access_available", label: "Can you provide hosting / CMS access? (yes / need help / admin login)", type: "select", required: true },
        { key: "main_issue", label: "Main issue (speed / SEO / broken pages / design / security / other)", type: "select", required: true },
        { key: "specific_problems", label: "Describe exactly what you want fixed", type: "text", required: true },
        { key: "pages_affected", label: "Pages or URLs affected (one per line)", type: "text", required: false },
        { key: "target_keywords", label: "If SEO-related: keywords you want to rank for", type: "text", required: false },
        { key: "brand_assets", label: "Logo / brand colors available if design changes needed?", type: "checkbox", required: false },
        { key: "urgency", label: "Timeline (ASAP / within a week / flexible)", type: "select", required: true },
      ],
    },
    "reputationshield": {
      name: "ReputationShield Onboarding",
      steps: [
        { key: "business_name", label: "Business name", type: "text", required: true },
        { key: "google_profile_link", label: "Google Business Profile link", type: "text", required: true },
        { key: "other_review_platforms", label: "Other review platforms (Yelp, Facebook, Trustpilot, etc.)", type: "text", required: false },
        { key: "customer_source", label: "How we get customer contacts (CSV upload / manual add / job-completion trigger)", type: "select", required: true },
        { key: "review_frequency", label: "Send requests (immediately after job / weekly batch / monthly batch)", type: "select", required: true },
        { key: "response_tone", label: "Reply tone (professional / friendly / direct)", type: "select", required: true },
        { key: "negative_handling", label: "For reviews under 4 stars (alert me first / route to private feedback form / auto-reply + alert)", type: "select", required: true },
        { key: "current_review_count", label: "Approximate current Google review count", type: "text", required: false },
      ],
    },
    "socialsync": {
      name: "SocialSync Onboarding",
      steps: [
        { key: "trade_type", label: "Your trade / service type", type: "text", required: true },
        { key: "platforms", label: "Platforms to post on (Facebook, Instagram, LinkedIn)", type: "text", required: true },
        { key: "handle_urls", label: "Page URLs or handles for each platform (one per line)", type: "text", required: true },
        { key: "posting_frequency", label: "Posts per week (2 / 3 / 5 / daily)", type: "select", required: true },
        { key: "content_style", label: "Content style (tips & how-to / project showcases / promotions / mixed)", type: "select", required: true },
        { key: "seasonal_themes", label: "Seasonal campaigns or topics to emphasize", type: "text", required: false },
        { key: "photos", label: "Do you have work photos we can use?", type: "checkbox", required: false },
        { key: "branding_notes", label: "Brand voice notes / topics to avoid", type: "text", required: false },
      ],
    },
    "sitelaunch": {
      name: "SiteLaunch (Custom) Onboarding",
      steps: [
        { key: "business_name", label: "Business name", type: "text", required: true },
        { key: "tagline", label: "Tagline / one-liner for hero section", type: "text", required: false },
        { key: "services", label: "Services to feature (one per line)", type: "text", required: true },
        { key: "service_area", label: "Service area", type: "text", required: true },
        { key: "contact_info", label: "Phone, email, address for the site", type: "text", required: true },
        { key: "business_hours", label: "Business hours", type: "text", required: false },
        { key: "style_preference", label: "Style preference (modern / classic / bold / minimal)", type: "select", required: true },
        { key: "brand_colors", label: "Brand colors (hex codes or description)", type: "text", required: false },
        { key: "logo", label: "Logo available", type: "checkbox", required: false },
        { key: "page_count", label: "Number of pages (3 / 5 / 8 / 10+)", type: "select", required: true },
        { key: "extra_features", label: "Extra features needed (blog, booking, gallery, testimonials, live chat)", type: "text", required: false },
        { key: "competitors", label: "Competitor websites you like the look of", type: "text", required: false },
      ],
    },
    "rankflow-starter": {
      name: "RankFlow Starter Onboarding",
      steps: [
        { key: "website_url", label: "Website URL", type: "text", required: true },
        { key: "google_account_email", label: "Google account email (for Search Console access)", type: "text", required: true },
        { key: "service_areas", label: "Areas you serve", type: "text", required: true },
        { key: "services", label: "Your main services", type: "text", required: true },
        { key: "target_keywords", label: "Keywords you want to rank for", type: "text", required: false },
        { key: "competitors", label: "Top 2-3 local competitors", type: "text", required: false },
      ],
    },
    "rankflow-growth": {
      name: "RankFlow Growth Onboarding",
      steps: [
        { key: "website_url", label: "Website URL", type: "text", required: true },
        { key: "google_account_email", label: "Google account email (for Search Console access)", type: "text", required: true },
        { key: "service_areas", label: "Areas you serve", type: "text", required: true },
        { key: "services", label: "Your main services", type: "text", required: true },
        { key: "target_keywords", label: "Keywords you want to rank for", type: "text", required: true },
        { key: "competitors", label: "Top 2-3 local competitors", type: "text", required: true },
        { key: "content_preferences", label: "Content style or topics to focus on", type: "text", required: false },
        { key: "cms_access", label: "Can you provide CMS/hosting access?", type: "select", required: true },
      ],
    },
    "rankflow-pro": {
      name: "RankFlow Pro Onboarding",
      steps: [
        { key: "website_url", label: "Website URL", type: "text", required: true },
        { key: "google_account_email", label: "Google account email (for Search Console access)", type: "text", required: true },
        { key: "service_areas", label: "Areas you serve", type: "text", required: true },
        { key: "services", label: "Your main services", type: "text", required: true },
        { key: "target_keywords", label: "Keywords you want to rank for", type: "text", required: true },
        { key: "competitors", label: "Top 2-3 local competitors", type: "text", required: true },
        { key: "content_preferences", label: "Content style or topics to focus on", type: "text", required: false },
        { key: "cms_access", label: "Can you provide CMS/hosting access?", type: "select", required: true },
        { key: "analytics_access", label: "Google Analytics access available?", type: "checkbox", required: false },
        { key: "existing_seo", label: "Current SEO provider or past SEO work", type: "text", required: false },
      ],
    },
    "adflow-starter": {
      name: "AdFlow Starter Onboarding",
      steps: [
        { key: "business_name", label: "Business name", type: "text", required: true },
        { key: "trade_type", label: "Trade / industry", type: "text", required: true },
        { key: "main_offer", label: "Main service or offer to advertise", type: "text", required: true },
        { key: "service_areas", label: "Target service areas (cities / zip codes)", type: "text", required: true },
        { key: "monthly_ad_budget", label: "Monthly ad budget (USD)", type: "text", required: true },
        { key: "preferred_platform", label: "Preferred platform (Google / Meta / Not sure)", type: "select", required: true },
        { key: "has_ad_accounts", label: "Do you have existing Google or Meta ad accounts?", type: "select", required: true },
        { key: "lead_destination", label: "Where should leads go? (phone / email / form)", type: "text", required: true },
        { key: "brand_assets", label: "Logo / brand photos available?", type: "checkbox", required: false },
        { key: "past_ad_notes", label: "Any past ad performance notes or campaigns we should know about?", type: "text", required: false },
        { key: "launch_urgency", label: "When do you want campaigns live? (ASAP / 2 weeks / flexible)", type: "select", required: true },
      ],
    },
    "adflow-growth": {
      name: "AdFlow Growth Onboarding",
      steps: [
        { key: "business_name", label: "Business name", type: "text", required: true },
        { key: "trade_type", label: "Trade / industry", type: "text", required: true },
        { key: "main_offer", label: "Main service or offer to advertise", type: "text", required: true },
        { key: "secondary_offers", label: "Secondary offers for A/B testing", type: "text", required: false },
        { key: "service_areas", label: "Target service areas (cities / zip codes)", type: "text", required: true },
        { key: "monthly_ad_budget", label: "Monthly ad budget (USD)", type: "text", required: true },
        { key: "platforms", label: "Platforms to run on (Google + Meta recommended)", type: "text", required: true },
        { key: "has_ad_accounts", label: "Do you have existing ad accounts?", type: "select", required: true },
        { key: "lead_destination", label: "Where should leads go?", type: "text", required: true },
        { key: "landing_page_url", label: "Landing page URL (if applicable)", type: "text", required: false },
        { key: "brand_assets", label: "Logo / photos / video available?", type: "checkbox", required: false },
        { key: "past_ad_notes", label: "Past ad performance notes", type: "text", required: false },
      ],
    },
    "adflow-pro": {
      name: "AdFlow Pro Onboarding",
      steps: [
        { key: "business_name", label: "Business name", type: "text", required: true },
        { key: "trade_type", label: "Trade / industry", type: "text", required: true },
        { key: "main_offer", label: "Main service or offer to advertise", type: "text", required: true },
        { key: "secondary_offers", label: "Secondary offers / campaigns", type: "text", required: false },
        { key: "service_areas", label: "Target service areas (cities / zip codes / radius)", type: "text", required: true },
        { key: "monthly_ad_budget", label: "Monthly ad budget (USD)", type: "text", required: true },
        { key: "platforms", label: "Platforms (Google / Meta / YouTube / all)", type: "text", required: true },
        { key: "has_ad_accounts", label: "Do you have existing ad accounts?", type: "select", required: true },
        { key: "lead_destination", label: "Where should leads go?", type: "text", required: true },
        { key: "landing_page_url", label: "Landing page URL (or should we build one?)", type: "text", required: false },
        { key: "video_assets", label: "Do you have video content available?", type: "checkbox", required: false },
        { key: "brand_assets", label: "Logo / photos / video available?", type: "checkbox", required: false },
        { key: "competitors", label: "Main competitors (for competitive targeting)", type: "text", required: false },
        { key: "target_audience", label: "Target customer profile (demographics, intent)", type: "text", required: false },
        { key: "past_ad_notes", label: "Past ad campaigns — what worked / what didn't", type: "text", required: false },
      ],
    },
    "sitelaunch-template": {
      name: "SiteLaunch Template Onboarding",
      steps: [
        { key: "business_name", label: "Business name", type: "text", required: true },
        { key: "trade_type", label: "Trade (we'll match you to a template)", type: "text", required: true },
        { key: "tagline", label: "Tagline / one-liner for hero section", type: "text", required: false },
        { key: "services", label: "Services to feature (comma-separated)", type: "text", required: true },
        { key: "service_area", label: "Service area", type: "text", required: true },
        { key: "contact_info", label: "Phone, email, address for the site", type: "text", required: true },
        { key: "business_hours", label: "Business hours", type: "text", required: false },
        { key: "brand_colors", label: "Brand colors (hex codes or description)", type: "text", required: false },
        { key: "logo", label: "Logo available", type: "checkbox", required: false },
        { key: "photos", label: "Business / work photos available", type: "checkbox", required: false },
        { key: "domain_preference", label: "Do you have a domain, or want us to suggest one?", type: "select", required: true },
        { key: "extra_pages", label: "Extra pages needed beyond home/services/contact?", type: "text", required: false },
      ],
    },
  };

  for (const [serviceId, template] of Object.entries(ONBOARDING)) {
    // Skip if service doesn't exist in catalog (avoids FK violation)
    const svc = await db.select({ id: serviceCatalog.id }).from(serviceCatalog).where(eq(serviceCatalog.id, serviceId)).limit(1);
    if (svc.length === 0) {
      console.log(`  ○ ${template.name} — skipped (${serviceId} not in service_catalog)`);
      continue;
    }
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
  // Surface underlying PostgreSQL details (code, detail, hint, table, column)
  // Drizzle wraps the original error on .cause; postgres-js exposes code/detail/hint directly.
  const cause = (err as any).cause ?? err;
  if (cause) {
    console.error("Underlying error:");
    for (const key of ["code", "detail", "hint", "table", "column", "constraint", "routine", "severity"]) {
      const val = cause[key];
      if (val !== undefined && val !== null) console.error(`  ${key}: ${val}`);
    }
    if (cause.stack) console.error(cause.stack.split("\n").slice(0, 5).join("\n"));
  }
  process.exit(1);
});
