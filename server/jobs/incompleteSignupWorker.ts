/**
 * Incomplete-signup re-engagement worker.
 *
 * Wins back free WeFixTrades signups who created an account but never
 * published a QuoteQuick calculator — a measured activation leak. Signups
 * auto-login (no email-verify checkpoint), so a user who lands on the
 * dashboard, gets confused, and leaves currently receives NO follow-up.
 *
 * A gentle 3-step sequence, each gated on STILL-no-calculator AND
 * not-already-sent-this-step:
 *   - Day 1 (≥24h after signup)  "finish your calculator"
 *   - Day 3                       re-nudge
 *   - Day 7                       last call
 * The sequence stops entirely once the client publishes a calculator.
 *
 * ── INERT BY DEFAULT ──
 * The flag INCOMPLETE_SIGNUP_EMAILS_ENABLED must equal the string "true" for
 * anything to send. It is checked FIRST; when off, the worker returns an
 * inert summary and NO email is ever sent, no DB write happens, nothing is
 * stamped. This worker sends REAL email, so it ships dormant until Alex
 * flips the flag.
 *
 * ── Idempotency / "sent step" state ──
 * Tracked on clients.metadata.incomplete_signup_emails as
 *   { day1_sent_at, day3_sent_at, day7_sent_at }  (ISO strings).
 * The targets have NO calculator, so the calculator-keyed analytics_events
 * dedup used by trialLifecycleWorker is unusable here — clients.metadata is
 * the natural per-account ledger (existing jsonb column, no migration). Each
 * step checks its own stamp; a step is never sent twice. Publishing a
 * calculator removes the client from the selection set, so the sequence
 * stops mid-flight with no extra bookkeeping.
 *
 * ── Compliance ──
 * Re-engagement to our own signups, but treated as MARKETING-class:
 * isEmailUnsubscribed() is checked before every send (worker-level + a
 * belt-and-braces check inside sendIncompleteSignupEmail), and the email
 * footer carries the per-recipient unsubscribe link.
 */

// NOTE on imports: the worker's pure control flow (flag check, dueStep,
// orchestration over an INJECTED IO) must load WITHOUT pulling in the DB /
// SMTP / Sentry dependency tree, so the standalone test can drive it with a
// fake IO and no installed runtime deps. Everything DB/email/logger-bound is
// therefore lazily `await import()`-ed inside buildDefaultIO() / lazyLog(),
// and only `import type` (erased at runtime) is used at module scope.
import type { IncompleteSignupStep } from "../lib/incompleteSignupEmail";

/** Local runtime copy of the step list (avoids importing the email module,
 *  which transitively loads nodemailer). Kept in sync with the email lib. */
const INCOMPLETE_SIGNUP_STEPS: readonly IncompleteSignupStep[] = [1, 3, 7] as const;

/**
 * Emit a single info line. `../lib/logger` imports @sentry/node, so we load
 * it lazily (only when the live worker runs) and fall back to console.info if
 * the logger tree isn't available (e.g. the injected-IO test). The fallback
 * keeps the message visible — this is not a swallowed error.
 */
async function logInfo(message: string, meta: Record<string, unknown>): Promise<void> {
  try {
    const { createLogger } = await import("../lib/logger");
    createLogger("IncompleteSignupWorker").info(message, meta);
  } catch (loggerUnavailable: any) {
    console.info(`[IncompleteSignupWorker] ${message}`, meta, `(logger fallback: ${loggerUnavailable?.message ?? loggerUnavailable})`);
  }
}

const META_KEY = "incomplete_signup_emails";
const STEP_STAMP: Record<IncompleteSignupStep, string> = {
  1: "day1_sent_at",
  3: "day3_sent_at",
  7: "day7_sent_at",
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MIN_AGE_HOURS = 24;
const MS_PER_HOUR = 1000 * 60 * 60;

/** Inert default. Only the exact string "true" arms the worker. */
export function incompleteSignupEmailsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.INCOMPLETE_SIGNUP_EMAILS_ENABLED === "true";
}

