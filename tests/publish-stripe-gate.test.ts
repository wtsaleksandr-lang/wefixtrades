/**
 * Lane B — publish Stripe-sync gate regression test.
 *
 * Proves the hard-block actually catches a regression (deliberate-failure
 * fixture, per [feedback_external_integration_rigor]): a simulated
 * syncProductPrice failure MUST fail the publish, revert the catalog write,
 * and leave the draft unpublished. A control case proves the same publish
 * succeeds when the sync succeeds — so a future change that quietly removes
 * the gate turns case 1 red, not silently green.
 *
 * No test-runner dep (assert/strict only) and NO live Stripe / DB — the db
 * module is stubbed in-memory (same pattern as
 * scripts/smoke-billing-recovery-local.ts) and the Stripe sync layer is
 * injected via publishProductDraft's syncDeps parameter.
 *
 * Excluded from `tsc --noEmit` (tsconfig excludes tests/). Run standalone:
 *
 *   npx tsx tests/publish-stripe-gate.test.ts
 *
 * Coverage:
 *   1. DELIBERATE FAILURE — parent price change, syncProductPrice → ok:false
 *      ⇒ publish throws PublishBlockedError, catalog row reverted,
 *        draft NOT marked published.
 *   2. Pre-flight block — price change on a row with stripe_price_id but no
 *      stripe_product_id ⇒ blocked BEFORE any write, sync never called.
 *   3. Control — sync succeeds ⇒ publish succeeds, new price ids persisted,
 *      draft marked published, stripeSync.ok true.
 *   4. Tier failure — tier price change, sync fails ⇒ blocked, sibling row
 *      reverted, draft NOT published.
 *   5. Yearly-mirror failure — monthly sync ok, yearly sync fails ⇒ blocked,
 *      stale stripe_yearly_price_id detached (fail-safe), draft NOT published.
 */

import crypto from "crypto";

/* ── ENV setup MUST happen before any imports that read process.env ── */
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://localhost:5432/dummy_no_connect";
process.env.STRIPE_SECRET_KEY = ""; // never used — sync layer is injected
process.env.SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(16).toString("hex");
process.env.NODE_ENV = "development";

const assert = (await import("node:assert/strict")).default;

/* ── In-memory tables ── */
type Row = Record<string, any>;
const memCatalog = new Map<string, Row>();
const memDrafts = new Map<number, Row>();

/* ── DB stub helpers (same pattern as scripts/smoke-billing-recovery-local.ts) ── */
function unwrapParam(v: any): any {
  if (v && typeof v === "object" && "value" in v && v.constructor?.name === "Param") return v.value;
  return v;
}
function tableNameOf(t: any): string {
  if (!t) return "";
  for (const sym of Object.getOwnPropertySymbols(t)) {
    const desc = sym.description || "";
    if (desc.includes("Name")) {
      const v = (t as any)[sym];
      if (typeof v === "string") return v;
    }
  }
  return t.tableName || t._?.name || "";
}
function extractEqPredicates(node: any): Array<{ colName: string; value: any }> {
  const out: Array<{ colName: string; value: any }> = [];
  function walk(n: any) {
    if (!n || typeof n !== "object") return;
    const chunks = (n as any).queryChunks;
    if (!Array.isArray(chunks)) return;
    if (chunks.length >= 3) {
      for (let i = 0; i < chunks.length - 2; i++) {
        const a = chunks[i];
        const b = chunks[i + 1];
        const c = chunks[i + 2];
        if (b && typeof b === "object" && b.value && Array.isArray(b.value) && b.value[0] === " = ") {
          const colName = a?._?.name || a?.name;
          if (typeof colName === "string") out.push({ colName, value: unwrapParam(c) });
        }
      }
    }
    for (const ch of chunks) walk(ch);
  }
  walk(node);
  return out;
}
function storeFor(tn: string): Map<any, Row> | null {
  if (tn === "service_catalog") return memCatalog;
  if (tn === "product_drafts") return memDrafts;
  return null;
}
function rowsMatching(tn: string, cond: any): Row[] {
  const store = storeFor(tn);
  if (!store) return [];
  const preds = extractEqPredicates(cond);
  return [...store.values()].filter((r) => preds.every((p) => r[p.colName] === p.value));
}
/* SELECTs must return copies — real drizzle hydrates fresh objects per query.
 * Returning live references would let the catalog UPDATE mutate the prevRow
 * snapshot inside publishProductDraft and mask the price diff. */
function copies(rows: Row[]): Row[] {
  return rows.map((r) => ({ ...r }));
}

/* ── Stub db.select / db.update before importing storage ── */
const { db } = await import("../server/db");

