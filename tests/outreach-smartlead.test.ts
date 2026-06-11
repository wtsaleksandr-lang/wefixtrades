/**
 * Lane OA unit tests — Smartlead rail + sending-domain pool.
 *
 * Hermetic: ZERO network calls (real client gets an injected fake fetch),
 * ZERO database (pure helpers only; db access in sendingDomainPool is
 * lazy-imported and never triggered here). No DATABASE_URL needed.
 *
 * Includes DELIBERATE-FAILURE fixtures (per [external-integration rigor]):
 * each gate is proven to catch a regression, not just to run:
 *   - a tampered verify-link payload (extra key) FAILS the shape gate;
 *   - an exhausted-retries 429 THROWS (and the throw is key-redacted);
 *   - a denylisted domain is REJECTED;
 *   - key-absent yields dry_run, NEVER "created".
 *
 * Run: npx tsx tests/outreach-smartlead.test.ts
 */

import assert from "node:assert/strict";

// Env hygiene BEFORE importing modules under test.
delete process.env.SMARTLEAD_API_KEY;
delete process.env.OUTBOUND_DRY_RUN;

import {
  SmartleadClient,
  SmartleadApiError,
  redactSecrets,
  isSmartleadConfigured,
  getSmartleadClient,
  resetSmartleadClientCache,
  type SmartleadSequenceStep,
} from "../server/services/sending/smartleadClient";
import { MockSmartleadClient } from "../server/services/sending/mockSmartlead";
import {
  isDeniedSendingDomain,
  normalizeDomain,
  extractEmailDomain,
  buildVerifyLinkResult,
  evaluateDomainHealth,
  aggregateDomainStats,
  type VerifyLinkResult,
} from "../server/services/sending/sendingDomainPool";
import {
  getOutreachAdapter,
  SmartleadAdapter,
  NoopAdapter,
} from "../server/services/outreachPlatform";
import { insertOutreachSendingDomainSchema } from "../shared/schemas/outreachSending";

/* ─── tiny harness ─── */

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed += 1;
    failures.push(name);
    console.error(`  FAIL ${name}`);
    console.error(`       ${err instanceof Error ? err.message : String(err)}`);
  }
}

/* ─── fake fetch helpers ─── */

function makeRes(status: number, body: unknown, headers: Record<string, string> = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    text: async () => text,
  } as unknown as Response;
}

type FetchCall = { url: string; method: string; body: unknown };

function fakeFetch(responses: Array<() => Response>, calls: FetchCall[]) {
  let i = 0;
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const next = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return next();
  }) as typeof fetch;
}

const KEY = "sk_TESTSECRET123";

function makeClient(
  responses: Array<() => Response>,
  calls: FetchCall[],
  opts: { maxRetries?: number } = {},
) {
  const sleeps: number[] = [];
  const client = new SmartleadClient(KEY, {
    fetchFn: fakeFetch(responses, calls),
    sleepFn: async (ms) => {
      sleeps.push(ms);
    },
    jitter: false,
    backoffBaseMs: 100,
    maxRetries: opts.maxRetries ?? 4,
  });
  return { client, sleeps };
}

/* ─── frozen-contract shape gate (also used as the deliberate-failure gate) ─── */

function assertVerifyLinkShape(obj: Record<string, unknown>): void {
  assert.deepEqual(
    Object.keys(obj).sort(),
    ["email_accounts", "linked", "platform_status", "verified"],
    "verify-link top-level keys deviate from the frozen contract",
  );
  assert.equal(typeof obj.linked, "boolean");
  assert.equal(typeof obj.verified, "boolean");
  assert.equal(typeof obj.platform_status, "string");
  assert.ok(Array.isArray(obj.email_accounts));
  for (const acct of obj.email_accounts as Array<Record<string, unknown>>) {
    assert.deepEqual(
      Object.keys(acct).sort(),
      ["domain", "email"],
      "email_accounts item keys deviate from the frozen contract",
    );
    assert.equal(typeof acct.email, "string");
    assert.equal(typeof acct.domain, "string");
  }
}

