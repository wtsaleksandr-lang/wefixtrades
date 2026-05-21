/**
 * SiteLaunch Post-Delivery Finalization
 *
 * When a SiteLaunch supplier submits their work (task status -> `submitted`),
 * the system automatically:
 *
 *   1. Generates SEO meta tags (title, description, schema markup) via Claude
 *   2. Generates form embed instructions (contact form, QuoteQuick widget)
 *   3. Creates a "finalization brief" stored in task metadata
 *   4. Auto-creates a follow-up task "Apply AI-generated SEO + forms"
 *
 * Called from the task update flow in adminCrmRoutes when a SiteLaunch
 * supplier task transitions to `submitted`.
 */

import { db } from "../db";
import { clients, clientServices, fulfillmentTasks, onboardingSubmissions, serviceCatalog } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { storage } from "../storage";
import { chat } from "./aiService";
import { createLogger } from "../lib/logger";
import type { FulfillmentTask } from "@shared/schema";

const log = createLogger("SiteLaunchFinalization");

/** The structured brief stored in task metadata */
export interface FinalizationBrief {
  generated_at: string;
  seo_meta_tags: {
    homepage: { title: string; description: string; schema_markup: string };
    about?: { title: string; description: string };
    services?: { title: string; description: string };
    contact?: { title: string; description: string };
    additional_pages?: Array<{ page: string; title: string; description: string }>;
  };
  form_embed_instructions: {
    contact_form: string;
    quotequick_widget: string | null;
    cta_recommendations: string[];
  };
  optimization_notes: string;
  raw_ai_output: string;
}

/**
 * Check if a task belongs to a SiteLaunch service.
 */
async function isSiteLaunchTask(task: FulfillmentTask): Promise<boolean> {
  const [cs] = await db
    .select({ service_id: clientServices.service_id })
    .from(clientServices)
    .where(eq(clientServices.id, task.client_service_id))
    .limit(1);
  if (!cs) return false;
  return cs.service_id.startsWith("sitelaunch");
}

/**
 * Load all context needed to generate the finalization brief.
 */
async function loadFinalizationContext(task: FulfillmentTask): Promise<{
  client: { business_name: string; trade_type: string | null; website_url: string | null; contact_email: string | null; contact_phone: string | null; metadata: any };
  serviceName: string;
  serviceId: string;
  onboardingResponses: Record<string, any> | null;
  hasQuoteQuick: boolean;
} | null> {
  // Get client info
  const [clientRow] = await db.select().from(clients).where(eq(clients.id, task.client_id)).limit(1);
  if (!clientRow) {
    log.warn(`Client #${task.client_id} not found for task #${task.id}`);
    return null;
  }

  // Get service info
  const [cs] = await db
    .select({ service_id: clientServices.service_id })
    .from(clientServices)
    .where(eq(clientServices.id, task.client_service_id))
    .limit(1);

  const serviceRow = cs
    ? (await db.select().from(serviceCatalog).where(eq(serviceCatalog.id, cs.service_id)).limit(1))[0]
    : null;

  // Get onboarding responses (what the customer submitted)
  const [onboarding] = await db
    .select({ responses: onboardingSubmissions.responses })
    .from(onboardingSubmissions)
    .where(
      and(
        eq(onboardingSubmissions.client_service_id, task.client_service_id),
        eq(onboardingSubmissions.status, "submitted"),
      ),
    )
    .limit(1);

  // Check if the client has an active QuoteQuick service
  const [quoteQuickService] = await db
    .select({ id: clientServices.id })
    .from(clientServices)
    .where(
      and(
        eq(clientServices.client_id, task.client_id),
        sql`${clientServices.service_id} LIKE 'quotequick%'`,
        sql`${clientServices.status} NOT IN ('cancelled')`,
      ),
    )
    .limit(1);

  return {
    client: {
      business_name: clientRow.business_name,
      trade_type: clientRow.trade_type,
      website_url: clientRow.website_url,
      contact_email: clientRow.contact_email,
      contact_phone: clientRow.contact_phone,
      metadata: clientRow.metadata,
    },
    serviceName: serviceRow?.name || "SiteLaunch",
    serviceId: cs?.service_id || "sitelaunch",
    onboardingResponses: (onboarding?.responses as Record<string, any>) || null,
    hasQuoteQuick: !!quoteQuickService,
  };
}

/**
 * Generate the finalization brief using Claude.
 */
