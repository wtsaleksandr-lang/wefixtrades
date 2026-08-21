/**
 * Affiliate DASHBOARD aggregation math (pure). Proves buildAffiliateDashboard
 * turns raw aggregates + an affiliate row into the correct tier / rate /
 * earnings view-model, using ONLY the terms from programs.ts. No DB.
 *
 * dashboard.ts imports server/db at module scope (throws without DATABASE_URL),
 * so we set a dummy URL FIRST, then dynamically import — the DB loader is never
 * reached; buildAffiliateDashboard is pure. Mirrors the sibling *.test.ts style.
 *
 * Run: npx tsx server/affiliate/dashboard.test.ts   (CI: check:affiliate-dashboard)
 * Excluded from `tsc --noEmit` via the tsconfig **\/*.test.ts pattern.
 */
import assert from "node:assert/strict";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://aff:aff@127.0.0.1:1/aff_no_connect";
}

let pass = 0;
let fail = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    pass++;
  } catch (err) {
    fail++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main() {
  const { buildAffiliateDashboard, AVG_MONTHLY_REVENUE_CENTS } = await import("./dashboard");
  const {
    AFFILIATE_BASE_RATE,
    AFFILIATE_PRO_RATE,
    AFFILIATE_PARTNER_RATE,
    AFFILIATE_PRO_THRESHOLD,
    AFFILIATE_MIN_PAYOUT_CENTS,
  } = await import("./programs");
  type Affiliate = import("@shared/schemas/affiliate").Affiliate;

  const baseAff = (over: Partial<Affiliate> = {}): Affiliate =>
    ({
      id: 1,
      owner_client_id: null,
      owner_user_id: null,
      email: "aff@x.com",
      name: "Ada Affiliate",
      code: "ABCD2345",
      tier: "base",
      commission_rate: AFFILIATE_BASE_RATE,
      status: "pending",
      payout_method: null,
      payout_details: null,
      created_at: new Date(),
      updated_at: new Date(),
      ...over,
    }) as Affiliate;

  const noAgg = { clicks: 0, signups: 0, convertedCustomers: 0, commissions: [] as Array<{ status: string; amount_cents: number }> };

  // ── Base tier: <10 active → base rate, progress counts up to 10 ──────────
  check("base affiliate: rate/tier/estimate/progress from active signups", () => {
    const d = buildAffiliateDashboard(
      baseAff(),
      { ...noAgg, clicks: 40, signups: 3, convertedCustomers: 1 },
      "https://wefixtrades.com/ref/ABCD2345",
    );
    assert.equal(d.stats.clicks, 40);
    assert.equal(d.stats.signups, 3);
    assert.equal(d.stats.convertedCustomers, 1);
    assert.equal(d.stats.activeReferredCustomers, 3);
    assert.equal(d.affiliate.tier, "base");
    assert.equal(d.tier.tier, "base");
    assert.equal(d.tier.nextTier, "pro");
    assert.equal(d.tier.toNextTier, AFFILIATE_PRO_THRESHOLD - 3);
    assert.equal(d.affiliate.commissionRate, AFFILIATE_BASE_RATE);
    // estimate = active × avg revenue × rate
    assert.equal(d.earnings.estimatedMonthlyCents, Math.round(3 * AVG_MONTHLY_REVENUE_CENTS * AFFILIATE_BASE_RATE));
    assert.equal(d.affiliate.link, "https://wefixtrades.com/ref/ABCD2345");
    assert.equal(d.earnings.minPayoutCents, AFFILIATE_MIN_PAYOUT_CENTS);
  });

  // ── Pro tier: ≥10 active, stored pro rate honored ────────────────────────
  check("pro affiliate: 10+ active → pro tier, top of self-serve ladder", () => {
    const d = buildAffiliateDashboard(
      baseAff({ tier: "pro", commission_rate: AFFILIATE_PRO_RATE }),
      { ...noAgg, signups: 12 },
      "l",
    );
    assert.equal(d.affiliate.tier, "pro");
    assert.equal(d.tier.toNextTier, 0);
    assert.equal(d.tier.nextTier, "partner");
    assert.equal(d.affiliate.commissionRate, AFFILIATE_PRO_RATE);
    assert.equal(d.earnings.estimatedMonthlyCents, Math.round(12 * AVG_MONTHLY_REVENUE_CENTS * AFFILIATE_PRO_RATE));
  });

  // ── Partner: hand-set rate wins over the tier default ────────────────────
  check("partner affiliate: stored partner rate wins, no next tier", () => {
    const d = buildAffiliateDashboard(
      baseAff({ tier: "partner", commission_rate: AFFILIATE_PARTNER_RATE }),
      { ...noAgg, signups: 4 },
      "l",
    );
    assert.equal(d.affiliate.tier, "partner");
    assert.equal(d.tier.nextTier, null);
    assert.equal(d.affiliate.commissionRate, AFFILIATE_PARTNER_RATE);
  });

  // ── Commission bucketing: pending / approved / paid ──────────────────────
  check("commission rows bucket into pending/approved/paid cents", () => {
    const d = buildAffiliateDashboard(
      baseAff(),
      {
        ...noAgg,
        signups: 2,
        commissions: [
          { status: "pending", amount_cents: 1500 },
          { status: "pending", amount_cents: 500 },
          { status: "approved", amount_cents: 3000 },
          { status: "paid", amount_cents: 8000 },
          { status: "weird", amount_cents: 100 }, // unknown → pending bucket
        ],
      },
      "l",
    );
    assert.equal(d.earnings.pendingCents, 1500 + 500 + 100);
    assert.equal(d.earnings.approvedCents, 3000);
    assert.equal(d.earnings.paidCents, 8000);
  });

  // ── Robustness: garbage/negative aggregates clamp to 0 ───────────────────
  check("negative / non-numeric aggregates clamp to zero", () => {
    const d = buildAffiliateDashboard(
      baseAff(),
      { clicks: -5, signups: -3, convertedCustomers: Number.NaN, commissions: [{ status: "paid", amount_cents: -99 }] },
      "l",
    );
    assert.equal(d.stats.clicks, 0);
    assert.equal(d.stats.signups, 0);
    assert.equal(d.stats.convertedCustomers, 0);
    assert.equal(d.stats.activeReferredCustomers, 0);
    assert.equal(d.earnings.paidCents, 0);
    assert.equal(d.earnings.estimatedMonthlyCents, 0);
  });

  console.log(`\n[dashboard.test] ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

void main();
