/**
 * Deliberate-failure tests for Vapi webhook signature verification
 * (Sentry NODEWEFIXTRADES-1E — "Webhook signature verification threw").
 *
 * Excluded from `tsc --noEmit` (tsconfig `**\/*.test.ts`). Runnable standalone:
 *
 *   npx tsx server/services/vapiService.sigverify.test.ts
 *
 * The regression being gated: `crypto.timingSafeEqual` THROWS on byte-length
 * mismatch, so a garbage `x-vapi-signature` header (attack noise) used to
 * throw inside the verifier and page Sentry at error level. The verifier must
 * return `false` for EVERY malformed input — never throw — so the route can
 * 401 cleanly. The "wrong-length hex" fixture below throws on the pre-fix
 * code, proving this gate catches the regression.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

// Env BEFORE importing the app module graph: db.ts hard-requires DATABASE_URL
// (stub never connects — same pattern as CI's schema-drift step), and the
// verifier itself needs a webhook secret + production semantics.
process.env.DATABASE_URL ||= "postgresql://stub:stub@localhost:5432/stub";
process.env.VAPI_WEBHOOK_SECRET = "test-webhook-secret";
process.env.NODE_ENV ||= "test";

let failures = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err: any) {
    failures++;
    console.error(`  FAIL ${name}\n      ${err?.message ?? err}`);
  }
}

async function main() {
  const { verifyWebhookSignature } = await import("./vapiService");

  const body = Buffer.from(JSON.stringify({ message: { type: "status-update" } }));
  const validSig = createHmac("sha256", "test-webhook-secret").update(body).digest("hex");

  test("valid signature → true", () => {
    assert.equal(verifyWebhookSignature(body, validSig), true);
  });

  test("tampered body → false", () => {
    const tampered = Buffer.from(JSON.stringify({ message: { type: "evil" } }));
    assert.equal(verifyWebhookSignature(tampered, validSig), false);
  });

  test("FIXTURE wrong-length hex signature → false, MUST NOT throw (threw pre-fix)", () => {
    // 8 hex chars decode to 4 bytes vs the expected 32 — this is the exact
    // input class that made timingSafeEqual throw ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH.
    assert.equal(verifyWebhookSignature(body, "deadbeef"), false);
  });

  test("FIXTURE non-hex garbage signature → false, MUST NOT throw", () => {
    assert.equal(verifyWebhookSignature(body, "not-hex-at-all-zzzz!!"), false);
  });

  test("empty signature header → false", () => {
    assert.equal(verifyWebhookSignature(body, undefined), false);
  });

  test("missing raw body → false", () => {
    assert.equal(verifyWebhookSignature(undefined, validSig), false);
  });

  test("same-length but wrong signature → false (constant-time path)", () => {
    const wrong = createHmac("sha256", "some-other-secret").update(body).digest("hex");
    assert.equal(wrong.length, validSig.length);
    assert.equal(verifyWebhookSignature(body, wrong), false);
  });

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed`);
    process.exit(1);
  }
  console.log("\nall vapi signature-verification tests passed");
}

main();
