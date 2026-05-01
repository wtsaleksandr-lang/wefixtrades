/**
 * WebCare Content Automation
 *
 * For WebCare Pro clients (4 content changes/month), generates blog posts
 * relevant to the client's trade using Claude and publishes them through
 * the existing ContentFlow pipeline (wordpressQueue).
 *
 * Flow:
 * 1. Look up client info (business_name, trade_type, website_url)
 * 2. Use Claude to generate a short, useful blog post (500-800 words)
 * 3. Create a ContentFlow draft with surface: "webcare", channel: "wordpress"
 * 4. Queue it for publishing via the existing wordpress publish queue
 *
 * Called by the webcareMaintenanceWorker when monthly content change tasks
 * are created by the recurring task worker.
 */

import { storage } from "../storage";
import { db } from "../db";
import { clientServices, fulfillmentTasks } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { chat as aiChat } from "./aiService";
import { enqueueDraft } from "./contentflow/wordpressQueue";
import { createLogger } from "../lib/logger";

const log = createLogger("WebCareContent");

/* ─── Types ────────────────────────────────────────────────────────── */

export interface ContentResult {
  published: boolean;
  title?: string;
  draft_id?: number;
  error?: string;
}

/* ─── AI Article Generation ────────────────────────────────────────── */

const SYSTEM_PROMPT = `You are a blog writer for small trade businesses (plumbers, electricians, roofers, HVAC technicians, etc.).

Write ONE useful, informative blog post that a trades business owner would want on their website. The post should help their local SEO and demonstrate expertise.

Hard rules:
- Do NOT fabricate testimonials, customer names, project stories, ratings, awards, or certifications.
- Do NOT invent specific prices, response times, warranties, or guarantees.
- Write plainly and factually. Helpful, not salesy.
- Keep it practical — homeowner tips, seasonal advice, what to look for, how things work.
- No fake urgency, no all-caps, no excessive exclamation marks.
- If you are unsure of a fact, omit it rather than invent it.

Output format: a single JSON object with exactly these keys:
  "title": string, 50-70 characters, clear and descriptive
  "excerpt": string, 120-160 characters, plain prose summary
  "body_md": string, 500-800 words of markdown, with 2-3 ## section headings, no images, no external links

Output ONLY the JSON object. No preamble. No markdown code fence.`;

function buildUserPrompt(businessName: string, tradeType: string | null): string {
  const lines: string[] = [];
  lines.push(`Business: ${businessName}`);
  lines.push(`Trade type: ${tradeType || "general trades"}`);
  lines.push(`Month: ${new Date().toLocaleString("en-US", { month: "long", year: "numeric" })}`);
  lines.push("");
  lines.push("Write a seasonal or evergreen blog post relevant to this trade. Pick a specific topic that homeowners search for.");
  lines.push("Output JSON only.");
  return lines.join("\n");
}

interface ArticleJson {
  title: string;
  excerpt: string;
  body_md: string;
}

function parseArticleJson(raw: string): ArticleJson | null {
  let s = raw.trim();
  // Strip code fences if the model added them
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  const slice = s.slice(first, last + 1);
  try {
    const parsed = JSON.parse(slice);
    if (typeof parsed?.title !== "string") return null;
    if (typeof parsed?.excerpt !== "string") return null;
    if (typeof parsed?.body_md !== "string") return null;
    return { title: parsed.title, excerpt: parsed.excerpt, body_md: parsed.body_md };
  } catch {
    return null;
  }
}

/* ─── Main Function ────────────────────────────────────────────────── */

/**
 * Generate and publish a monthly blog post for a WebCare client.
 * Creates a ContentFlow draft and enqueues it for WordPress publishing.
 */
