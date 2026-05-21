/**
 * /api/v1 — embed-code and hosted-URL endpoints.
 *
 * Read-only convenience endpoints. They reuse the existing slug-to-URL
 * helpers from `@shared/slugUtils` so the answer matches what the
 * internal portal hands users.
 *
 * Cross-tenant scoping is enforced by getCalculatorForUser.
 */
import type { Router, Request, Response } from "express";
import { fail, ok } from "./envelope";
import { getCalculatorForUser } from "../../services/calculatorService";
import { buildHostedUrl, buildSubdomain, HOSTING_DOMAIN } from "@shared/slugUtils";
import { createLogger } from "../../lib/logger";

const log = createLogger("ApiV1.Embeds");

function parseIdParam(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const id = Number.parseInt(value, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function buildEmbedCode(slug: string): { snippet: string; iframe: string; script: string; subdomain: string } {
  const subdomain = buildSubdomain(slug, HOSTING_DOMAIN);
  const url = `https://${subdomain}`;
  const iframe = `<iframe src="${url}" style="width:100%;border:0;min-height:720px" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Quote calculator"></iframe>`;
  const script = `<div data-quotequick-slug="${slug}"></div>\n<script async src="https://${HOSTING_DOMAIN}/embed.js" data-slug="${slug}"></script>`;
  return { snippet: iframe, iframe, script, subdomain };
}

export function registerV1EmbedsRoutes(router: Router): void {
  /* ─── GET /calculators/:id/embed-code ─── */
  router.get("/calculators/:id/embed-code", async (req: Request, res: Response) => {
    const apiUser = req.apiUser;
    if (!apiUser) return fail(req, res, 401, { code: "unauthenticated", message: "API key required." });
    const id = parseIdParam(req.params.id);
    if (id == null) return fail(req, res, 400, { code: "invalid_id", message: "Invalid calculator id." });
    try {
      const calc = await getCalculatorForUser(apiUser.id, id);
      if (!calc) return fail(req, res, 404, { code: "not_found", message: "Calculator not found." });
      if (!calc.slug) {
        return fail(req, res, 409, { code: "no_slug", message: "Calculator has no published slug — publish it first." });
      }
      return ok(req, res, buildEmbedCode(calc.slug));
    } catch (err: any) {
      log.error("embed-code failed", { error: err?.message, userId: apiUser.id, id });
      return fail(req, res, 500, { code: "internal_error", message: "Failed to build embed code." });
    }
  });

  /* ─── GET /calculators/:id/hosted-url ─── */
  router.get("/calculators/:id/hosted-url", async (req: Request, res: Response) => {
    const apiUser = req.apiUser;
    if (!apiUser) return fail(req, res, 401, { code: "unauthenticated", message: "API key required." });
    const id = parseIdParam(req.params.id);
    if (id == null) return fail(req, res, 400, { code: "invalid_id", message: "Invalid calculator id." });
    try {
      const calc = await getCalculatorForUser(apiUser.id, id);
      if (!calc) return fail(req, res, 404, { code: "not_found", message: "Calculator not found." });
      if (!calc.slug) {
        return fail(req, res, 409, { code: "no_slug", message: "Calculator has no published slug — publish it first." });
      }
      const subdomain = buildSubdomain(calc.slug, HOSTING_DOMAIN);
      return ok(req, res, {
        slug: calc.slug,
        subdomain,
        hosted_url: buildHostedUrl(calc.slug, HOSTING_DOMAIN),
      });
    } catch (err: any) {
      log.error("hosted-url failed", { error: err?.message, userId: apiUser.id, id });
      return fail(req, res, 500, { code: "internal_error", message: "Failed to fetch hosted URL." });
    }
  });
}
