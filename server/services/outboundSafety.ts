/**
 * Outbound Safety Service
 *
 * Provides the compliance + safety capabilities used throughout the
 * outbound module:
 *  1. Dedup fingerprint generation          (Task 1)
 *  2. Contact confidence scoring            (Task 2)
 *  3. Global blacklist check & management   (Task 7)
 *  4. Reply sentiment classification        (Task 5)
 *  5. CASL hard consent gate                (Lane OB)
 *  6. Unified push-time eligibility check   (Lane OB)
 *  7. Global volume-ramp computation        (Lane OB)
 *  8. CAN-SPAM sequence body validation     (Lane OB)
 *  9. Platform global-suppression bridge    (Lane OB)
 *
 * All functions are pure or use the shared db instance.
 * No side effects beyond the functions that explicitly write to the DB.
 */

import crypto from "crypto";
import { db } from "../db";
import {
  outboundBlockedDomains,
  outboundBlockedEmails,
  outboundBlockedPhones,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { getOutreachAdapter, type OutreachPlatform } from "./outreachPlatform";
import { isEmailUnsubscribed } from "../lib/unsubscribeStorage";
import { createLogger } from "../lib/logger";

const log = createLogger("OutboundSafety");

/* ═══════════════════════════════════════════
   TASK 1 — Dedup Fingerprint
   ═══════════════════════════════════════════ */

/** Business name suffixes to strip before fingerprinting */
const CORP_SUFFIXES = /\b(inc|llc|ltd|co|corp|corporation|company|group|holdings|services|service|solutions|professionals|pros|contractors|contractor)\b\.?/gi;

/**
 * Normalise a business name for fingerprinting.
 * Lowercase, strip punctuation, remove common corporate suffixes.
 */
function normaliseBusinessName(name: string): string {
  return name
    .toLowerCase()
    .replace(CORP_SUFFIXES, " ")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Generate a deterministic dedup fingerprint.
 * Inputs: business name, city, phone — the three most stable identifiers
 * across different data sources for the same business.
 *
 * Returns a 64-char hex string (first 256 bits of SHA-256).
 */
export function generateFingerprint(
  businessName: string,
  city: string | null | undefined,
  phone: string | null | undefined
): string {
  const namePart = normaliseBusinessName(businessName);
  const cityPart = (city || "").toLowerCase().replace(/[^a-z]/g, "").trim();
  // Normalise phone to last 10 digits to handle country code variants (+1 vs no prefix)
  const phonePart = (phone || "").replace(/\D/g, "").slice(-10);

  const raw = `${namePart}|${cityPart}|${phonePart}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 64);
}

/* ═══════════════════════════════════════════
   TASK 2 — Contact Confidence Scoring
   ═══════════════════════════════════════════ */

export type ContactConfidence = "high" | "medium" | "low" | "none";

/**
 * Free email providers that indicate low-quality / personal contacts.
 * Do not flag business domains that happen to use Google Workspace.
 */
const FREE_PROVIDERS = new Set([
  "gmail.com", "googlemail.com",
  "yahoo.com", "ymail.com", "yahoo.co.uk",
  "hotmail.com", "hotmail.co.uk",
  "outlook.com", "live.com", "msn.com",
  "aol.com",
  "icloud.com", "me.com", "mac.com",
  "mail.com", "inbox.com",
  "protonmail.com", "pm.me",
]);

/**
 * Generic email prefixes that are customer-facing inboxes rather than personal.
 * These are "medium" confidence even on a matching business domain.
 */
const GENERIC_PREFIXES = new Set([
  "info", "contact", "hello", "support", "admin", "office",
  "mail", "team", "service", "help", "sales", "enquiries",
  "inquiries", "enquiry", "inquiry", "reception", "billing",
  "accounts", "bookings", "booking", "jobs", "careers",
]);

/**
 * Score an email address for outreach suitability.
 *
 * Rules (in priority order):
 *  1. No email → "none"
 *  2. Free provider → "low"
 *  3. Domain matches business website + specific prefix (john@acmeplumbing.com) → "high"
 *  4. Domain matches business website + generic prefix (info@acmeplumbing.com) → "medium"
 *  5. Unknown business domain (not free, no website to compare) → "medium"
 */
export function scoreContactConfidence(
  email: string | null | undefined,
  websiteDomain: string | null | undefined
): ContactConfidence {
  if (!email || !email.includes("@")) return "none";

  const parts = email.toLowerCase().trim().split("@");
  if (parts.length !== 2) return "none";

  const [prefix, emailDomain] = parts;
  if (!emailDomain) return "none";

  // Rule 2: free provider
  if (FREE_PROVIDERS.has(emailDomain)) return "low";

  // Rules 3 & 4: compare email domain to known website domain
  if (websiteDomain) {
    const cleanSiteDomain = websiteDomain.toLowerCase().replace(/^www\./, "");
    const domainMatches =
      emailDomain === cleanSiteDomain ||
      emailDomain.endsWith(`.${cleanSiteDomain}`);

    if (domainMatches) {
      return GENERIC_PREFIXES.has(prefix) ? "medium" : "high";
    }
  }

  // Rule 5: unknown domain but not free → could be a business email
  return "medium";
}

/* ═══════════════════════════════════════════
   TASK 7 — Global Blacklist
   ═══════════════════════════════════════════ */

export interface BlacklistHit {
  blocked: true;
  type: "domain" | "email" | "phone";
  reason: string;
}
export interface BlacklistClean {
  blocked: false;
}
export type BlacklistResult = BlacklistHit | BlacklistClean;

/**
 * Check whether ANY of the provided identifiers are on the global blacklist.
 * Short-circuits on first hit — runs three queries in parallel.
 */
export async function checkBlacklist(
  domain: string | null | undefined,
  email: string | null | undefined,
  phone: string | null | undefined
): Promise<BlacklistResult> {
  const checks: Promise<{ type: "domain" | "email" | "phone"; reason: string } | null>[] = [];

  if (domain) {
    const cleanDomain = domain.toLowerCase().replace(/^www\./, "");
    checks.push(
      db.select({ reason: outboundBlockedDomains.reason })
        .from(outboundBlockedDomains)
        .where(eq(outboundBlockedDomains.domain, cleanDomain))
        .limit(1)
        .then((rows) => rows[0] ? { type: "domain" as const, reason: rows[0].reason ?? "blocked" } : null)
    );
  }

  if (email) {
    checks.push(
      db.select({ reason: outboundBlockedEmails.reason })
        .from(outboundBlockedEmails)
        .where(eq(outboundBlockedEmails.email, email.toLowerCase().trim()))
        .limit(1)
        .then((rows) => rows[0] ? { type: "email" as const, reason: rows[0].reason ?? "blocked" } : null)
    );
  }

  if (phone) {
    const cleanPhone = phone.replace(/\D/g, "").slice(-10);
    if (cleanPhone.length >= 7) {
      checks.push(
        db.select({ reason: outboundBlockedPhones.reason })
          .from(outboundBlockedPhones)
          .where(eq(outboundBlockedPhones.phone, cleanPhone))
          .limit(1)
          .then((rows) => rows[0] ? { type: "phone" as const, reason: rows[0].reason ?? "blocked" } : null)
      );
    }
  }

  if (checks.length === 0) return { blocked: false };

  const results = await Promise.all(checks);
  const hit = results.find((r) => r !== null);

  return hit ? { blocked: true, type: hit.type, reason: hit.reason } : { blocked: false };
}

/**
 * Add an entry to the appropriate blacklist table.
 * Safe to call multiple times — onConflictDoNothing prevents duplicates.
 */
export async function addToBlacklist(
  type: "domain" | "email" | "phone",
  value: string,
  reason: string
): Promise<void> {
  if (!value) return;

  if (type === "domain") {
    const clean = value.toLowerCase().replace(/^www\./, "").trim();
    if (!clean) return;
    await db.insert(outboundBlockedDomains)
      .values({ domain: clean, reason })
      .onConflictDoNothing();
  } else if (type === "email") {
    const clean = value.toLowerCase().trim();
    if (!clean || !clean.includes("@")) return;
    await db.insert(outboundBlockedEmails)
      .values({ email: clean, reason })
      .onConflictDoNothing();
  } else if (type === "phone") {
    const clean = value.replace(/\D/g, "").slice(-10);
    if (clean.length < 7) return;
    await db.insert(outboundBlockedPhones)
      .values({ phone: clean, reason })
      .onConflictDoNothing();
  }
}

/* ═══════════════════════════════════════════
   TASK 5 — Reply Sentiment Classification
   ═══════════════════════════════════════════ */

/** Keywords that strongly indicate an uninterested or hostile reply */
const NEGATIVE_KEYWORDS = [
  "not interested", "no thanks", "no thank you",
  "please remove", "please unsubscribe",
  "unsubscribe me", "take me off", "remove me",
  "stop emailing", "stop contacting", "stop messaging",
  "wrong person", "wrong email", "wrong number",
  "do not contact", "do not email", "never contact",
  "leave me alone", "cease and desist", "spam",
];

/** Keywords that indicate genuine interest or engagement */
const POSITIVE_KEYWORDS = [
  "interested", "tell me more", "sounds good", "sounds interesting",
  "pricing", "how much", "what does it cost", "cost me",
  "demo", "demonstration", "call me", "give me a call",
  "let's talk", "lets talk", "schedule", "schedule a",
  "sign up", "get started", "want to try", "would like to try",
  "when can we", "can we chat", "set up a meeting",
  "how does it work",
];

/**
 * Classify a reply body as positive, neutral, or negative.
 *
 * Used in the webhook handler to decide whether to create a sales opportunity.
 * Falls back to "neutral" when the reply body is unavailable (many webhooks
 * don't include the full body) — this ensures we don't miss real opportunities.
 */
export function classifyReply(replyText: string | null | undefined): "positive" | "neutral" | "negative" {
  if (!replyText || replyText.trim().length === 0) return "neutral";

  const lower = replyText.toLowerCase();

  // Negative check first — do not contact requests must be respected
  if (NEGATIVE_KEYWORDS.some((kw) => lower.includes(kw))) return "negative";

  if (POSITIVE_KEYWORDS.some((kw) => lower.includes(kw))) return "positive";

  return "neutral";
}

/* ═══════════════════════════════════════════
   LANE OB — CASL Hard Consent Gate

   Eligibility (evaluated at ASSIGN time and re-evaluated at PUSH time):

     1. Implied consent past its CASL 2-year window → BLOCKED, always,
        for every country, regardless of confidence or human review.
     2. consent_basis = 'express'                  → eligible (no expiry).
     3. Confidence gate: contact_confidence must rank ≥
        OUTBOUND_MIN_CONTACT_CONFIDENCE (env, DEFAULT 'high') — i.e.
        'medium' never auto-passes under the default — UNLESS a human
        explicitly reviewed the prospect (reviewed_by set).
     4. CASL basis check (strict mode): the prospect must have a valid,
        unexpired consent basis OR pass the conspicuous-publication test
        (email domain === the business's own website domain). Strict mode
        is ON by default (OUTBOUND_CASL_STRICT !== "false") and CANNOT be
        disabled for Canadian prospects — CA is always strict.
   ═══════════════════════════════════════════ */

export type ConsentBasis = "express" | "implied_conspicuous" | "implied_inquiry" | "none";

export type ConsentBlockCode =
  | "blocked_consent_expired"   // implied consent past its 2-year CASL window
  | "blocked_confidence"        // contact_confidence below env minimum, no review, no express consent
  | "blocked_casl_no_basis";    // strict CASL mode and no valid consent basis / publication evidence

export interface ConsentGateInput {
  contact_confidence: string | null | undefined;   // high | medium | low | none
  reviewed_by: number | null | undefined;
  consent_basis: string | null | undefined;        // ConsentBasis
  consent_expires_at: Date | null | undefined;
  country: string | null | undefined;
  primary_email: string | null | undefined;
  website_domain: string | null | undefined;
}

export type ConsentGateResult =
  | { eligible: true; basis: ConsentBasis | "confidence" | "reviewed"; inferred_conspicuous: boolean }
  | { eligible: false; code: ConsentBlockCode; reason: string };

const CONFIDENCE_RANK: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3 };

/** Resolve the minimum auto-pass confidence from env. Default: high. */
export function minContactConfidence(): ContactConfidence {
  const raw = (process.env.OUTBOUND_MIN_CONTACT_CONFIDENCE || "high").toLowerCase().trim();
  if (raw in CONFIDENCE_RANK) return raw as ContactConfidence;
  log.warn(`Invalid OUTBOUND_MIN_CONTACT_CONFIDENCE="${raw}" — falling back to "high"`);
  return "high";
}

function isCanadianProspect(country: string | null | undefined): boolean {
  const c = (country || "").trim().toLowerCase();
  return c === "ca" || c === "can" || c === "canada";
}

/** The CASL conspicuous-publication test: email domain === business's own website domain. */
export function publishedOnOwnDomain(
  email: string | null | undefined,
  websiteDomain: string | null | undefined,
): boolean {
  const emailDomain = (email || "").split("@")[1]?.toLowerCase().trim().replace(/^www\./, "") || "";
  const siteDomain = (websiteDomain || "").toLowerCase().trim().replace(/^www\./, "");
  return !!emailDomain && !!siteDomain && emailDomain === siteDomain;
}

/**
 * Pure consent-gate evaluation. `now` is injectable for tests.
 * Env is read at CALL time (not module load) so tests can vary it.
 */
export function evaluateConsentGate(p: ConsentGateInput, now: Date = new Date()): ConsentGateResult {
  const basis = ((p.consent_basis || "none").toLowerCase().trim()) as ConsentBasis;
  const isImplied = basis === "implied_conspicuous" || basis === "implied_inquiry";

  // 1 — expired implied consent blocks unconditionally (CASL 2-year window)
  if (isImplied && p.consent_expires_at && p.consent_expires_at.getTime() < now.getTime()) {
    return {
      eligible: false,
      code: "blocked_consent_expired",
      reason: `Implied consent (${basis}) expired ${p.consent_expires_at.toISOString()} — CASL 2-year window`,
    };
  }

  // 2 — express consent is always sufficient (no statutory expiry)
  if (basis === "express") {
    return { eligible: true, basis: "express", inferred_conspicuous: false };
  }

  // 3 — confidence gate: ≥ env minimum (default high) OR human-reviewed
  const min = minContactConfidence();
  const conf = (p.contact_confidence || "none").toLowerCase().trim();
  const confRank = CONFIDENCE_RANK[conf] ?? 0;
  const reviewed = p.reviewed_by != null;

  if (confRank < CONFIDENCE_RANK[min] && !reviewed) {
    return {
      eligible: false,
      code: "blocked_confidence",
      reason: `contact_confidence "${conf}" < required "${min}" and not human-reviewed (no express consent)`,
    };
  }

  // 4 — CASL basis check. Strict by default; Canadian prospects are ALWAYS
  //     strict, even when OUTBOUND_CASL_STRICT=false.
  const strict = process.env.OUTBOUND_CASL_STRICT !== "false" || isCanadianProspect(p.country);
  if (strict) {
    const hasRecordedBasis = isImplied; // unexpired (checked above)
    const conspicuous = publishedOnOwnDomain(p.primary_email, p.website_domain);
    if (!hasRecordedBasis && !conspicuous) {
      return {
        eligible: false,
        code: "blocked_casl_no_basis",
        reason: `No CASL consent basis: consent_basis="${basis}" and "${p.primary_email}" is not published on the business's own domain (${p.website_domain || "no website"})`,
      };
    }
    return {
      eligible: true,
      basis: hasRecordedBasis ? basis : (reviewed && confRank < CONFIDENCE_RANK[min] ? "reviewed" : "confidence"),
      inferred_conspicuous: !hasRecordedBasis && conspicuous,
    };
  }

  return {
    eligible: true,
    basis: reviewed && confRank < CONFIDENCE_RANK[min] ? "reviewed" : "confidence",
    inferred_conspicuous: false,
  };
}

