/**
 * WebCare Maintenance Worker
 *
 * Runs monthly (1st of each month at 03:00 UTC). For each active WebCare
 * client_service:
 *
 * 1. Looks up WordPress credentials from rankflow_profiles.credentials.wordpress
 *    OR from client_service.metadata.wordpress_credentials
 * 2. If no credentials — creates an internal task and skips
 * 3. Runs plugin update check — logs results
 * 4. Applies safe updates (minor/patch only, not major)
 * 5. Runs site health check — stores results in client_service metadata
 * 6. Generates monthly report using Claude
 * 7. Marks the recurring "Apply software updates" task as delivered
 *
 * Wrapped by `runJob()` in the scheduler — retry-with-backoff (3 attempts)
 * and job-log database row provided by the wrapper.
 */

import { db } from "../db";
import { storage } from "../storage";
import { clients, clientServices } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import {
  decryptToken,
  isEncryptionConfigured,
} from "../services/socialSync/tokenEncryption";
import {
  checkPluginUpdates,
  applyPluginUpdates,
  runSiteHealthCheck,
} from "../services/wordpressMaintenance";
import type { WpCredentials, PluginUpdateResult, HealthReport } from "../services/wordpressMaintenance";
import { chat as aiChat } from "../services/aiService";
import { generateAndPublishMonthlyContent } from "../services/webcareContentAutomation";
import { detectClientPlatform } from "../services/contentflow/cmsRouter";
import { fulfillmentTasks } from "@shared/schema";

const log = createLogger("WebCareMaintenance");

/* ─── Types ────────────────────────────────────────────────────────── */

interface MaintenanceResult {
  servicesProcessed: number;
  servicesSkipped: number;
  pluginUpdatesApplied: number;
  healthChecksRun: number;
  reportsGenerated: number;
  credentialTasksCreated: number;
  errors: number;
}

interface StoredWpCreds {
  cms_url: string;
  cms_username: string;
  cms_app_password: string; // encrypted
}

/* ─── Month prefix (matches recurringTaskWorker convention) ──────── */

