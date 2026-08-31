/**
 * Portal WebCare Dashboard KPIs — Wave 31.
 *
 * GET /api/portal/webcare/dashboard-kpis
 *
 * Returns the hero KPIs for the /portal/webcare/dashboard surface.
 *
 * HONESTY CONTRACT (see the guard in dashboardKpis.test.ts)
 * ---------------------------------------------------------
 * Every number here must come from something we ACTUALLY measured. A KPI
 * we do not measure is reported as `null` ("Not measured") — never as a
 * zero, never as a score computed from absent inputs.
 *
 * A previous version scored security from seven `webcare_security_state`
 * flags (malware, SSL, WP core, plugins, themes, 2FA, weak passwords)
 * that NOTHING in the codebase ever wrote. Absent flags read as `false`,
 * so the weighted total was always 0 → every paying WebCare customer saw
 * a security grade of "F" (0/100) regardless of their site's real state.
 * The same class of bug zeroed performance, pending updates and backups,
 * and reported "100% uptime" for sites we had never once checked.
 *
 * What we genuinely measure today:
 *   - uptime_history        ← webcareHealthWorker, HTTP check every 15 min
 *   - last_health_report    ← webcareMaintenanceWorker (WordPress only):
 *                             ssl_valid, security_headers, outdated_plugins,
 *                             total_plugins, wordpress_version, checked_at
 *   - last_plugin_update    ← webcareMaintenanceWorker: updates_available
 *   - webcare_backups       ← webcareBackupWorker (weekly) + the 1-click
 *                             action. A row is only 'success' when a
 *                             restorable artifact exists (DB CHECK, 0100).
 *   - webcare_malware_scans ← the same worker: wordpress.org core-checksum
 *                             integrity + public-page signature scan.
 *
 * What we still do NOT measure (reported as null, never scored):
 *   - admin 2FA, weak-password auditing (no API access to either)
 *   - WordPress-core currency (we store the site's version but have no
 *     "latest release" reference to compare it against)
 *   - Lighthouse / performance scores — no measurement exists, so the
 *     "Monthly performance checks" claim was removed from the Pro tier
 *     rather than backed by an invented number.
 *
 * Response:
 *   securityGrade      { score, letter } | null   — null until measured
 *   securityFactors    only MEASURED factors; an unmeasured check is
 *                      omitted entirely rather than rendered as failing.
 *                      The malware factor appears only once a scan has
 *                      genuinely completed.
 *   uptimePct          number | null              — null with no checks
 *   daysWithoutIncident number | null
 *   performanceScore   null                       — not measured
 *   pendingUpdates     number | null              — real plugin updates
 *   backupTimeline30d  real rows from webcare_backups
 *   backupsTracked     true once a backup has been ATTEMPTED — so a site
 *                      with only failures shows red, not "not tracked"
 *
 * Auth: requireClient. adminPreviewSafe-wrapped.
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import {
  clients,
  clientServices,
  serviceCatalog,
  webcareBackups,
  webcareMalwareScans,
} from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalWebcareDashboardKpis");

interface SecurityFactor {
  key: string;
  label: string;
  weight: number;
  ok: boolean;
  detail?: string;
}

interface BackupEntry {
  date: string;            // YYYY-MM-DD
  status: "success" | "failed" | "pending";
  sizeBytes?: number;
  retentionDays?: number;
}

interface LastIncident {
  kindLabel: string;
  daysAgo: number;
  durationMinutes: number;
}

interface DashboardResponse {
  previewMode?: boolean;
  kpis: {
    /** null until a real health report exists. Never a score from absent data. */
    securityGrade: { score: number; letter: string } | null;
    /** null until the health worker has recorded at least one check. */
    uptimePct: number | null;
    daysWithoutIncident: number | null;
    /** Always null — we run no Lighthouse/performance measurement. */
    performanceScore: { desktop: number; mobile: number; avg: number } | null;
    /** Real plugin updates awaiting the next sweep; null until measured. */
    pendingUpdates: number | null;
  };
  /** Only checks we actually ran. An unmeasured check is omitted, not failed. */
  securityFactors: SecurityFactor[];
  backupTimeline30d: BackupEntry[];
  /** False = we do not run backups, so an empty strip must not read as "0 taken". */
  backupsTracked: boolean;
  /** True once uptime checks exist, so "never" can be distinguished from "unknown". */
  incidentHistoryTracked: boolean;
  lastIncident: LastIncident | null;
  bestStreakDays: number | null;
  hasWebcareService: boolean;
}