/* ═══════════════════════════════════════════
   LANE OB — Unified push-time eligibility

   ONE function both push paths (outboundSyncWorker + the manual
   /campaigns/:id/sync route) call immediately before pushing a lead to
   the outreach platform. Re-runs every suppression source so a lead
   suppressed AFTER assignment is never pushed:
     - do_not_contact flag
     - consent gate (above)
     - global outbound blacklist (domain / email / phone)
     - transactional unsubscribe registry (email_unsubscribes bridge)
   Deps are injectable for deliberate-failure test fixtures.
   ═══════════════════════════════════════════ */

export interface PushEligibilityProspect extends ConsentGateInput {
  do_not_contact: boolean | null | undefined;
  primary_phone: string | null | undefined;
}

export type PushBlockCode =
  | "blocked_dnc"
  | ConsentBlockCode
  | "blocked_blacklist"
  | "blocked_unsubscribed";

export type PushEligibilityResult =
  | { eligible: true }
  | { eligible: false; code: PushBlockCode; reason: string; blacklistType?: "domain" | "email" | "phone" };

export interface PushEligibilityDeps {
  checkBlacklist: typeof checkBlacklist;
  isEmailUnsubscribed: typeof isEmailUnsubscribed;
  now?: Date;
}

export async function checkPushEligibility(
  prospect: PushEligibilityProspect,
  deps: Partial<PushEligibilityDeps> = {},
): Promise<PushEligibilityResult> {
  const d: PushEligibilityDeps = {
    checkBlacklist: deps.checkBlacklist ?? checkBlacklist,
    isEmailUnsubscribed: deps.isEmailUnsubscribed ?? isEmailUnsubscribed,
    now: deps.now,
  };

  if (prospect.do_not_contact) {
    return { eligible: false, code: "blocked_dnc", reason: "do_not_contact flag set" };
  }

  const consent = evaluateConsentGate(prospect, d.now ?? new Date());
  if (!consent.eligible) {
    return { eligible: false, code: consent.code, reason: consent.reason };
  }

  const bl = await d.checkBlacklist(
    prospect.website_domain,
    prospect.primary_email,
    prospect.primary_phone,
  );
  if (bl.blocked) {
    return {
      eligible: false,
      code: "blocked_blacklist",
      reason: `Blacklisted ${bl.type}: ${bl.reason}`,
      blacklistType: bl.type,
    };
  }

  if (prospect.primary_email && (await d.isEmailUnsubscribed(prospect.primary_email))) {
    return {
      eligible: false,
      code: "blocked_unsubscribed",
      reason: "Email present in the transactional unsubscribe registry (email_unsubscribes)",
    };
  }

  return { eligible: true };
}

