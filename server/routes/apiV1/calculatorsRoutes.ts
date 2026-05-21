/**
 * /api/v1/calculators — CRUD over the authenticated user's calculators.
 *
 * Cross-tenant guarantee: every query path goes through the calculator
 * service which filters by `user_id = req.apiUser.id`. Direct DB access
 * is avoided here on purpose.
 */
import type { Router, Request, Response } from "express";
import { z } from "zod";
import { fail, ok } from "./envelope";
import {
  archiveCalculatorForUser,
  countActiveCalculators,
  createCalculatorForUser,
  getCalculatorForUser,
  listCalculators,
  setCalculatorPaused,
  toApiCalculator,
  updateCalculatorForUser,
  type CalcStatus,
} from "../../services/calculatorService";
import { getApiTier } from "@shared/pricing/apiTiers";
import { createLogger } from "../../lib/logger";

const log = createLogger("ApiV1.Calculators");

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(["active", "paused", "archived"]).optional(),
});

const createBody = z.object({
  name: z.string().min(1).max(120),
  business_name: z.string().min(1).max(200).optional(),
  template_id: z.string().max(120).optional(),
  trade_type: z.string().max(80).optional(),
  pricing_config: z.record(z.any()).optional(),
  calculator_settings: z.record(z.any()).optional(),
});

const updateBody = z.object({
  name: z.string().min(1).max(120).optional(),
  business_name: z.string().min(1).max(200).optional(),
  calculator_settings: z.record(z.any()).optional(),
});

function requireUser(req: Request): { id: number; tier: string } | null {
  return req.apiUser ?? null;
}

