/**
 * WebFix Automated Audit Pipeline
 *
 * Pre-fix audit (runs when WebFix service is created):
 *   1. Calls Google PageSpeed Insights API for the client's website URL
 *   2. Stores performance scores (performance, FCP, LCP, CLS, TBT, speed index)
 *   3. Uses Claude to analyze results and generate a prioritized fix list
 *   4. Stores as metadata.pre_audit on the first fulfillment task
 *
 * Post-fix verification (runs when all WebFix tasks are delivered):
 *   1. Re-runs the same PageSpeed audit
 *   2. Compares before/after scores
 *   3. Uses Claude to generate a before/after report summary
 *   4. Stores as metadata.post_audit on the completion task
 *   5. Creates a deliverable with the report
 */

import { db } from "../db";
import { clients, clientServices, fulfillmentTasks, serviceCatalog } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { storage } from "../storage";
import { chat } from "./aiService";
import { createLogger } from "../lib/logger";

const log = createLogger("WebFixAudit");

/* ─── Types ─── */

export interface PageSpeedMetrics {
  performance_score: number;    // 0-100
  fcp_ms: number;               // First Contentful Paint (ms)
  lcp_ms: number;               // Largest Contentful Paint (ms)
  cls: number;                   // Cumulative Layout Shift
  tbt_ms: number;               // Total Blocking Time (ms)
  speed_index_ms: number;       // Speed Index (ms)
  accessibility_score?: number;
  seo_score?: number;
  best_practices_score?: number;
}

export interface AuditResult {
  audited_at: string;
  url: string;
  strategy: "mobile" | "desktop";
  metrics: PageSpeedMetrics;
  ai_analysis: string;
  prioritized_fixes: string[];
  raw_lighthouse_categories?: Record<string, any>;
}

export interface PostAuditResult {
  audited_at: string;
  url: string;
  strategy: "mobile" | "desktop";
  metrics: PageSpeedMetrics;
  comparison: {
    performance_delta: number;
    fcp_delta_ms: number;
    lcp_delta_ms: number;
    cls_delta: number;
    tbt_delta_ms: number;
    speed_index_delta_ms: number;
  };
  ai_report: string;
  improvements_summary: string;
}

/* ─── PageSpeed Insights API ─── */

