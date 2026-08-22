/**
 * Affiliate + Referral program routes (Phase 1) — ported from QuoteFleet
 * src/server/routes/partners.ts (tenant→client, `/r/:code`→`/ref/:code` because
 * `/r/:slug` is already WFT's review-link funnel, `qf_ref`→`wft_ref`).
 *
 *   [middleware]  ?ref=<code> on any GET → capture click + set 90-day cookie
 *   GET  /ref/:code                → capture + redirect to '/'
 *   GET  /api/client/referral      → the logged-in client's referral link + stats
 *
 * PHASE C (affiliate UI) will add the public /partners landing, self-serve
 * affiliate signup (POST /api/partners/signup) and the affiliate dashboard —
 * see the clear seams below. It imports the pure terms + code helpers from
 * server/affiliate/{programs,codes}.ts and the `affiliates` schema; it does NOT
 * need to touch this file's client-referral endpoint.
 *
 * Registered BEFORE the SPA catch-all (serveStatic / setupVite in
 * server/index.ts) via registerRoutes so `/ref/:code` resolves server-side.
 */
import type { Express, Request, Response, NextFunction } from "express";
import { and, count, eq, ne, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { clients } from "@shared/schemas/adminCrm";
import { affiliates, referralAttributions, referralCredits } from "@shared/schemas/affiliate";
import { requireClient } from "../auth";
import {
  REFERRER_FREE_MONTHS,
  REFEREE_TRIAL_DAYS,
  REFEREE_DISCOUNT_PCT,
  REFEREE_DISCOUNT_MONTHS,
  AFFILIATE_BASE_RATE,
  AFFILIATE_PRO_RATE,
  AFFILIATE_PARTNER_RATE,
  AFFILIATE_PRO_THRESHOLD,
  AFFILIATE_PRO_DURATION_MONTHS,
  AFFILIATE_MIN_PAYOUT_CENTS,
  AFFILIATE_PAYOUT_CADENCE,
  REF_COOKIE_DAYS,
  normalizeCode,
  isValidCodeShape,
} from "../affiliate/programs";
import { captureRefClick } from "../affiliate/attribution";
import { ensureClientReferralCode, mintUniqueCode } from "../affiliate/codes";
import { loadAffiliateDashboard } from "../affiliate/dashboard";
import { registerAffiliate } from "../affiliate/signup";
import { createLogger } from "../lib/logger";

const log = createLogger("PartnersRoutes");

function referralBase(): string {
  return process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
}

/** The public referral short-link for a code (`https://host/ref/<code>`). */
export function referralLink(code: string, base = referralBase()): string {
  return `${base.replace(/\/+$/, "")}/ref/${code}`;
}

async function resolveClientId(userId: number): Promise<number | null> {
  const [row] = await db.select({ id: clients.id }).from(clients).where(eq(clients.user_id, userId)).limit(1);
  return row?.id ?? null;
}

/**
 * Both programs' published NUMBERS, surfaced to the React marketing pages so
 * they render the terms from the ONE source of truth (programs.ts) and can
 * never drift from the DB/billing layer. Percentages are whole numbers for copy.
 */
export function programTerms() {
  return {
    referral: {
      referrerFreeMonths: REFERRER_FREE_MONTHS,
      refereeTrialDays: REFEREE_TRIAL_DAYS,
      refereeDiscountPct: Math.round(REFEREE_DISCOUNT_PCT * 100),
      refereeDiscountMonths: REFEREE_DISCOUNT_MONTHS,
    },
    affiliate: {
      baseRatePct: Math.round(AFFILIATE_BASE_RATE * 100),
      proRatePct: Math.round(AFFILIATE_PRO_RATE * 100),
      partnerRatePct: Math.round(AFFILIATE_PARTNER_RATE * 100),
      proThreshold: AFFILIATE_PRO_THRESHOLD,
      proDurationMonths: AFFILIATE_PRO_DURATION_MONTHS,
      cookieDays: REF_COOKIE_DAYS,
      minPayoutCents: AFFILIATE_MIN_PAYOUT_CENTS,
      payoutCadence: AFFILIATE_PAYOUT_CADENCE,
    },
  };
}

const AffiliateSignupSchema = z.object({
  email: z.string().trim().email().max(200),
  name: z.string().trim().max(120).optional(),
  payoutMethod: z.enum(["paypal", "stripe", "bank"]).optional(),
  payoutDetails: z.string().trim().max(300).optional(),
});

export function registerPartnersRoutes(app: Express): void {
  // ── ?ref=<code> capture (any GET request) ────────────────────────────────
  // Best-effort, non-blocking: records the click + drops the wft_ref cookie,
  // then always calls next() so the normal page still renders. Only fires when
  // a `ref` query param is present, so it's a no-op on the vast majority of hits.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET" && typeof req.query?.ref === "string" && req.query.ref) {
      // Fire-and-forget — never block the response on attribution.
      void captureRefClick(req, res).catch((err) =>
        log.warn("ref-capture middleware failed (non-fatal)", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
    next();
  });

  // ── /ref/:code short link → capture + redirect home ──────────────────────
  app.get("/ref/:code", async (req: Request, res: Response) => {
    const code = normalizeCode(req.params.code);
    if (code && isValidCodeShape(code)) {
      await captureRefClick(req, res, code);
    }
    return res.redirect(302, "/");
  });

  // ── PHASE C — affiliate UI JSON endpoints ────────────────────────────────
  // The public /partners, /partners/terms and /partners/dashboard *pages* are
  // React routes (client/src/pages/marketing/Partners*.tsx) — the SPA catch-all
  // renders them. These endpoints feed those pages. All program NUMBERS come
  // from programs.ts via programTerms(); nothing here hardcodes a term.

  // Published terms for BOTH programs (drives the marketing copy).
  app.get("/api/partners/program-terms", (_req: Request, res: Response) => {
    res.json(programTerms());
  });

  // Self-serve affiliate registration. Idempotent on email (a repeat submit
  // returns the existing row — never a duplicate, never a 500 on duplicate).
  app.post("/api/partners/signup", async (req: Request, res: Response) => {
    const parsed = AffiliateSignupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    const email = parsed.data.email.toLowerCase();
    try {
      // Link to the account owning this email: prefer the logged-in user, else
      // match a client by contact email (a customer who is also an affiliate).
      const userId = (req.user as { id: number } | undefined)?.id ?? null;
      let ownerClientId: number | null = userId ? await resolveClientId(userId) : null;
      let ownerUserId: number | null = userId;
      if (ownerClientId == null) {
        const byEmail = (
          await db.select({ id: clients.id, userId: clients.user_id }).from(clients).where(eq(clients.contact_email, email)).limit(1)
        )[0];
        if (byEmail) {
          ownerClientId = byEmail.id;
          ownerUserId = ownerUserId ?? byEmail.userId ?? null;
        }
      }

      const result = await registerAffiliate(
        {
          email,
          name: parsed.data.name || null,
          payoutMethod: parsed.data.payoutMethod ?? null,
          payoutDetails: parsed.data.payoutDetails ?? null,
          ownerClientId,
          ownerUserId,
        },
        {
          findByEmail: async (e) =>
            (await db.select({ code: affiliates.code, status: affiliates.status }).from(affiliates).where(eq(affiliates.email, e)).limit(1))[0] ?? null,
          mint: () => mintUniqueCode(),
          insert: async (values) =>
            (await db.insert(affiliates).values(values).returning({ code: affiliates.code, status: affiliates.status }))[0] ?? null,
        },
      );
      return res.json({ code: result.code, referralLink: referralLink(result.code), status: result.status, existing: result.existing });
    } catch (err) {
      // Unique-violation race on email/code → treat as already-registered.
      const msg = err instanceof Error ? err.message : String(err);
      if (/duplicate key|unique/i.test(msg)) {
        const again = (
          await db.select().from(affiliates).where(eq(affiliates.email, email)).limit(1)
        )[0];
        if (again) {
          return res.json({ code: again.code, referralLink: referralLink(again.code), status: again.status, existing: true });
        }
      }
      log.error("POST /api/partners/signup failed", { error: msg });
      return res.status(500).json({ error: "Could not create your affiliate account. Please try again." });
    }
  });

  // Public read of an affiliate's dashboard by code (404 if unknown). SECURITY:
  // `code` is the PUBLIC `?ref=` share value — anyone holding a partner's link
  // can call this — so the response MUST NOT leak PII. We return ONLY aggregate
  // stats + tier + rate + the referral link, and strip the affiliate's email,
  // real name, id, and payout method/details from the public projection.
  app.get("/api/partners/dashboard", async (req: Request, res: Response) => {
    try {
      const code = normalizeCode(req.query.code);
      if (!code || !isValidCodeShape(code)) {
        return res.status(400).json({ error: "Enter your affiliate code." });
      }
      const dash = await loadAffiliateDashboard(code);
      if (!dash) {
        return res.status(404).json({ error: "No affiliate found for that code." });
      }
      // Public-safe projection — drop id/email/name/payoutMethod (PII).
      const publicDash = {
        ...dash,
        affiliate: {
          code: dash.affiliate.code,
          tier: dash.affiliate.tier,
          status: dash.affiliate.status,
          commissionRate: dash.affiliate.commissionRate,
          link: dash.affiliate.link,
        },
      };
      return res.json(publicDash);
    } catch (err) {
      log.error("GET /api/partners/dashboard failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({ error: "Could not load the affiliate dashboard." });
    }
  });

  // ── Logged-in client referral surface (portal "Refer a friend" card) ─────
  app.get("/api/client/referral", requireClient, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as { id: number } | undefined)?.id;
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      const clientId = await resolveClientId(userId);
      if (clientId == null) {
        // Admin without a linked client, or a not-yet-provisioned account.
        return res.status(200).json({ previewMode: true, code: null, link: null, freeMonthsPerReferral: REFERRER_FREE_MONTHS, stats: { clicks: 0, signups: 0, creditsPendingMonths: 0, creditsAppliedMonths: 0 } });
      }

      const code = await ensureClientReferralCode(clientId);
      const [clicksRow, signupsRow, creditRows] = await Promise.all([
        db.select({ n: count() }).from(referralAttributions).where(eq(referralAttributions.code, code)),
        db
          .select({ n: count() })
          .from(referralAttributions)
          .where(
            and(
              eq(referralAttributions.code, code),
              isNotNull(referralAttributions.referred_client_id),
              ne(referralAttributions.reward_status, "ignored"),
            ),
          ),
        db
          .select({
            status: referralCredits.status,
            months: sql<number>`coalesce(sum(${referralCredits.months_granted}), 0)`,
          })
          .from(referralCredits)
          .where(eq(referralCredits.client_id, clientId))
          .groupBy(referralCredits.status),
      ]);
      let pendingMonths = 0;
      let appliedMonths = 0;
      for (const r of creditRows) {
        if (r.status === "applied") appliedMonths += Number(r.months ?? 0);
        else if (r.status === "pending") pendingMonths += Number(r.months ?? 0);
      }
      return res.json({
        code,
        link: referralLink(code),
        freeMonthsPerReferral: REFERRER_FREE_MONTHS,
        stats: {
          clicks: Number(clicksRow[0]?.n ?? 0),
          signups: Number(signupsRow[0]?.n ?? 0),
          creditsPendingMonths: pendingMonths,
          creditsAppliedMonths: appliedMonths,
        },
      });
    } catch (err) {
      log.error("GET /api/client/referral failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({ error: "Could not load your referral details." });
    }
  });
}
