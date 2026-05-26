/**
 * Portal WebCare Dashboard KPIs — Wave 31.
 *
 * GET /api/portal/webcare/dashboard-kpis
 *
 * Returns the hero KPIs for the new /portal/webcare/dashboard surface:
 *
 *   1. securityGrade        — A-F letter grade + numeric score from the
 *                             weighted formula (malware, SSL, WP core,
 *                             plugins, themes, 2FA, weak-passwords).
 *   2. uptimePct            — rolling 90-day uptime %, with last-incident
 *                             metadata + a target threshold of 99.9.
 *   3. daysWithoutIncident  — gamified counter; resets to 0 on incidents,
 *                             tracks best streak in client metadata.
 *   4. performanceScore     — daily Google Lighthouse avg (desktop + mobile)
 *                             pulled from client_service metadata if wired,
 *                             else falls back to a fresh estimate.
 *   5. pendingUpdates       — count of plugin/theme/core updates available.
 *
 *  Plus auxiliary data:
 *   - securityFactors: array of {key, weight, label, ok} feeding the
 *     "Why this grade?" expander on the SecurityScoreCard.
 *   - backupTimeline30d: 30 daily entries {date, status, sizeBytes?, retentionDays?}
 *     for the BackupTimeline strip.
 *   - lastIncident: { kindLabel, daysAgo, durationMinutes } | null
 *   - bestStreakDays: highest historical days-without-incident value
 *
 * Source: aggregated from `clients.metadata.webcare_*` + `client_service.metadata`
 * (uptime_history, last_*_at) populated by the existing webcareHealthWorker
 * / webcareMaintenanceWorker. When no WebCare service exists, an empty
 * preview shape renders the dashboard gracefully.
 *
 * Auth: requireClient. adminPreviewSafe-wrapped.
 */

import type { Express, Request, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { clients, clientServices, serviceCatalog } from "@shared/schema";
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
    securityGrade: { score: number; letter: string };
    uptimePct: number;
    daysWithoutIncident: number;
    performanceScore: { desktop: number; mobile: number; avg: number };
    pendingUpdates: number;
  };
  securityFactors: SecurityFactor[];
  backupTimeline30d: BackupEntry[];
  lastIncident: LastIncident | null;
  bestStreakDays: number;
  hasWebcareService: boolean;
}