async function generateFinalizationBrief(context: {
  business_name: string;
  trade_type: string | null;
  website_url: string | null;
  onboardingResponses: Record<string, any> | null;
  hasQuoteQuick: boolean;
}): Promise<FinalizationBrief> {
  const locationHint = context.onboardingResponses?.location
    || context.onboardingResponses?.service_area
    || context.onboardingResponses?.city
    || "their local area";

  const prompt = `You are an SEO and web optimization specialist for trades businesses. Generate a complete finalization brief for a newly built website.

Business details:
- Business name: ${context.business_name}
- Trade type: ${context.trade_type || "general trades"}
- Location/service area: ${locationHint}
- Website URL: ${context.website_url || "TBD"}
- Has QuoteQuick widget: ${context.hasQuoteQuick ? "Yes" : "No"}
${context.onboardingResponses ? `- Customer onboarding responses: ${JSON.stringify(context.onboardingResponses)}` : ""}

Generate a JSON response with this exact structure:
{
  "seo_meta_tags": {
    "homepage": {
      "title": "Max 60 chars, include business name + trade + location",
      "description": "Max 160 chars, compelling meta description with call to action",
      "schema_markup": "JSON-LD LocalBusiness schema markup (as a string)"
    },
    "about": {
      "title": "About page title tag",
      "description": "About page meta description"
    },
    "services": {
      "title": "Services page title tag",
      "description": "Services page meta description"
    },
    "contact": {
      "title": "Contact page title tag",
      "description": "Contact page meta description"
    }
  },
  "form_embed_instructions": {
    "contact_form": "Instructions for ensuring a contact form is on the site with required fields",
    "quotequick_widget": ${context.hasQuoteQuick ? '"Instructions for embedding the QuoteQuick widget on the site"' : "null"},
    "cta_recommendations": ["Array of 3-5 specific CTA suggestions for the site"]
  },
  "optimization_notes": "Brief optimization checklist: image alt tags, heading structure, mobile responsiveness checks, page speed tips"
}

Return ONLY the JSON, no markdown fences or explanation.`;

  const rawOutput = await chat({
    system: "You are a technical SEO specialist. Return only valid JSON.",
    messages: [{ role: "user", content: prompt }],
    maxTokens: 2000,
    surface: "sitelaunch",
  });

  // Parse the AI output
  let parsed: any;
  try {
    // Strip markdown fences if present
    const cleaned = rawOutput.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    log.warn(`Failed to parse AI output as JSON, using raw text`, { taskContext: context.business_name });
    parsed = {
      seo_meta_tags: {
        homepage: {
          title: `${context.business_name} | ${context.trade_type || "Professional Services"}`,
          description: `${context.business_name} provides professional ${context.trade_type || "trades"} services in ${locationHint}. Contact us for a free quote.`,
          schema_markup: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            name: context.business_name,
            description: `Professional ${context.trade_type || "trades"} services`,
          }),
        },
      },
      form_embed_instructions: {
        contact_form: "Ensure a contact form with name, email, phone, and message fields is present on the contact page and in the footer.",
        quotequick_widget: context.hasQuoteQuick ? "Embed the QuoteQuick widget on the homepage and services page." : null,
        cta_recommendations: ["Add a prominent 'Get a Free Quote' button above the fold", "Include phone number in the header"],
      },
      optimization_notes: "Check all images have alt tags. Ensure heading hierarchy (H1 > H2 > H3). Test mobile responsiveness.",
    };
  }

  return {
    generated_at: new Date().toISOString(),
    seo_meta_tags: parsed.seo_meta_tags || parsed.seoMetaTags || {},
    form_embed_instructions: parsed.form_embed_instructions || parsed.formEmbedInstructions || {},
    optimization_notes: parsed.optimization_notes || parsed.optimizationNotes || "",
    raw_ai_output: rawOutput,
  };
}

/**
 * Run the SiteLaunch finalization pipeline for a submitted task.
 *
 * Idempotent: if finalization_brief already exists in task metadata, skips.
 */