/* ═══════════════════════════════════════════
   LANE OB — Global volume ramp

   Cross-campaign daily cap on real platform pushes, enforced BEFORE
   per-campaign caps. Schedule: 50/day starting at the first REAL
   (non-dry-run) send, +25/day for each full week since. The env var
   OUTBOUND_GLOBAL_DAILY_CAP, when set, is a hard ceiling on top of the
   ramp (effective cap = min(ramp, env)).
   ═══════════════════════════════════════════ */

export const RAMP_BASE_DAILY = 50;
export const RAMP_WEEKLY_INCREMENT = 25;

/** Pure ramp math. firstRealSendAt=null means nothing real ever sent → week 0. */
export function computeGlobalDailyCap(firstRealSendAt: Date | null, now: Date = new Date()): number {
  let ramp = RAMP_BASE_DAILY;
  if (firstRealSendAt) {
    const elapsedMs = now.getTime() - firstRealSendAt.getTime();
    const fullWeeks = Math.max(0, Math.floor(elapsedMs / (7 * 24 * 60 * 60 * 1000)));
    ramp = RAMP_BASE_DAILY + fullWeeks * RAMP_WEEKLY_INCREMENT;
  }
  const envCapRaw = process.env.OUTBOUND_GLOBAL_DAILY_CAP;
  if (envCapRaw) {
    const envCap = parseInt(envCapRaw, 10);
    if (Number.isFinite(envCap) && envCap > 0) return Math.min(ramp, envCap);
  }
  return ramp;
}

