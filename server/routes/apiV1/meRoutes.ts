/**
 * /api/v1/me — self endpoint.
 *
 * Returns the authenticated user's tier, current monthly usage, and
 * calls remaining. The middleware already populated `req.apiUser`,
 * `req.apiKey`, and `req.apiSubscription` before we got here.
 */
import type { Router, Request, Response } from "express";
import { fail, ok } from "./envelope";
import { getApiTier } from "@shared/pricing/apiTiers";

export function registerV1MeRoutes(router: Router): void {
  router.get("/me", (req: Request, res: Response) => {
    const apiUser = req.apiUser;
    const sub = req.apiSubscription;
    const key = req.apiKey;
    if (!apiUser || !sub || !key) {
      return fail(req, res, 401, { code: "unauthenticated", message: "API key required." });
    }
    const tier = getApiTier(apiUser.tier);
    return ok(req, res, {
      user_id: apiUser.id,
      api_key: {
        id: key.id,
        prefix: key.prefix,
        name: key.name,
        status: key.status,
      },
      tier: tier
        ? {
            id: tier.id,
            name: tier.name,
            monthly_call_quota: tier.monthlyCallQuota,
            rate_limit_per_minute: tier.rateLimitPerMinute,
            max_calculators: tier.maxCalculators,
            webhook_quota: tier.webhookQuota,
          }
        : { id: apiUser.tier, name: apiUser.tier },
      subscription: {
        status: sub.status,
        current_period_start: sub.current_period_start,
        current_period_end: sub.current_period_end,
        reset_at: sub.reset_at,
      },
      usage_this_period: {
        calls_used: sub.monthly_calls_used,
        calls_quota: sub.monthly_call_quota,
        calls_remaining: Math.max(0, sub.monthly_call_quota - sub.monthly_calls_used),
        reset_at: sub.reset_at,
      },
    });
  });
}
