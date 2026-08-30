/**
 * Guard: Citation Builder never tells a customer about work nobody did.
 *
 * Runnable standalone: npx tsx server/services/citationBuilder/fulfilmentHonesty.test.ts
 * Wired into CI as `npm run check:citation-builder-fulfilment`.
 *
 * THE REGRESSION THIS PINS
 * ------------------------
 * Citation Builder sold at $79 / $179 / $299 one-time and promised "Listed
 * within 7 business days" and a "Status dashboard + completion report". What
 * it did: the Stripe webhook inserted one row at status='pending' and stopped.
 * No admin route, worker or cron could move a row off 'pending', and
 * sendCitationBuilderProgressEmail / sendCitationBuilderCompletionEmail —
 * both fully written — had ZERO callers anywhere in the repo.
 *
 * The naive fix is worse than the bug: give an admin a PATCH that sets
 * `status` and `directories_submitted_count`, and the product can now claim
 * anything an operator types. That is the same defect class this repo removed
 * three times over — rankflowWorker's canned "[AI-generated] Task 'X'
 * completed by AI engine", AdFlow's "campaign paused" with no ad platform
 * behind it, and sitelaunch's issue-ssl flipping ssl_status to 'active' on a
 * setTimeout.
 *
 * So the contract enforced here is structural, not stylistic:
 *
 *   1. Counts are DERIVED from citation_builder_directory_tasks rows. Nothing
 *      accepts them from a request body.
 *   2. `live` — the only state a customer sees as a listing — cannot be
 *      recorded without the URL that proves it. `rejected` / `not_applicable`
 *      cannot be recorded without a reason.
 *   3. The progress email fires on the FIRST recorded submission and never on
 *      a timer, a purchase, or "start". It is idempotent.
 *   4. Completion is refused unless every directory has an outcome AND at
 *      least one is live. The completion email reports the live count, not
 *      the tier's marketing number.
 *   5. Both emails have exactly one caller — the fulfilment service.
 *   6. The customer-facing tier counts equal the registry the operator's
 *      checklist is cut from, so marketing cannot outrun the work.
 *
 * Sections 1-4 are behavioural (pure functions, no DB). 5-6 are structural
 * source scans, the same technique as
 * server/services/rankflow/rankflowHonesty.test.ts. Section 7 is a
 * deliberate-failure fixture proving the behavioural half actually goes red.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// The modules under test transitively import ../db, which throws at
// module-eval when DATABASE_URL is unset. Set a dummy FIRST. No connection is
// opened — everything asserted is pure or a source scan.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:1/test_no_connect";
}

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");

let failures = 0;
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (err: any) {
    failures++;
    console.error(`  FAIL  ${name}\n        ${err?.message}`);
  }
}

/** Read a repo file with line and block comments stripped. */
function readSourceWithoutComments(relPath: string): string {
  const raw = readFileSync(join(REPO_ROOT, relPath), "utf8");
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", ".vite", "coverage"]);

/** Every .ts/.tsx file under a repo-relative directory. */
function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry)) yield full;
  }
}

function repoRel(p: string): string {
  return relative(REPO_ROOT, p).split("\\").join("/");
}

/**
 * Every drizzle WRITE of `column` in this source — i.e. the column appearing
 * as a key inside a `.set({ … })` or `.values({ … })` call. Reading the value
 * back out into a response body is not a write and is not what we are banning.
 */
function drizzleWritesOf(src: string, column: string): string[] {
  const hits: string[] = [];
  const re = /\.(?:set|values)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    // Walk to the matching close paren so nested braces/objects are included.
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") { depth--; if (depth === 0) break; }
    }
    const body = src.slice(m.index, i + 1);
    if (new RegExp("\\b" + column + "\\s*:").test(body)) hits.push(body.slice(0, 120));
  }
  return hits;
}

