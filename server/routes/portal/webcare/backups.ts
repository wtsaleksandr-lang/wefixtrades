/**
 * Portal WebCare backup + malware-scan endpoints.
 *
 *   GET  /api/portal/webcare/backups                  list real backup runs
 *   GET  /api/portal/webcare/backups/:id/download     the actual archive
 *   GET  /api/portal/webcare/backups/:id/contents     what's inside one
 *   POST /api/portal/webcare/backups/:id/restore      put one item back
 *   GET  /api/portal/webcare/malware-scans            real scans + findings
 *
 * The download route is the customer-owned escape hatch: the archive is
 * plain gzipped JSON of their own content, so "you own your site, we don't
 * hold your data hostage" is literally true and testable. Without a real
 * download, a backup product is just a promise.
 *
 * Auth: requireClient, and every query is bound to the authenticated
 * client_id so one customer can never read another's archive.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { webcareMalwareScans } from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";
import {
  fetchBackupArchive,
  listBackups,
  restoreItem,
} from "../../../services/webcare/backupService";
import { loadWebcareContext } from "../../../services/webcare/runners";
import { resolveWpCredentials } from "../../../services/webcare/credentials";
import { safeBrowsingConfigured } from "../../../services/webcare/malwareScanner";

const log = createLogger("PortalWebcareBackups");

const EMPTY_BACKUPS = {
  previewMode: true,
  backups: [] as unknown[],
  hasWebcareService: false,
};

const EMPTY_SCANS = {
  previewMode: true,
  scans: [] as unknown[],
  safeBrowsingConfigured: false,
  hasWebcareService: false,
};

const restoreSchema = z.object({
  itemType: z.enum(["post", "page"]),
  itemId: z.number().int().positive(),
});

export function registerPortalWebcareBackupRoutes(app: Express) {
  /* ─── List backups ────────────────────────────────────────────────── */
  app.get(
    "/api/portal/webcare/backups",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_BACKUPS,
        });
        if (clientId === null) return;

        const ctx = await loadWebcareContext(clientId);
        const rows = await listBackups(clientId);

        res.json({
          hasWebcareService: !!ctx,
          backups: rows.map((b) => ({
            id: b.id,
            status: b.status,
            trigger: b.trigger,
            sizeBytes: b.size_bytes,
            itemCounts: b.item_counts,
            retentionDays: b.retention_days,
            // Exposed so a customer can verify the archive they download
            // is the archive we stored.
            sha256: b.sha256,
            error: b.error,
            startedAt: b.started_at,
            completedAt: b.completed_at,
          })),
        });
      } catch (err: any) {
        log.error("[portal/webcare/backups]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );

  /* ─── Download one archive ────────────────────────────────────────── */
  app.get(
    "/api/portal/webcare/backups/:id/download",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: { previewMode: true, error: "Preview mode — no archive." },
        });
        if (clientId === null) return;

        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ error: "Invalid backup id." });
        }

        const fetched = await fetchBackupArchive(id, clientId);
        if (!fetched.ok) {
          return res.status(404).json({ error: fetched.error });
        }

        res.setHeader("Content-Type", "application/gzip");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="webcare-backup-${id}.json.gz"`,
        );
        return res.send(fetched.gzip);
      } catch (err: any) {
        log.error("[portal/webcare/backups/download]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );

  /* ─── Inspect one archive ─────────────────────────────────────────── */
  app.get(
    "/api/portal/webcare/backups/:id/contents",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: { previewMode: true, items: [] },
        });
        if (clientId === null) return;

        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ error: "Invalid backup id." });
        }

        const fetched = await fetchBackupArchive(id, clientId);
        if (!fetched.ok) return res.status(404).json({ error: fetched.error });

        const title = (v: unknown): string => {
          if (typeof v === "string") return v;
          if (v && typeof v === "object") {
            const o = v as Record<string, unknown>;
            if (typeof o.raw === "string") return o.raw;
            if (typeof o.rendered === "string") return o.rendered;
          }
          return "(untitled)";
        };

        const items = [
          ...(fetched.archive.posts as Array<Record<string, any>>).map((p) => ({
            itemType: "post" as const,
            id: Number(p.id),
            title: title(p.title),
            status: p.status ?? null,
          })),
          ...(fetched.archive.pages as Array<Record<string, any>>).map((p) => ({
            itemType: "page" as const,
            id: Number(p.id),
            title: title(p.title),
            status: p.status ?? null,
          })),
        ].filter((i) => Number.isFinite(i.id));

        res.json({
          capturedAt: fetched.archive.captured_at,
          sourceUrl: fetched.archive.source_url,
          // Surfaced verbatim: a customer must be able to see what this
          // archive does NOT contain.
          omitted: fetched.archive.omitted,
          truncated: fetched.archive.truncated,
          items,
        });
      } catch (err: any) {
        log.error("[portal/webcare/backups/contents]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );

  /* ─── Restore one item ────────────────────────────────────────────── */
  app.post(
    "/api/portal/webcare/backups/:id/restore",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: { previewMode: true, ok: true, message: "Preview mode — nothing restored." },
          mode: "write",
          action: "webcare.restore-backup-item",
        });
        if (clientId === null) return;

        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ error: "Invalid backup id." });
        }

        const parsed = restoreSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
        }

        const ctx = await loadWebcareContext(clientId);
        if (!ctx) {
          return res.status(403).json({
            error: "webcare_required",
            message: "Restoring from a backup requires an active WebCare subscription.",
          });
        }

        const creds = await resolveWpCredentials(clientId, ctx.metadata);
        if (!creds) {
          return res.status(400).json({
            error: "credentials_missing",
            message:
              "We don't have WordPress access for your site, so we can't write the restored content back.",
          });
        }

        const result = await restoreItem({
          clientId,
          backupId: id,
          credentials: creds,
          itemType: parsed.data.itemType,
          itemId: parsed.data.itemId,
        });

        if (!result.ok) {
          return res.status(400).json({ error: result.error ?? "restore_failed", message: result.message });
        }
        return res.json({ ok: true, message: result.message });
      } catch (err: any) {
        log.error("[portal/webcare/backups/restore]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );

  /* ─── Malware scans ───────────────────────────────────────────────── */
  app.get(
    "/api/portal/webcare/malware-scans",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_SCANS,
        });
        if (clientId === null) return;

        const ctx = await loadWebcareContext(clientId);
        const rows = await db
          .select()
          .from(webcareMalwareScans)
          .where(eq(webcareMalwareScans.client_id, clientId))
          .orderBy(desc(webcareMalwareScans.started_at))
          .limit(30);

        res.json({
          hasWebcareService: !!ctx,
          // Reported so the UI can say the Safe Browsing check is not
          // configured, rather than let its absence read as a pass.
          safeBrowsingConfigured: safeBrowsingConfigured(),
          scans: rows.map((s) => ({
            id: s.id,
            status: s.status,
            trigger: s.trigger,
            findings: s.findings,
            urlsScanned: s.urls_scanned,
            coreVersion: s.core_version,
            coreFilesChecked: s.core_files_checked,
            coreFilesModified: s.core_files_modified,
            error: s.error,
            startedAt: s.started_at,
            completedAt: s.completed_at,
          })),
        });
      } catch (err: any) {
        log.error("[portal/webcare/malware-scans]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