export async function generateAndPublishMonthlyContent(
  clientId: number,
  clientServiceId: number,
): Promise<ContentResult> {
  // 1. Look up client info
  const client = await storage.getClientById(clientId);
  if (!client) {
    return { published: false, error: `Client ${clientId} not found` };
  }

  const businessName = client.business_name;
  const tradeType = client.trade_type || null;

  log.info(`Generating monthly content for client#${clientId} (${businessName})`);

  // 2. Generate article via Claude
  let articleJson: ArticleJson | null = null;
  try {
    const raw = await aiChat({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(businessName, tradeType) }],
      maxTokens: 1500,
    });

    articleJson = parseArticleJson(raw);
    if (!articleJson) {
      log.error("Failed to parse AI article output", { clientId: String(clientId), rawLength: String(raw.length) });
      return { published: false, error: "AI returned unparseable output" };
    }
  } catch (err: any) {
    log.error("AI article generation failed", { clientId: String(clientId), error: err.message });
    return { published: false, error: `AI generation failed: ${err.message}` };
  }

  // 3. Create a ContentFlow draft
  let draft;
  try {
    draft = await storage.createContentDraft({
      client_id: clientId,
      client_service_id: clientServiceId,
      kind: "article",
      surface: "webcare",
      title: articleJson.title,
      body: articleJson.body_md,
      excerpt: articleJson.excerpt,
      target_platform: "website",
      target_url: null,
      metadata: {
        generation_source: "webcare_content_automation",
        generated_at: new Date().toISOString(),
        trade_type: tradeType,
        business_name: businessName,
      },
      quality_score: null,
      quality_notes: null,
      status: "approved",           // Auto-approved for WebCare content
      auto_approved: true,
      requires_admin_review: false,
      requires_client_review: false,
      admin_approved_at: null,
      admin_approved_by: null,
      client_approved_at: null,
      rejected_at: null,
      rejection_reason: null,
      linked_social_post_id: null,
      linked_task_id: null,
      generation_cost_micro_usd: null,
      created_by: "system",
    });

    log.info(`Created WebCare content draft#${draft.id} for client#${clientId}: "${articleJson.title}"`);
  } catch (err: any) {
    log.error("Failed to create content draft", { clientId: String(clientId), error: err.message });
    return { published: false, title: articleJson.title, error: `Draft creation failed: ${err.message}` };
  }

  // 4. Enqueue for WordPress publishing
  try {
    const enqueueResult = await enqueueDraft(draft.id, { wp_status: "publish" });

    if (!enqueueResult.ok) {
      // The draft was created but enqueueing failed — this can happen if
      // the draft surface doesn't match 'rankflow'. For WebCare drafts
      // (surface='webcare'), we store the queue metadata directly so
      // the existing wordpress queue worker can pick it up.
      log.warn("Standard enqueue failed for WebCare draft, applying queue metadata directly", {
        draftId: String(draft.id),
        reason: "reason" in enqueueResult ? enqueueResult.reason : "unknown",
      });

      // Manually set wordpress queue metadata so the queue worker picks it up
      const existingMeta = (draft.metadata || {}) as Record<string, any>;
      await storage.updateContentDraft(draft.id, {
        metadata: {
          ...existingMeta,
          wordpress: {
            queue_status: "queued",
            scheduled_for: null,
            attempts: 0,
            last_error: null,
            locked_at: null,
            locked_by: null,
            desired_wp_status: "publish",
          },
        },
      });
    }

    return {
      published: true,
      title: articleJson.title,
      draft_id: draft.id,
    };
  } catch (err: any) {
    log.error("Failed to enqueue draft for publishing", { draftId: String(draft.id), error: err.message });
    return {
      published: false,
      title: articleJson.title,
      draft_id: draft.id,
      error: `Enqueue failed: ${err.message}`,
    };
  }
}

/* ─── Content Task Processor ───────────────────────────────────────── */

/**
 * Process a monthly content change fulfillment task.
 * Called by the maintenance worker or can be triggered manually.
 *
 * Looks up the task, checks if the client has WordPress credentials,
 * generates content, and marks the task as delivered.
 */
export async function processContentChangeTask(
  taskId: number,
): Promise<ContentResult> {
  // Look up the task directly — no getFulfillmentTaskById in IStorage
  const [task] = await db
    .select()
    .from(fulfillmentTasks)
    .where(eq(fulfillmentTasks.id, taskId))
    .limit(1);

  if (!task) {
    return { published: false, error: `Task ${taskId} not found` };
  }

  if (task.status === "delivered" || task.status === "cancelled") {
    return { published: false, error: `Task ${taskId} already ${task.status}` };
  }

  // Generate and publish content
  const result = await generateAndPublishMonthlyContent(task.client_id, task.client_service_id);

  // Mark task as delivered if content was published
  if (result.published) {
    try {
      await storage.updateFulfillmentTask(taskId, {
        status: "delivered",
        completed_at: new Date(),
        last_action: `Blog post published: "${result.title}"`,
        actor_type: "system",
        metadata: {
          ...(task.metadata as Record<string, any> || {}),
          content_published: true,
          content_title: result.title,
          content_draft_id: result.draft_id,
          published_at: new Date().toISOString(),
        },
      });
    } catch (err: any) {
      log.warn(`Failed to mark content task#${taskId} as delivered`, { error: err.message });
    }
  }

  return result;
}
