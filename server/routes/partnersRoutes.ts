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
import { db } from "../db";
import { clients } from "@shared/schemas/adminCrm";
import { referralAttributions, referralCredits } from "@shared/schemas/affiliate";
import { requireClient } from "../auth";
import { REFERRER_FREE_MONTHS, normalizeCode, isValidCodeShape } from "../affiliate/programs";
import { captureRefClick } from "../affiliate/attribution";
import { ensureClientReferralCode } from "../affiliate/codes";
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

  // ── PHASE C SEAMS (affiliate UI — built by PR C, not here) ───────────────
  //   GET  /partners                → public landing (both programs + signup form)
  //   GET  /partners/terms          → full program terms
  //   GET  /partners/dashboard      → an affiliate's dashboard (?code=… gate)
  //   POST /api/partners/signup     → self-serve affiliate signup (email → code)
  // These read the `affiliates` table + mintUniqueCode/resolveCodeOwner already
  // shipped in this PR. Intentionally NOT implemented here.

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
