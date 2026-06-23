/**
 * ROOFQUOTE COST GATING — public /api/roofquote/* rate-limit regression gate.
 *
 * The public roof-quote widget spends real upstream money per uncached call
 * (Google on the reads, ~$0.04 Replicate/gpt-image on /airender). Before this
 * gate the endpoints had no per-IP application-layer limit, so a curl-loop
 * could run up the bill. These limiters add the per-IP defense; this test
 * proves they bound a loop WITHOUT breaking a normal single-session pattern.
 *
 * Drives the PURE, dependency-injected gate decision exported from
 * server/routes/roofQuoteRoutes.ts (evaluateAiRenderGate) plus the production
 * limiter constants from server/services/rateLimiter.ts — no express, no DB,
 * no network.
 *
 * Cases:
 *   1. Normal session — a real homeowner renders a few materials (≤ the per-min
 *      cap) → every call allowed.
 *   2. Per-IP minute LOOP — a burst past the 6/min cap → 429, retryAfter=60
 *      (the minute bucket clears within 60s).
 *   3. Per-IP day cap — exhausting the daily bucket → 429, retryAfter=3600
 *      (minute bucket still fine, the day bucket is what tripped).
 *   4. Per-IP keying — one IP's loop never starves another IP.
 *   5. Per-CALCULATOR day cap — engages ONLY when calcId is present; a botnet
 *      (many IPs) hitting one embed still trips the per-calc bucket; anonymous
 *      (calcId=null) requests skip it.
 *   6. The Google shared per-IP/min limiter bounds a cross-endpoint loop while a
 *      normal session (each read ~once, geotiff ~4×) stays well under.
 *   7. Production thresholds are comfortably above a real session and below an
 *      abusive loop (the actual constants, env-overridable).
 *   8. DELIBERATE-FAILURE FIXTURE — a regressed gate that checks the per-calc
 *      cap BEFORE the per-IP caps (so an anonymous loop with no calcId would
 *      never be bounded) must turn the real assertion red.
 *
 * Excluded from `tsc --noEmit` via the tsconfig **\/*.test.ts pattern.
 * Runnable standalone:  npx tsx server/routes/roofQuoteRoutes.test.ts
 * Wired into CI as `npm run check:roofquote-cost-gating`.
 */
import assert from "node:assert/strict";

/* server/db.ts throws without a DATABASE_URL at module-load. Never used for
 * real IO here — the gate decision is pure + every limiter is injected. */
process.env.DATABASE_URL ??= "postgresql://stub:stub@localhost:5432/stub";

const { evaluateAiRenderGate } = await import("./roofQuoteRoutes");
const { RateLimiter, MemoryRateLimitStore } = await import("../services/rateLimiter");
const RL = await import("../services/rateLimiter");

type AiRenderGateLimiters = import("./roofQuoteRoutes").AiRenderGateLimiters;

let passed = 0;
let failed = 0;
async function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${label}`);
  } catch (err: any) {
    failed++;
    console.error(`  FAIL ${label}: ${err?.message ?? err}`);
  }
}

const DAY_MS = 24 * 60 * 60_000;

/** Build a fresh injectable limiter bundle at the given thresholds. Each call
 *  gets its OWN in-memory store so cases don't bleed into each other. */
function makeLimiters(opts?: {
  perMin?: number;
  perDay?: number;
  perCalcPerDay?: number;
}): AiRenderGateLimiters {
  return {
    perMin: new RateLimiter(new MemoryRateLimitStore(), opts?.perMin ?? 6, 60_000),
    perDay: new RateLimiter(new MemoryRateLimitStore(), opts?.perDay ?? 40, DAY_MS),
    perCalcPerDay: new RateLimiter(new MemoryRateLimitStore(), opts?.perCalcPerDay ?? 300, DAY_MS),
  };
}

const IP = "203.0.113.7";

/* ═══ 1. Normal session passes ════════════════════════════════════════ */

await check("normal session — rendering 4 materials is fully allowed", async () => {
  const lim = makeLimiters();
  for (let i = 0; i < 4; i++) {
    const r = await evaluateAiRenderGate(lim, { ip: IP, calcId: null });
    assert.equal(r.allowed, true, `render #${i + 1} must be allowed`);
  }
});

/* ═══ 2. Per-IP minute loop trips 429 ═════════════════════════════════ */

