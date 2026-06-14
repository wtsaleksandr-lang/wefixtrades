/**
 * Gate test for TradeLine day-one knowledge seeding
 * (feat/tradeline-kb-seeding).
 *
 * Proves the day-one knowledge contract the launch audits' #1 gap required:
 *
 *   1. Seeding a client produces the full per-trade starter FAQ set as
 *      CUSTOMER-tier rows (kind='faq', never internal*) marked starter_default
 *      via the kbd: id prefix.
 *   2. HONESTY — no starter answer fabricates a "$"-price or a "guarantee"
 *      (a generic deferral that merely contains the word is allowed; a
 *      concrete promised guarantee is not). Unknowns DEFER.
 *   3. IDEMPOTENT — re-running seeding produces ZERO duplicate rows (the
 *      deterministic ids upsert in place).
 *   4. OVERRIDE — an owner onboarding answer for "hours" supersedes the
 *      starter-default hours row: the owner (kbo) row is active+high-priority
 *      and the starter (kbd) hours row is archived.
 *
 * DB-free: kbSeeding transitively imports server/db (via clientKnowledge +
 * onboardingMappers) which throws at module-eval if DATABASE_URL is unset. We
 * set the dummy URL FIRST, then dynamically import. The core seeder is driven
 * through an injected in-memory store, so no DB connection is opened.
 *
 * Run: tsx server/services/tradelineSetup/kbSeeding.test.ts
 * Wired into CI as `npm run check:tradeline-kb-seeding`.
 */

// MUST run before importing kbSeeding (which transitively pulls server/db).
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://audit:audit@127.0.0.1:1/audit_no_connect";
}

import assert from "node:assert/strict";

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : "");
  }
}

/* ─── In-memory KB store implementing KbSeedingDeps (no DB) ───────────────── */

interface StoredRow {
  id: string;
  client_id: number;
  kind: string;
  title: string;
  content: string;
  priority: number;
  status: "active" | "archived";
}

function makeStore() {
  const rows = new Map<string, StoredRow>();
  return {
    rows,
    deps: {
      async upsertRows(incoming: StoredRow[]) {
        for (const r of incoming) {
          // Upsert by id — this IS the idempotency mechanism under test.
          rows.set(r.id, { ...r });
        }
      },
      async archiveRows(clientId: number, ids: string[]) {
        for (const id of ids) {
          const existing = rows.get(id);
          if (existing && existing.client_id === clientId) {
            rows.set(id, { ...existing, status: "archived" });
          }
        }
      },
    },
    active(): StoredRow[] {
      return [...rows.values()].filter((r) => r.status === "active");
    },
  };
}

