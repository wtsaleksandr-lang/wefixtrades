/**
 * Admin AFFILIATE management (Phase 1) — the operator surface for the affiliate
 * program (schema shared/schemas/affiliate.ts; self-serve signup in
 * server/routes/partnersRoutes.ts). Self-registered affiliates land as
 * status='pending' and `resolveCodeOwner`/attribution only credit 'active'
 * ones, so without this router a self-serve affiliate sits dead forever with
 * no way to be activated. Mirrors the requireAdmin + list/PATCH + before→after
 * `storage.logAdminActivity` audit patterns in adminCrmRoutes.ts.
 *
 *   GET   /api/admin/affiliates            list + per-affiliate stats, ?status=
 *   PATCH /api/admin/affiliates/:id        set status | tier | commission_rate
 *
 * Registered via server/routes/index.ts (registerAdminAffiliatesRoutes).
 */
import type { Express, Request, Response } from "express";
import { and, count, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { requireAdmin } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import { affiliates, affiliateCommissions, referralAttributions } from "@shared/schemas/affiliate";
import {
  AFFILIATE_STATUSES,
  affiliateAdminUpdateSchema,
  computeAffiliateUpdate,
  type AffiliateSnapshot,
} from "../affiliate/adminUpdate";
import { createLogger } from "../lib/logger";

const log = createLogger("AdminAffiliates");

/** Cap the page size so a huge affiliate table can't build an unbounded response. */
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;

export function registerAdminAffiliatesRoutes(app: Express): void {
  /**
   * GET /api/admin/affiliates — one row per affiliate + aggregate stats.
   * Optional `?status=pending|active|suspended` filter and limit/offset paging.
   * Stats are computed with a small number of GROUPed queries over the current
   * page's codes/ids (no per-row N+1): clicks + signups from
   * referral_attributions, pending/paid commission cents from
   * affiliate_commissions (empty until the phase-2 billing job writes rows).
   */
  app.get("/api/admin/affiliates", requireAdmin, async (req: Request, res: Response) => {
    try {
      const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
      const status =
        statusRaw && (AFFILIATE_STATUSES as readonly string[]).includes(statusRaw)
          ? statusRaw
          : undefined;
      const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.limit as string) || DEFAULT_PAGE_SIZE));
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);

      const whereClause = status ? eq(affiliates.status, status) : undefined;

      const [rows, totalRow] = await Promise.all([
        db
          .select()
          .from(affiliates)
          .where(whereClause)
          .orderBy(desc(affiliates.created_at))
          .limit(limit)
          .offset(offset),
        db.select({ n: count() }).from(affiliates).where(whereClause),
      ]);

      const codes = rows.map((r) => r.code);
      const ids = rows.map((r) => r.id);

      // Aggregate clicks + signups per code, and commission cents per affiliate,
      // only for the affiliates on this page. Empty page → skip the queries.
      const [attrRows, commissionRows] = await Promise.all([
        codes.length
          ? db
              .select({
                code: referralAttributions.code,
                clicks: count(),
                signups: sql<number>`count(*) filter (where ${referralAttributions.referred_client_id} is not null and ${referralAttributions.reward_status} <> 'ignored')`,
              })
              .from(referralAttributions)
              .where(inArray(referralAttributions.code, codes))
              .groupBy(referralAttributions.code)
          : Promise.resolve([] as Array<{ code: string; clicks: number; signups: number }>),
        ids.length
          ? db
              .select({
                affiliate_id: affiliateCommissions.affiliate_id,
                pendingCents: sql<number>`coalesce(sum(${affiliateCommissions.amount_cents}) filter (where ${affiliateCommissions.status} <> 'paid'), 0)`,
                paidCents: sql<number>`coalesce(sum(${affiliateCommissions.amount_cents}) filter (where ${affiliateCommissions.status} = 'paid'), 0)`,
              })
              .from(affiliateCommissions)
              .where(inArray(affiliateCommissions.affiliate_id, ids))
              .groupBy(affiliateCommissions.affiliate_id)
          : Promise.resolve([] as Array<{ affiliate_id: number; pendingCents: number; paidCents: number }>),
      ]);

      const attrByCode = new Map(attrRows.map((r) => [r.code, r]));
      const commByAffiliate = new Map(commissionRows.map((r) => [r.affiliate_id, r]));

      const data = rows.map((r) => {
        const a = attrByCode.get(r.code);
        const c = commByAffiliate.get(r.id);
        return {
          id: r.id,
          email: r.email,
          name: r.name,
          code: r.code,
          tier: r.tier,
          status: r.status,
          commission_rate: r.commission_rate,
          payout_method: r.payout_method,
          owner_client_id: r.owner_client_id,
          created_at: r.created_at,
          stats: {
            clicks: Number(a?.clicks ?? 0),
            signups: Number(a?.signups ?? 0),
            pendingCents: Number(c?.pendingCents ?? 0),
            paidCents: Number(c?.paidCents ?? 0),
          },
        };
      });

      res.json({ data, total: Number(totalRow[0]?.n ?? 0) });
    } catch (err: any) {
      log.error("[admin-affiliates] list error", { error: err?.message });
      res.status(500).json({ error: "Failed to list affiliates" });
    }
  });

  /**
   * PATCH /api/admin/affiliates/:id — update status / tier / commission_rate.
   * Zod-validates the body (status/tier to their enums, rate to a [0,1] double),
   * writes only the changed columns, and records a before→after audit row
   * (mirrors the client PATCH audit in adminCrmRoutes.ts). A patch that changes
   * nothing returns the row unchanged and skips the audit.
   */
  app.patch("/api/admin/affiliates/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid affiliate id" });

      const parsed = affiliateAdminUpdateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid affiliate update", details: parsed.error.flatten() });
      }

      const before = (await db.select().from(affiliates).where(eq(affiliates.id, id)).limit(1))[0];
      if (!before) return res.status(404).json({ error: "Affiliate not found" });

      const snapshot: AffiliateSnapshot = {
        status: before.status,
        tier: before.tier,
        commission_rate: before.commission_rate,
      };
      const { set, before: beforeDiff, after: afterDiff, changed } = computeAffiliateUpdate(
        snapshot,
        parsed.data,
      );

      // No-op patch (every provided field already matches) → return as-is.
      if (changed.length === 0) {
        return res.json(before);
      }

      const [updated] = await db
        .update(affiliates)
        .set({ ...set, updated_at: new Date() })
        .where(eq(affiliates.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Affiliate not found" });

      const u = req.user as any;
      await storage.logAdminActivity({
        actor_type: "human",
        actor_id: u?.id,
        actor_name: u?.name || u?.email,
        action: "affiliate.update",
        entity_type: "affiliate",
        entity_id: id,
        summary: `Updated affiliate "${updated.code}" (${changed.join(", ")})`,
        metadata: {
          affiliate_id: id,
          code: updated.code,
          fields: changed,
          before: beforeDiff,
          after: afterDiff,
        },
      });

      res.json(updated);
    } catch (err: any) {
      log.error("[admin-affiliates] update error", { error: err?.message });
      res.status(500).json({ error: "Failed to update affiliate" });
    }
  });
}
