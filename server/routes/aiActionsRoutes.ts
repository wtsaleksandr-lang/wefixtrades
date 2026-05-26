/**
 * Wave 34 — Universal AI-action dispatch routes.
 *
 *   POST  /api/ai-actions/dispatch          — single entry-point invocation
 *   GET   /api/admin/ai-actions/audit-log   — admin-only cross-product
 *                                              audit log read
 *
 * The legacy `/api/portal/<product>/run-action` endpoints continue to
 * accept their existing body shapes — both paths flow through the same
 * dispatcher.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../auth";
import { createLogger } from "../lib/logger";
import { db } from "../db";
import { aiActionAuditLog, clients } from "@shared/schema";
import { dispatchAction } from "../services/aiActions/dispatcher";
import {
  AI_ACTION_PRODUCTS,
  type AIActionProduct,
} from "@shared/aiActions";

const log = createLogger("AiActionsRoutes");

const PRODUCT_ENUM = z.enum(AI_ACTION_PRODUCTS as readonly [AIActionProduct, ...AIActionProduct[]]);

const dispatchSchema = z.object({
  product: PRODUCT_ENUM,
  context: z.enum(["portal", "admin"]),
  actionKey: z.string().min(1).max(96),
  params: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
  recommendationId: z.string().min(1).max(200).optional(),
});

async function resolveClientIdFromUser(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, userId))
    .limit(1);
  return row?.id ?? null;
}

export function registerAiActionsRoutes(app: Express) {
  /* POST /api/ai-actions/dispatch — universal single entry-point. */
  app.post(
    "/api/ai-actions/dispatch",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const parsed = dispatchSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Invalid body",
            details: parsed.error.flatten(),
          });
        }

        const { product, context, actionKey, params, recommendationId } =
          parsed.data;

        // Resolve clientId from the authenticated user (portal context) OR
        // leave null for admin-context system actions.
        const user = req.user!;
        let clientId: number | null = null;
        if (context === "portal") {
          clientId = await resolveClientIdFromUser(user.id);
          if (clientId === null) {
            return res.status(403).json({
              error: "no_client_profile",
              message:
                "Portal AI actions require a customer profile on this account.",
            });
          }
        } else {
          // admin context: gate to admin role.
          if (user.role !== "admin") {
            return res.status(403).json({
              error: "admin_required",
              message: "Admin context AI actions require an admin role.",
            });
          }
        }

        const result = await dispatchAction({
          clientId,
          product,
          context,
          actionKey,
          params: (params ?? {}) as Record<string, unknown>,
          triggeredBy: "user_click",
          userId: user.id,
          recommendationId,
        });

        if (!result.success) {
          const status =
            result.errorCode === "subscription_required"
              ? 403
              : result.errorCode === "not_whitelisted"
                ? 400
                : 400;
          return res.status(status).json({
            success: false,
            errorCode: result.errorCode,
            message: result.message,
            ...(result.resultPayload ?? {}),
          });
        }

        return res.json({
          success: true,
          message: result.message,
          dismissed: result.dismissed ?? false,
          ...(result.resultPayload ?? {}),
        });
      } catch (err: any) {
        log.error("/api/ai-actions/dispatch", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );

  /* GET /api/admin/ai-actions/audit-log — admin-only cross-product log. */
  app.get(
    "/api/admin/ai-actions/audit-log",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const limitRaw = parseInt(String(req.query.limit ?? "50"), 10);
        const limit = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50), 500);
        const productFilter =
          typeof req.query.product === "string" ? req.query.product : null;

        let query = db.select().from(aiActionAuditLog)
          .orderBy(desc(aiActionAuditLog.recorded_at))
          .limit(limit);
        if (productFilter && (AI_ACTION_PRODUCTS as readonly string[]).includes(productFilter)) {
          query = db.select().from(aiActionAuditLog)
            .where(eq(aiActionAuditLog.product, productFilter))
            .orderBy(desc(aiActionAuditLog.recorded_at))
            .limit(limit) as typeof query;
        }
        const rows = await query;
        return res.json({ rows });
      } catch (err: any) {
        log.error("/api/admin/ai-actions/audit-log", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