export async function runSiteLaunchFinalization(taskId: number): Promise<{
  finalized: boolean;
  followUpTaskId?: number;
  reason?: string;
}> {
  try {
    // 1. Load the task
    const [task] = await db
      .select()
      .from(fulfillmentTasks)
      .where(eq(fulfillmentTasks.id, taskId))
      .limit(1);

    if (!task) {
      return { finalized: false, reason: "task_not_found" };
    }

    // 2. Must be submitted status
    if (task.status !== "submitted") {
      return { finalized: false, reason: `task_status_is_${task.status}` };
    }

    // 3. Must be a SiteLaunch service
    const isSL = await isSiteLaunchTask(task);
    if (!isSL) {
      return { finalized: false, reason: "not_sitelaunch_service" };
    }

    // 4. Idempotency: skip if already finalized
    const meta = (task.metadata as Record<string, any>) || {};
    if (meta.finalization_brief) {
      log.info(`Task #${taskId} already has finalization brief — skipping`);
      return { finalized: false, reason: "already_finalized" };
    }

    log.info(`Starting SiteLaunch finalization for task #${taskId}`);

    // 5. Load context
    const context = await loadFinalizationContext(task);
    if (!context) {
      return { finalized: false, reason: "context_load_failed" };
    }

    // 6. Generate the finalization brief via AI
    const brief = await generateFinalizationBrief({
      business_name: context.client.business_name,
      trade_type: context.client.trade_type,
      website_url: context.client.website_url,
      onboardingResponses: context.onboardingResponses,
      hasQuoteQuick: context.hasQuoteQuick,
    });

    // 7. Store the brief in the submitted task's metadata
    await storage.updateFulfillmentTask(taskId, {
      metadata: {
        ...meta,
        finalization_brief: brief,
      },
    } as any);

    // 8. Create follow-up task: "Apply AI-generated SEO + forms"
    const followUpTask = await storage.createFulfillmentTask({
      client_service_id: task.client_service_id,
      client_id: task.client_id,
      supplier_id: task.supplier_id, // same supplier, or null for internal
      title: "Apply AI-generated SEO + forms",
      description: buildFollowUpDescription(brief, context.client.business_name),
      sort_order: task.sort_order + 1,
      priority: "normal",
      handled_by: task.supplier_id ? "supplier" : "internal",
      waiting_on: null,
      human_review_required: false,
      status: "not_started",
      actor_type: "system",
      metadata: {
        finalization_brief: brief,
        parent_task_id: taskId,
        auto_created: true,
        auto_created_reason: "sitelaunch_finalization",
      },
    });

    // 9. Log the activity
    await storage.logAdminActivity({
      actor_type: "system",
      actor_name: "SiteLaunchFinalization",
      action: "finalization.completed",
      entity_type: "fulfillment_task",
      entity_id: taskId,
      summary: `AI finalization brief generated for "${task.title}" — follow-up task #${followUpTask.id} created`,
      metadata: {
        follow_up_task_id: followUpTask.id,
        client_id: task.client_id,
        service_id: context.serviceId,
      },
    });

    log.info(`SiteLaunch finalization complete for task #${taskId} — follow-up task #${followUpTask.id} created`);

    return { finalized: true, followUpTaskId: followUpTask.id };
  } catch (err: any) {
    log.error(`SiteLaunch finalization failed for task #${taskId}: ${err.message}`);
    return { finalized: false, reason: `error: ${err.message}` };
  }
}

/**
 * Build a human-readable description for the follow-up task.
 */
function buildFollowUpDescription(brief: FinalizationBrief, businessName: string): string {
  const lines: string[] = [
    `Apply the AI-generated SEO meta tags and form embed instructions for ${businessName}.`,
    "",
    "--- SEO META TAGS ---",
  ];

  if (brief.seo_meta_tags.homepage) {
    lines.push(`Homepage Title: ${brief.seo_meta_tags.homepage.title}`);
    lines.push(`Homepage Description: ${brief.seo_meta_tags.homepage.description}`);
  }
  if (brief.seo_meta_tags.about) {
    lines.push(`About Title: ${brief.seo_meta_tags.about.title}`);
  }
  if (brief.seo_meta_tags.services) {
    lines.push(`Services Title: ${brief.seo_meta_tags.services.title}`);
  }
  if (brief.seo_meta_tags.contact) {
    lines.push(`Contact Title: ${brief.seo_meta_tags.contact.title}`);
  }

  lines.push("", "--- SCHEMA MARKUP ---");
  if (brief.seo_meta_tags.homepage?.schema_markup) {
    lines.push(brief.seo_meta_tags.homepage.schema_markup);
  }

  lines.push("", "--- FORM EMBED INSTRUCTIONS ---");
  lines.push(brief.form_embed_instructions.contact_form);
  if (brief.form_embed_instructions.quotequick_widget) {
    lines.push(`QuoteQuick Widget: ${brief.form_embed_instructions.quotequick_widget}`);
  }

  if (brief.form_embed_instructions.cta_recommendations?.length) {
    lines.push("", "--- CTA RECOMMENDATIONS ---");
    for (const cta of brief.form_embed_instructions.cta_recommendations) {
      lines.push(`- ${cta}`);
    }
  }

  lines.push("", "--- OPTIMIZATION NOTES ---");
  lines.push(brief.optimization_notes);

  return lines.join("\n");
}
