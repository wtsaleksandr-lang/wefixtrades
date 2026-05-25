/**
 * PII redaction for persistence boundaries.
 *
 * Wrap any free-form text (transcripts, chat messages, audit-log bodies)
 * with `redactPii()` BEFORE it leaves process memory for durable storage.
 * The substitutions are intentionally aggressive — false positives just
 * mean a `[REDACTED]` token replaces a string that looked like sensitive
 * data; false negatives leak PII into long-lived storage and breach our
 * data-handling promises.
 *
 * Patterns covered:
 *   1. Credit-card-like runs of 13–19 digits (spaces / dashes allowed).
 *   2. US Social Security Numbers (XXX-XX-XXXX).
 *   3. Generic email addresses — EXCEPT any address ending in
 *      `@wefixtrades.com`, which are internal staff emails we keep so
 *      audit trails still attribute internal replies correctly.
 *
 * Order matters: card / SSN run BEFORE the email pass so a SSN-shaped
 * substring inside an address local-part still gets caught.
 */

const CREDIT_CARD_RE = /\b(?:\d[ -]?){13,19}\b/g;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

const INTERNAL_EMAIL_SUFFIX = "@wefixtrades.com";

export function redactPii(text: string): string {
  if (typeof text !== "string" || text.length === 0) return text;

  let out = text.replace(CREDIT_CARD_RE, "[REDACTED]");
  out = out.replace(SSN_RE, "[REDACTED]");
  out = out.replace(EMAIL_RE, (match) =>
    match.toLowerCase().endsWith(INTERNAL_EMAIL_SUFFIX) ? match : "[REDACTED]"
  );
  return out;
}
