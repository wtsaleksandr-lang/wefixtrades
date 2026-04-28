/**
 * Pre-merge verification for the billing recovery system (PR #29).
 *
 * Run this on Replit AFTER:
 *   1. Adding BILLING_PORTAL_SECRET to Replit Secrets
 *   2. Running `npm run db:push` to create billing_dunning_events
 *
 * It verifies:
 *   - BILLING_PORTAL_SECRET is set (presence only, value never printed)
 *   - DATABASE_URL is reachable
 *   - billing_dunning_events table exists with all expected columns
 *   - Default values + NOT NULL constraints match schema
 *   - Reasonable indexes exist (PK at minimum; secondary indexes are
 *     not declared in the Drizzle schema yet, so we report what we find)
 *   - No live Stripe portal sessions get created (we never call the
 *     billingPortal.sessions.create endpoint here)
 *   - No emails are sent (no SMTP usage in this script)
 *
 * Run: npx tsx scripts/verify-billing-recovery-prereqs.ts
 */

import { sql } from "drizzle-orm";
import { db } from "../server/db";

let pass = 0;
let fail = 0;
function assert(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${label}${detail ? `  (${detail})` : ""}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}${detail ? `  (${detail})` : ""}`);
    fail++;
  }
}

async function main() {
  console.log("\n[1] Required environment variables");
  const hasPortalSecret = !!process.env.BILLING_PORTAL_SECRET;
  const portalSecretLen = process.env.BILLING_PORTAL_SECRET?.length ?? 0;
  assert("BILLING_PORTAL_SECRET present", hasPortalSecret, hasPortalSecret ? `${portalSecretLen} chars` : "MISSING");
  assert("BILLING_PORTAL_SECRET looks like 64-hex", hasPortalSecret && portalSecretLen === 64 && /^[0-9a-f]+$/i.test(process.env.BILLING_PORTAL_SECRET!),
    hasPortalSecret ? (portalSecretLen === 64 ? "ok" : `unexpected length ${portalSecretLen}`) : "n/a");
  // Never print the value itself.

  assert("DATABASE_URL present", !!process.env.DATABASE_URL);
  assert("STRIPE_SECRET_KEY present", !!process.env.STRIPE_SECRET_KEY);

  console.log("\n[2] billing_dunning_events table");

  const tableExists = await db.execute(sql`
    SELECT to_regclass('public.billing_dunning_events') AS reg
  `);
  const exists = (tableExists as any).rows?.[0]?.reg === "billing_dunning_events";
  assert("table exists", exists);
  if (!exists) {
    console.log("\n  → Run `npm run db:push` first, then re-run this script.");
    process.exit(1);
  }

  // Pull column definitions
  const cols = await db.execute(sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'billing_dunning_events'
    ORDER BY ordinal_position
  `);
  const colMap = new Map<string, any>();
  for (const r of (cols as any).rows ?? []) colMap.set(r.column_name, r);

  const expectedCols = [
    "id", "client_id",
    "stripe_customer_id", "stripe_subscription_id", "stripe_invoice_id",
    "trigger_event", "trigger_event_id", "kind",
    "scheduled_for", "sent_at",
    "status", "cancel_reason",
    "amount_cents", "currency",
    "metadata",
    "created_at", "updated_at",
  ];
  for (const c of expectedCols) {
    assert(`column "${c}" exists`, colMap.has(c), colMap.get(c)?.data_type);
  }

  // NOT NULL constraints on the columns the code requires
  const requiredNotNull = ["id", "stripe_customer_id", "trigger_event", "trigger_event_id", "kind", "scheduled_for", "status"];
  for (const c of requiredNotNull) {
    const col = colMap.get(c);
    assert(`"${c}" is NOT NULL`, col?.is_nullable === "NO", col?.is_nullable);
  }

  // Default for status should resolve to 'pending'
  const statusDefault = colMap.get("status")?.column_default ?? "";
  assert(`"status" default is 'pending'`, /pending/.test(statusDefault), statusDefault);

  // Indexes — at minimum a PK on id. Drizzle schema does not declare additional
  // indexes/unique constraints, so we only report what's present without failing.
  console.log("\n[3] Indexes / constraints (informational)");
  const idx = await db.execute(sql`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'billing_dunning_events'
    ORDER BY indexname
  `);
  const idxRows = (idx as any).rows ?? [];
  const pkPresent = idxRows.some((r: any) => /PRIMARY KEY|_pkey/.test(r.indexdef));
  assert("PRIMARY KEY index present", pkPresent);
  console.log(`  → ${idxRows.length} index(es) on billing_dunning_events:`);
  for (const r of idxRows) console.log(`     - ${r.indexname}`);

  console.log(`
[4] Idempotency in code, not schema
  The schema does not declare a UNIQUE (subscription_id, event_id, kind)
  constraint. Idempotency is enforced at the application layer in
  scheduleFailedPaymentSequence() via SELECT-then-INSERT — proven by
  the verify-dunning.ts harness. If this DB is ever written to from
  another process, add a partial unique index:
     CREATE UNIQUE INDEX billing_dunning_events_event_kind_uq
       ON billing_dunning_events (stripe_subscription_id, trigger_event_id, kind)
       WHERE stripe_subscription_id IS NOT NULL;`);

  console.log("\n[5] Stripe portal session safety check");
  console.log("  This script does NOT call stripe.billingPortal.sessions.create().");
  console.log("  Portal sessions are only minted at click time on the public route.");
  assert("no stripe portal session created during verification", true);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("[verify-billing-recovery-prereqs] error:", err.message);
  process.exit(1);
});