/** Build a task list of `n` rows in a given status. */
function tasks(spec: Array<[status: string, extra?: Partial<{ listing_url: string; note: string }>]>) {
  return spec.map(([status, extra], i) => ({
    directory_id: `dir_${i}`,
    directory_name: `Directory ${i}`,
    status,
    listing_url: extra?.listing_url ?? null,
    note: extra?.note ?? null,
  }));
}

async function main(): Promise<void> {
  console.log("citation builder fulfilment honesty");

  const fulfilment = await import("./fulfilment");
  const registry = await import("@shared/citationBuilder/directories");
  const { CITATIONBUILDER } = await import("@shared/pricing");

  /* ─── 1. Counts are derived from recorded rows ────────────────────── */

  await check("an order with no recorded work reports zero progress", () => {
    const c = fulfilment.deriveCounts([]);
    assert.equal(c.total, 0, "no tasks means no total");
    assert.equal(c.submitted, 0, "no tasks means nothing submitted");
    assert.equal(c.live, 0, "no tasks means nothing live");
  });

  await check("an order whose tasks are all untouched still reports zero progress", () => {
    const c = fulfilment.deriveCounts(tasks([["not_started"], ["not_started"], ["not_started"]]));
    assert.equal(c.total, 3, "the checklist exists");
    assert.equal(c.submitted, 0, "assigning work is not doing it");
    assert.equal(c.live, 0, "assigning work is not doing it");
    assert.equal(c.outstanding, 3);
  });

  await check("live counts toward submitted so the customer's bar never goes backwards", () => {
    const c = fulfilment.deriveCounts(tasks([
      ["live", { listing_url: "https://x.test/a" }],
      ["submitted"],
      ["rejected", { note: "duplicate" }],
      ["not_applicable", { note: "US only" }],
    ]));
    assert.equal(c.live, 1);
    assert.equal(c.submitted, 2, "live implies submitted");
    assert.equal(c.rejected, 1);
    assert.equal(c.notApplicable, 1);
    assert.equal(c.outstanding, 1, "only the still-pending submission is outstanding");
  });

  /* ─── 2. A claim needs its evidence ───────────────────────────────── */

  await check("a directory cannot be marked live without a listing URL", () => {
    const r = fulfilment.validateTaskWrite({ status: "live", listing_url: "", note: "went fine" });
    assert.equal(r.ok, false, "live with no URL must be refused");
  });

  await check("a directory cannot be marked live with a non-URL", () => {
    const r = fulfilment.validateTaskWrite({ status: "live", listing_url: "done" });
    assert.equal(r.ok, false, "'done' is not evidence of a listing");
  });

  await check("live is accepted with a real URL", () => {
    const r = fulfilment.validateTaskWrite({ status: "live", listing_url: "https://yelp.test/biz/x" });
    assert.equal(r.ok, true);
  });

  await check("rejected and not_applicable both require a reason", () => {
    assert.equal(fulfilment.validateTaskWrite({ status: "rejected" }).ok, false);
    assert.equal(fulfilment.validateTaskWrite({ status: "not_applicable" }).ok, false);
    assert.equal(fulfilment.validateTaskWrite({ status: "rejected", note: "sales-gated" }).ok, true);
    assert.equal(fulfilment.validateTaskWrite({ status: "not_applicable", note: "US only" }).ok, true);
  });

  await check("an unknown status is refused rather than stored", () => {
    assert.equal(fulfilment.validateTaskWrite({ status: "definitely_done" }).ok, false);
  });

  /* ─── 3. The progress email needs recorded work ───────────────────── */

  await check("no progress email for an order with no tasks at all", () => {
    assert.equal(
      fulfilment.shouldSendProgressEmail({ tasks: [], progressEmailSentAt: null }),
      false,
      "an unstarted order must generate no mail, however old it is",
    );
  });

  await check("no progress email merely because the checklist was cut", () => {
    assert.equal(
      fulfilment.shouldSendProgressEmail({
        tasks: tasks([["not_started"], ["not_started"]]),
        progressEmailSentAt: null,
      }),
      false,
      "assignment is not progress — this is the exact claim the old product made and never earned",
    );
  });

  await check("progress email fires on the first recorded submission", () => {
    assert.equal(
      fulfilment.shouldSendProgressEmail({
        tasks: tasks([["submitted"], ["not_started"]]),
        progressEmailSentAt: null,
      }),
      true,
    );
  });

  await check("progress email is idempotent once stamped", () => {
    assert.equal(
      fulfilment.shouldSendProgressEmail({
        tasks: tasks([["submitted"], ["live", { listing_url: "https://x.test/a" }]]),
        progressEmailSentAt: new Date(),
      }),
      false,
      "a second task write must not re-send",
    );
  });

  /* ─── 4. Completion needs every outcome, and a real one ───────────── */

  await check("an unstarted order cannot be completed", () => {
    const r = fulfilment.assertCompletable([]);
    assert.equal(r.ok, false);
  });

  await check("an order with any unrecorded directory cannot be completed", () => {
    const r = fulfilment.assertCompletable(tasks([
      ["live", { listing_url: "https://x.test/a" }],
      ["not_started"],
    ]));
    assert.equal(r.ok, false, "'your listings are live' would be false");
    assert.match((r as any).reason, /Directory 1/, "the operator is told which one is outstanding");
  });

  await check("an order still awaiting a directory's decision cannot be completed", () => {
    const r = fulfilment.assertCompletable(tasks([
      ["live", { listing_url: "https://x.test/a" }],
      ["submitted"],
    ]));
    assert.equal(r.ok, false, "submitted is not an outcome");
  });

  await check("an order where nothing went live cannot be completed", () => {
    const r = fulfilment.assertCompletable(tasks([
      ["rejected", { note: "sales-gated" }],
      ["not_applicable", { note: "CA only" }],
    ]));
    assert.equal(r.ok, false, "a completion report for zero listings is not a delivery");
    assert.match((r as any).reason, /refund/i, "the operator is pointed at a refund, not a report");
  });

  await check("an order with every outcome recorded and one live can be completed", () => {
    const r = fulfilment.assertCompletable(tasks([
      ["live", { listing_url: "https://x.test/a" }],
      ["rejected", { note: "sales-gated" }],
      ["not_applicable", { note: "CA only" }],
    ]));
    assert.equal(r.ok, true);
  });

  await check("the completion email's directory list is only the ones that went live", () => {
    const names = fulfilment.liveDirectoryNames(tasks([
      ["live", { listing_url: "https://x.test/a" }],
      ["rejected", { note: "no" }],
      ["submitted"],
    ]));
    assert.deepEqual(names, ["Directory 0"], "a rejected or pending directory is not a listing");
  });

  /* ─── 5. The emails have exactly one caller ───────────────────────── */

  await check("progress + completion emails are imported ONLY by the fulfilment service", () => {
    const offenders: Record<string, string[]> = { progress: [], completion: [] };
    for (const abs of walk(join(REPO_ROOT, "server"))) {
      const rel = repoRel(abs);
      if (rel.endsWith(".test.ts")) continue;
      // The modules themselves, and the one legitimate caller.
      if (rel === "server/lib/citationBuilderProgressEmail.ts") continue;
      if (rel === "server/lib/citationBuilderCompletionEmail.ts") continue;
      const src = readSourceWithoutComments(rel);
      if (/sendCitationBuilderProgressEmail/.test(src) && rel !== "server/services/citationBuilder/fulfilment.ts") {
        offenders.progress.push(rel);
      }
      if (/sendCitationBuilderCompletionEmail/.test(src) && rel !== "server/services/citationBuilder/fulfilment.ts") {
        offenders.completion.push(rel);
      }
    }
    assert.deepEqual(
      offenders,
      { progress: [], completion: [] },
      "these emails may only be sent from server/services/citationBuilder/fulfilment.ts, which gates them on recorded task rows",
    );
  });

  await check("the fulfilment service really does call both of them", () => {
    const src = readSourceWithoutComments("server/services/citationBuilder/fulfilment.ts");
    assert.ok(/sendCitationBuilderProgressEmail\s*\(/.test(src), "progress email must actually be sent");
    assert.ok(/sendCitationBuilderCompletionEmail\s*\(/.test(src), "completion email must actually be sent");
  });

  await check("no timer, interval or cron can advance a Citation Builder order", () => {
    const watched = [
      "server/services/citationBuilder/fulfilment.ts",
      "server/routes/adminCitationBuilderRoutes.ts",
      "server/routes/citationBuilderRoutes.ts",
      "server/routes/citationBuilderWebhookHandlers.ts",
    ];
    for (const rel of watched) {
      const src = readSourceWithoutComments(rel);
      assert.ok(
        !/\bsetTimeout\s*\(|\bsetInterval\s*\(|\bcron\.schedule\s*\(/.test(src),
        `${rel} must not schedule anything — progress is a consequence of recorded work, never of elapsed time ` +
          "(this is the sitelaunch issue-ssl setTimeout bug)",
      );
    }
  });

  /* ─── 6. No route may assert progress, and copy cannot outrun it ──── */

  await check("no admin route accepts a progress count or a completed status from the client", () => {
    const src = readSourceWithoutComments("server/routes/adminCitationBuilderRoutes.ts");

    // The zod bodies are the whole attack surface: anything outside them is
    // dropped by .strict(). Assert neither count column is ever WRITTEN here.
    // Reading one back into a response is fine; the ban is on drizzle writes.
    for (const col of ["directories_submitted_count", "directories_total"]) {
      assert.deepEqual(
        drizzleWritesOf(src, col),
        [],
        `adminCitationBuilderRoutes must never write ${col} — it is derived by recountSubmission()`,
      );
    }

    // The submission PATCH must be a closed object that cannot reach 'completed'.
    const patchBody = src.match(/submissionPatchBody\s*=\s*z\.object\(\{[\s\S]*?\}\)\.strict\(\)/);
    assert.ok(patchBody, "submissionPatchBody must be a .strict() zod object so unknown fields are rejected");
    assert.ok(
      !/completed/.test(patchBody![0]),
      "the submission PATCH must not be able to set status='completed' — completion runs through completeSubmission(), which gates on recorded outcomes",
    );

    // The task PATCH must be strict too.
    assert.ok(
      /taskPatchBody\s*=\s*z\.object\(\{[\s\S]*?\}\)\.strict\(\)/.test(src),
      "taskPatchBody must be a .strict() zod object",
    );

    // And every completion must go through the gated service.
    assert.ok(
      /completeSubmission\s*\(/.test(src),
      "the complete route must delegate to completeSubmission(), which enforces assertCompletable()",
    );
  });

  await check("recountSubmission is the only writer of the two mirror columns", () => {
    const offenders: string[] = [];
    for (const abs of walk(join(REPO_ROOT, "server"))) {
      const rel = repoRel(abs);
      if (rel.endsWith(".test.ts")) continue;
      if (rel === "server/services/citationBuilder/fulfilment.ts") continue;
      const src = readSourceWithoutComments(rel);
      if (drizzleWritesOf(src, "directories_submitted_count").length > 0) offenders.push(rel);
    }
    assert.deepEqual(
      offenders,
      [],
      "only recountSubmission() in the fulfilment service may write directories_submitted_count",
    );
  });

  await check("the checkout + order email quote the registry's real count, with no fallback", () => {
    const routes = readSourceWithoutComments("server/routes/citationBuilderRoutes.ts");
    assert.ok(
      /from "@shared\/citationBuilder\/directories"/.test(routes),
      "the checkout must read the same registry the operator's checklist comes from",
    );
    assert.ok(
      !/CITATION_BUILDER_TIER_DIRECTORIES\[[^\]]*\]\s*\?\?/.test(routes),
      "no `?? 25` fallback — a silent default is how the old code charged for a made-up number",
    );
    const webhook = readSourceWithoutComments("server/routes/citationBuilderWebhookHandlers.ts");
    assert.ok(
      !/CITATION_BUILDER_TIER_DIRECTORIES\[[^\]]*\]\s*\?\?/.test(webhook),
      "no `?? 25` fallback in the order email either",
    );
  });

  await check("the pricing bullets match the registry, tier by tier", () => {
    const counts = registry.CITATION_BUILDER_TIER_DIRECTORIES;
    // Every count named in a Citation Builder bullet must be a real tier size
    // or a real increment — nothing invented, nothing rounded up.
    const legal = new Set<number>([
      counts.starter,
      counts.pro,
      counts.premium,
      counts.pro - counts.starter,
      counts.premium - counts.pro,
    ]);
    for (const tier of CITATIONBUILDER.tiers) {
      for (const feature of tier.features) {
        // Only numbers that actually QUANTIFY listings are checked against the
        // registry. "within 7 business days" is a turnaround promise, not a
        // count — the copy rules below cover that class of claim instead.
        for (const m of feature.matchAll(/(\d{1,3})\+?(?=[^,;.)]{0,40}?(?:listing|director))/gi)) {
          const n = Number(m[1]);
          assert.ok(
            legal.has(n),
            `pricing.ts CITATIONBUILDER "${tier.name}" claims "${feature}" — ${n} is not a tier size ` +
              `(${counts.starter}/${counts.pro}/${counts.premium}) or an increment. ` +
              "Every number sold must come from shared/citationBuilder/directories.ts.",
          );
        }
      }
    }
  });

  await check("no removed or undeliverable directory is named in customer copy", () => {
    // Each of these was named on /citation-builder or in pricing.ts and cannot
    // be delivered; the reason is recorded in the registry's nonInclusionNotes.
    const banned = [
      "Acxiom",
      "Localeze",
      "HomeAdvisor",
      "ServiceMagic",
      "ExpressUpdate",
      "ReferenceUSA",
      "Infofree",
      "Citysearch",
      "Factual",
      "TradeFix",
      "ImproveNet",
      "Pro Referral",
    ];
    const surfaces = [
      "shared/pricing.ts",
      "client/src/pages/marketing/CitationBuilderPage.tsx",
      "client/src/pages/portal/CitationBuilderDashboard.tsx",
      "server/lib/citationBuilderOrderEmail.ts",
      "server/lib/citationBuilderProgressEmail.ts",
      "server/lib/citationBuilderCompletionEmail.ts",
    ];
    for (const rel of surfaces) {
      const src = readSourceWithoutComments(rel);
      for (const name of banned) {
        assert.ok(
          !src.includes(name),
          `${rel} still names "${name}" as a deliverable. See nonInclusionNotes in ` +
            "shared/citationBuilder/directories.ts for why it cannot be delivered.",
        );
      }
    }
  });

  await check("the retired Premium promises are gone from every customer surface", () => {
    const surfaces = [
      "shared/pricing.ts",
      "client/src/pages/marketing/CitationBuilderPage.tsx",
    ];
    for (const rel of surfaces) {
      const src = readSourceWithoutComments(rel);
      assert.ok(
        !/[Qq]uarterly NAP re-verification/.test(src),
        `${rel} still promises a quarterly NAP re-verification report. There is no mechanism for it, ` +
          "and a four-quarter obligation cannot be funded by a one-time fee — Citation Tracker is the real product.",
      );
      assert.ok(
        !/[Vv]oice-search optimized director/.test(src),
        `${rel} still claims voice-search optimized directories. Alexa/Siri/Assistant read Google, Apple ` +
          "and Bing, which are already in Starter under their own names.",
      );
      assert.ok(
        !/100\+\s*(local\s+)?(business\s+)?director/i.test(src),
        `${rel} still claims 100+ directories. The registry has ${registry.CITATION_BUILDER_TIER_DIRECTORIES.premium}.`,
      );
    }
  });

  await check("every registry entry is free and carries its evidence", () => {
    for (const d of registry.CITATION_BUILDER_DIRECTORIES) {
      assert.equal(d.cost, "free", `${d.name} is not free — a paid directory cannot be funded by these tiers`);
      assert.ok(d.evidence && d.evidence.length > 40, `${d.name} has no recorded evidence for its submission path`);
      assert.ok(/^https?:\/\//.test(d.submitUrl), `${d.name} has no usable submission URL`);
    }
  });

  await check("the tiers are strictly nested so 'everything in Starter' is true by construction", () => {
    const s = new Set(registry.getDirectoriesForTier("starter").map(d => d.id));
    const p = new Set(registry.getDirectoriesForTier("pro").map(d => d.id));
    const pr = new Set(registry.getDirectoriesForTier("premium").map(d => d.id));
    for (const id of s) assert.ok(p.has(id), `Pro is missing Starter's ${id}`);
    for (const id of p) assert.ok(pr.has(id), `Premium is missing Pro's ${id}`);
  });

  /* ─── 7. Deliberate-failure fixture ──────────────────────────────────
   * Everything above passes on the current code, which proves nothing on its
   * own. These cases re-run the same rules against the behaviour the OLD
   * design would have produced, and assert the rules reject it. If someone
   * loosens deriveCounts / shouldSendProgressEmail / assertCompletable, the
   * fixture's expectations flip and this guard goes red.
   * ─────────────────────────────────────────────────────────────────── */

  await check("FIXTURE: the pre-fix behaviour is rejected by every rule that now exists", () => {
    // (a) The old product's state: a paid order, no work recorded anywhere.
    //     It claimed "Listed within 7 business days" regardless.
    const unstarted: any[] = [];
    assert.equal(
      fulfilment.shouldSendProgressEmail({ tasks: unstarted, progressEmailSentAt: null }),
      false,
      "REGRESSION: an order with zero recorded work would email the customer that submissions are live",
    );
    assert.equal(
      fulfilment.assertCompletable(unstarted).ok,
      false,
      "REGRESSION: an order with zero recorded work could be marked completed",
    );

    // (b) The naive admin fix: an operator types a count, nothing is recorded.
    //     Progress must still be zero because it is derived, not asserted.
    const typedProgressOnly = fulfilment.deriveCounts(unstarted);
    assert.equal(
      typedProgressOnly.submitted,
      0,
      "REGRESSION: progress became assertable rather than derived",
    );

    // (c) "Everything went out" with no proof: live rows with no URL. These
    //     must be refused at write time, so they can never reach the customer.
    const unprovenLive = { status: "live", listing_url: null, note: "all done" };
    assert.equal(
      fulfilment.validateTaskWrite(unprovenLive).ok,
      false,
      "REGRESSION: a listing could be claimed live with no URL behind it",
    );

    // (d) A completion report where every directory refused the business.
    const allRejected = tasks([
      ["rejected", { note: "sales-gated" }],
      ["rejected", { note: "duplicate" }],
    ]);
    assert.equal(
      fulfilment.assertCompletable(allRejected).ok,
      false,
      "REGRESSION: a completion report could be sent for an order with zero live listings",
    );
  });

  await check("FIXTURE: the old 25/50/100 tier numbers would fail the pricing-vs-registry check", () => {
    const counts = registry.CITATION_BUILDER_TIER_DIRECTORIES;
    const legal = new Set<number>([
      counts.starter,
      counts.pro,
      counts.premium,
      counts.pro - counts.starter,
      counts.premium - counts.pro,
    ]);
    for (const stale of [25, 50, 100]) {
      assert.ok(
        !legal.has(stale),
        `REGRESSION: ${stale} is once again a legal tier number, which means the registry was padded ` +
          "back out to match the old marketing copy instead of the copy being corrected.",
      );
    }
  });

  console.log("");
  if (failures > 0) {
    console.error(`citation builder fulfilment honesty: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("citation builder fulfilment honesty: all checks passed");
  process.exit(0);
}

void main();
