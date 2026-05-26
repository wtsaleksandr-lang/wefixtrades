/**
 * Portal WebCare Site Inventory — Wave 31.
 *
 * GET /api/portal/webcare/site-inventory
 *
 * Returns the table of installed plugins + themes for the active
 * WebCare site. Each row carries: name, version, lastUpdated (ISO),
 * status (up-to-date / update-available / security-patch), and a
 * `recentlyUpdated` flag the pulse-dot uses to visually reinforce
 * ongoing maintenance work.
 *
 * Source: snapshot stored on client_service.metadata.webcare_inventory
 * by the existing webcareMaintenanceWorker. When no snapshot exists,
 * returns an empty list — the dashboard shows the "first scan
 * scheduled" empty-state.
 *
 * Sort: most-recently-updated first (descending). The dashboard then
 * shows the heaviest maintenance activity at the top — directly
 * answers "what are you doing for me?".
 *
 * Auth: requireClient. adminPreviewSafe-wrapped.
 */

import type { Express, Request, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { clientServices, serviceCatalog } from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalWebcareSiteInventory");

type InventoryStatus = "up-to-date" | "update-available" | "security-patch";
type InventoryKind = "plugin" | "theme" | "core";

interface InventoryEntry {
  kind: InventoryKind;
  name: string;
  version: string;
  latestVersion?: string;
  lastUpdated: string | null; // ISO
  status: InventoryStatus;
  recentlyUpdated: boolean;
}

interface InventoryResponse {
  previewMode?: boolean;
  entries: InventoryEntry[];
  hasWebcareService: boolean;
  lastSnapshotAt: string | null;
}

const PREVIEW_RESPONSE = {
  previewMode: true,
  entries: [] as InventoryEntry[],
  hasWebcareService: false,
  lastSnapshotAt: null as string | null,
} satisfies Record<string, unknown>;

function normalizeStatus(raw: unknown): InventoryStatus {
  if (raw === "update-available" || raw === "security-patch") return raw;
  return "up-to-date";
}

function normalizeKind(raw: unknown): InventoryKind {
  if (raw === "theme" || raw === "core") return raw;
  return "plugin";
}

function toEntry(raw: Record<string, unknown>): InventoryEntry {
  const lastUpdatedRaw = raw.last_updated;
  const lastUpdated =
    typeof lastUpdatedRaw === "string" && lastUpdatedRaw.length > 0
      ? lastUpdatedRaw
      : null;
  const recentlyUpdated = lastUpdated
    ? Date.now() - new Date(lastUpdated).getTime() < 14 * 86_400_000
    : false;
  return {
    kind: normalizeKind(raw.kind),
    name: typeof raw.name === "string" ? raw.name : "Unknown",
    version: typeof raw.version === "string" ? raw.version : "?",
    latestVersion: typeof raw.latest_version === "string" ? raw.latest_version : undefined,
    lastUpdated,
    status: normalizeStatus(raw.status),
    recentlyUpdated,
  };
}

export function registerPortalWebcareSiteInventoryRoutes(app: Express) {
  app.get(
    "/api/portal/webcare/site-inventory",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: PREVIEW_RESPONSE,
        });
        if (clientId === null) return;

        const [svc] = await db
          .select({
            cs_id: clientServices.id,
            cs_metadata: clientServices.metadata,
          })
          .from(clientServices)
          .innerJoin(
            serviceCatalog,
            eq(clientServices.service_id, serviceCatalog.id),
          )
          .where(
            and(
              eq(clientServices.client_id, clientId),
              sql`${serviceCatalog.id} LIKE 'webcare%'`,
              sql`${clientServices.status} IN ('active', 'onboarding')`,
            ),
          )
          .limit(1);

        if (!svc?.cs_id) {
          const payload: InventoryResponse = {
            entries: [],
            hasWebcareService: false,
            lastSnapshotAt: null,
          };
          return res.json(payload);
        }

        const csMeta = (svc.cs_metadata as Record<string, unknown>) ?? {};
        const snapshot = (csMeta.webcare_inventory as Record<string, unknown>) ?? {};
        const rawEntries = Array.isArray(snapshot.entries)
          ? (snapshot.entries as Array<Record<string, unknown>>)
          : [];
        const lastSnapshotAt =
          typeof snapshot.recorded_at === "string" ? snapshot.recorded_at : null;

        const entries = rawEntries
          .map(toEntry)
          .sort((a, b) => {
            const ta = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
            const tb = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
            return tb - ta;
          });

        const payload: InventoryResponse = {
          entries,
          hasWebcareService: true,
          lastSnapshotAt,
        };
        res.json(payload);
      } catch (err: any) {
        log.error("[portal/webcare/site-inventory]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
