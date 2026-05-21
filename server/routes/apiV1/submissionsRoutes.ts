/**
 * /api/v1 — submissions endpoints.
 *
 * Submissions are stored as `leads` rows scoped by calculator. The
 * public API surfaces them as "submissions" because that name better
 * captures their role for programmatic consumers (a completed quote,
 * with optional contact info).
 *
 * Endpoints:
 *   GET  /calculators/:id/submissions  — list submissions for a calc
 *   GET  /submissions/:id               — single submission detail
 *   POST /calculators/:id/quotes        — server-side quote submission
 *
 * Cross-tenant guarantee: every read filters by `lead.calculator_id IN
 * (calculators owned by req.apiUser)`. POST /quotes always loads the
 * calculator through `getCalculatorForUser` first.
 *
 * POST /quotes notes:
 *   - Server-side. Bypasses the widget's client-side dedup window because
 *     API customers pay their own quota; they are trusted to dedupe.
 *   - Accepts an optional `compute: true` hint that runs the advanced
 *     formula engine when the calculator's settings.advanced.enabled is
 *     true. When false (or unset), the API caller is expected to supply
 *     `quote_amount` themselves — which mirrors the widget flow where
 *     the client does the math.
 */
import type { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../../db";
import { calculators, leads } from "@shared/schema";
import { and, desc, eq, gte, inArray, lte, count as countFn } from "drizzle-orm";
import { fail, ok } from "./envelope";
import { getCalculatorForUser } from "../../services/calculatorService";
import { runCalculations, type Calculation, type FormulaContext } from "@shared/formulaEngine";
import { createLogger } from "../../lib/logger";

const log = createLogger("ApiV1.Submissions");

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
});

const quoteBody = z.object({
  field_values: z.record(z.any()).default({}),
  quote_amount: z.number().finite().nullable().optional(),
  compute: z.boolean().optional(),
  contact: z
    .object({
      name: z.string().max(200).nullable().optional(),
      email: z.string().email().nullable().optional(),
      phone: z.string().max(60).nullable().optional(),
      company: z.string().max(200).nullable().optional(),
    })
    .optional(),
});

