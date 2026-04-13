/**
 * Outbound Safety Service
 *
 * Provides four capabilities used throughout the outbound module:
 *  1. Dedup fingerprint generation         (Task 1)
 *  2. Contact confidence scoring            (Task 2)
 *  3. Global blacklist check & management  (Task 7)
 *  4. Reply sentiment classification       (Task 5)
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