function parseIdParam(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const id = Number.parseInt(value, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function registerV1CalculatorsRoutes(router: Router): void {
  /* ─── GET /calculators ─── */
  router.get("/calculators", async (req: Request, res: Response) => {
    const apiUser = requireUser(req);
    if (!apiUser) return fail(req, res, 401, { code: "unauthenticated", message: "API key required." });
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      return fail(req, res, 400, { code: "invalid_query", message: "Invalid query parameters." });
    }
    try {
      const result = await listCalculators({
        userId: apiUser.id,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
        status: parsed.data.status as CalcStatus | undefined,
      });
      return ok(req, res, {
        data: result.data.map(toApiCalculator),
        total: result.total,
        has_more: result.has_more,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      });
    } catch (err: any) {
      log.error("list failed", { error: err?.message, userId: apiUser.id });
      return fail(req, res, 500, { code: "internal_error", message: "Failed to list calculators." });
    }
  });

  /* ─── POST /calculators ─── */
  router.post("/calculators", async (req: Request, res: Response) => {
    const apiUser = requireUser(req);
    if (!apiUser) return fail(req, res, 401, { code: "unauthenticated", message: "API key required." });
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      return fail(req, res, 400, { code: "invalid_body", message: "Invalid request body.", details: parsed.error.flatten() });
    }
    try {
      const tier = getApiTier(apiUser.tier);
      if (!tier) {
        return fail(req, res, 500, { code: "unknown_tier", message: `Unknown tier: ${apiUser.tier}` });
      }
      if (tier.maxCalculators !== -1) {
        const current = await countActiveCalculators(apiUser.id);
        if (current >= tier.maxCalculators) {
          return fail(req, res, 403, {
            code: "tier_limit_exceeded",
            message: `Your tier allows up to ${tier.maxCalculators} calculator${tier.maxCalculators === 1 ? "" : "s"}.`,
            limit: tier.maxCalculators,
            current,
          });
        }
      }
      const calc = await createCalculatorForUser({
        userId: apiUser.id,
        name: parsed.data.name,
        business_name: parsed.data.business_name || parsed.data.name,
        template_id: parsed.data.template_id,
        trade_type: parsed.data.trade_type,
        pricing_config: parsed.data.pricing_config,
        calculator_settings: parsed.data.calculator_settings,
      });
      return ok(req, res, toApiCalculator(calc), 201);
    } catch (err: any) {
      log.error("create failed", { error: err?.message, userId: apiUser.id });
      return fail(req, res, 500, { code: "internal_error", message: "Failed to create calculator." });
    }
  });

  /* ─── GET /calculators/:id ─── */
  router.get("/calculators/:id", async (req: Request, res: Response) => {
    const apiUser = requireUser(req);
    if (!apiUser) return fail(req, res, 401, { code: "unauthenticated", message: "API key required." });
    const id = parseIdParam(req.params.id);
    if (id == null) return fail(req, res, 400, { code: "invalid_id", message: "Invalid calculator id." });
    try {
      const calc = await getCalculatorForUser(apiUser.id, id);
      if (!calc) return fail(req, res, 404, { code: "not_found", message: "Calculator not found." });
      return ok(req, res, toApiCalculator(calc));
    } catch (err: any) {
      log.error("get failed", { error: err?.message, userId: apiUser.id, id });
      return fail(req, res, 500, { code: "internal_error", message: "Failed to fetch calculator." });
    }
  });

  /* ─── PATCH /calculators/:id ─── */
  router.patch("/calculators/:id", async (req: Request, res: Response) => {
    const apiUser = requireUser(req);
    if (!apiUser) return fail(req, res, 401, { code: "unauthenticated", message: "API key required." });
    const id = parseIdParam(req.params.id);
    if (id == null) return fail(req, res, 400, { code: "invalid_id", message: "Invalid calculator id." });
    const parsed = updateBody.safeParse(req.body);
    if (!parsed.success) {
      return fail(req, res, 400, { code: "invalid_body", message: "Invalid request body.", details: parsed.error.flatten() });
    }
    try {
      const updated = await updateCalculatorForUser(apiUser.id, id, parsed.data);
      if (!updated) return fail(req, res, 404, { code: "not_found", message: "Calculator not found." });
      return ok(req, res, toApiCalculator(updated));
    } catch (err: any) {
      log.error("update failed", { error: err?.message, userId: apiUser.id, id });
      return fail(req, res, 500, { code: "internal_error", message: "Failed to update calculator." });
    }
  });

  /* ─── DELETE /calculators/:id (soft) ─── */
  router.delete("/calculators/:id", async (req: Request, res: Response) => {
    const apiUser = requireUser(req);
    if (!apiUser) return fail(req, res, 401, { code: "unauthenticated", message: "API key required." });
    const id = parseIdParam(req.params.id);
    if (id == null) return fail(req, res, 400, { code: "invalid_id", message: "Invalid calculator id." });
    try {
      const archived = await archiveCalculatorForUser(apiUser.id, id);
      if (!archived) return fail(req, res, 404, { code: "not_found", message: "Calculator not found." });
      return ok(req, res, { id: archived.id, status: "archived" });
    } catch (err: any) {
      log.error("delete failed", { error: err?.message, userId: apiUser.id, id });
      return fail(req, res, 500, { code: "internal_error", message: "Failed to delete calculator." });
    }
  });

  /* ─── POST /calculators/:id/pause ─── */
  router.post("/calculators/:id/pause", async (req: Request, res: Response) => {
    const apiUser = requireUser(req);
    if (!apiUser) return fail(req, res, 401, { code: "unauthenticated", message: "API key required." });
    const id = parseIdParam(req.params.id);
    if (id == null) return fail(req, res, 400, { code: "invalid_id", message: "Invalid calculator id." });
    try {
      const updated = await setCalculatorPaused(apiUser.id, id, true);
      if (!updated) return fail(req, res, 404, { code: "not_found", message: "Calculator not found." });
      return ok(req, res, toApiCalculator(updated));
    } catch (err: any) {
      log.error("pause failed", { error: err?.message, userId: apiUser.id, id });
      return fail(req, res, 500, { code: "internal_error", message: "Failed to pause calculator." });
    }
  });

  /* ─── POST /calculators/:id/resume ─── */
  router.post("/calculators/:id/resume", async (req: Request, res: Response) => {
    const apiUser = requireUser(req);
    if (!apiUser) return fail(req, res, 401, { code: "unauthenticated", message: "API key required." });
    const id = parseIdParam(req.params.id);
    if (id == null) return fail(req, res, 400, { code: "invalid_id", message: "Invalid calculator id." });
    try {
      const updated = await setCalculatorPaused(apiUser.id, id, false);
      if (!updated) return fail(req, res, 404, { code: "not_found", message: "Calculator not found." });
      return ok(req, res, toApiCalculator(updated));
    } catch (err: any) {
      log.error("resume failed", { error: err?.message, userId: apiUser.id, id });
      return fail(req, res, 500, { code: "internal_error", message: "Failed to resume calculator." });
    }
  });
}