(db as any).select = function (..._cols: any[]) {
  let fromTable: any = null;
  return {
    from(t: any) { fromTable = t; return this; },
    where(cond: any) {
      const tn = tableNameOf(fromTable);
      const run = () => copies(rowsMatching(tn, cond));
      return {
        limit: (_n: number) => Promise.resolve(run()),
        orderBy: (..._cs: any[]) => ({ limit: (_n: number) => Promise.resolve(run()) }),
      };
    },
  };
};

(db as any).update = function (t: any) {
  const tn = tableNameOf(t);
  let setClause: any = null;
  return {
    set(v: any) { setClause = v; return this; },
    where(cond: any) {
      const apply = () => {
        const rows = rowsMatching(tn, cond);
        for (const r of rows) Object.assign(r, setClause);
        return rows;
      };
      return {
        returning: () => Promise.resolve(apply()),
        then: (resolve: any, reject?: any) => {
          try { return Promise.resolve(resolve(apply())); }
          catch (e) { return reject ? Promise.resolve(reject(e)) : Promise.reject(e); }
        },
      };
    },
  };
};

/* ── Import the system under test AFTER the db stub is in place ── */
const { storage, PublishBlockedError } = await import("../server/storage");

/* ── Fixtures ── */
function seedParent(over: Partial<Row> = {}): Row {
  const row: Row = {
    id: "tradeline-pro",
    name: "TradeLine Pro",
    tagline: "AI call answering",
    description: "AI call answering",
    category: "automation",
    default_price: 14900,
    billing_period: "monthly",
    is_active: true,
    tiers: null,
    features: [],
    stripe_product_id: "prod_test_parent",
    stripe_price_id: "price_old_monthly",
    stripe_yearly_price_id: "price_old_yearly",
    automation_config: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...over,
  };
  memCatalog.set(row.id, row);
  return row;
}
function seedTierSibling(over: Partial<Row> = {}): Row {
  const row: Row = {
    id: "mapguard-pro",
    name: "MapGuard Pro",
    default_price: 14900,
    billing_period: "monthly",
    is_active: true,
    stripe_product_id: "prod_test_tier",
    stripe_price_id: "price_tier_old_monthly",
    stripe_yearly_price_id: "price_tier_old_yearly",
    created_at: new Date(),
    updated_at: new Date(),
    ...over,
  };
  memCatalog.set(row.id, row);
  return row;
}
let draftSeq = 1;
function seedDraft(draft_data: Row): Row {
  const row: Row = { id: draftSeq++, status: "draft", draft_data, approvers: [], published_at: null, published_by: null };
  memDrafts.set(row.id, row);
  return row;
}
function reset() {
  memCatalog.clear();
  memDrafts.clear();
}

const okMeta = async () => ({ ok: true });
const okPrice = async (change: any) => {
  const r: any = { ok: true };
  if (change.period === "yearly") r.newStripeYearlyPriceId = `price_new_yearly_${change.serviceCatalogId}`;
  else r.newStripePriceId = `price_new_monthly_${change.serviceCatalogId}`;
  return r;
};
const monthlyToYearlyCents = (m: number) => Math.round((m * 12 * 0.9) / 100) * 100;

/* ── Tiny runner (repo pattern — assert/strict, no runner dep) ── */
let failures = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (err: any) {
    failures++;
    console.error(`  FAIL ${name}`);
    console.error(err?.message ?? err);
    process.exitCode = 1;
  }
}

console.log("publishProductDraft Stripe-sync gate");

/* 1 — DELIBERATE FAILURE FIXTURE: sync fails → publish MUST fail. */
await test("parent price change + syncProductPrice failure → PublishBlockedError, row reverted, draft stays draft", async () => {
  reset();
  seedParent();
  const draft = seedDraft({ default_price: 9900 });
  let syncCalls = 0;
  const failingDeps = {
    syncProductMetadata: okMeta,
    syncProductPrice: async () => { syncCalls++; return { ok: false, warning: "simulated Stripe outage (deliberate-failure fixture)" }; },
    monthlyToYearlyCents,
  } as any;

  await assert.rejects(
    () => storage.publishProductDraft(draft.id, "tradeline-pro", draft.draft_data, 1, failingDeps),
    (err: any) => err instanceof PublishBlockedError && /simulated Stripe outage/.test(err.blockers[0]),
  );
  assert.equal(syncCalls, 1, "monthly sync attempted exactly once");
  const row = memCatalog.get("tradeline-pro")!;
  assert.equal(row.default_price, 14900, "catalog price reverted to pre-publish value");
  assert.equal(row.stripe_price_id, "price_old_monthly", "old price id untouched");
  assert.equal(memDrafts.get(draft.id)!.status, "draft", "draft NOT marked published");
});

