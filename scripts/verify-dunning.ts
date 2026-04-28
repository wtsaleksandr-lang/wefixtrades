/**
 * Verification harness for the Billing Recovery / Dunning system.
 *
 * Exercises:
 *   1. Signed billing portal token round-trip + tampering detection
 *   2. Each email template renders + has correct subject + has CTA
 *   3. Schedule path: scheduleFailedPaymentSequence creates 3 rows at
 *      +2 / +5 / +7 days; replay with same event id is a no-op
 *   4. Cancellation path: cancelPendingForSubscription flips 'pending'
 *      rows to 'cancelled'
 *   5. Worker integration: send a row via stubbed transporter, verify
 *      DB row marked sent + recipient captured
 *   6. 24h resend guard: with one row already sent within 24h, a second
 *      row of same kind for same subscription is skipped with reason
 *      'resend_guard'
 *
 * No SMTP env vars are set, so the worker uses a monkey-patched
 * sendMail that records calls but never opens a connection.
 *
 * Run: tsx scripts/verify-dunning.ts
 */

process.env.SMTP_HOST = "smtp.example.invalid";
process.env.SMTP_PORT = "587";
process.env.SMTP_USER = "verify-harness@example.invalid";
process.env.SMTP_PASS = "fake-password-not-real";
process.env.SMTP_FROM = "verify@example.invalid";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://localhost:5432/dummy_no_connect";
process.env.BILLING_PORTAL_SECRET = "verify-harness-billing-portal-secret-deterministic";

let pass = 0;
let fail = 0;

