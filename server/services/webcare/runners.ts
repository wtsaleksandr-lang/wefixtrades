/**
 * WebCare work runners — the single place that turns "customer asked for a
 * backup / a malware scan" into the work actually happening and being
 * recorded.
 *
 * Both the scheduled worker and the portal's 1-click actions call these, so
 * there is exactly one code path per capability and no way for the button to
 * drift back into reporting work the worker alone performs.
 *
 * Every runner:
 *   - resolves real credentials (or reports honestly that it cannot),
 *   - does the real work,
 *   - persists the real result (webcare_backups / webcare_malware_scans),
 *   - writes ONE webcare_action_log row describing WHAT HAPPENED, in the
 *     past tense, only after it happened.
 *
 * The removed version wrote its log row up-front with text like "Backup
 * queued. The backup timeline will show a new green dot when it completes"
 * and then did nothing whatsoever. That is the defect class this file
 * exists to make structurally impossible.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  clients,
  clientServices,
  serviceCatalog,
  webcareActionLog,
  webcareMalwareScans,
} from "@shared/schema";
import { createLogger } from "../../lib/logger";
import { resolveWpCredentials } from "./credentials";
import { captureBackup } from "./backupService";
import { scanSite, summariseScan } from "./malwareScanner";
import type { MalwareFinding } from "./malwareScanner";
import { checkPluginUpdates, applyPluginUpdates } from "../wordpressMaintenance";

const log = createLogger("WebCareRunners");

export interface WebcareSiteContext {
  csId: number;
  clientId: number;
  websiteUrl: string | null;
  metadata: Record<string, any>;
}

/** Resolve the client's active WebCare service + the data the runners need. */
export async function loadWebcareContext(
  clientId: number,
): Promise<WebcareSiteContext | null> {
  const [row] = await db
    .select({
      cs_id: clientServices.id,
      cs_metadata: clientServices.metadata,
      website_url: clients.website_url,
    })
    .from(clientServices)
    .innerJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
    .innerJoin(clients, eq(clientServices.client_id, clients.id))
    .where(
      and(
        eq(clientServices.client_id, clientId),
        sql`${serviceCatalog.id} LIKE 'webcare%'`,
        sql`${clientServices.status} IN ('active', 'onboarding')`,
      ),
    )
    .limit(1);

  if (!row?.cs_id) return null;
  return {
    csId: row.cs_id,
    clientId,
    websiteUrl: row.website_url,
    metadata: (row.cs_metadata as Record<string, any>) ?? {},
  };
}

async function logAction(params: {
  clientId: number;
  csId: number | null;
  eventType: "updates" | "security" | "performance" | "backups" | "other";
  severity: "info" | "success" | "warning" | "failed";
  technical: string;
  plain: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(webcareActionLog).values({
      client_id: params.clientId,
      client_service_id: params.csId,
      event_type: params.eventType,
      severity: params.severity,
      technical_summary: params.technical,
      plain_language_summary: params.plain,
      expanded_detail: (params.detail ?? {}) as Record<string, unknown>,
    });
  } catch (err: any) {
    // The work already happened; failing to narrate it must not undo it.
    log.warn("action-log insert failed", {
      clientId: String(params.clientId),
      error: err?.message,
    });
  }
}

export interface RunnerOutcome {
  ok: boolean;
  message: string;
  errorCode?: string;
}

/* ─── Backup ────────────────────────────────────────────────────────── */

/**
 * Capture a content backup now and report what genuinely happened.
 *
 * Returns ok:false with a plain reason when the site has no stored
 * WordPress credentials — because without them there is no backup, and
 * saying otherwise is the lie this rewrite removes.
 */