/* 2 — pre-flight: no stripe_product_id but a Stripe price is expected. */
await test("price change with stripe_price_id but no stripe_product_id → blocked before any write, sync never called", async () => {
  reset();
  seedParent({ stripe_product_id: null });
  const draft = seedDraft({ default_price: 9900 });
  let syncCalls = 0;
  const spyDeps = {
    syncProductMetadata: okMeta,
    syncProductPrice: async () => { syncCalls++; return { ok: true }; },
    monthlyToYearlyCents,
  } as any;

  await assert.rejects(
    () => storage.publishProductDraft(draft.id, "tradeline-pro", draft.draft_data, 1, spyDeps),
    (err: any) => err instanceof PublishBlockedError && /no stripe_product_id/.test(err.blockers[0]),
  );
  assert.equal(syncCalls, 0, "sync never attempted");
  assert.equal(memCatalog.get("tradeline-pro")!.default_price, 14900, "nothing was written");
  assert.equal(memDrafts.get(draft.id)!.status, "draft");
});

/* 3 — control: identical publish succeeds when sync succeeds. */
await test("control: same price change with healthy sync → publish succeeds, ids persisted, draft published", async () => {
  reset();
  seedParent();
  const draft = seedDraft({ default_price: 9900 });
  const healthyDeps = { syncProductMetadata: okMeta, syncProductPrice: okPrice, monthlyToYearlyCents } as any;

  const result = await storage.publishProductDraft(draft.id, "tradeline-pro", draft.draft_data, 1, healthyDeps);
  assert.equal(result.stripeSync.ok, true);
  assert.deepEqual(result.stripeSync.warnings, []);
  const row = memCatalog.get("tradeline-pro")!;
  assert.equal(row.default_price, 9900, "new price live");
  assert.equal(row.stripe_price_id, "price_new_monthly_tradeline-pro", "new monthly price id persisted");
  assert.equal(row.stripe_yearly_price_id, "price_new_yearly_tradeline-pro", "new yearly price id persisted");
  assert.equal(memDrafts.get(draft.id)!.status, "published", "draft marked published");
});

/* 4 — tier mirror: failing tier price sync blocks + reverts the sibling. */
await test("tier price change + sync failure → blocked, sibling reverted, draft stays draft", async () => {
  reset();
  seedParent();
  seedTierSibling();
  const draft = seedDraft({
    tiers: [{ id: "mapguard-pro", name: "MapGuard Pro", price_cents: 9900, billing_period: "monthly" }],
  });
  const failingDeps = {
    syncProductMetadata: okMeta,
    syncProductPrice: async () => ({ ok: false, warning: "simulated tier sync failure" }),
    monthlyToYearlyCents,
  } as any;

  await assert.rejects(
    () => storage.publishProductDraft(draft.id, "tradeline-pro", draft.draft_data, 1, failingDeps),
    (err: any) => err instanceof PublishBlockedError && /tier "mapguard-pro"/.test(err.blockers[0]),
  );
  const sib = memCatalog.get("mapguard-pro")!;
  assert.equal(sib.default_price, 14900, "sibling price reverted");
  assert.equal(sib.stripe_price_id, "price_tier_old_monthly", "sibling old price id untouched");
  assert.equal(memDrafts.get(draft.id)!.status, "draft", "draft NOT marked published");
});

/* 5 — yearly mirror failure: fail-safe detach + block. */
await test("monthly sync ok but yearly mirror fails → blocked, stale yearly price detached", async () => {
  reset();
  seedParent();
  const draft = seedDraft({ default_price: 9900 });
  const partialDeps = {
    syncProductMetadata: okMeta,
    syncProductPrice: async (change: any) =>
      change.period === "yearly"
        ? { ok: false, warning: "simulated yearly mint failure" }
        : { ok: true, newStripePriceId: "price_new_monthly_tradeline-pro" },
    monthlyToYearlyCents,
  } as any;

  await assert.rejects(
    () => storage.publishProductDraft(draft.id, "tradeline-pro", draft.draft_data, 1, partialDeps),
    (err: any) => err instanceof PublishBlockedError && /YEARLY price sync failed/.test(err.blockers[0]),
  );
  const row = memCatalog.get("tradeline-pro")!;
  assert.equal(row.stripe_price_id, "price_new_monthly_tradeline-pro", "monthly stays consistent (already re-minted)");
  assert.equal(row.stripe_yearly_price_id, null, "stale yearly price detached so yearly checkout cannot mis-bill");
  assert.equal(memDrafts.get(draft.id)!.status, "draft", "draft NOT marked published");
});

if (failures === 0) console.log("\nAll publish-gate tests passed.");
else console.error(`\n${failures} test(s) failed.`);