function assert(label: string, cond: boolean) {
  if (cond) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}`);
    fail++;
  }
}

/* ─── Test 1: signed billing portal token ─── */

console.log("\n[1] Billing portal HMAC token");

const { buildBillingPortalToken, verifyBillingPortalToken, buildBillingPortalUrl } = await import("../server/lib/billingPortalToken");

const tok = buildBillingPortalToken({ stripeCustomerId: "cus_TEST123" });
const verified = verifyBillingPortalToken(tok);
assert("round-trip — verify returns the same customer id", verified?.stripeCustomerId === "cus_TEST123");
assert("token has expires_at in the future", !!verified && verified.expiresAt > Math.floor(Date.now() / 1000));

// Tampering: flip a single character in the signature
const tampered = tok.slice(0, -2) + (tok.slice(-2) === "AA" ? "BB" : "AA");
assert("tampered signature → null", verifyBillingPortalToken(tampered) === null);

// Expired token
const expired = buildBillingPortalToken({ stripeCustomerId: "cus_TEST456", ttlSeconds: -10 });
assert("expired token → null", verifyBillingPortalToken(expired) === null);

// Garbage input
assert("empty string → null", verifyBillingPortalToken("") === null);
assert("malformed → null", verifyBillingPortalToken("not.a.valid.token") === null);

const url = buildBillingPortalUrl({ stripeCustomerId: "cus_TEST789", baseUrl: "https://example.com" });
assert("URL has correct shape", url.startsWith("https://example.com/api/billing/portal/") && url.split("/").pop()!.includes("."));

/* ─── Test 2: email template rendering ─── */

console.log("\n[2] Email template rendering");

const {
  buildDay2ReminderEmail,
  buildDay5FinalReminderEmail,
  buildDay7WarningEmail,
  buildCardExpiringEmail,
  buildSubscriptionCanceledEmail,
} = await import("../server/lib/dunningEmails");

const sharedParams = {
  contactFirstName: "Sam",
  amount: "$199.00",
  portalUrl: "https://example.com/api/billing/portal/abc.def",
  supportEmail: "support@example.com",
  recipientEmail: "sam@example.test",
};

const day2 = buildDay2ReminderEmail(sharedParams);
assert("Day 2 subject matches user spec", day2.subject === "Payment issue — action needed");
assert("Day 2 HTML contains CTA portal link", day2.html.includes(sharedParams.portalUrl));
assert("Day 2 HTML contains amount", day2.html.includes("$199.00"));
assert("Day 2 HTML uses first name", day2.html.includes("Sam"));
assert("Day 2 plain text exists + has CTA", day2.text.length > 50 && day2.text.includes(sharedParams.portalUrl));
assert("Day 2 HTML has mobile viewport meta", day2.html.includes("viewport"));

const day5 = buildDay5FinalReminderEmail(sharedParams);
assert("Day 5 subject matches user spec", day5.subject === "Billing update needed");
assert("Day 5 has CTA + amount", day5.html.includes(sharedParams.portalUrl) && day5.html.includes("$199.00"));

const day7 = buildDay7WarningEmail(sharedParams);
assert("Day 7 subject matches user spec", day7.subject === "Final reminder to keep service active");
assert("Day 7 mentions service-at-risk pill", day7.html.includes("Service at risk"));
assert("Day 7 says 'may pause' (warning, not auto-pause)", day7.html.includes("may pause"));

const cardExp = buildCardExpiringEmail({ ...sharedParams, cardLast4: "4242", cardBrand: "Visa", expMonth: 9, expYear: 2026 });
assert("Card-expiring subject", cardExp.subject === "Your card is about to expire");
assert("Card-expiring shows last4 + brand", cardExp.html.includes("4242") && cardExp.html.includes("Visa"));
assert("Card-expiring shows formatted exp date", cardExp.html.includes("09/26"));

const canceled = buildSubscriptionCanceledEmail({ ...sharedParams, serviceName: "QuoteQuick Pro" });
assert("Canceled subject", canceled.subject === "Your WeFixTrades subscription has been canceled");
assert("Canceled mentions service name", canceled.html.includes("QuoteQuick Pro"));

/* ─── Test 3: schedule + cancel + send via stubbed db ─── */

console.log("\n[3] Schedule / cancel / send pipeline");

// Stub the DB layer in-memory so we can verify behavior without postgres
type Row = {
  id: number;
  client_id: number | null;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  stripe_invoice_id: string | null;
  trigger_event: string;
  trigger_event_id: string;
  kind: string;
  scheduled_for: Date;
  sent_at: Date | null;
  status: string;
  cancel_reason: string | null;
  amount_cents: number | null;
  currency: string | null;
  metadata: any;
  created_at: Date;
  updated_at: Date;
};
const memStore: Row[] = [];
let nextId = 1;
const memClients: Array<{ id: number; stripe_customer_id: string; contact_email: string; contact_name: string; business_name: string }> = [
  { id: 5001, stripe_customer_id: "cus_ACME", contact_email: "ops@acme.test", contact_name: "Sam Owner", business_name: "Acme Plumbing" },
];

// Tablename detection helper — same as AdFlow harness
function tableNameOf(t: any): string {
  if (!t) return "";
  for (const sym of Object.getOwnPropertySymbols(t)) {
    const desc = sym.description || "";
    if (desc.includes("Name")) {
      const v = t[sym];
      if (typeof v === "string") return v;
    }
  }
  return t.tableName || t._?.name || "";
}

// Walk drizzle SQL queryChunks tree and pull out [colName, value] pairs
// from every embedded `eq(column, value)` predicate. Drizzle composes
// SQL as a recursive structure of StringChunks + ColumnRefs + values,
// so we just look for the canonical eq pattern: ["", colRef, " = ", val, ""].
// Drizzle wraps the literal value in a Param object — unwrap it.
function unwrapParam(v: any): any {
  if (v && typeof v === "object" && "value" in v && v.constructor?.name === "Param") return v.value;
  return v;
}
function extractEqPredicates(node: any): Array<{ colName: string; value: any }> {
  const out: Array<{ colName: string; value: any }> = [];
  function walk(n: any) {
    if (!n || typeof n !== "object") return;
    const chunks = n.queryChunks;
    if (!Array.isArray(chunks)) return;
    // Pattern: this SQL is itself an eq predicate
    if (chunks.length >= 5) {
      for (let i = 0; i < chunks.length - 2; i++) {
        const a = chunks[i];
        const b = chunks[i + 1];
        const c = chunks[i + 2];
        if (b && typeof b === "object" && b.value && Array.isArray(b.value) && b.value[0] === " = ") {
          const col = a;
          const value = unwrapParam(c);
          const colName = col?._?.name || col?.name;
          if (typeof colName === "string") {
            out.push({ colName, value });
          }
        }
      }
    }
    // Recurse into nested SQL fragments
    for (const ch of chunks) walk(ch);
  }
  walk(node);
  return out;
}

const { db } = await import("../server/db");

(db as any).select = function (..._cols: any[]) {
  let fromTable: any = null;
  return {
    from(t: any) { fromTable = t; return this; },
    innerJoin(_t: any, _on: any) { return this; },
    where(cond: any) {
      const tn = tableNameOf(fromTable);
      const preds = extractEqPredicates(cond);
      function findPred(colName: string) { return preds.find(p => p.colName === colName); }

      const runMatch = () => {
        if (tn === "clients") {
          const idEq = findPred("id");
          const custEq = findPred("stripe_customer_id");
          const c = memClients.find(c =>
            (idEq && c.id === idEq.value) || (custEq && c.stripe_customer_id === custEq.value),
          );
          return c ? [{
            id: c.id,
            contact_email: c.contact_email,
            contact_name: c.contact_name,
            business_name: c.business_name,
            stripe_customer_id: c.stripe_customer_id,
          }] : [];
        }
        if (tn === "billing_dunning_events") {
          const evIdEq = findPred("trigger_event_id");
          const subIdEq = findPred("stripe_subscription_id");
          const custEq = findPred("stripe_customer_id");
          const kindEq = findPred("kind");
          const statusEq = findPred("status");

          return memStore.filter(r => {
            if (evIdEq && r.trigger_event_id !== evIdEq.value) return false;
            if (subIdEq && r.stripe_subscription_id !== subIdEq.value) return false;
            if (custEq && r.stripe_customer_id !== custEq.value) return false;
            if (kindEq && r.kind !== kindEq.value) return false;
            if (statusEq && r.status !== statusEq.value) return false;
            return true;
          }).map(r => ({ id: r.id, ...r }));
        }
        if (tn.includes("unsubscribe")) return [];
        return [];
      };

      return {
        limit: (_n: number) => Promise.resolve(runMatch()),
        orderBy: (..._cols: any[]) => ({
          limit: (_n: number) => {
            if (tn === "billing_dunning_events") {
              const now = new Date();
              return Promise.resolve(memStore.filter(r => r.status === "pending" && r.scheduled_for <= now));
            }
            return Promise.resolve([]);
          },
        }),
      };
    },
  };
};

(db as any).insert = function (_t: any) {
  return {
    values(v: any) {
      const row: Row = {
        id: nextId++,
        client_id: v.client_id ?? null,
        stripe_customer_id: v.stripe_customer_id,
        stripe_subscription_id: v.stripe_subscription_id ?? null,
        stripe_invoice_id: v.stripe_invoice_id ?? null,
        trigger_event: v.trigger_event,
        trigger_event_id: v.trigger_event_id,
        kind: v.kind,
        scheduled_for: v.scheduled_for instanceof Date ? v.scheduled_for : new Date(v.scheduled_for),
        sent_at: null,
        status: v.status ?? "pending",
        cancel_reason: null,
        amount_cents: v.amount_cents ?? null,
        currency: v.currency ?? null,
        metadata: v.metadata ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      memStore.push(row);
      return {
        returning: () => Promise.resolve([row]),
        // Calls without .returning resolve to nothing
        then: (resolve: any) => resolve(undefined),
      };
    },
  };
};

(db as any).update = function (_t: any) {
  let setClause: any = null;
  return {
    set(v: any) { setClause = v; return this; },
    where(cond: any) {
      const preds = extractEqPredicates(cond);
      function findPred(colName: string) { return preds.find(p => p.colName === colName); }

      const applyTo = (rows: Row[]): Row[] => {
        for (const r of rows) {
          // Skip the SQL-merge metadata clause (we don't simulate jsonb concat here)
          const cleaned: any = {};
          for (const k of Object.keys(setClause || {})) {
            const v = (setClause as any)[k];
            if (k === "metadata" && v && typeof v === "object" && (v as any).queryChunks) continue;
            cleaned[k] = v;
          }
          Object.assign(r, cleaned, { updated_at: new Date() });
        }
        return rows;
      };

      const matches = memStore.filter(r => {
        const idEq = findPred("id");
        const subEq = findPred("stripe_subscription_id");
        const statusEq = findPred("status");
        if (idEq && r.id !== idEq.value) return false;
        if (subEq && r.stripe_subscription_id !== subEq.value) return false;
        if (statusEq && r.status !== statusEq.value) return false;
        return true;
      });

      return {
        returning: (_cols?: any) => Promise.resolve(applyTo(matches).map(r => ({ id: r.id }))),
        then: (resolve: any) => { applyTo(matches); resolve(undefined); },
      };
    },
  };
};

// isEmailUnsubscribed naturally fails-open on DB errors AND our select stub
// returns [] for the email_unsubscribes table → !!row → false (not unsubscribed).
// No monkey-patch needed.

// Stub the SMTP transporter
const transportMod = await import("../server/lib/emailTransport");
const transporter = transportMod.getEmailTransporter();
let sendMailLog: Array<{ to: string; subject: string }> = [];
if (transporter) {
  (transporter as any).sendMail = async (opts: any) => {
    sendMailLog.push({ to: opts.to, subject: opts.subject });
    return { messageId: `<verify-${sendMailLog.length}@example.invalid>` };
  };
}

const { scheduleFailedPaymentSequence, cancelPendingForSubscription } = await import("../server/services/dunningService");

// 3a. Initial schedule
const failedAt = new Date(2026, 3, 1, 12, 0, 0); // April 1 2026 noon
const sched1 = await scheduleFailedPaymentSequence({
  stripeCustomerId: "cus_ACME",
  stripeSubscriptionId: "sub_ACME",
  stripeInvoiceId: "in_001",
  triggerEventId: "evt_001",
  amountCents: 19900,
  currency: "usd",
  clientId: 5001,
  failedAt,
});
assert("schedule inserts 3 rows on first call", sched1.scheduled === 3 && sched1.skipped === 0);
assert("memStore has 3 pending rows", memStore.length === 3 && memStore.every(r => r.status === "pending"));
assert("scheduled_for is +2/+5/+7 days from failedAt", (() => {
  const days = memStore.map(r => Math.round((r.scheduled_for.getTime() - failedAt.getTime()) / (24*60*60*1000)));
  return days.includes(2) && days.includes(5) && days.includes(7);
})());

// 3b. Idempotent replay
const sched2 = await scheduleFailedPaymentSequence({
  stripeCustomerId: "cus_ACME",
  stripeSubscriptionId: "sub_ACME",
  stripeInvoiceId: "in_001",
  triggerEventId: "evt_001",
  amountCents: 19900,
  currency: "usd",
  clientId: 5001,
  failedAt,
});
assert("replay with same event_id schedules 0, skips 3", sched2.scheduled === 0 && sched2.skipped === 3);
assert("memStore still has 3 rows", memStore.length === 3);

// 3c. Cancel-on-success
const cancelled = await cancelPendingForSubscription({
  stripeSubscriptionId: "sub_ACME",
  reason: "payment_succeeded",
});
assert("cancelPendingForSubscription flips all 3 to cancelled", cancelled === 3);
assert("all rows now status=cancelled", memStore.every(r => r.status === "cancelled"));
assert("cancel_reason is payment_succeeded", memStore.every(r => r.cancel_reason === "payment_succeeded"));

/* ─── Test 4: worker drain + send + 24h resend guard ─── */

console.log("\n[4] Worker drain + send + 24h resend guard");

// Schedule a fresh sequence with failedAt = several days ago so all rows are due now
const failedLongAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
const schedDue = await scheduleFailedPaymentSequence({
  stripeCustomerId: "cus_ACME",
  stripeSubscriptionId: "sub_ACME2",
  stripeInvoiceId: "in_002",
  triggerEventId: "evt_002",
  amountCents: 9900,
  currency: "usd",
  clientId: 5001,
  failedAt: failedLongAgo,
});
assert("3 due rows scheduled", schedDue.scheduled === 3);

const { processDunningQueue } = await import("../server/jobs/dunningWorker");
sendMailLog = [];
const drainResult = await processDunningQueue();

assert("worker processed all 3 due rows", drainResult.processed === 3);
assert("3 sent (transporter stubbed)", drainResult.sent === 3);
assert("0 failed / 0 skipped", drainResult.failed === 0 && drainResult.skipped === 0);
assert("sendMail called 3 times", sendMailLog.length === 3);
assert("subjects match the 3 user-spec subjects", (() => {
  const subjects = sendMailLog.map(l => l.subject).sort();
  return subjects[0] === "Billing update needed"
      && subjects[1] === "Final reminder to keep service active"
      && subjects[2] === "Payment issue — action needed";
})());
assert("all sends went to ops@acme.test", sendMailLog.every(l => l.to === "ops@acme.test"));
assert("DB rows now status=sent", memStore.filter(r => r.trigger_event_id === "evt_002").every(r => r.status === "sent"));

// 4b. Resend guard: schedule a NEW sequence under the SAME subscription with a new event id,
// run worker again — all 3 should be skipped with reason 'resend_guard' because the same kinds
// for the same subscription went out within the past 24 hours.
const schedAgain = await scheduleFailedPaymentSequence({
  stripeCustomerId: "cus_ACME",
  stripeSubscriptionId: "sub_ACME2",
  stripeInvoiceId: "in_003",
  triggerEventId: "evt_003",
  amountCents: 9900,
  currency: "usd",
  clientId: 5001,
  failedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
});
assert("schedule again (different event id) inserts 3 fresh rows", schedAgain.scheduled === 3);

sendMailLog = [];
const drainAgain = await processDunningQueue();
assert("worker drains 3 due rows on second run", drainAgain.processed === 3);
assert("0 sent (24h resend guard caught all)", drainAgain.sent === 0);
assert("3 skipped with reason resend_guard", drainAgain.skipped_resend_guard === 3);
assert("sendMail NOT called on resend-guarded run", sendMailLog.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