const EMPTY_RESPONSE = {
  previewMode: true,
  kpis: {
    securityGrade: null,
    uptimePct: null,
    daysWithoutIncident: null,
    performanceScore: null,
    pendingUpdates: null,
  },
  securityFactors: [] as SecurityFactor[],
  backupTimeline30d: [] as BackupEntry[],
  backupsTracked: false,
  incidentHistoryTracked: false,
  lastIncident: null as LastIncident | null,
  bestStreakDays: null,
  hasWebcareService: false,
} satisfies Record<string, unknown>;

/* ─── A-F mapping (matches LetterGradeBadge bands) ─────────────────── */
function letterFor(score: number): string {
  if (score >= 95) return "A++";
  if (score >= 90) return "A+";
  if (score >= 85) return "A";
  if (score >= 80) return "B+";
  if (score >= 75) return "B";
  if (score >= 70) return "C+";
  if (score >= 65) return "C";
  if (score >= 55) return "D";
  return "F";
}

interface CsRow {
  cs_id: number;
  cs_metadata: Record<string, unknown> | null;
}

interface UptimeEntry {
  ts: string;
  status: "up" | "down";
  http_status: number | null;
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function bool(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true";
  return fallback;
}

/**
 * Shape of `client_service.metadata.last_health_report`, written by
 * webcareMaintenanceWorker from services/wordpressMaintenance.HealthReport.
 * WordPress sites only — absent for every other stack.
 */
interface HealthReportSnapshot {
  ssl_valid?: unknown;
  security_headers?: unknown;
  outdated_plugins?: unknown;
  total_plugins?: unknown;
  checked_at?: unknown;
}

/**
 * Derive the security grade from checks we ACTUALLY ran.
 *
 * Only three signals are genuinely measured (webcareMaintenanceWorker →
 * runSiteHealthCheck): TLS validity, plugin patch level, and which
 * security response headers the site sends. Malware scanning, admin 2FA
 * and password auditing are NOT implemented, so they are not listed as
 * factors at all — showing them as failing checks would tell a customer
 * their site failed a test we never ran.
 *
 * Returns `grade: null` when no health report exists (no sweep yet, or a
 * non-WordPress site). Callers must render "not measured", never a 0/F.
 */
export function computeSecurity(csMeta: Record<string, unknown>): {
  grade: { score: number; letter: string } | null;
  factors: SecurityFactor[];
} {
  const report = csMeta.last_health_report as HealthReportSnapshot | undefined;
  if (!report || typeof report !== "object") {
    return { grade: null, factors: [] };
  }

  const factors: SecurityFactor[] = [];

  if (typeof report.ssl_valid === "boolean") {
    factors.push({
      key: "ssl_valid",
      label: "SSL certificate valid",
      weight: 40,
      ok: report.ssl_valid,
    });
  }

  const outdated = report.outdated_plugins;
  const total = report.total_plugins;
  if (typeof outdated === "number" && Number.isFinite(outdated)) {
    factors.push({
      key: "plugins_current",
      label: "All plugins up-to-date",
      weight: 35,
      ok: outdated === 0,
      detail: typeof total === "number"
        ? `${outdated} of ${total} plugins need an update`
        : `${outdated} plugin update(s) pending`,
    });
  }

  const headers = report.security_headers;
  if (headers && typeof headers === "object" && !Array.isArray(headers)) {
    const values = Object.values(headers as Record<string, unknown>);
    if (values.length > 0) {
      const present = values.filter((v) => v === true).length;
      factors.push({
        key: "security_headers",
        label: "Security headers present",
        weight: 25,
        ok: present === values.length,
        detail: `${present} of ${values.length} recommended headers set`,
      });
    }
  }

  if (factors.length === 0) return { grade: null, factors: [] };

  // Renormalise over the checks we actually ran so a partial sweep is not
  // silently penalised for the checks it could not perform.
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const earned = factors.reduce((sum, f) => (f.ok ? sum + f.weight : sum), 0);
  const score = Math.round((earned / totalWeight) * 100);

  return { grade: { score, letter: letterFor(score) }, factors };
}

function computeUptime(history: UptimeEntry[]): { pct: number | null; incident: LastIncident | null } {
  // No checks recorded → we do not know the uptime. Reporting 100% here
  // would claim perfect availability for a site we have never polled.
  if (history.length === 0) return { pct: null, incident: null };
  const upCount = history.filter((h) => h.status === "up").length;
  const pct = Math.round((upCount / history.length) * 10_000) / 100;

  // Locate the most recent "down" run for the lastIncident summary.
  const downs = history.filter((h) => h.status === "down");
  if (downs.length === 0) return { pct, incident: null };
  const lastDown = downs[downs.length - 1]!;
  const lastTs = new Date(lastDown.ts).getTime();
  const daysAgo = Math.max(0, Math.floor((Date.now() - lastTs) / 86_400_000));

  // Crude duration estimate — count contiguous downs at the end of the
  // most recent block (15 min per check spacing).
  let i = history.length - 1;
  let downSpan = 0;
  while (i >= 0 && history[i]!.status === "down") {
    downSpan += 1;
    i -= 1;
  }
  const durationMinutes = downSpan * 15;

  return {
    pct,
    incident: {
      kindLabel: "Site downtime",
      daysAgo,
      durationMinutes,
    },
  };
}

/**
 * Build the backup strip from RECORDED backup runs only.
 *
 * The old version padded every un-recorded day with a "pending" dot so the
 * strip always showed 30 entries, implying 30 scheduled-but-unfinished jobs
 * for a backup system that did not exist. It also read
 * `client_service.metadata.webcare_backups` — a key nothing ever wrote.
 *
 * It now reads the real `webcare_backups` table. A row can only carry
 * status='success' when a verifiable artifact exists (DB CHECK constraint,
 * migration 0100), so a green dot on this strip means a restorable archive
 * is genuinely in object storage.
 */
function buildBackupTimeline(
  backups: Array<{
    status: string;
    size_bytes: number | null;
    retention_days: number | null;
    started_at: Date | string;
  }>,
): BackupEntry[] {
  const out: BackupEntry[] = [];
  const cutoff = Date.now() - 30 * 86_400_000;
  for (const b of backups) {
    const d = b.started_at instanceof Date ? b.started_at : new Date(b.started_at);
    if (Number.isNaN(d.getTime()) || d.getTime() < cutoff) continue;
    // 'running' is genuinely pending — the only legitimate pending dot.
    const status: BackupEntry["status"] =
      b.status === "success" ? "success" : b.status === "failed" ? "failed" : "pending";
    out.push({
      date: d.toISOString().slice(0, 10),
      status,
      sizeBytes: typeof b.size_bytes === "number" ? b.size_bytes : undefined,
      retentionDays: typeof b.retention_days === "number" ? b.retention_days : undefined,
    });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

export async function computeWebcareDashboardKpis(
  clientId: number,
): Promise<Omit<DashboardResponse, "previewMode">> {
  // Find an active WebCare service for this client.
  const [svc] = await db
    .select({
      cs_id: clientServices.id,
      cs_metadata: clientServices.metadata,
    })
    .from(clientServices)
    .innerJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
    .where(
      and(
        eq(clientServices.client_id, clientId),
        sql`${serviceCatalog.id} LIKE 'webcare%'`,
        sql`${clientServices.status} IN ('active', 'onboarding')`,
      ),
    )
    .limit(1);

  if (!svc?.cs_id) {
    return {
      kpis: EMPTY_RESPONSE.kpis,
      securityFactors: EMPTY_RESPONSE.securityFactors,
      backupTimeline30d: EMPTY_RESPONSE.backupTimeline30d,
      backupsTracked: false,
      incidentHistoryTracked: false,
      lastIncident: null,
      bestStreakDays: null,
      hasWebcareService: false,
    };
  }

  const csMeta: Record<string, unknown> = (svc.cs_metadata as Record<string, unknown>) ?? {};
  const history = Array.isArray(csMeta.uptime_history)
    ? (csMeta.uptime_history as UptimeEntry[])
    : [];

  const { grade: securityGrade, factors: secFactors } = computeSecurity(csMeta);
  const { pct: uptimePct, incident } = computeUptime(history);

  // Days without incident — only meaningful once we have uptime checks to
  // count from. With no history at all this is unknown, not zero.
  const incidentHistoryTracked = history.length > 0;
  let daysWithoutIncident: number | null = null;
  if (incident) {
    daysWithoutIncident = incident.daysAgo;
  } else if (incidentHistoryTracked) {
    const firstTs = new Date(history[0]!.ts).getTime();
    daysWithoutIncident = Number.isFinite(firstTs)
      ? Math.max(0, Math.floor((Date.now() - firstTs) / 86_400_000))
      : null;
  }

  // No best-streak is persisted anywhere, so the only defensible value is
  // the current streak. Reporting a separate "record" would invent history.
  const bestStreakDays = daysWithoutIncident;

  // Performance: we run no Lighthouse job and nothing writes a perf score.
  // Reporting 0 rendered as "0/100 performance" for every customer.
  const performanceScore = null;

  // Pending updates — read the REAL maintenance snapshot. The old code read
  // `webcare_pending_updates`, a key nothing writes, so this always summed to
  // 0 and rendered a green "all clear" gauge even for sites with a dozen
  // outdated plugins. webcareMaintenanceWorker genuinely writes
  // `last_plugin_update.updates_available` on every monthly sweep.
  const lastPluginUpdate = csMeta.last_plugin_update as Record<string, unknown> | undefined;
  const pendingUpdates =
    lastPluginUpdate && typeof lastPluginUpdate === "object"
      && typeof lastPluginUpdate.updates_available === "number"
      ? num(lastPluginUpdate.updates_available)
      : null;

  // Real backup runs from the real table (weekly worker + 1-click action).
  const backupRows = await db
    .select({
      status: webcareBackups.status,
      size_bytes: webcareBackups.size_bytes,
      retention_days: webcareBackups.retention_days,
      started_at: webcareBackups.started_at,
    })
    .from(webcareBackups)
    .where(eq(webcareBackups.client_id, clientId))
    .orderBy(desc(webcareBackups.started_at))
    .limit(120);

  const backupTimeline30d = buildBackupTimeline(backupRows);

  // "Tracked" means a backup has genuinely been ATTEMPTED for this client —
  // not that one succeeded. A site with only failed runs must show red dots
  // and a real failure count, not fall back to a soothing "not tracked".
  const backupsTracked = backupRows.length > 0;

  // Real malware scans. A completed scan is a measured security signal, so
  // it joins the grade; an absent or failed scan is omitted entirely rather
  // than rendered as a failed check the customer never had run.
  const [lastScan] = await db
    .select({
      status: webcareMalwareScans.status,
      findings: webcareMalwareScans.findings,
      urls_scanned: webcareMalwareScans.urls_scanned,
      core_files_checked: webcareMalwareScans.core_files_checked,
      completed_at: webcareMalwareScans.completed_at,
    })
    .from(webcareMalwareScans)
    .where(
      and(
        eq(webcareMalwareScans.client_id, clientId),
        eq(webcareMalwareScans.status, "success"),
      ),
    )
    .orderBy(desc(webcareMalwareScans.started_at))
    .limit(1);

  let factors = secFactors;
  let grade = securityGrade;
  if (lastScan) {
    const findings = Array.isArray(lastScan.findings)
      ? (lastScan.findings as Array<{ severity?: string }>)
      : [];
    const critical = findings.filter((f) => f.severity === "critical").length;
    factors = [
      ...secFactors,
      {
        key: "malware_scan",
        label: "No known malware signatures",
        weight: 40,
        ok: critical === 0,
        detail:
          `${lastScan.urls_scanned} URL(s)` +
          (lastScan.core_files_checked > 0
            ? ` + ${lastScan.core_files_checked} WordPress core files`
            : "") +
          ` scanned · ${findings.length} finding(s)`,
      },
    ];
    // Re-normalise over the full factor set now that the scan is included.
    const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
    const earned = factors.reduce((s, f) => (f.ok ? s + f.weight : s), 0);
    const score = Math.round((earned / totalWeight) * 100);
    grade = { score, letter: letterFor(score) };
  }

  return {
    kpis: {
      securityGrade: grade,
      uptimePct,
      daysWithoutIncident,
      performanceScore,
      pendingUpdates,
    },
    securityFactors: factors,
    backupTimeline30d,
    backupsTracked,
    incidentHistoryTracked,
    lastIncident: incident,
    bestStreakDays,
    hasWebcareService: true,
  };
}

export function registerPortalWebcareDashboardKpisRoutes(app: Express) {
  app.get(
    "/api/portal/webcare/dashboard-kpis",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_RESPONSE,
        });
        if (clientId === null) return;

        const payload = await computeWebcareDashboardKpis(clientId);
        // suppress unused param-warning on `clients` reference
        void clients;
        res.json(payload);
      } catch (err: any) {
        log.error("[portal/webcare/dashboard-kpis]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