async function main() {
  console.log("\n── denylist (hard rule: wefixtrades.com + subdomains) ──");

  await test("wefixtrades.com is denied", () => {
    assert.equal(isDeniedSendingDomain("wefixtrades.com"), true);
  });
  await test("subdomains are denied (mail., deep.sub.)", () => {
    assert.equal(isDeniedSendingDomain("mail.wefixtrades.com"), true);
    assert.equal(isDeniedSendingDomain("a.b.wefixtrades.com"), true);
  });
  await test("case / whitespace / scheme / trailing-dot variants are denied", () => {
    assert.equal(isDeniedSendingDomain("WeFixTrades.COM"), true);
    assert.equal(isDeniedSendingDomain("  wefixtrades.com  "), true);
    assert.equal(isDeniedSendingDomain("https://wefixtrades.com/path"), true);
    assert.equal(isDeniedSendingDomain("wefixtrades.com."), true);
  });
  await test("lookalike but DIFFERENT domains are allowed", () => {
    assert.equal(isDeniedSendingDomain("notwefixtrades.com"), false);
    assert.equal(isDeniedSendingDomain("wefixtradesmail.com"), false);
    assert.equal(isDeniedSendingDomain("wefixtrades.com.attacker.com"), false);
    assert.equal(isDeniedSendingDomain("wefixtrades.net"), false);
  });
  await test("DELIBERATE FAILURE: insert-path validation rejects the brand domain", () => {
    // Simulates the exact POST /sending-domains route logic.
    const parsed = insertOutreachSendingDomainSchema.safeParse({
      domain: "WEFIXTRADES.com",
    });
    assert.equal(parsed.success, true, "zod accepts the raw string (denial is the denylist's job)");
    const normalized = normalizeDomain((parsed as { data: { domain: string } }).data.domain);
    assert.equal(isDeniedSendingDomain(normalized), true, "denylist MUST reject the brand domain");
  });
  await test("insert schema rejects garbage / URLs, accepts a bare lookalike domain", () => {
    assert.equal(insertOutreachSendingDomainSchema.safeParse({ domain: "not a domain" }).success, false);
    assert.equal(insertOutreachSendingDomainSchema.safeParse({ domain: "https://x.com" }).success, false);
    assert.equal(insertOutreachSendingDomainSchema.safeParse({ domain: "wefixtrades-mail.com" }).success, true);
    assert.equal(insertOutreachSendingDomainSchema.safeParse({ domain: "x.com", status: "bogus" }).success, false);
  });

  console.log("\n── 429 retry + exponential backoff ──");

  await test("429,429,200 → 3 fetches, exponential delays, final success", async () => {
    const calls: FetchCall[] = [];
    const { client, sleeps } = makeClient(
      [
        () => makeRes(429, { error: "rate limited" }),
        () => makeRes(429, { error: "rate limited" }),
        () => makeRes(200, { id: 7, name: "c", status: "ACTIVE" }),
      ],
      calls,
    );
    const campaign = await client.getCampaign(7);
    assert.equal(calls.length, 3);
    assert.equal(campaign?.id, 7);
    const backoffs = sleeps.filter((ms) => ms >= 100);
    assert.deepEqual(backoffs, [100, 200], "expected exponential 1x,2x backoff");
  });

  await test("Retry-After header is honored when larger than the backoff", async () => {
    const calls: FetchCall[] = [];
    const { client, sleeps } = makeClient(
      [
        () => makeRes(429, "slow down", { "retry-after": "2" }),
        () => makeRes(200, { id: 1, name: "c", status: "ACTIVE" }),
      ],
      calls,
    );
    await client.getCampaign(1);
    assert.ok(sleeps.includes(2000), `expected a 2000ms wait, got ${JSON.stringify(sleeps)}`);
  });

  await test("DELIBERATE FAILURE: endless 429 exhausts retries and THROWS (redacted)", async () => {
    const calls: FetchCall[] = [];
    const { client } = makeClient([() => makeRes(429, "rate limited")], calls, { maxRetries: 2 });
    await assert.rejects(
      () => client.getCampaign(9),
      (err: unknown) => {
        assert.ok(err instanceof SmartleadApiError);
        assert.equal(err.status, 429);
        assert.ok(!err.message.includes(KEY), "429 error message leaked the api key");
        return true;
      },
    );
    assert.equal(calls.length, 3, "1 initial + 2 retries");
  });

  console.log("\n── api_key redaction (key rides the query string) ──");

  await test("HTTP error bodies echoing the full URL are redacted", async () => {
    const calls: FetchCall[] = [];
    const { client } = makeClient(
      [() => makeRes(500, `boom at https://server.smartlead.ai/api/v1/campaigns/1?api_key=${KEY}`)],
      calls,
    );
    await assert.rejects(
      () => client.getCampaign(1),
      (err: unknown) => {
        assert.ok(err instanceof SmartleadApiError);
        assert.ok(!err.message.includes(KEY), "error message leaked the api key");
        assert.ok(err.message.includes("REDACTED"), "expected REDACTED marker");
        assert.ok(!err.path.includes("?"), "SmartleadApiError.path must not carry the query string");
        return true;
      },
    );
  });

  await test("network-level fetch errors embedding the URL are redacted", async () => {
    const client = new SmartleadClient(KEY, {
      fetchFn: (async (url: RequestInfo | URL) => {
        throw new Error(`ECONNRESET while fetching ${String(url)}`);
      }) as typeof fetch,
      sleepFn: async () => {},
      jitter: false,
    });
    await assert.rejects(
      () => client.getCampaign(1),
      (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        assert.ok(!msg.includes(KEY), "network error leaked the api key");
        return true;
      },
    );
  });

  await test("redactSecrets strips api_key params + raw key, keeps the rest", () => {
    const s = redactSecrets(`GET /x?api_key=${KEY}&limit=5 :: ${KEY}`, KEY);
    assert.ok(!s.includes(KEY));
    assert.ok(s.includes("limit=5"), "non-secret query parts must survive");
  });

  console.log("\n── client-side rate limiter (10 req / 2s) ──");

  await test("11th request inside the window waits for the window to roll", async () => {
    let now = 0;
    const sleeps: number[] = [];
    const calls: FetchCall[] = [];
    const client = new SmartleadClient(KEY, {
      fetchFn: fakeFetch([() => makeRes(200, { id: 1, name: "c", status: "ACTIVE" })], calls),
      sleepFn: async (ms) => {
        sleeps.push(ms);
        now += ms; // sleeping advances the fake clock
      },
      nowFn: () => now,
      jitter: false,
    });
    for (let i = 0; i < 11; i += 1) {
      await client.getCampaign(1);
    }
    assert.equal(calls.length, 11);
    assert.deepEqual(sleeps, [2000], "exactly the 11th call should wait out the 2s window");
  });

  console.log("\n── key-absent behaviour (never fake success) ──");

  await test("isSmartleadConfigured() is false and factory returns the mock", () => {
    resetSmartleadClientCache();
    assert.equal(isSmartleadConfigured(), false);
    const client = getSmartleadClient();
    assert.equal(client.isMock, true);
    assert.ok(client instanceof MockSmartleadClient);
  });

  await test("DELIBERATE FAILURE: key-absent adapter yields dry_run, NEVER 'created'", async () => {
    const adapter = getOutreachAdapter("smartlead");
    const result = await adapter.addLeadToCampaign("123", { email: "x@lookalike.com" });
    assert.equal(result.status, "dry_run");
    assert.notEqual(result.status, "created", "mock result must never masquerade as a real create");
  });

  console.log("\n── verify-link FROZEN CONTRACT ──");

  const activePool = new Set(["pool-one.com", "pool-two.com"]);

  await test("shape matches the frozen contract exactly", () => {
    const result = buildVerifyLinkResult({
      campaignStatus: "ACTIVE",
      emailAccounts: [
        { id: 1, from_email: "a@pool-one.com" },
        { id: 2, from_email: "b@pool-two.com" },
      ],
      activePoolDomains: activePool,
    });
    assertVerifyLinkShape(result as unknown as Record<string, unknown>);
    assert.equal(result.linked, true);
    assert.equal(result.verified, true);
    assert.equal(result.platform_status, "ACTIVE");
    assert.deepEqual(result.email_accounts, [
      { email: "a@pool-one.com", domain: "pool-one.com" },
      { email: "b@pool-two.com", domain: "pool-two.com" },
    ]);
  });

  await test("DELIBERATE FAILURE: a tampered payload (extra key) FAILS the shape gate", () => {
    const good = buildVerifyLinkResult({
      campaignStatus: "ACTIVE",
      emailAccounts: [{ id: 1, from_email: "a@pool-one.com" }],
      activePoolDomains: activePool,
    });
    const tampered = { ...good, extra_field: true } as unknown as Record<string, unknown>;
    assert.throws(
      () => assertVerifyLinkShape(tampered),
      "shape gate MUST reject a contract deviation — it did not",
    );
    const tamperedAccount = {
      ...good,
      email_accounts: [{ email: "a@pool-one.com", domain: "pool-one.com", warmup: 1 }],
    } as unknown as Record<string, unknown>;
    assert.throws(
      () => assertVerifyLinkShape(tamperedAccount),
      "shape gate MUST reject an email_accounts item deviation — it did not",
    );
  });

  await test("account domain OUTSIDE the active pool → verified=false (still linked)", () => {
    const result = buildVerifyLinkResult({
      campaignStatus: "ACTIVE",
      emailAccounts: [{ id: 1, from_email: "a@rogue-domain.com" }],
      activePoolDomains: activePool,
    });
    assert.equal(result.linked, true);
    assert.equal(result.verified, false);
  });

  await test("DENYLISTED account domain → verified=false even if seeded into the pool", () => {
    const poisonedPool = new Set([...activePool, "wefixtrades.com"]);
    const result = buildVerifyLinkResult({
      campaignStatus: "ACTIVE",
      emailAccounts: [
        { id: 1, from_email: "a@pool-one.com" },
        { id: 2, from_email: "ceo@wefixtrades.com" },
      ],
      activePoolDomains: poisonedPool,
    });
    assert.equal(result.verified, false, "brand domain must fail verify-link no matter what");
  });

  await test("campaign not found → linked=false, platform_status=not_found, empty accounts", () => {
    const result = buildVerifyLinkResult({
      campaignStatus: null,
      emailAccounts: [],
      activePoolDomains: activePool,
    });
    assertVerifyLinkShape(result as unknown as Record<string, unknown>);
    assert.deepEqual(result, {
      linked: false,
      verified: false,
      platform_status: "not_found",
      email_accounts: [],
    } satisfies VerifyLinkResult);
  });

  await test("zero email accounts → verified=false", () => {
    const result = buildVerifyLinkResult({
      campaignStatus: "DRAFTED",
      emailAccounts: [],
      activePoolDomains: activePool,
    });
    assert.equal(result.linked, true);
    assert.equal(result.verified, false);
  });

  console.log("\n── global suppression (frozen adapter contract) ──");

  await test("Smartlead: resolves emails → lead ids, unsubscribes, honest count", async () => {
    const mock = new MockSmartleadClient();
    mock.seedLead("a@x.com");
    mock.seedLead("b@y.com");
    mock.seedLead("c@z.com");
    const adapter = new SmartleadAdapter(mock);
    const result = await adapter.pushGlobalSuppression([
      "a@x.com",
      "unknown@nowhere.com",
      "b@y.com",
      "",
      "c@z.com",
    ]);
    assert.deepEqual(Object.keys(result), ["suppressed"], "frozen contract: exactly {suppressed}");
    assert.equal(result.suppressed, 3);
    const unsubCalls = mock.calls.filter((c) => c.method === "unsubscribeLeadGlobal");
    assert.equal(unsubCalls.length, 3, "one unsubscribe per KNOWN lead only");
    assert.equal(mock.getUnsubscribedLeadIds().length, 3);
  });

  await test("DELIBERATE FAILURE: unknown emails are NOT counted as suppressed", async () => {
    const mock = new MockSmartleadClient();
    mock.seedLead("only@one.com");
    const adapter = new SmartleadAdapter(mock);
    const result = await adapter.pushGlobalSuppression(["only@one.com", "ghost@gone.com"]);
    assert.notEqual(result.suppressed, 2, "must not fake suppression of unknown leads");
    assert.equal(result.suppressed, 1);
  });

  await test("Instantly: honest not_supported → {suppressed: 0}", async () => {
    process.env.INSTANTLY_API_KEY = "dummy-test-key";
    try {
      const adapter = getOutreachAdapter("instantly");
      const result = await adapter.pushGlobalSuppression(["a@x.com", "b@y.com"]);
      assert.deepEqual(result, { suppressed: 0 });
    } finally {
      delete process.env.INSTANTLY_API_KEY;
    }
  });

  await test("Noop (dry-run): simulated count, zero network", async () => {
    const result = await new NoopAdapter().pushGlobalSuppression(["a@x.com", "b@y.com"]);
    assert.deepEqual(result, { suppressed: 2 });
  });

  console.log("\n── lead batching (documented 400/request cap) ──");

  await test("950 leads → 3 requests of 400/400/150, aggregated result", async () => {
    const calls: FetchCall[] = [];
    const { client } = makeClient(
      [() => makeRes(200, { ok: true, upload_count: 1 })],
      calls,
    );
    const leads = Array.from({ length: 950 }, (_, i) => ({ email: `lead${i}@pool-one.com` }));
    await client.addLeads(42, leads);
    assert.equal(calls.length, 3);
    const sizes = calls.map((c) => (c.body as { lead_list: unknown[] }).lead_list.length);
    assert.deepEqual(sizes, [400, 400, 150]);
    for (const c of calls) {
      assert.ok("lead_list" in (c.body as object), "payload must use the verified lead_list field");
    }
  });

  console.log("\n── sequence push (verified wrapped payload) ──");

  await test("saveSequences wraps steps in a `sequences` key", async () => {
    const calls: FetchCall[] = [];
    const { client } = makeClient([() => makeRes(200, { ok: true })], calls);
    const steps: SmartleadSequenceStep[] = [
      {
        seq_number: 1,
        seq_delay_details: { delay_in_days: 0 },
        subject: "Quick question",
        email_body: "<p>Hi {{first_name}}</p>",
      },
    ];
    await client.saveSequences(5, steps);
    assert.equal(calls.length, 1);
    const body = calls[0].body as { sequences: unknown[] };
    assert.ok(Array.isArray(body.sequences), "body must be { sequences: [...] } (verified shape)");
    assert.equal((body.sequences[0] as { seq_number: number }).seq_number, 1);
  });

  console.log("\n── domain health: thresholds + auto-pause maths ──");

  await test("bounce 4% over 7d → pause; 2.9% → no pause", () => {
    assert.equal(evaluateDomainHealth({ sent: 1000, bounced: 40, complaints: 0 }).shouldPause, true);
    assert.equal(evaluateDomainHealth({ sent: 1000, bounced: 29, complaints: 0 }).shouldPause, false);
  });
  await test("complaint 0.11% → pause; 0.09% → no pause", () => {
    assert.equal(
      evaluateDomainHealth({ sent: 10000, bounced: 0, complaints: 11 }).shouldPause,
      true,
    );
    assert.equal(
      evaluateDomainHealth({ sent: 10000, bounced: 0, complaints: 9 }).shouldPause,
      false,
    );
  });
  await test("tiny sample (< 50 sent) never auto-pauses (noise guard)", () => {
    const verdict = evaluateDomainHealth({ sent: 10, bounced: 5, complaints: 1 });
    assert.equal(verdict.shouldPause, false);
    assert.ok(verdict.bounceRate > 0.03, "rate is over threshold but sample is too small");
  });
  await test("aggregateDomainStats splits campaign counts evenly across its domains", () => {
    const stats = aggregateDomainStats([
      { domains: ["pool-one.com", "pool-two.com"], sent: 100, bounced: 10, complaints: 2 },
      { domains: ["pool-one.com"], sent: 50, bounced: 1, complaints: 0 },
    ]);
    assert.equal(stats.get("pool-one.com")?.sent, 100);
    assert.equal(stats.get("pool-one.com")?.bounced, 6);
    assert.equal(stats.get("pool-two.com")?.sent, 50);
    assert.equal(stats.get("pool-two.com")?.complaints, 1);
  });

  console.log("\n── misc helpers ──");

  await test("extractEmailDomain / normalizeDomain edge cases", () => {
    assert.equal(extractEmailDomain("A@Pool-One.COM"), "pool-one.com");
    assert.equal(extractEmailDomain("not-an-email"), "");
    assert.equal(normalizeDomain("HTTPS://X.com:8080/p?q=1"), "x.com");
  });

  /* ── summary ── */
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error(`Failures: ${failures.join(", ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