async function fetchPageSpeedInsights(url: string, strategy: "mobile" | "desktop" = "mobile"): Promise<{
  metrics: PageSpeedMetrics;
  categories: Record<string, any>;
} | null> {
  const apiKey = process.env.PAGESPEED_API_KEY;
  if (!apiKey) {
    log.warn("PAGESPEED_API_KEY not set — skipping PageSpeed audit");
    return null;
  }

  const apiUrl = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  apiUrl.searchParams.set("url", url);
  apiUrl.searchParams.set("key", apiKey);
  apiUrl.searchParams.set("strategy", strategy);
  apiUrl.searchParams.set("category", "PERFORMANCE");
  apiUrl.searchParams.append("category", "ACCESSIBILITY");
  apiUrl.searchParams.append("category", "BEST_PRACTICES");
  apiUrl.searchParams.append("category", "SEO");

  try {
    const response = await fetch(apiUrl.toString(), {
      signal: AbortSignal.timeout(60_000), // 60s timeout — PageSpeed can be slow
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      log.error(`PageSpeed API returned ${response.status}: ${errorText.slice(0, 200)}`);
      return null;
    }

    const data = await response.json() as any;
    const lighthouse = data.lighthouseResult;
    if (!lighthouse) {
      log.error("PageSpeed response missing lighthouseResult");
      return null;
    }

    const audits = lighthouse.audits || {};
    const categories = lighthouse.categories || {};

    const metrics: PageSpeedMetrics = {
      performance_score: Math.round((categories.performance?.score || 0) * 100),
      fcp_ms: audits["first-contentful-paint"]?.numericValue || 0,
      lcp_ms: audits["largest-contentful-paint"]?.numericValue || 0,
      cls: audits["cumulative-layout-shift"]?.numericValue || 0,
      tbt_ms: audits["total-blocking-time"]?.numericValue || 0,
      speed_index_ms: audits["speed-index"]?.numericValue || 0,
      accessibility_score: categories.accessibility ? Math.round(categories.accessibility.score * 100) : undefined,
      seo_score: categories.seo ? Math.round(categories.seo.score * 100) : undefined,
      best_practices_score: categories["best-practices"] ? Math.round(categories["best-practices"].score * 100) : undefined,
    };

    return { metrics, categories };
  } catch (err: any) {
    log.error(`PageSpeed API call failed: ${err.message}`);
    return null;
  }
}

/* ─── AI Analysis ─── */

async function analyzePreFixResults(
  metrics: PageSpeedMetrics,
  businessName: string,
  websiteUrl: string,
): Promise<{ analysis: string; prioritizedFixes: string[] }> {
  const prompt = `You are a web performance specialist. Analyze these PageSpeed Insights results for a trades business website and generate a prioritized fix list.

Business: ${businessName}
Website: ${websiteUrl}

Performance Scores:
- Performance: ${metrics.performance_score}/100
- First Contentful Paint (FCP): ${Math.round(metrics.fcp_ms)}ms
- Largest Contentful Paint (LCP): ${Math.round(metrics.lcp_ms)}ms
- Cumulative Layout Shift (CLS): ${metrics.cls.toFixed(3)}
- Total Blocking Time (TBT): ${Math.round(metrics.tbt_ms)}ms
- Speed Index: ${Math.round(metrics.speed_index_ms)}ms
${metrics.accessibility_score != null ? `- Accessibility: ${metrics.accessibility_score}/100` : ""}
${metrics.seo_score != null ? `- SEO: ${metrics.seo_score}/100` : ""}
${metrics.best_practices_score != null ? `- Best Practices: ${metrics.best_practices_score}/100` : ""}

Return a JSON response with:
{
  "analysis": "2-3 sentence summary of the key issues",
  "prioritized_fixes": [
    "Fix 1 (highest priority) — clear, actionable instruction",
    "Fix 2 — ...",
    "Fix 3 — ...",
    "Fix 4 — ...",
    "Fix 5 — ..."
  ]
}

Focus on the most impactful fixes first. Be specific and actionable for a web developer.
Return ONLY the JSON, no markdown fences.`;

  const rawOutput = await chat({
    system: "You are a web performance optimization expert. Return only valid JSON.",
    messages: [{ role: "user", content: prompt }],
    maxTokens: 1200,
    // audit/ai 2026-05-24: WeFix performance-audit narrative.
    surface: "wft_audit",
  });

  try {
    const cleaned = rawOutput.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      analysis: parsed.analysis || "Performance audit complete.",
      prioritizedFixes: parsed.prioritized_fixes || parsed.prioritizedFixes || [],
    };
  } catch {
    log.warn("Failed to parse AI analysis output, using raw text");
    return {
      analysis: rawOutput.slice(0, 500),
      prioritizedFixes: [
        "Review PageSpeed results and address critical performance issues",
        "Optimize images and implement lazy loading",
        "Minimize render-blocking resources",
      ],
    };
  }
}