export async function runBackupNow(
  ctx: WebcareSiteContext,
  trigger: "manual" | "scheduled",
): Promise<RunnerOutcome> {
  const creds = await resolveWpCredentials(ctx.clientId, ctx.metadata);
  if (!creds) {
    return {
      ok: false,
      errorCode: "credentials_missing",
      message:
        "We don't have WordPress access for your site yet, so there's nothing we can back up. " +
        "Send us an Application Password from WordPress (Users → Profile → Application Passwords) and backups start immediately.",
    };
  }

  const res = await captureBackup({
    clientId: ctx.clientId,
    clientServiceId: ctx.csId,
    credentials: creds,
    trigger,
  });

  if (!res.ok) {
    await logAction({
      clientId: ctx.clientId,
      csId: ctx.csId,
      eventType: "backups",
      severity: "failed",
      technical: `webcare.backup(trigger=${trigger}) -> failed`,
      plain: `Backup failed: ${res.error ?? "unknown error"}`,
      detail: { backup_id: res.backupId, error: res.error },
    });
    return { ok: false, errorCode: "backup_failed", message: `Backup failed: ${res.error}` };
  }

  const counts = res.itemCounts ?? {};
  const items = Object.values(counts).reduce((a, b) => a + b, 0);
  const kb = Math.max(1, Math.round((res.sizeBytes ?? 0) / 1024));
  const plain =
    `Content backup completed — ${items} items (${counts.posts ?? 0} posts, ` +
    `${counts.pages ?? 0} pages), ${kb} KB stored.`;

  await logAction({
    clientId: ctx.clientId,
    csId: ctx.csId,
    eventType: "backups",
    severity: "success",
    technical: `webcare.backup(trigger=${trigger}) -> ok sha256=${res.sha256?.slice(0, 12)}…`,
    plain,
    detail: { backup_id: res.backupId, size_bytes: res.sizeBytes, item_counts: counts },
  });

  return { ok: true, message: plain };
}

/* ─── Apply pending updates ─────────────────────────────────────────── */

/**
 * Apply the safe (minor/patch) plugin updates now, using the same
 * machinery the monthly maintenance sweep uses. Major-version bumps are
 * deliberately left for the sweep's human-reviewable path — auto-applying
 * a major update is how a working site becomes a broken one.
 *
 * A content backup is captured FIRST. The old copy claimed "A fresh backup
 * runs first" while running neither the backup nor the updates; now the
 * claim is true, and if the backup cannot be taken the customer is told
 * that before anything is changed.
 */
export async function runApplyUpdatesNow(
  ctx: WebcareSiteContext,
  trigger: "manual" | "scheduled",
): Promise<RunnerOutcome> {
  const creds = await resolveWpCredentials(ctx.clientId, ctx.metadata);
  if (!creds) {
    return {
      ok: false,
      errorCode: "credentials_missing",
      message:
        "We don't have WordPress access for your site yet, so we can't apply updates. " +
        "Send us an Application Password from WordPress (Users → Profile → Application Passwords).",
    };
  }

  const backup = await runBackupNow(ctx, trigger);
  if (!backup.ok) {
    return {
      ok: false,
      errorCode: "backup_before_update_failed",
      message: `We stopped before touching your site: the safety backup failed. ${backup.message}`,
    };
  }

  const check = await checkPluginUpdates(creds);
  if (!check.ok) {
    return {
      ok: false,
      errorCode: "update_check_failed",
      message: `Couldn't read your plugin list: ${check.error ?? "unknown error"}`,
    };
  }

  const safe = check.plugins.filter((p) => p.update_available && !p.is_major_update).map((p) => p.plugin);
  const major = check.plugins.filter((p) => p.update_available && p.is_major_update).length;

  if (safe.length === 0) {
    const plain =
      major > 0
        ? `No safe updates to apply. ${major} major update${major === 1 ? "" : "s"} held back for manual review.`
        : "No plugin updates were pending.";
    await logAction({
      clientId: ctx.clientId,
      csId: ctx.csId,
      eventType: "updates",
      severity: "info",
      technical: `webcare.apply_updates(trigger=${trigger}) -> 0 applied, ${major} major held`,
      plain,
      detail: { applied: 0, major_held: major },
    });
    return { ok: true, message: plain };
  }

  const applied = await applyPluginUpdates(creds, safe);
  const plain =
    `Applied ${applied.updates_applied} of ${safe.length} safe plugin update${safe.length === 1 ? "" : "s"}` +
    (major > 0 ? `; ${major} major update${major === 1 ? "" : "s"} held back for manual review` : "") +
    (applied.errors.length > 0 ? `; ${applied.errors.length} failed` : "") + ".";

  await logAction({
    clientId: ctx.clientId,
    csId: ctx.csId,
    eventType: "updates",
    severity: applied.errors.length > 0 ? "warning" : "success",
    technical:
      `webcare.apply_updates(trigger=${trigger}) -> ${applied.updates_applied}/${safe.length} applied, ` +
      `${applied.errors.length} errors, ${major} major held`,
    plain,
    detail: {
      applied: applied.updates_applied,
      attempted: safe.length,
      major_held: major,
      errors: applied.errors,
      results: applied.results,
    },
  });

  return { ok: true, message: plain };
}