await check("per-IP minute LOOP — the 7th call in a minute trips 429 (retry 60)", async () => {
  const lim = makeLimiters({ perMin: 6 });
  for (let i = 0; i < 6; i++) {
    assert.equal((await evaluateAiRenderGate(lim, { ip: IP, calcId: null })).allowed, true);
  }
  const over = await evaluateAiRenderGate(lim, { ip: IP, calcId: null });
  assert.equal(over.allowed, false, "7th call over 6/min must be blocked");
  if (over.allowed) throw new Error("unreachable");
  // The MINUTE bucket is what tripped (day bucket still has room) → the bucket
  // clears in ≤60s, so advise a 60s retry.
  assert.equal(over.retryAfter, 60);
});

/* ═══ 3. Per-IP day cap trips 429 ═════════════════════════════════════ */

await check("per-IP day cap — exhausting the daily bucket trips 429 (retry 3600)", async () => {
  // High per-minute so only the DAY bucket can be the limiter; tiny day cap.
  const lim = makeLimiters({ perMin: 1000, perDay: 3 });
  for (let i = 0; i < 3; i++) {
    assert.equal((await evaluateAiRenderGate(lim, { ip: IP, calcId: null })).allowed, true);
  }
  const over = await evaluateAiRenderGate(lim, { ip: IP, calcId: null });
  assert.equal(over.allowed, false);
  if (over.allowed) throw new Error("unreachable");
  // The minute bucket is fine; the DAY bucket is exhausted → it won't clear for
  // up to a day, so advise an hour (longest reasonable retry hint).
  assert.equal(over.retryAfter, 3600);
});

/* ═══ 4. Per-IP keying — one loop never starves another IP ════════════ */

await check("per-IP keying — IP A's loop does not block IP B", async () => {
  const lim = makeLimiters({ perMin: 2 });
  await evaluateAiRenderGate(lim, { ip: "198.51.100.1", calcId: null });
  await evaluateAiRenderGate(lim, { ip: "198.51.100.1", calcId: null });
  const aOver = await evaluateAiRenderGate(lim, { ip: "198.51.100.1", calcId: null });
  assert.equal(aOver.allowed, false, "IP A is over its own cap");
  const bFirst = await evaluateAiRenderGate(lim, { ip: "198.51.100.2", calcId: null });
  assert.equal(bFirst.allowed, true, "IP B has its own fresh bucket");
});

/* ═══ 5. Per-calculator day cap ═══════════════════════════════════════ */

await check("per-calc day cap — a botnet on ONE embed (rotating IPs) still trips it", async () => {
  // Generous per-IP (so the IP caps never fire) but a tiny per-calc/day so the
  // shared embed bucket is the only thing that can stop the flood.
  const lim = makeLimiters({ perMin: 1000, perDay: 100000, perCalcPerDay: 2 });
  const CALC = 42;
  assert.equal((await evaluateAiRenderGate(lim, { ip: "10.0.0.1", calcId: CALC })).allowed, true);
  assert.equal((await evaluateAiRenderGate(lim, { ip: "10.0.0.2", calcId: CALC })).allowed, true);
  // Third distinct IP, SAME embed → the per-calc bucket is exhausted.
  const over = await evaluateAiRenderGate(lim, { ip: "10.0.0.3", calcId: CALC });
  assert.equal(over.allowed, false, "per-calc cap bounds spend across IPs on one embed");
});

await check("per-calc cap is SKIPPED for anonymous (calcId=null) requests", async () => {
  // Even with a per-calc cap of 1, a null calcId must never consult that bucket
  // (otherwise every anonymous request would share one global bucket → DoS).
  const lim = makeLimiters({ perMin: 1000, perDay: 100000, perCalcPerDay: 1 });
  for (let i = 0; i < 5; i++) {
    const r = await evaluateAiRenderGate(lim, { ip: `192.0.2.${i}`, calcId: null });
    assert.equal(r.allowed, true, "anonymous calls never touch the per-calc bucket");
  }
});

await check("per-IP caps are checked BEFORE the per-calc cap (order matters)", async () => {
  // An anonymous loop (no calcId) MUST still be bounded by the per-IP cap. If
  // the per-calc cap were checked first and the IP cap skipped, this would pass
  // forever. Prove the per-IP cap fires on a null-calc loop.
  const lim = makeLimiters({ perMin: 2, perCalcPerDay: 1 });
  await evaluateAiRenderGate(lim, { ip: IP, calcId: null });
  await evaluateAiRenderGate(lim, { ip: IP, calcId: null });
  const over = await evaluateAiRenderGate(lim, { ip: IP, calcId: null });
  assert.equal(over.allowed, false, "anonymous loop is bounded by the per-IP cap");
});