async function generateBeforeAfterReport(
  preMetrics: PageSpeedMetrics,
  postMetrics: PageSpeedMetrics,
  businessName: string,
  websiteUrl: string,
): Promise<{ report: string; summary: string }> {
  const prompt = `Generate a before/after performance report for a website fix project.

Business: ${businessName}
Website: ${websiteUrl}

BEFORE (pre-fix):
- Performance: ${preMetrics.performance_score}/100
- FCP: ${Math.round(preMetrics.fcp_ms)}ms
- LCP: ${Math.round(preMetrics.lcp_ms)}ms
- CLS: ${preMetrics.cls.toFixed(3)}
- TBT: ${Math.round(preMetrics.tbt_ms)}ms
- Speed Index: ${Math.round(preMetrics.speed_index_ms)}ms

AFTER (post-fix):
- Performance: ${postMetrics.performance_score}/100
- FCP: ${Math.round(postMetrics.fcp_ms)}ms
- LCP: ${Math.round(postMetrics.lcp_ms)}ms
- CLS: ${postMetrics.cls.toFixed(3)}
- TBT: ${Math.round(postMetrics.tbt_ms)}ms
- Speed Index: ${Math.round(postMetrics.speed_index_ms)}ms

Return JSON:
{
  "report": "Full before/after report in plain text, suitable for sending to the client. Include specific improvements and remaining recommendations.",
  "summary": "One-line summary of the improvement (e.g., 'Performance improved from 45 to 82, with 40% faster load times')"
}

Return ONLY the JSON, no markdown fences.`;

  const rawOutput = await chat({
    system: "You are a web performance consultant writing a client-friendly report. Return only valid JSON.",
    messages: [{ role: "user", content: prompt }],
    maxTokens: 1500,
    // audit/ai 2026-05-24: WeFix before/after report — same surface as
    // the prefix narrative call above.
    surface: "wft_audit",
  });

  try {
    const cleaned = rawOutput.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      report: parsed.report || "Performance improvement report generated.",
      summary: parsed.summary || `Performance: ${preMetrics.performance_score} -> ${postMetrics.performance_score}`,
    };
  } catch {
    const perfDelta = postMetrics.performance_score - preMetrics.performance_score;
    return {
      report: rawOutput.slice(0, 1000),
      summary: `Performance score changed by ${perfDelta >= 0 ? "+" : ""}${perfDelta} (${preMetrics.performance_score} -> ${postMetrics.performance_score})`,
    };
  }
}

/* ─── Public API ─── */

/**
 * Run the pre-fix audit for a WebFix service.
 * Called after WebFix service provisioning (Stripe webhook or manual provision).
 *
 * Idempotent: skips if pre_audit already exists on the first task.
 */
export async function runPreFixAudit(clientServiceId: number): Promise<{
  audited: boolean;
  reason?: string;
}> {
  try {
    // 1. Load the client service
    const cs = await storage.getClientServiceById(clientServiceId);
    if (!cs) return { audited: false, reason: "client_service_not_found" };

    // Must be a WebFix service
    if (!cs.service_id.startsWith("webfix")) {
      return { audited: false, reason: "not_webfix_service" };
    }

    // 2. Get the client's website URL
    const client = await storage.getClientById(cs.client_id);
    if (!client?.website_url) {
      log.warn(`Client #${cs.client_id} has no website_url — cannot run PageSpeed audit`);
      return { audited: false, reason: "no_website_url" };
    }

    // 3. Find the first fulfillment task for this service
    const [firstTask] = await db
      .select()
      .from(fulfillmentTasks)
      .where(
        and(
          eq(fulfillmentTasks.client_service_id, clientServiceId),
          sql`${fulfillmentTasks.status} != 'cancelled'`,
        ),
      )
      .orderBy(fulfillmentTasks.sort_order)
      .limit(1);

    if (!firstTask) {
      return { audited: false, reason: "no_tasks_found" };
    }

    // 4. Idempotency: skip if already audited
    const taskMeta = (firstTask.metadata as Record<string, any>) || {};
    if (taskMeta.pre_audit) {
      log.info(`Task #${firstTask.id} already has pre_audit — skipping`);
      return { audited: false, reason: "already_audited" };
    }

    log.info(`Running pre-fix PageSpeed audit for client #${cs.client_id} (${client.website_url})`);

    // 5. Call PageSpeed API
    const psResult = await fetchPageSpeedInsights(client.website_url);
    if (!psResult) {
      return { audited: false, reason: "pagespeed_api_failed" };
    }

    // 6. AI analysis
    const { analysis, prioritizedFixes } = await analyzePreFixResults(
      psResult.metrics,
      client.business_name,
      client.website_url,
    );

    // 7. Build the audit result
    const auditResult: AuditResult = {
      audited_at: new Date().toISOString(),
      url: client.website_url,
      strategy: "mobile",
      metrics: psResult.metrics,
      ai_analysis: analysis,
      prioritized_fixes: prioritizedFixes,
      raw_lighthouse_categories: psResult.categories,
    };

    // 8. Store in task metadata
    await storage.updateFulfillmentTask(firstTask.id, {
      metadata: {
        ...taskMeta,
        pre_audit: auditResult,
      },
      description: buildEnhancedTaskDescription(firstTask.description, auditResult),
    } as any);

    // 9. Log activity
    await storage.logAdminActivity({
      actor_type: "system",
      actor_name: "WebFixAudit",
      action: "webfix.pre_audit_completed",
      entity_type: "fulfillment_task",
      entity_id: firstTask.id,
      summary: `Pre-fix audit complete for ${client.business_name}: performance ${psResult.metrics.performance_score}/100`,
      metadata: {
        client_id: cs.client_id,
        client_service_id: clientServiceId,
        performance_score: psResult.metrics.performance_score,
        fix_count: prioritizedFixes.length,
      },
    });

    log.info(`Pre-fix audit stored on task #${firstTask.id} — performance: ${psResult.metrics.performance_score}/100`);

    return { audited: true };
  } catch (err: any) {
    log.error(`Pre-fix audit failed for client_service #${clientServiceId}: ${err.message}`);
    return { audited: false, reason: `error: ${err.message}` };
  }
}