/**
 * In-run accounting for the global cap so it holds ACROSS campaigns in a
 * single worker pass: instantiate once per run with (cap, alreadySentToday),
 * then consume one unit per real push regardless of which campaign it
 * belongs to.
 */
export class GlobalSendBudget {
  constructor(
    public readonly cap: number,
    private used: number,
  ) {}

  get remaining(): number {
    return Math.max(0, this.cap - this.used);
  }

  /** Reserve one send. Returns false (and consumes nothing) once the cap is hit. */
  tryConsume(): boolean {
    if (this.used >= this.cap) return false;
    this.used++;
    return true;
  }
}

/* ═══════════════════════════════════════════
   LANE OB — CAN-SPAM sequence body validation

   Every step of a sequence must carry, at activation time:
     1. a physical postal address (merge token or literal street address)
     2. an unsubscribe mechanism (merge token, or an explicit
        unsubscribe/opt-out mention alongside a link)
   ═══════════════════════════════════════════ */

const ADDRESS_TOKENS = [
  "{{sender_address}}", "{{company_address}}", "{{physical_address}}",
  "{{business_address}}", "{{address}}", "{{sendingaccountaddress}}",
];

/** Literal street address: "123 Main St", "4501 W Innovation Blvd Suite 200", … */
const LITERAL_ADDRESS_RX =
  /\b\d{1,6}\s+[A-Za-z0-9.\- ]{2,40}\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|place|pl|suite|ste|unit|floor|hwy|highway)\b\.?/i;