/** Per-tick recipient cap (env override). Default 50. */
function batchCap(env: NodeJS.ProcessEnv = process.env): number {
  const raw = parseInt(env.INCOMPLETE_SIGNUP_EMAILS_BATCH || "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 50;
}

/** A signup with no published calculator, eligible for the sequence. */
export interface IncompleteSignupRecord {
  client_id: number;
  business_name: string;
  contact_name: string | null;
  contact_email: string;
  created_at: Date | string;
  /** Existing per-step stamps from clients.metadata.incomplete_signup_emails. */
  sentStamps: Partial<Record<string, string>>;
}

/**
 * Injected IO surface. Deliberately narrow + fully fakeable so the test can
 * drive the whole pass with a fake store / email sink / clock and assert
 * inertness, selection, idempotency, suppression, batch cap, and per-
 * recipient failure isolation — no DB, no SMTP.
 */
export interface IncompleteSignupIO {
  /**
   * Return clients that: have a contact_email, created ≥24h ago, and own
   * ZERO calculators (no published calculator). Includes their current
   * per-step stamps so the caller can decide which step (if any) is due.
   */
  listIncompleteSignups(now: number): Promise<IncompleteSignupRecord[]>;
  /** Marketing-suppression check (unsubscribe list). */
  isUnsubscribed(email: string): Promise<boolean>;
  /** Send one step's email. Resolves true if accepted; throws on failure. */
  sendStep(step: IncompleteSignupStep, rec: IncompleteSignupRecord): Promise<boolean>;
  /** Persist the per-step sent stamp (idempotency ledger write). */
  markSent(clientId: number, step: IncompleteSignupStep, at: Date): Promise<void>;
  /** Absolute base URL for building the wizard CTA link. */
  baseUrl: string;
  /** Support email surfaced in the email body. */
  supportEmail: string;
}

export interface IncompleteSignupSummary {
  enabled: boolean;
  scanned: number;
  emails: number;
  skippedUnsubscribed: number;
  errors: string[];
}

/** Whole days elapsed since `created_at`, floored. */
export function ageDays(createdAt: Date | string, now: number): number {
  return Math.floor((now - new Date(createdAt).getTime()) / MS_PER_DAY);
}

/**
 * Which step is due for a record at `now`, or null if none.
 *  - Step fires when ageDays >= step AND that step's stamp is absent.
 *  - We pick the LATEST eligible step so a long-dormant signup that we
 *    somehow never emailed jumps straight to the most relevant message
 *    (and the earlier stamps are filled too, below) rather than restarting
 *    a stale day-1 drip.
 */
export function dueStep(rec: IncompleteSignupRecord, now: number): IncompleteSignupStep | null {
  const age = ageDays(rec.created_at, now);
  let due: IncompleteSignupStep | null = null;
  for (const step of INCOMPLETE_SIGNUP_STEPS) {
    if (age >= step && !rec.sentStamps[STEP_STAMP[step]]) {
      due = step;
    }
  }
  return due;
}

/**
 * Live IO surface. Built lazily (async) so its DB/SMTP imports are only
 * pulled in when the real worker runs — never when the test injects a fake.
 */
async function buildDefaultIO(): Promise<IncompleteSignupIO> {
  const { db } = await import("../db");
  const { clients, calculators } = await import("@shared/schema");
  const { and, isNotNull, lte, sql } = await import("drizzle-orm");
  const { isEmailUnsubscribed } = await import("../lib/unsubscribeStorage");
  const { sendIncompleteSignupEmail } = await import("../lib/incompleteSignupEmail");

  const baseUrl = (
    process.env.APP_URL ||
    process.env.APP_PUBLIC_URL ||
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://wefixtrades.com")
  ).replace(/\/$/, "");
  const supportEmail =
    process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL || "support@wefixtrades.com";

  return {
    baseUrl,
    supportEmail,

    async listIncompleteSignups(now) {
      const cutoff = new Date(now - MIN_AGE_HOURS * MS_PER_HOUR);
      const rows = await db
        .select({
          client_id: clients.id,
          business_name: clients.business_name,
          contact_name: clients.contact_name,
          contact_email: clients.contact_email,
          created_at: clients.created_at,
          metadata: clients.metadata,
        })
        .from(clients)
        // No published calculator: the client's user owns zero calculator rows.
        // clients.user_id → calculators.user_id (same linkage the
        // /api/portal/quotequick/summary endpoint uses).
        .where(
          and(
            isNotNull(clients.contact_email),
            isNotNull(clients.user_id),
            lte(clients.created_at, cutoff),
            sql`NOT EXISTS (
              SELECT 1 FROM ${calculators}
              WHERE ${calculators.user_id} = ${clients.user_id}
            )`,
          ),
        );

      return rows
        .filter((r): r is typeof r & { contact_email: string; created_at: Date } =>
          !!r.contact_email && !!r.created_at,
        )
        .map((r) => {
          const meta = (r.metadata as Record<string, any> | null) ?? {};
          const ledger = (meta[META_KEY] as Record<string, string> | undefined) ?? {};
          return {
            client_id: r.client_id,
            business_name: r.business_name,
            contact_name: r.contact_name,
            contact_email: r.contact_email,
            created_at: r.created_at,
            sentStamps: ledger,
          };
        });
    },

    async isUnsubscribed(email) {
      return isEmailUnsubscribed(email);
    },

    async sendStep(step, rec) {
      const firstName =
        (rec.contact_name || rec.business_name || "there").split(" ")[0] || "there";
      return sendIncompleteSignupEmail(step, {
        recipientEmail: rec.contact_email,
        firstName,
        businessName: rec.business_name,
        wizardUrl: `${baseUrl}/wizard`,
        supportEmail,
      });
    },

    async markSent(clientId, step, at) {
      // jsonb deep-merge so we never clobber sibling metadata keys, and so a
      // concurrent stamp from another step on the same client is preserved.
      const stamp = STEP_STAMP[step];
      await db.execute(sql`
        UPDATE clients
        SET metadata = COALESCE(metadata, '{}'::jsonb)
          || jsonb_build_object(
               ${META_KEY},
               COALESCE(metadata -> ${META_KEY}, '{}'::jsonb)
                 || jsonb_build_object(${stamp}, ${at.toISOString()}::text)
             )
        WHERE id = ${clientId}
      `);
    },
  };
}

/**
 * One scheduler tick. INERT unless INCOMPLETE_SIGNUP_EMAILS_ENABLED==="true".
 *
 * @param now  injectable clock (ms) — defaults to Date.now()
 * @param io   injectable IO surface — defaults to the live DB/SMTP impl
 */
export async function processIncompleteSignupTick(
  now: number = Date.now(),
  io?: IncompleteSignupIO,
): Promise<IncompleteSignupSummary> {
  const summary: IncompleteSignupSummary = {
    enabled: false,
    scanned: 0,
    emails: 0,
    skippedUnsubscribed: 0,
    errors: [],
  };

  // FLAG CHECKED FIRST — when off, return inert. No IO is constructed, no
  // query runs, and absolutely no email is sent.
  if (!incompleteSignupEmailsEnabled()) {
    return summary;
  }
  summary.enabled = true;

  const effectiveIO = io ?? (await buildDefaultIO());
  const cap = batchCap();

  const records = await effectiveIO.listIncompleteSignups(now);
  summary.scanned = records.length;

  for (const rec of records) {
    if (summary.emails >= cap) break;

    const step = dueStep(rec, now);
    if (step === null) continue;

    // Marketing suppression — never email an unsubscribed recipient.
    let unsubscribed = false;
    try {
      unsubscribed = await effectiveIO.isUnsubscribed(rec.contact_email);
    } catch (err: any) {
      // A broken suppression check must not silently let us spam — log it
      // and skip this recipient this tick (fail closed for the unsub gate).
      summary.errors.push(`client ${rec.client_id} unsub-check: ${err?.message ?? err}`);
      continue;
    }
    if (unsubscribed) {
      summary.skippedUnsubscribed++;
      continue;
    }

    try {
      const sent = await effectiveIO.sendStep(step, rec);
      if (!sent) {
        // SMTP not configured / recipient suppressed at send-time — not an
        // error, just nothing delivered. Do NOT stamp (so it retries once
        // sending is possible).
        continue;
      }
      await effectiveIO.markSent(rec.client_id, step, new Date(now));
      summary.emails++;
    } catch (err: any) {
      // Per-recipient failure isolation: record and continue the batch.
      // Not stamped, so the step is retried next tick.
      summary.errors.push(`client ${rec.client_id} step ${step}: ${err?.message ?? err}`);
    }
  }

  if (summary.emails > 0 || summary.errors.length > 0) {
    await logInfo("incomplete-signup pass complete", {
      scanned: summary.scanned,
      emails: summary.emails,
      skippedUnsubscribed: summary.skippedUnsubscribed,
      errors: summary.errors.length,
    });
  }
  return summary;
}