function getMonthPrefix(date: Date = new Date()): string {
  return date.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/* ─── Credential Resolver ──────────────────────────────────────────── */

/**
 * Attempt to find WordPress credentials from multiple locations:
 * 1. client_service.metadata.wordpress_credentials (set by onboarding)
 * 2. rankflow_profiles.credentials.wordpress (shared with RankFlow)
 *
 * Returns decrypted credentials or null.
 */
async function resolveWpCredentials(
  clientId: number,
  csMetadata: Record<string, any>,
): Promise<WpCredentials | null> {
  if (!isEncryptionConfigured()) {
    log.warn("TOKEN_ENCRYPTION_KEY not set — cannot decrypt WordPress credentials");
    return null;
  }

  // Check 1: client_service.metadata.wordpress_credentials
  const csMeta = csMetadata?.wordpress_credentials as StoredWpCreds | undefined;
  if (csMeta?.cms_url && csMeta?.cms_username && csMeta?.cms_app_password) {
    try {
      return {
        cms_url: csMeta.cms_url,
        cms_username: csMeta.cms_username,
        cms_app_password: decryptToken(csMeta.cms_app_password),
      };
    } catch (err: any) {
      log.warn("Failed to decrypt credentials from client_service metadata", {
        clientId: String(clientId),
        error: err.message,
      });
    }
  }

  // Check 2: rankflow_profiles.credentials.wordpress
  try {
    const profile = await storage.getRankFlowProfile(clientId) as any;
    if (profile?.credentials?.wordpress) {
      const wp = profile.credentials.wordpress as StoredWpCreds;
      if (wp.cms_url && wp.cms_username && wp.cms_app_password) {
        return {
          cms_url: wp.cms_url,
          cms_username: wp.cms_username,
          cms_app_password: decryptToken(wp.cms_app_password),
        };
      }
    }
  } catch (err: any) {
    log.warn("Failed to load RankFlow profile credentials", {
      clientId: String(clientId),
      error: err.message,
    });
  }

  return null;
}

/* ─── Report Generator ─────────────────────────────────────────────── */

async function generateMonthlyReport(
  businessName: string,
  pluginResult: PluginUpdateResult | null,
  healthReport: HealthReport | null,
  uptimePercent: number | null,
): Promise<string> {
  const systemPrompt = `You are a professional website maintenance report writer for WeFixTrades.
Write a concise monthly maintenance report for a trades business website.
Be factual and clear. No marketing fluff. Use plain language.
Format as clean text with sections. Keep it under 500 words.`;

  const userPrompt = `Write a monthly WebCare maintenance report for "${businessName}".

Data:
- Uptime: ${uptimePercent !== null ? `${uptimePercent.toFixed(1)}%` : "not tracked this period"}
- Plugins total: ${pluginResult?.total_plugins ?? "unknown"}
- Plugin updates available: ${pluginResult?.updates_available ?? "unknown"}
- Plugin updates applied: ${pluginResult?.ok ? (pluginResult.plugins.filter(p => !p.update_available).length) : "none (check failed)"}
- WordPress version: ${healthReport?.wordpress_version ?? "unknown"}
- SSL valid: ${healthReport?.ssl_valid ? "yes" : "no / unknown"}
- Security headers present: ${healthReport ? Object.entries(healthReport.security_headers).filter(([_, v]) => v).map(([k]) => k).join(", ") || "none detected" : "not checked"}
- Site reachable: ${healthReport?.site_reachable ? "yes" : "no / not checked"}
- Response time: ${healthReport?.response_time_ms ? `${healthReport.response_time_ms}ms` : "not measured"}
- Health check issues: ${healthReport?.errors?.length ? healthReport.errors.join("; ") : "none"}

Summarize: uptime, plugin updates done, security status, any issues found.`;

  try {
    const report = await aiChat({
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 800,
      // audit/ai 2026-05-24: monthly WebCare report shares the wft_audit
      // surface — same product (WebFix), same narrative-generation profile.
      surface: "wft_audit",
    });
    return report;
  } catch (err: any) {
    log.error("AI report generation failed", { error: err.message });
    return `Monthly WebCare Report for ${businessName}\n\nAutomated report generation failed. Manual review required.\n\nPlugin updates: ${pluginResult?.updates_available ?? "unknown"} available\nSite reachable: ${healthReport?.site_reachable ? "yes" : "unknown"}\nSSL: ${healthReport?.ssl_valid ? "valid" : "unknown"}`;
  }
}

/* ─── Uptime Calculator ────────────────────────────────────────────── */

function calculateUptimePercent(metadata: Record<string, any>): number | null {
  const history = metadata?.uptime_history as Array<{ status: string }> | undefined;
  if (!Array.isArray(history) || history.length === 0) return null;

  // Look at last 30 days of checks (~2880 at 15-min intervals)
  const recent = history.slice(-2880);
  const upCount = recent.filter(h => h.status === "up").length;
  return (upCount / recent.length) * 100;
}

/* ─── Main Worker ──────────────────────────────────────────────────── */

export async function processWebcareMaintenance(): Promise<MaintenanceResult> {
  const monthPrefix = getMonthPrefix();
  log.info(`Starting monthly maintenance for ${monthPrefix}`);

  const result: MaintenanceResult = {
    servicesProcessed: 0,
    servicesSkipped: 0,
    pluginUpdatesApplied: 0,
    healthChecksRun: 0,
    reportsGenerated: 0,
    credentialTasksCreated: 0,
    errors: 0,
  };

  // Query all active WebCare client_services
  const rows = await db
    .select({
      cs_id: clientServices.id,
      cs_client_id: clientServices.client_id,
      cs_service_id: clientServices.service_id,
      cs_metadata: clientServices.metadata,
      client_business_name: clients.business_name,
      client_website_url: clients.website_url,
    })
    .from(clientServices)
    .innerJoin(clients, eq(clientServices.client_id, clients.id))
    .where(
      and(
        sql`${clientServices.service_id} LIKE 'webcare%'`,
        eq(clientServices.status, "active"),
        eq(clientServices.enabled, true),
      ),
    );

  for (const row of rows) {
    try {
      result.servicesProcessed++;
      const csMeta = (row.cs_metadata as Record<string, any>) || {};

      // Idempotency: skip if already processed this month
      if (csMeta.last_maintenance_period === monthPrefix) {
        log.debug(`Skipping cs#${row.cs_id} — already processed for ${monthPrefix}`);
        result.servicesSkipped++;
        continue;
      }

      // Step 0: Detect CMS platform for this client
      const clientPlatform = await detectClientPlatform(row.cs_client_id, row.cs_id) || "wordpress";
      const isWordPress = clientPlatform === "wordpress";

      // Step 1: Resolve WordPress credentials (only needed for WP clients)
      let wpCreds: WpCredentials | null = null;
      if (isWordPress) {
        wpCreds = await resolveWpCredentials(row.cs_client_id, csMeta);

        if (!wpCreds) {
          log.info(`No WordPress credentials for cs#${row.cs_id} — creating credential collection task`);

          // Check if we already have a pending credential task
          const existingCredTasks = await db
            .select({ id: sql<number>`id` })
            .from(sql`fulfillment_tasks`)
            .where(
              and(
                eq(sql`client_service_id`, row.cs_id),
                sql`title LIKE '%Collect WordPress credentials%'`,
                sql`status NOT IN ('delivered', 'cancelled')`,
              ),
            )
            .limit(1);

          if (existingCredTasks.length === 0) {
            await storage.createFulfillmentTask({
              client_service_id: row.cs_id,
              client_id: row.cs_client_id,
              title: `${monthPrefix}: Collect WordPress credentials`,
              description: `WordPress Application Password credentials are required for automated maintenance. ` +
                `Contact the client and request they generate an Application Password from their WordPress admin ` +
                `(Users → Profile → Application Passwords). Store the credentials via the onboarding form or admin panel.`,
              status: "not_started",
              priority: "high",
              handled_by: "internal",
              waiting_on: "client",
              actor_type: "system",
              metadata: {
                type: "credential_collection",
                source: "webcare_maintenance_worker",
                period: monthPrefix,
              },
            });
            result.credentialTasksCreated++;
          }

          result.servicesSkipped++;
          continue;
        }
      } else {
        log.info(`Skipping plugin updates — client uses ${clientPlatform}, not WordPress`, {
          csId: String(row.cs_id),
          clientId: String(row.cs_client_id),
          platform: clientPlatform,
        });
      }

      // Step 2: Check plugin updates (WordPress only)
      let pluginResult: PluginUpdateResult | null = null;
      if (isWordPress && wpCreds) {
        try {
          pluginResult = await checkPluginUpdates(wpCreds);
          log.info(`Plugin check for cs#${row.cs_id}: ${pluginResult.total_plugins} total, ${pluginResult.updates_available} updates`);
        } catch (err: any) {
          log.error(`Plugin check failed for cs#${row.cs_id}`, { error: err.message });
        }

        // Step 3: Apply safe updates (minor/patch only)
        if (pluginResult?.ok && pluginResult.updates_available > 0) {
          const safeUpdates = pluginResult.plugins
            .filter(p => p.update_available && !p.is_major_update)
            .map(p => p.plugin);

          if (safeUpdates.length > 0) {
            try {
              const applyResult = await applyPluginUpdates(wpCreds, safeUpdates);
              result.pluginUpdatesApplied += applyResult.updates_applied;
              log.info(`Applied ${applyResult.updates_applied}/${safeUpdates.length} plugin updates for cs#${row.cs_id}`);

              if (applyResult.errors.length > 0) {
                log.warn(`Plugin update errors for cs#${row.cs_id}`, {
                  errors: applyResult.errors.map(e => `${e.plugin}: ${e.error}`).join("; "),
                });
              }
            } catch (err: any) {
              log.error(`Plugin update failed for cs#${row.cs_id}`, { error: err.message });
            }
          }

          // Log major updates that were skipped
          const majorUpdates = pluginResult.plugins.filter(p => p.update_available && p.is_major_update);
          if (majorUpdates.length > 0) {
            log.info(`Skipped ${majorUpdates.length} major plugin updates for cs#${row.cs_id}: ${majorUpdates.map(p => `${p.name} ${p.version} → ${p.update_version}`).join(", ")}`);
          }
        }
      }

      // Step 4: Run site health check (WordPress only)
      let healthReport: HealthReport | null = null;
      if (isWordPress && wpCreds) {
        try {
          healthReport = await runSiteHealthCheck(wpCreds);
          result.healthChecksRun++;
          log.info(`Health check for cs#${row.cs_id}: reachable=${healthReport.site_reachable}, ssl=${healthReport.ssl_valid}, wp=${healthReport.wordpress_version}`);
        } catch (err: any) {
          log.error(`Health check failed for cs#${row.cs_id}`, { error: err.message });
        }
      }

      // Step 5: Calculate uptime and generate report
      const uptimePercent = calculateUptimePercent(csMeta);
      let reportText: string | null = null;
      try {
        reportText = await generateMonthlyReport(
          row.client_business_name,
          pluginResult,
          healthReport,
          uptimePercent,
        );
        result.reportsGenerated++;
      } catch (err: any) {
        log.error(`Report generation failed for cs#${row.cs_id}`, { error: err.message });
      }

      // Step 6: Update client_service metadata with results
      const updatedMeta = {
        ...csMeta,
        last_maintenance_period: monthPrefix,
        last_maintenance_at: new Date().toISOString(),
        last_health_report: healthReport ? {
          wordpress_version: healthReport.wordpress_version,
          ssl_valid: healthReport.ssl_valid,
          security_headers: healthReport.security_headers,
          outdated_plugins: healthReport.outdated_plugins,
          total_plugins: healthReport.total_plugins,
          response_time_ms: healthReport.response_time_ms,
          checked_at: healthReport.checked_at,
        } : csMeta.last_health_report,
        last_plugin_update: pluginResult ? {
          total_plugins: pluginResult.total_plugins,
          updates_available: pluginResult.updates_available,
          checked_at: new Date().toISOString(),
        } : csMeta.last_plugin_update,
        monthly_report: reportText || csMeta.monthly_report,
        uptime_percent: uptimePercent,
      };

      await db.update(clientServices)
        .set({
          metadata: updatedMeta,
          updated_at: new Date(),
        } as any)
        .where(eq(clientServices.id, row.cs_id));

      // Step 7: Mark the recurring "Apply software updates" task as delivered
      try {
        const updateTasks = await db
          .select({ id: sql<number>`id` })
          .from(sql`fulfillment_tasks`)
          .where(
            and(
              eq(sql`client_service_id`, row.cs_id),
              sql`title LIKE ${monthPrefix + ':%'}`,
              sql`title LIKE '%software updates%'`,
              sql`status NOT IN ('delivered', 'cancelled')`,
            ),
          )
          .limit(1);

        if (updateTasks.length > 0) {
          await storage.updateFulfillmentTask(updateTasks[0].id, {
            status: "delivered",
            completed_at: new Date(),
            last_action: "Automated maintenance completed",
            actor_type: "system",
            metadata: {
              source: "webcare_maintenance_worker",
              plugin_updates_applied: result.pluginUpdatesApplied,
              health_report_generated: !!healthReport,
              monthly_report_generated: !!reportText,
              period: monthPrefix,
            },
          });
        }
      } catch (err: any) {
        log.warn(`Failed to mark software update task delivered for cs#${row.cs_id}`, { error: err.message });
      }

      // Step 8: Process content change tasks (WebCare Pro — 4 content changes/month)
      // Look for open content change tasks for this period
      try {
        const contentTasks = await db
          .select({ id: fulfillmentTasks.id })
          .from(fulfillmentTasks)
          .where(
            and(
              eq(fulfillmentTasks.client_service_id, row.cs_id),
              sql`${fulfillmentTasks.title} LIKE ${monthPrefix + ':%'}`,
              sql`(${fulfillmentTasks.title} LIKE '%content change%' OR ${fulfillmentTasks.title} LIKE '%content update%' OR ${fulfillmentTasks.title} LIKE '%blog post%')`,
              sql`${fulfillmentTasks.status} NOT IN ('delivered', 'cancelled')`,
            ),
          );

        for (const ct of contentTasks) {
          try {
            const contentResult = await generateAndPublishMonthlyContent(
              row.cs_client_id,
              row.cs_id,
            );
            if (contentResult.published) {
              await storage.updateFulfillmentTask(ct.id, {
                status: "delivered",
                completed_at: new Date(),
                last_action: `Blog post published: "${contentResult.title}"`,
                actor_type: "system",
                metadata: {
                  source: "webcare_content_automation",
                  content_title: contentResult.title,
                  content_draft_id: contentResult.draft_id,
                  published_at: new Date().toISOString(),
                  period: monthPrefix,
                },
              });
              log.info(`Content change delivered for cs#${row.cs_id}: "${contentResult.title}"`);
            } else {
              log.warn(`Content change failed for cs#${row.cs_id}: ${contentResult.error}`);
            }
          } catch (err: any) {
            log.error(`Content change error for task#${ct.id}`, { error: err.message });
          }
        }
      } catch (err: any) {
        log.warn(`Failed to process content change tasks for cs#${row.cs_id}`, { error: err.message });
      }

      // Log activity
      try {
        await storage.logAdminActivity({
          actor_type: "system",
          actor_name: "WebCare Maintenance Worker",
          action: "webcare.monthly_maintenance",
          entity_type: "client_service",
          entity_id: row.cs_id,
          summary: `Monthly maintenance completed for ${row.client_business_name}: ` +
            `${result.pluginUpdatesApplied} plugin updates, ` +
            `health check ${healthReport ? "passed" : "skipped"}, ` +
            `report ${reportText ? "generated" : "skipped"}`,
          metadata: {
            period: monthPrefix,
            plugins_updated: result.pluginUpdatesApplied,
            health_check: !!healthReport,
            report_generated: !!reportText,
          },
        });
      } catch (err: any) {
        log.warn("Failed to log maintenance activity", { error: err.message });
      }
    } catch (err: any) {
      log.error(`Error processing cs#${row.cs_id}`, { error: err.message });
      result.errors++;
    }
  }

  log.info(
    `Complete: ${result.servicesProcessed} processed, ${result.servicesSkipped} skipped, ` +
    `${result.pluginUpdatesApplied} plugins updated, ${result.healthChecksRun} health checks, ` +
    `${result.reportsGenerated} reports, ${result.credentialTasksCreated} credential tasks, ` +
    `${result.errors} errors`,
  );

  return result;
}