function parseIdParam(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const id = Number.parseInt(value, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

interface ComputedQuote {
  total: number;
  breakdown: Record<string, number>;
  errors: Record<string, string>;
}

function computeFromAdvanced(
  settings: any,
  fieldValues: Record<string, unknown>,
): ComputedQuote | null {
  const adv = settings?.advanced;
  if (!adv || !adv.enabled) return null;
  const calcs: Calculation[] = Array.isArray(adv.calculations) ? adv.calculations : [];
  if (calcs.length === 0) return null;

  // Build context: every field by name + by id maps to its value (or 0).
  const ctx: FormulaContext = {};
  const fields = Array.isArray(adv.fields) ? adv.fields : [];
  for (const f of fields) {
    const raw = (fieldValues as any)[f.name] ?? (fieldValues as any)[f.id];
    if (typeof raw === "number") {
      ctx[f.name] = raw;
    } else if (typeof raw === "string") {
      ctx[f.name] = raw;
    } else if (typeof raw === "boolean") {
      ctx[f.name] = raw;
    } else if (Array.isArray(raw)) {
      ctx[f.name] = raw as Array<number | string>;
    } else {
      ctx[f.name] = 0;
    }
  }
  const result = runCalculations(calcs, ctx);
  const resultName = adv.result_calc || calcs[calcs.length - 1]?.name || "";
  const total = Number(result.values[resultName] ?? 0);
  return { total, breakdown: result.values, errors: result.errors };
}

function toApiSubmission(row: typeof leads.$inferSelect) {
  return {
    id: row.id,
    calculator_id: row.calculator_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    quote_amount: row.quote_amount,
    answers: row.answers,
    status: row.status,
    created_at: row.created_date,
  };
}

export function registerV1SubmissionsRoutes(router: Router): void {
  /* ─── GET /calculators/:id/submissions ─── */
  router.get("/calculators/:id/submissions", async (req: Request, res: Response) => {
    const apiUser = req.apiUser;
    if (!apiUser) return fail(req, res, 401, { code: "unauthenticated", message: "API key required." });
    const calcId = parseIdParam(req.params.id);
    if (calcId == null) return fail(req, res, 400, { code: "invalid_id", message: "Invalid calculator id." });
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      return fail(req, res, 400, { code: "invalid_query", message: "Invalid query parameters." });
    }
    try {
      // Tenant scoping: confirm the calculator is owned by req.apiUser
      // BEFORE we touch the leads table. Same query path the create/get/
      // update/delete handlers use.
      const owned = await getCalculatorForUser(apiUser.id, calcId);
      if (!owned) return fail(req, res, 404, { code: "not_found", message: "Calculator not found." });

      const conds = [eq(leads.calculator_id, calcId)];
      if (parsed.data.since) conds.push(gte(leads.created_date, new Date(parsed.data.since)));
      if (parsed.data.until) conds.push(lte(leads.created_date, new Date(parsed.data.until)));
      const where = and(...conds);

      const rows = await db
        .select()
        .from(leads)
        .where(where)
        .orderBy(desc(leads.created_date))
        .limit(parsed.data.limit)
        .offset(parsed.data.offset);

      const [totalRow] = await db
        .select({ n: countFn(leads.id).as("n") })
        .from(leads)
        .where(where);
      const total = Number(totalRow?.n ?? 0);

      return ok(req, res, {
        data: rows.map(toApiSubmission),
        total,
        has_more: parsed.data.offset + rows.length < total,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      });
    } catch (err: any) {
      log.error("list submissions failed", { error: err?.message, userId: apiUser.id, calcId });
      return fail(req, res, 500, { code: "internal_error", message: "Failed to list submissions." });
    }
  });

  /* ─── GET /submissions/:id ─── */
  router.get("/submissions/:id", async (req: Request, res: Response) => {
    const apiUser = req.apiUser;
    if (!apiUser) return fail(req, res, 401, { code: "unauthenticated", message: "API key required." });
    const id = parseIdParam(req.params.id);
    if (id == null) return fail(req, res, 400, { code: "invalid_id", message: "Invalid submission id." });
    try {
      // Cross-tenant guard: subquery `calculator_id IN (user's calcs)`.
      // Cheaper than fetching the calc and validating after.
      const userCalcIds = await db
        .select({ id: calculators.id })
        .from(calculators)
        .where(eq(calculators.user_id, apiUser.id));
      if (userCalcIds.length === 0) {
        return fail(req, res, 404, { code: "not_found", message: "Submission not found." });
      }
      const ids = userCalcIds.map((r) => r.id);
      const [row] = await db
        .select()
        .from(leads)
        .where(and(eq(leads.id, id), inArray(leads.calculator_id, ids)))
        .limit(1);
      if (!row) return fail(req, res, 404, { code: "not_found", message: "Submission not found." });
      return ok(req, res, toApiSubmission(row));
    } catch (err: any) {
      log.error("get submission failed", { error: err?.message, userId: apiUser.id, id });
      return fail(req, res, 500, { code: "internal_error", message: "Failed to fetch submission." });
    }
  });

  /* ─── POST /calculators/:id/quotes ─── */
  router.post("/calculators/:id/quotes", async (req: Request, res: Response) => {
    const apiUser = req.apiUser;
    if (!apiUser) return fail(req, res, 401, { code: "unauthenticated", message: "API key required." });
    const calcId = parseIdParam(req.params.id);
    if (calcId == null) return fail(req, res, 400, { code: "invalid_id", message: "Invalid calculator id." });
    const parsed = quoteBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return fail(req, res, 400, { code: "invalid_body", message: "Invalid request body.", details: parsed.error.flatten() });
    }
    try {
      const calc = await getCalculatorForUser(apiUser.id, calcId);
      if (!calc) return fail(req, res, 404, { code: "not_found", message: "Calculator not found." });

      // Compute if asked AND the calculator has the advanced builder. Otherwise
      // we trust whatever quote_amount the caller supplied.
      let computed: ComputedQuote | null = null;
      const wantsCompute = parsed.data.compute !== false; // default true
      if (wantsCompute) {
        computed = computeFromAdvanced(calc.calculator_settings as any, parsed.data.field_values);
      }
      const finalQuoteAmount =
        parsed.data.quote_amount != null
          ? parsed.data.quote_amount
          : computed
          ? Math.round(computed.total)
          : null;

      const contact = parsed.data.contact || {};
      const [submission] = await db
        .insert(leads)
        .values({
          calculator_id: calcId,
          name: contact.name ?? null,
          email: contact.email ?? null,
          phone: contact.phone ?? null,
          company: contact.company ?? null,
          quote_amount:
            finalQuoteAmount != null && Number.isFinite(finalQuoteAmount) ? finalQuoteAmount : null,
          answers: parsed.data.field_values,
          status: "new",
        })
        .returning();

      return ok(req, res, {
        submission_id: submission.id,
        calculator_id: submission.calculator_id,
        computed_quote: finalQuoteAmount,
        breakdown: computed?.breakdown ?? null,
        formula_errors: computed?.errors && Object.keys(computed.errors).length ? computed.errors : null,
        submission: toApiSubmission(submission),
      }, 201);
    } catch (err: any) {
      log.error("create quote failed", { error: err?.message, userId: apiUser.id, calcId });
      return fail(req, res, 500, { code: "internal_error", message: "Failed to create quote." });
    }
  });
}