/**
 * Run the post-fix audit for a WebFix service.
 * Called from the service completion cascade when a WebFix service completes.
 *
 * Idempotent: skips if post_audit already exists on the last delivered task.
 */
export async function runPostFixAudit(clientServiceId: number): Promise<{
  audited: boolean;
  reason?: string;
}> {
  try {
    // 1. Load the client service
    const cs = await storage.getClientServiceById(clientServiceId);
    if (!cs) return { audited: false, reason: "client_service_not_found" };

    if (!cs.service_id.startsWith("webfix")) {
      return { audited: false, reason: "not_webfix_service" };
    }

    // 2. Get client's website URL
    const client = await storage.getClientById(cs.client_id);
    if (!client?.website_url) {
      return { audited: false, reason: "no_website_url" };
    }

    // 3. Find the last delivered task (the one to store post-audit on)
    const deliveredTasks = await db
      .select()
      .from(fulfillmentTasks)
      .where(
        and(
          eq(fulfillmentTasks.client_service_id, clientServiceId),
          eq(fulfillmentTasks.status, "delivered"),
        ),
      )
      .orderBy(desc(fulfillmentTasks.completed_at))
      .limit(1);

    const lastDeliveredTask = deliveredTasks[0];
    if (!lastDeliveredTask) {
      return { audited: false, reason: "no_delivered_tasks" };
    }

    // 4. Idempotency check
    const taskMeta = (lastDeliveredTask.metadata as Record<string, any>) || {};
    if (taskMeta.post_audit) {
      log.info(`Task #${lastDeliveredTask.id} already has post_audit — skipping`);
      return { audited: false, reason: "already_audited" };
    }

    // 5. Get pre-audit metrics for comparison
    const allTasks = await db
      .select({ metadata: fulfillmentTasks.metadata })
      .from(fulfillmentTasks)
      .where(eq(fulfillmentTasks.client_service_id, clientServiceId));

    let preAudit: AuditResult | null = null;
    for (const t of allTasks) {
      const m = (t.metadata as Record<string, any>) || {};
      if (m.pre_audit) {
        preAudit = m.pre_audit as AuditResult;
        break;
      }
    }

    log.info(`Running post-fix PageSpeed audit for client #${cs.client_id} (${client.website_url})`);

    // 6. Call PageSpeed API
    const psResult = await fetchPageSpeedInsights(client.website_url);
    if (!psResult) {
      return { audited: false, reason: "pagespeed_api_failed" };
    }

    // 7. Build comparison
    const preMetrics = preAudit?.metrics || {
      performance_score: 0, fcp_ms: 0, lcp_ms: 0, cls: 0, tbt_ms: 0, speed_index_ms: 0,
    };

    const comparison = {
      performance_delta: psResult.metrics.performance_score - preMetrics.performance_score,
      fcp_delta_ms: psResult.metrics.fcp_ms - preMetrics.fcp_ms,
      lcp_delta_ms: psResult.metrics.lcp_ms - preMetrics.lcp_ms,
      cls_delta: psResult.metrics.cls - preMetrics.cls,
      tbt_delta_ms: psResult.metrics.tbt_ms - preMetrics.tbt_ms,
      speed_index_delta_ms: psResult.metrics.speed_index_ms - preMetrics.speed_index_ms,
    };

    // 8. Generate before/after report via AI
    const { report, summary } = await generateBeforeAfterReport(
      preMetrics,
      psResult.metrics,
      client.business_name,
      client.website_url,
    );

    // 9. Build post-audit result
    const postAuditResult: PostAuditResult = {
      audited_at: new Date().toISOString(),
      url: client.website_url,
      strategy: "mobile",
      metrics: psResult.metrics,
      comparison,
      ai_report: report,
      improvements_summary: summary,
    };

    // 10. Store on the last delivered task
    const existingDeliverables = Array.isArray(lastDeliveredTask.deliverables)
      ? (lastDeliveredTask.deliverables as any[])
      : [];

    await storage.updateFulfillmentTask(lastDeliveredTask.id, {
      metadata: {
        ...taskMeta,
        post_audit: postAuditResult,
      },
      deliverables: [
        ...existingDeliverables,
        {
          kind: "report",
          url: "",   // no external URL — report stored in metadata
          label: `Performance Report: ${summary}`,
          uploaded_by: "system",
          uploaded_at: new Date().toISOString(),
        },
      ],
    } as any);

    // 11. Log activity
    await storage.logAdminActivity({
      actor_type: "system",
      actor_name: "WebFixAudit",
      action: "webfix.post_audit_completed",
      entity_type: "fulfillment_task",
      entity_id: lastDeliveredTask.id,
      summary: `Post-fix audit: ${summary}`,
      metadata: {
        client_id: cs.client_id,
        client_service_id: clientServiceId,
        pre_score: preMetrics.performance_score,
        post_score: psResult.metrics.performance_score,
        delta: comparison.performance_delta,
      },
    });

    log.info(`Post-fix audit stored on task #${lastDeliveredTask.id} — ${summary}`);

    return { audited: true };
  } catch (err: any) {
    log.error(`Post-fix audit failed for client_service #${clientServiceId}: ${err.message}`);
    return { audited: false, reason: `error: ${err.message}` };
  }
}