async function main() {
  const {
    seedTradelineKnowledgeCore,
    sourceOfRowId,
    starterRowId,
    ownerRowId,
    STARTER_PRIORITY,
    OWNER_PRIORITY,
  } = await import("./kbSeeding");
  const { STARTER_FAQ_KEYS } = await import("./starterFaqs");

  const CLIENT_ID = 4242;

  /* ── 1. Starter set: full, customer-tier, starter_default-marked ── */
  console.log("seed: plumbing client produces the full customer-tier starter FAQ set");
  {
    const store = makeStore();
    const result = await seedTradelineKnowledgeCore(store.deps as any, {
      clientId: CLIENT_ID,
      businessName: "Bob's Plumbing",
      tradeType: "plumbing",
      responses: {}, // no owner answers → all starter defaults active
    });

    const active = store.active();
    check(
      "one active row per starter key (no owner answers)",
      active.length === STARTER_FAQ_KEYS.length,
      { active: active.length, expected: STARTER_FAQ_KEYS.length },
    );
    check("every active row is kind='faq' (customer tier, never internal*)",
      active.every((r) => r.kind === "faq" && !r.kind.toLowerCase().startsWith("internal")));
    check("every active row is provenance starter_default",
      active.every((r) => sourceOfRowId(r.id) === "starter_default"));
    check("starter rows carry the low starter priority",
      active.every((r) => r.priority === STARTER_PRIORITY));
    check("result.written matches active count", result.written === active.length);
    check("no owner rows when responses are empty", result.ownerRows === 0);

    // Every expected key has its deterministic starter id.
    for (const key of STARTER_FAQ_KEYS) {
      check(`starter row present for "${key}"`, store.rows.has(starterRowId(CLIENT_ID, key)));
    }

    /* ── 2. Honesty: no fabricated price or guarantee in starter answers ── */
    for (const r of active) {
      const body = r.content;
      check(`"${r.id}" has no fabricated $-price`, !/\$\s?\d/.test(body), body);
      // "guarantee" is only allowed inside a generic deferral, never as a
      // concrete promise. The starter set must not promise one at all.
      check(`"${r.id}" makes no guarantee promise`, !/\bguarantee/i.test(body), body);
    }
    // Spot-check the deferral discipline on the high-risk keys.
    const estimates = store.rows.get(starterRowId(CLIENT_ID, "free_estimates"))!;
    check("free_estimates DEFERS (no fabricated 'free' claim)",
      /confirm|quick call|before any work/i.test(estimates.content) && !/\$/.test(estimates.content),
      estimates.content);
    const licensed = store.rows.get(starterRowId(CLIENT_ID, "licensed_insured"))!;
    check("licensed_insured DEFERS (no fabricated license number)",
      !/#\s?\d/.test(licensed.content) && /confirm/i.test(licensed.content),
      licensed.content);
  }

  /* ── 3. Idempotency: re-running seeding never duplicates ── */
  console.log("seed: re-running is idempotent (no duplicate rows)");
  {
    const store = makeStore();
    const inputs = {
      clientId: CLIENT_ID,
      businessName: "Bob's Plumbing",
      tradeType: "plumbing",
      responses: { service_area: "the greater Springfield area" },
    };
    await seedTradelineKnowledgeCore(store.deps as any, inputs);
    const afterFirst = store.rows.size;
    await seedTradelineKnowledgeCore(store.deps as any, inputs);
    const afterSecond = store.rows.size;
    check("row count is identical after a second seed", afterFirst === afterSecond, {
      afterFirst,
      afterSecond,
    });
    // No two active rows share a question key (one answer per question).
    const activeKeys = store.active().map((r) => r.id);
    check("no duplicate active row ids", new Set(activeKeys).size === activeKeys.length);
  }

  /* ── 4. Override: owner "hours" answer supersedes the starter default ── */
  console.log("seed: owner onboarding 'hours' answer overrides the starter default");
  {
    const store = makeStore();
    await seedTradelineKnowledgeCore(store.deps as any, {
      clientId: CLIENT_ID,
      businessName: "Bob's Plumbing",
      tradeType: "plumbing",
      responses: { business_hours: "Mon-Fri 7am-6pm, Sat 9am-2pm" },
    });

    const starterHours = store.rows.get(starterRowId(CLIENT_ID, "hours"));
    const ownerHours = store.rows.get(ownerRowId(CLIENT_ID, "hours"));

    check("owner hours row exists and is active", ownerHours?.status === "active");
    check("owner hours row carries the owner's typed answer",
      !!ownerHours && ownerHours.content.includes("Mon-Fri 7am-6pm"), ownerHours?.content);
    check("owner hours row provenance is owner_onboarding",
      !!ownerHours && sourceOfRowId(ownerHours.id) === "owner_onboarding");
    check("owner hours row outranks the starter (higher priority)",
      ownerHours?.priority === OWNER_PRIORITY && OWNER_PRIORITY > STARTER_PRIORITY);
    check("starter hours row is ARCHIVED (owner wins)", starterHours?.status === "archived");

    // Exactly one ACTIVE answer for the hours question reaches the customer.
    const activeHours = store
      .active()
      .filter((r) => r.id === starterRowId(CLIENT_ID, "hours") || r.id === ownerRowId(CLIENT_ID, "hours"));
    check("exactly one active hours answer (the owner's)",
      activeHours.length === 1 && activeHours[0].id === ownerRowId(CLIENT_ID, "hours"),
      activeHours.map((r) => r.id));

    // Other keys still have their starter defaults active (override is scoped).
    const areaStarter = store.rows.get(starterRowId(CLIENT_ID, "service_area"));
    check("a non-overridden key keeps its active starter default",
      areaStarter?.status === "active");
  }

  /* ── 5. Override re-seed is still idempotent ── */
  console.log("seed: override case re-seeds idempotently");
  {
    const store = makeStore();
    const inputs = {
      clientId: CLIENT_ID,
      businessName: "Bob's Plumbing",
      tradeType: "plumbing",
      responses: { business_hours: "Mon-Fri 7am-6pm" },
    };
    await seedTradelineKnowledgeCore(store.deps as any, inputs);
    const first = store.rows.size;
    await seedTradelineKnowledgeCore(store.deps as any, inputs);
    check("override re-seed adds no rows", store.rows.size === first, {
      first,
      second: store.rows.size,
    });
    check("hours starter still archived after re-seed",
      store.rows.get(starterRowId(CLIENT_ID, "hours"))?.status === "archived");
  }

  assert.ok(true); // keep node:assert imported + meaningful

  if (failures > 0) {
    console.error(`\n✗ ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\n✓ all TradeLine KB-seeding checks passed");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
