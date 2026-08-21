/**
 * Referral/affiliate ATTRIBUTION (DB + cookie).
 *
 * Ported from QuoteFleet src/server/affiliate/attribution.ts (tenant→client,
 * QF `db()` → WFT `db`, trialEndsAt → trial_pro_expires_at + features flag,
 * `qf_ref` cookie → `wft_ref`). The self-referral / reward branch logic lives
 * in the pure `evaluateReferralSignup` in programs.ts (testable without a DB).
 *
 * Flow:
 *   1. A visitor lands on any page with `?ref=<code>` (or `/ref/:code`).
 *      captureRefClick() drops a 90-day `wft_ref` cookie and records a
 *      referral_attributions row (idempotent per browser+code).
 *   2. On client signup, linkReferralOnSignup() reads the cookie, ignores
 *      self-referral, links the attribution → new client, applies the referee
 *      reward (extends the Pro trial to 30 days for peer referrals) and queues
 *      the referrer's "1 free month" credit. Affiliate-code signups only link
 *      the attribution; cash commissions accrue in the phase-2 billing job.
 */
import type { Request, Response } from "express";
import { randomBytes } from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { clients } from "@shared/schemas/adminCrm";
import { referralAttributions, referralCredits } from "@shared/schemas/affiliate";
import {
  REF_COOKIE_NAME,
  REF_COOKIE_MAX_AGE_MS,
  REFEREE_TRIAL_DAYS,
  REFEREE_DISCOUNT_PCT,
  REFEREE_DISCOUNT_MONTHS,
  normalizeCode,
  isValidCodeShape,
  evaluateReferralSignup,
  type ReferralOutcome,
} from "./programs";
import { resolveCodeOwner } from "./codes";
import { createLogger } from "../lib/logger";

const log = createLogger("AffiliateAttribution");

interface RefCookie {
  code: string;
  token: string;
}

/** Parse the `wft_ref` cookie (`<CODE>~<visitorToken>`). */
export function parseRefCookie(raw: unknown): RefCookie | null {
  const s = String(raw ?? "");
  const i = s.indexOf("~");
  if (i <= 0) return null;
  const code = normalizeCode(s.slice(0, i));
  const token = s
    .slice(i + 1)
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 40);
  if (!code || !token) return null;
  return { code, token };
}

function writeRefCookie(res: Response, code: string, token: string): void {
  const secure = process.env.NODE_ENV === "production";
  res.cookie(REF_COOKIE_NAME, `${code}~${token}`, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: REF_COOKIE_MAX_AGE_MS,
    path: "/",
  });
}

/**
 * Capture a `?ref=<code>` (or an explicit code from `/ref/:code`) into the
 * cookie + a referral_attributions row. Never throws into the request —
 * attribution is best-effort. Returns true when a (new) capture happened.
 */