/* ─── Helpers ─── */

/**
 * Enhance the task description with audit results for the supplier brief.
 */
function buildEnhancedTaskDescription(existingDescription: string | null, audit: AuditResult): string {
  const lines: string[] = [];

  if (existingDescription) {
    lines.push(existingDescription);
    lines.push("");
  }

  lines.push("=== AUTOMATED PERFORMANCE AUDIT RESULTS ===");
  lines.push(`Website: ${audit.url}`);
  lines.push(`Audited: ${new Date(audit.audited_at).toLocaleDateString()}`);
  lines.push("");
  lines.push(`Performance Score: ${audit.metrics.performance_score}/100`);
  lines.push(`First Contentful Paint: ${Math.round(audit.metrics.fcp_ms)}ms`);
  lines.push(`Largest Contentful Paint: ${Math.round(audit.metrics.lcp_ms)}ms`);
  lines.push(`Cumulative Layout Shift: ${audit.metrics.cls.toFixed(3)}`);
  lines.push(`Total Blocking Time: ${Math.round(audit.metrics.tbt_ms)}ms`);
  lines.push(`Speed Index: ${Math.round(audit.metrics.speed_index_ms)}ms`);

  if (audit.metrics.accessibility_score != null) {
    lines.push(`Accessibility: ${audit.metrics.accessibility_score}/100`);
  }
  if (audit.metrics.seo_score != null) {
    lines.push(`SEO: ${audit.metrics.seo_score}/100`);
  }

  lines.push("");
  lines.push("=== AI-GENERATED ANALYSIS ===");
  lines.push(audit.ai_analysis);

  if (audit.prioritized_fixes.length > 0) {
    lines.push("");
    lines.push("=== PRIORITIZED FIX LIST ===");
    for (let i = 0; i < audit.prioritized_fixes.length; i++) {
      lines.push(`${i + 1}. ${audit.prioritized_fixes[i]}`);
    }
  }

  lines.push("");
  lines.push("Please address the issues listed above. Ensure all scores improve. Reply when done.");

  return lines.join("\n");
}