const UNSUBSCRIBE_TOKENS = [
  "{{unsubscribe}}", "{{unsubscribe_link}}", "{{unsubscribe_url}}",
  "{{opt_out}}", "{{optout}}", "{{opt_out_link}}",
];

const UNSUBSCRIBE_TEXT_RX = /\b(unsubscribe|opt[ -]?out|stop receiving|stop these emails)\b/i;

export interface CanSpamValidation {
  ok: boolean;
  missing: ("physical_address" | "unsubscribe")[];
}

/** Validate ONE email body for CAN-SPAM requirements. Pure. */
export function validateCanSpamBody(body: string | null | undefined): CanSpamValidation {
  const text = body || "";
  const lower = text.toLowerCase();

  const hasAddress =
    ADDRESS_TOKENS.some((t) => lower.includes(t)) || LITERAL_ADDRESS_RX.test(text);

  const hasUnsubscribe =
    UNSUBSCRIBE_TOKENS.some((t) => lower.includes(t)) || UNSUBSCRIBE_TEXT_RX.test(text);

  const missing: CanSpamValidation["missing"] = [];
  if (!hasAddress) missing.push("physical_address");
  if (!hasUnsubscribe) missing.push("unsubscribe");
  return { ok: missing.length === 0, missing };
}

/** Validate every step of a sequence. Returns per-step failures for a clear 422. */
export function validateSequenceCanSpam(
  steps: { order_index: number; body_template: string }[],
): { ok: boolean; failures: { order_index: number; missing: CanSpamValidation["missing"] }[] } {
  const failures: { order_index: number; missing: CanSpamValidation["missing"] }[] = [];
  for (const step of steps) {
    const v = validateCanSpamBody(step.body_template);
    if (!v.ok) failures.push({ order_index: step.order_index, missing: v.missing });
  }
  return { ok: failures.length === 0, failures };
}