const EMPTY_RESPONSE = {
  previewMode: true,
  kpis: {
    securityGrade: { score: 0, letter: "F" },
    uptimePct: 0,
    daysWithoutIncident: 0,
    performanceScore: { desktop: 0, mobile: 0, avg: 0 },
    pendingUpdates: 0,
  },
  securityFactors: [] as SecurityFactor[],
  backupTimeline30d: [] as BackupEntry[],
  lastIncident: null as LastIncident | null,
  bestStreakDays: 0,
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
 * Compute the weighted security score (0-100) from the latest health
 * snapshot stored on client_service.metadata.webcare_security_state.
 * If the worker hasn't written one yet, every factor is treated as
 * "warning" — score 50, letter "F".
 */
function computeSecurity(state: Record<string, unknown>): {
  score: number;
  factors: SecurityFactor[];
} {
  const factorDefs: Array<Omit<SecurityFactor, "ok"> & { state_key: string }> = [
    { key: "malware_clean", label: "No malware detected", weight: 25, state_key: "malware_clean" },
    { key: "ssl_valid",      label: "SSL valid & not expiring soon", weight: 15, state_key: "ssl_valid" },
    { key: "wp_core_current", label: "WordPress core up-to-date", weight: 15, state_key: "wp_core_current" },
    { key: "plugins_current", label: "All plugins up-to-date",    weight: 15, state_key: "plugins_current" },
    { key: "themes_current",  label: "All themes up-to-date",     weight: 10, state_key: "themes_current" },
    { key: "admin_2fa",       label: "Admin 2FA enabled",         weight: 10, state_key: "admin_2fa" },
    { key: "passwords_clean", label: "No weak passwords flagged", weight: 10, state_key: "passwords_clean" },
  ];

  let score = 0;
  const factors: SecurityFactor[] = factorDefs.map((d) => {
    const ok = bool(state[d.state_key], false);
    if (ok) score += d.weight;
    return {
      key: d.key,
      label: d.label,
      weight: d.weight,
      ok,
    };
  });
  return { score, factors };
}

function computeUptime(history: UptimeEntry[]): { pct: number; incident: LastIncident | null } {
  if (history.length === 0) return { pct: 100, incident: null };
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

function buildBackupTimeline(backups: Array<Record<string, unknown>>): BackupEntry[] {
  // Build 30 entries terminating at today; pull whatever's present, fill
  // missing dates with "pending" so the strip always renders 30 dots.
  const out: BackupEntry[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const byDate = new Map<string, Record<string, unknown>>();
  for (const b of backups) {
    const ts = typeof b.recorded_at === "string" ? b.recorded_at : null;
    if (!ts) continue;
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) continue;
    const key = d.toISOString().slice(0, 10);
    byDate.set(key, b);
  }
  for (let offset = 29; offset >= 0; offset -= 1) {
    const d = new Date(today.getTime() - offset * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    const rec = byDate.get(key);
    if (!rec) {
      out.push({ date: key, status: "pending" });
      continue;
    }
    const status = (rec.status === "success" || rec.status === "failed")
      ? (rec.status as "success" | "failed")
      : "pending";
    out.push({
      date: key,
      status,
      sizeBytes: typeof rec.size_bytes === "number" ? rec.size_bytes : undefined,
      retentionDays: typeof rec.retention_days === "number" ? rec.retention_days : undefined,
    });
  }
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
      lastIncident: null,
      bestStreakDays: 0,
      hasWebcareService: false,
    };
  }

  const csMeta: Record<string, unknown> = (svc.cs_metadata as Record<string, unknown>) ?? {};
  const securityState = (csMeta.webcare_security_state as Record<string, unknown>) ?? {};
  const history = Array.isArray(csMeta.uptime_history)
    ? (csMeta.uptime_history as UptimeEntry[])
    : [];

  const { score: secScore, factors: secFactors } = computeSecurity(securityState);
  const { pct: uptimePct, incident } = computeUptime(history);

  // Days without incident — derived from lastIncident or stored streak.
  let daysWithoutIncident: number;
  if (incident) {
    daysWithoutIncident = incident.daysAgo;
  } else {
    const startedAt = typeof csMeta.webcare_incident_clean_since === "string"
      ? new Date(csMeta.webcare_incident_clean_since).getTime()
      : null;
    daysWithoutIncident = startedAt
      ? Math.max(0, Math.floor((Date.now() - startedAt) / 86_400_000))
      : 0;
  }

  const bestStreakDays = Math.max(
    daysWithoutIncident,
    num(csMeta.webcare_best_streak_days),
  );

  // Performance score — Lighthouse averages. Stored by an existing worker
  // hook; defaults to 0 (empty-state in the gauge) until it lands.
  const perfState = (csMeta.webcare_perf_state as Record<string, unknown>) ?? {};
  const perfDesktop = num(perfState.desktop_score);
  const perfMobile = num(perfState.mobile_score);
  const perfAvg = perfDesktop > 0 && perfMobile > 0
    ? Math.round((perfDesktop + perfMobile) / 2)
    : Math.max(perfDesktop, perfMobile);

  // Pending updates from the latest maintenance snapshot.
  const updates = (csMeta.webcare_pending_updates as Record<string, unknown>) ?? {};
  const pendingUpdates = num(updates.plugin_count)
    + num(updates.theme_count)
    + num(updates.core_count);

  const backupTimeline30d = buildBackupTimeline(
    Array.isArray(csMeta.webcare_backups)
      ? (csMeta.webcare_backups as Array<Record<string, unknown>>)
      : [],
  );

  return {
    kpis: {
      securityGrade: { score: secScore, letter: letterFor(secScore) },
      uptimePct,
      daysWithoutIncident,
      performanceScore: {
        desktop: perfDesktop,
        mobile: perfMobile,
        avg: perfAvg,
      },
      pendingUpdates,
    },
    securityFactors: secFactors,
    backupTimeline30d,
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