export async function captureRefClick(
  req: Request,
  res: Response,
  explicitCode?: string,
): Promise<boolean> {
  try {
    const raw = explicitCode ?? (req.query?.ref as string | undefined);
    const code = normalizeCode(raw);
    if (!code || !isValidCodeShape(code)) return false;

    const existing = parseRefCookie((req as any).cookies?.[REF_COOKIE_NAME]);
    // Same code already captured in this browser → refresh cookie TTL, no dupe row.
    if (existing && existing.code === code) {
      writeRefCookie(res, code, existing.token);
      return false;
    }
    const token = existing?.token || randomBytes(12).toString("hex");
    writeRefCookie(res, code, token);

    const owner = await resolveCodeOwner(code);
    const kind = owner ? owner.kind : "unknown";
    await db.insert(referralAttributions).values({
      code,
      kind,
      visitor_token: token,
      reward_status: "pending",
    });
    return true;
  } catch (err) {
    log.warn("captureRefClick failed (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export interface ReferralLinkResult {
  kind: "referral" | "affiliate";
  attributionId: number;
  /** Peer referral: the referee reward applied to the NEW client. */
  refereeTrialDays?: number;
  refereeDiscountPct?: number;
  refereeDiscountMonths?: number;
  /** Peer referral: the referrer client queued a free-month credit. */
  referrerClientId?: number;
  referrerFreeMonths?: number;
  /** Affiliate: the affiliate credited with this signup. */
  affiliateId?: number;
}

/**
 * Link a pending attribution to a freshly-created client + apply rewards.
 * Idempotent + self-referral-safe; never throws into the signup path (returns
 * null on any miss/error). `signupEmail` is the new owner's login email — used
 * to detect + ignore self-referral.
 */
export async function linkReferralOnSignup(opts: {
  req: Request;
  clientId: number;
  signupEmail: string;
}): Promise<ReferralLinkResult | null> {
  try {
    const cookie = parseRefCookie((opts.req as any).cookies?.[REF_COOKIE_NAME]);
    if (!cookie) return null;
    const owner = await resolveCodeOwner(cookie.code);
    if (!owner) return null;

    // Pure decision: self-referral? which reward? (see programs.ts).
    const outcome: ReferralOutcome = evaluateReferralSignup(owner, opts.signupEmail, opts.clientId);

    // Find (or create) the pending attribution row for this browser+code.
    let attribution = (
      await db
        .select()
        .from(referralAttributions)
        .where(
          and(
            eq(referralAttributions.visitor_token, cookie.token),
            eq(referralAttributions.code, cookie.code),
            isNull(referralAttributions.referred_client_id),
          ),
        )
        .orderBy(desc(referralAttributions.landed_at))
        .limit(1)
    )[0];

    if (!attribution) {
      attribution = (
        await db
          .insert(referralAttributions)
          .values({
            code: cookie.code,
            kind: owner.kind,
            visitor_token: cookie.token,
            reward_status: "pending",
          })
          .returning()
      )[0];
    }
    if (!attribution) return null;

    if (outcome.self) {
      await db
        .update(referralAttributions)
        .set({ referred_client_id: opts.clientId, reward_status: "ignored" })
        .where(eq(referralAttributions.id, attribution.id));
      return null;
    }

    // Link the attribution to the new client.
    await db
      .update(referralAttributions)
      .set({ referred_client_id: opts.clientId, kind: owner.kind, reward_status: "signed_up" })
      .where(eq(referralAttributions.id, attribution.id));

    if (outcome.kind === "referral") {
      // Referee reward: extend the Pro trial to 30 days (the fresh client was
      // provisioned at 14 — TRIAL_DAYS in authRoutes) and keep Pro features on.
      // The 20%-off intro discount is recorded as a program constant + read at
      // billing time (phase-2 seam getRefereeDiscountForClient); no live Stripe
      // coupon is created here. Mark the client's source as 'referral'.
      const trialEndsAt = new Date(Date.now() + REFEREE_TRIAL_DAYS * 24 * 60 * 60 * 1000);
      await db
        .update(clients)
        .set({
          trial_pro_expires_at: trialEndsAt,
          trial_pro_features_enabled: true,
          source: "referral",
        })
        .where(eq(clients.id, opts.clientId));

      // Queue the referrer's free-month credit — idempotent (one per attribution).
      if (outcome.queueCreditForClientId != null) {
        const already = (
          await db
            .select({ id: referralCredits.id })
            .from(referralCredits)
            .where(eq(referralCredits.source_attribution_id, attribution.id))
            .limit(1)
        )[0];
        if (!already) {
          await db.insert(referralCredits).values({
            client_id: outcome.queueCreditForClientId,
            source_attribution_id: attribution.id,
            months_granted: outcome.referrerFreeMonths ?? 1,
            status: "pending",
          });
        }
      }
      return {
        kind: "referral",
        attributionId: attribution.id,
        refereeTrialDays: outcome.refereeTrialDays,
        refereeDiscountPct: outcome.refereeDiscountPct,
        refereeDiscountMonths: outcome.refereeDiscountMonths,
        referrerClientId: outcome.queueCreditForClientId,
        referrerFreeMonths: outcome.referrerFreeMonths,
      };
    }

    // Affiliate code — cash commission accrues in phase 2; nothing more here.
    return { kind: "affiliate", attributionId: attribution.id, affiliateId: outcome.affiliateId };
  } catch (err) {
    log.warn("linkReferralOnSignup failed (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * PHASE-2 SEAM: the referee intro-discount a client is entitled to, or null.
 * A client qualifies when it signed up through a PEER-referral code (an
 * attribution row referred_client_id=client, kind='referral', not ignored).
 * The billing job reads this to apply the 20%-off-first-3-months coupon.
 */
export async function getRefereeDiscountForClient(
  clientId: number,
): Promise<{ pct: number; months: number } | null> {
  try {
    const row = (
      await db
        .select({ id: referralAttributions.id, status: referralAttributions.reward_status })
        .from(referralAttributions)
        .where(
          and(
            eq(referralAttributions.referred_client_id, clientId),
            eq(referralAttributions.kind, "referral"),
          ),
        )
        .limit(1)
    )[0];
    if (!row || row.status === "ignored") return null;
    return { pct: REFEREE_DISCOUNT_PCT, months: REFEREE_DISCOUNT_MONTHS };
  } catch (err) {
    log.warn("getRefereeDiscountForClient failed (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