/* ═══════════════════════════════════════════
   LANE OB — Platform global-suppression bridge

   Lane OA is adding `pushGlobalSuppression(emails: string[]):
   Promise<{suppressed: number}>` to the PlatformAdapter interface
   (frozen signature). That interface is NOT exported and OA has not
   merged yet, so we duck-type at the factory boundary: if the adapter
   exposes the method we call it; otherwise we report unsupported (and
   the caller logs). This merges cleanly with OA's change — once their
   adapters implement the method, this starts pushing for real with NO
   code change here. The NoopAdapter (dry-run) either lacks the method
   (today) or no-ops it (after OA) — either way nothing real is sent.
   ═══════════════════════════════════════════ */

type GlobalSuppressionCapable = {
  pushGlobalSuppression?: (emails: string[]) => Promise<{ suppressed: number }>;
};

export async function pushPermanentSuppressionToPlatform(
  platform: OutreachPlatform,
  campaignMetadata: Record<string, unknown> | null,
  emails: string[],
): Promise<{ supported: boolean; suppressed: number }> {
  const valid = emails.map((e) => (e || "").toLowerCase().trim()).filter((e) => e.includes("@"));
  if (valid.length === 0) return { supported: true, suppressed: 0 };

  let adapter: GlobalSuppressionCapable;
  try {
    adapter = getOutreachAdapter(platform, campaignMetadata) as unknown as GlobalSuppressionCapable;
  } catch (err: any) {
    // API key not configured — nothing to push to.
    log.warn("pushPermanentSuppressionToPlatform: adapter unavailable", { platform, error: err.message });
    return { supported: false, suppressed: 0 };
  }

  if (typeof adapter.pushGlobalSuppression !== "function") {
    // Lane OA's adapter method not merged yet — local suppression still holds.
    log.info("Platform adapter has no pushGlobalSuppression yet — local suppression only", { platform });
    return { supported: false, suppressed: 0 };
  }

  const result = await adapter.pushGlobalSuppression(valid);
  return { supported: true, suppressed: result.suppressed };
}