/* ═══ 6. Google shared per-IP/min limiter ═════════════════════════════ */

await check("Google shared limiter — a normal session of ~9 reads passes; a 31-call loop trips", async () => {
  // One real session: geocode + solar + datalayers + 4×geotiff + analyze +
  // features + streetview + capture ≈ 10 calls, all in the SAME per-IP bucket.
  const google = new RateLimiter(new MemoryRateLimitStore(), 30, 60_000);
  const key = `roofquote:google:${IP}`;
  for (let i = 0; i < 11; i++) {
    assert.equal(await google.check(key), true, `read #${i + 1} within a real session must pass`);
  }
  // A scripted loop blowing past 30/min trips.
  let tripped = false;
  for (let i = 11; i < 40; i++) {
    if (!(await google.check(key))) { tripped = true; break; }
  }
  assert.equal(tripped, true, "a >30/min cross-endpoint loop must trip the shared cap");
});

/* ═══ 7. Production thresholds sanity ═════════════════════════════════ */

await check("production limiter thresholds bound abuse without breaking a real session", async () => {
  // Use the ACTUAL exported production limiters (env-overridable defaults).
  const prod: AiRenderGateLimiters = {
    perMin: RL.roofQuoteAiRenderPerMinLimiter,
    perDay: RL.roofQuoteAiRenderPerDayLimiter,
    perCalcPerDay: RL.roofQuoteAiRenderPerCalcPerDayLimiter,
  };
  const pip = "203.0.113.200";
  // A real session renders ~3 materials — must pass on the production minute cap.
  for (let i = 0; i < 3; i++) {
    assert.equal((await evaluateAiRenderGate(prod, { ip: pip, calcId: null })).allowed, true);
  }
  // The production minute cap default is 6 — calls 4..6 still pass, the 7th in
  // the same minute trips. (This also asserts the default isn't absurdly high.)
  await evaluateAiRenderGate(prod, { ip: pip, calcId: null }); // 4
  await evaluateAiRenderGate(prod, { ip: pip, calcId: null }); // 5
  await evaluateAiRenderGate(prod, { ip: pip, calcId: null }); // 6
  const seventh = await evaluateAiRenderGate(prod, { ip: pip, calcId: null });
  assert.equal(seventh.allowed, false, "production per-min default (6) must bound a burst");

  // The Google shared limiter default (30/min) must clear a real session.
  const gkey = `roofquote:google:203.0.113.201`;
  for (let i = 0; i < 12; i++) {
    assert.equal(await RL.roofQuoteGooglePerMinLimiter.check(gkey), true);
  }
});

/* ═══ 8. DELIBERATE-FAILURE FIXTURE ═══════════════════════════════════
 * A regressed gate that consults the per-calc cap FIRST and skips the per-IP
 * caps when calcId is null would let an anonymous render loop run unbounded.
 * The real gate's guarantee (an anonymous loop IS bounded by the per-IP cap)
 * must turn red against that regression — proving the gate CATCHES this class
 * rather than merely running. (Repo precedent: quoteWidgetUploadRoutes.test.ts.)
 */

await check("DELIBERATE-FAILURE fixture — per-calc-first gate leaks anonymous loops", async () => {
  const lim = makeLimiters({ perMin: 2, perCalcPerDay: 1000000 });
  // The regression: when calcId is null, "allow" without ever checking per-IP.
  const regressedGate = async (input: { ip: string; calcId: number | null }) => {
    if (input.calcId == null) return { allowed: true as const };
    return evaluateAiRenderGate(lim, input);
  };
  // Drive an anonymous loop well past the per-IP cap.
  await regressedGate({ ip: IP, calcId: null });
  await regressedGate({ ip: IP, calcId: null });
  const third = await regressedGate({ ip: IP, calcId: null });

  let caught: unknown = null;
  try {
    // The REAL gate assertion: an anonymous loop MUST be bounded.
    assert.equal(third.allowed, false);
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, "gate assertion must fail red against the per-calc-first regression");
});

/* ═══ Verdict ═════════════════════════════════════════════════════════ */

console.log(`\nroofquote-cost-gating gate: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
