/**
 * Portal WebCare Maintenance Log — Wave 31.
 *
 * GET /api/portal/webcare/maintenance-log?limit=N&before=ISO&eventType=key
 *
 * Paginated, reverse-chronological feed of every action WebCare has
 * taken on the customer's site. THE structural moat per the research:
 * no competitor exposes this live. Surface drives the customer's
 * answer to "what exactly am I paying you for?".
 *
 * Pagination: keyset on `recorded_at < before` (newest-first). Default
 * limit 30, max 100.
 *
 * Filtering: `eventType` narrows to a single bucket (updates / security
 * / performance / backups / uptime / other). The right-rail filter on
 * the inbox uses this.
 *
 * Empty-state: returns `{ entries: [], emptyState: 'fresh' }` when the
 * service is active but no actions have been logged yet — the inbox
 * renders the "New here — actions will appear..." copy.
 *
 * Auth: requireClient. adminPreviewSafe-wrapped.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { clientServices, serviceCatalog, webcareActionLog } from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalWebcareMaintenanceLog");

const EVENT_TYPES = [
  "updates",
  "security",
  "performance",
  "backups",
  "uptime",
  "other",
] as const;
type EventType = (typeof EVENT_TYPES)[number];

const querySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(100, Math.max(1, Number(v) || 30)) : 30)),
  before: z.string().optional(),
  eventType: z.enum(EVENT_TYPES).optional(),
});

interface LogEntry {
  id: number;
  recordedAt: string;
  eventType: EventType;
  severity: "success" | "warning" | "failed" | "info";
  plainLanguageSummary: string;
  technicalSummary: string;
  expandedDetail: Record<string, unknown> | null;
}

interface LogResponse {
  previewMode?: boolean;
  entries: LogEntry[];
  emptyState: "none" | "fresh" | "filtered";
  hasMore: boolean;
  nextBefore: string | null;
  hasWebcareService: boolean;
}

const PREVIEW_RESPONSE = {
  previewMode: true,
  entries: [] as LogEntry[],
  emptyState: "fresh" as const,
  hasMore: false,
  nextBefore: null as string | null,
  hasWebcareService: false,
} satisfies Record<string, unknown>;

async function hasActiveWebcare(clientId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: clientServices.id })
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
  return !!row;
}

function normalizeSeverity(s: string): LogEntry["severity"] {
  switch (s) {
    case "success":
    case "warning":
    case "failed":
    case "info":
      return s;
    default:
      return "info";
  }
}

function normalizeEventType(s: string): EventType {
  return (EVENT_TYPES as readonly string[]).includes(s) ? (s as EventType) : "other";
}

export function registerPortalWebcareMaintenanceLogRoutes(app: Express) {
  app.get(
    "/api/portal/webcare/maintenance-log",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: PREVIEW_RESPONSE,
        });
        if (clientId === null) return;

        const parsed = querySchema.safeParse(req.query);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Invalid query",
            details: parsed.error.flatten(),
          });
        }
        const { limit, before, eventType } = parsed.data;

        const hasSvc = await hasActiveWebcare(clientId);
        if (!hasSvc) {
          return res.json({
            entries: [],
            emptyState: "none",
            hasMore: false,
            nextBefore: null,
            hasWebcareService: false,
          } satisfies LogResponse);
        }

        const conditions = [eq(webcareActionLog.client_id, clientId)];
        if (eventType) {
          conditions.push(eq(webcareActionLog.event_type, eventType));
        }
        if (before) {
          const beforeDate = new Date(before);
          if (!Number.isNaN(beforeDate.getTime())) {
            conditions.push(lt(webcareActionLog.recorded_at, beforeDate));
          }
        }

        const rows = await db
          .select({
            id: webcareActionLog.id,
            recorded_at: webcareActionLog.recorded_at,
            event_type: webcareActionLog.event_type,
            severity: webcareActionLog.severity,
            plain_language_summary: webcareActionLog.plain_language_summary,
            technical_summary: webcareActionLog.technical_summary,
            expanded_detail: webcareActionLog.expanded_detail,
          })
          .from(webcareActionLog)
          .where(and(...conditions))
          .orderBy(desc(webcareActionLog.recorded_at))
          .limit(limit + 1);

        const sliced = rows.slice(0, limit);
        const hasMore = rows.length > limit;
        const entries: LogEntry[] = sliced.map((r) => ({
          id: r.id,
          recordedAt: r.recorded_at.toISOString(),
          eventType: normalizeEventType(r.event_type),
          severity: normalizeSeverity(r.severity),
          plainLanguageSummary: r.plain_language_summary,
          technicalSummary: r.technical_summary,
          expandedDetail: (r.expanded_detail as Record<string, unknown> | null) ?? null,
        }));

        const nextBefore = hasMore && sliced.length > 0
          ? sliced[sliced.length - 1]!.recorded_at.toISOString()
          : null;

        let emptyState: LogResponse["emptyState"] = "none";
        if (entries.length === 0) {
          emptyState = eventType ? "filtered" : "fresh";
        }

        const payload: LogResponse = {
          entries,
          emptyState,
          hasMore,
          nextBefore,
          hasWebcareService: true,
        };
        res.json(payload);
      } catch (err: any) {
        log.error("[portal/webcare/maintenance-log]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