/* ─── Malware scan ──────────────────────────────────────────────────── */

/**
 * Run a malware scan now and store the real findings.
 *
 * A scan that cannot reach the site is persisted as status='failed'. It is
 * never stored as a successful scan with an empty findings array — that
 * would render to the customer as a clean bill of health for a check that
 * never ran.
 */
export async function runMalwareScanNow(
  ctx: WebcareSiteContext,
  trigger: "manual" | "scheduled",
): Promise<RunnerOutcome> {
  // The scan works over plain HTTP against the public site, so it needs a
  // URL but no credentials. Prefer the maintenance URL, fall back to the
  // client's website_url.
  const storedUrl =
    (ctx.metadata?.wordpress_credentials?.cms_url as string | undefined) ??
    ctx.websiteUrl ??
    null;

  if (!storedUrl) {
    return {
      ok: false,
      errorCode: "no_site_url",
      message: "We don't have a website address on file for you yet, so there's nothing to scan.",
    };
  }

  const wpVersion =
    (ctx.metadata?.last_health_report?.wordpress_version as string | undefined) ?? null;

  const [row] = await db
    .insert(webcareMalwareScans)
    .values({
      client_id: ctx.clientId,
      client_service_id: ctx.csId,
      status: "running",
      trigger,
      source_url: storedUrl,
      core_version: wpVersion,
    })
    .returning({ id: webcareMalwareScans.id });
  const scanId = row!.id;

  const res = await scanSite({ siteUrl: storedUrl, wordpressVersion: wpVersion });

  if (!res.ok) {
    await db
      .update(webcareMalwareScans)
      .set({ status: "failed", error: (res.error ?? "unknown").slice(0, 2000), completed_at: new Date() })
      .where(eq(webcareMalwareScans.id, scanId));
    await logAction({
      clientId: ctx.clientId,
      csId: ctx.csId,
      eventType: "security",
      severity: "failed",
      technical: `webcare.malware_scan(trigger=${trigger}) -> failed`,
      plain: `Malware scan couldn't run: ${res.error}`,
      detail: { scan_id: scanId, error: res.error },
    });
    return { ok: false, errorCode: "scan_failed", message: `Malware scan couldn't run: ${res.error}` };
  }

  await db
    .update(webcareMalwareScans)
    .set({
      status: "success",
      findings: res.findings as unknown as MalwareFinding[],
      urls_scanned: res.urlsScanned,
      core_version: res.coreVersion,
      core_files_checked: res.coreFilesChecked,
      core_files_modified: res.coreFilesModified,
      completed_at: new Date(),
    })
    .where(eq(webcareMalwareScans.id, scanId));

  const summary = summariseScan(res);
  const critical = res.findings.filter((f) => f.severity === "critical").length;

  await logAction({
    clientId: ctx.clientId,
    csId: ctx.csId,
    eventType: "security",
    severity: critical > 0 ? "warning" : "success",
    technical:
      `webcare.malware_scan(trigger=${trigger}) -> ${res.findings.length} finding(s), ` +
      `${res.urlsScanned} urls, ${res.coreFilesChecked} core files`,
    plain: summary,
    detail: {
      scan_id: scanId,
      findings: res.findings,
      urls_scanned: res.urlsScanned,
      core_files_checked: res.coreFilesChecked,
      core_files_modified: res.coreFilesModified,
    },
  });

  return { ok: true, message: summary };
}
