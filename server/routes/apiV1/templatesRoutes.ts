/**
 * /api/v1/templates — read-only template catalogue.
 *
 * Reuses the merged template data from `getEffectiveTemplates` (the same
 * helper that backs the internal /api/quotequick/templates endpoint built
 * in PR #393). Mounted under apiKeyAuth so usage is counted against the
 * caller's quota — though the data itself is public.
 */
import type { Router, Request, Response } from "express";
import { fail, ok } from "./envelope";
import { getEffectiveTemplate, getEffectiveTemplates } from "../../lib/applyQuoteQuickOverrides";
import { createLogger } from "../../lib/logger";

const log = createLogger("ApiV1.Templates");

export function registerV1TemplatesRoutes(router: Router): void {
  router.get("/templates", async (req: Request, res: Response) => {
    try {
      const templates = await getEffectiveTemplates();
      return ok(req, res, { data: templates, total: templates.length });
    } catch (err: any) {
      log.error("list templates failed", { error: err?.message });
      return fail(req, res, 500, { code: "internal_error", message: "Failed to load templates." });
    }
  });

  router.get("/templates/:id", async (req: Request, res: Response) => {
    try {
      const t = await getEffectiveTemplate(String(req.params.id));
      if (!t) return fail(req, res, 404, { code: "not_found", message: "Template not found." });
      return ok(req, res, t);
    } catch (err: any) {
      log.error("get template failed", { error: err?.message });
      return fail(req, res, 500, { code: "internal_error", message: "Failed to load template." });
    }
  });
}
