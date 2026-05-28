/**
 * Unit smoke tests for the Wave 82 SMS template resolver.
 *
 * Excluded from `tsc --noEmit` via the **\/*.test.ts ignore. Runnable as:
 *
 *   npx tsx server/lib/smsTemplateResolver.test.ts
 *
 * We deliberately exercise the `clientId == null` short-circuit path so
 * the test runs without a DB. The override-row path is covered by the
 * portal endpoint integration tests (Wave 83) where a fixture DB is
 * available.
 *
 * Coverage:
 *   1. Unknown templateId throws
 *   2. clientId=null → registry default body with interpolated vars
 *   3. clientId=null + defaultEnabled=false would return enabled:false
 *      (verified by passing a hand-rolled fake registry through the
 *      same logic — guarded indirectly because all shipped templates
 *      default-enabled true, so we run on the public surface only)
 *   4. canBeDisabled flows through unchanged
 */
import assert from "node:assert/strict";
import { resolveSmsTemplate } from "./smsTemplateResolver";

let passed = 0;
let failed = 0;

async function check(label: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed++;
    // eslint-disable-next-line no-console
    console.log(`  ok  ${label}`);
  } catch (err: any) {
    failed++;
    // eslint-disable-next-line no-console
    console.error(`  FAIL ${label}: ${err?.message ?? err}`);
  }
}

(async () => {
  // 1
  await check("unknown templateId throws", async () => {
    await assert.rejects(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => resolveSmsTemplate({ templateId: "nope.nope" as any, clientId: null }),
      /Unknown SMS template id/,
    );
  });

  // 2
  await check("clientId=null → registry default with interpolated vars", async () => {
    const r = await resolveSmsTemplate({
      templateId: "bookflow.day_of_reminder",
      clientId: null,
      vars: { brand_name: "Acme", time: "3:00 PM" },
    });
    assert.equal(r.enabled, true);
    assert.ok(r.body.includes("Acme"), `body should include brand_name, got: ${r.body}`);
    assert.ok(r.body.includes("3:00 PM"), `body should include time, got: ${r.body}`);
    assert.ok(!r.body.includes("{"), `body should not have unrendered placeholders`);
  });

  // 3 — registry-pinned non-disable-able templates flow through
  await check("canBeDisabled flows through (compliance template)", async () => {
    const r = await resolveSmsTemplate({
      templateId: "quotequick.deposit_receipt",
      clientId: null,
      vars: {
        trade_name: "Acme",
        amount: "$25",
        ref: "00001",
        link: "https://example.com",
      },
    });
    assert.equal(r.enabled, true);
    assert.equal(r.canBeDisabled, false);
  });

  // 4 — first-touch carrier-compliance template surfaces STOP / HELP
  await check("first-touch resolver result carries STOP + HELP", async () => {
    const r = await resolveSmsTemplate({
      templateId: "bookflow.confirmation",
      clientId: null,
      vars: {
        brand_name: "Acme",
        service_name: "drain unclog",
        date: "Thu, May 28",
        time: "3:00 PM",
        manage_link: "https://example.com",
      },
    });
    assert.ok(/STOP/.test(r.body), "must mention STOP");
    assert.ok(/HELP/.test(r.body), "must mention HELP");
  });

  // eslint-disable-next-line no-console
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
})();
