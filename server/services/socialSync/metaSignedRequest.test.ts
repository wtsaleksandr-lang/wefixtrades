/**
 * Unit tests for Meta `signed_request` parsing + verification
 * (server/services/socialSync/metaSignedRequest.ts), used by the Meta
 * Data Deletion callback (POST /api/meta/data-deletion).
 *
 * Excluded from `tsc --noEmit` (tsconfig `**\/*.test.ts`). Runnable
 * standalone:
 *
 *   npx tsx server/services/socialSync/metaSignedRequest.test.ts
 *
 * `assert/strict` only — no test runner dep is added.
 *
 * Coverage (includes the deliberate-failure fixtures that prove the gate
 * actually rejects bad input, not just that it runs):
 *   1. Valid signature → payload parses, user_id extracted
 *   2. Tampered payload (user_id swapped after signing) → rejected
 *   3. Tampered signature (one byte flipped) → rejected
 *   4. Wrong app secret → rejected
 *   5. Unsupported algorithm in an otherwise correctly-signed token → rejected
 *   6. Structural garbage (no dot / empty / non-base64url / missing secret) → rejected
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { parseSignedRequest, buildSignedRequest } from "./metaSignedRequest";

const APP_SECRET = "test-app-secret-0123456789abcdef";

function test(name: string, fn: () => void | Promise<void>) {
  const run = async () => {
    try {
      await fn();
      console.log(`  ok  ${name}`);
    } catch (err: any) {
      console.error(`  FAIL ${name}`);
      console.error(err?.message ?? err);
      process.exitCode = 1;
    }
  };
  // Sequential — keeps log output deterministic.
  return run();
}

(async () => {
  console.log("Meta signed_request verification contract");

  await test("valid signature → payload parses with user_id", () => {
    const signed = buildSignedRequest(
      { algorithm: "HMAC-SHA256", user_id: "1234567890", issued_at: 1765400000 },
      APP_SECRET,
    );
    const payload = parseSignedRequest(signed, APP_SECRET);
    assert.ok(payload, "expected payload, got null");
    assert.equal(payload!.user_id, "1234567890");
    assert.equal(payload!.issued_at, 1765400000);
  });

  await test("DELIBERATE FAILURE: tampered payload (user_id swapped) → rejected", () => {
    const signed = buildSignedRequest(
      { algorithm: "HMAC-SHA256", user_id: "1234567890", issued_at: 1765400000 },
      APP_SECRET,
    );
    const [sig] = signed.split(".");
    // Re-encode a different payload but keep the original signature —
    // exactly what an attacker forging a deletion for another user would do.
    const forgedPayload = Buffer.from(
      JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "9999999999", issued_at: 1765400000 }),
      "utf-8",
    ).toString("base64url");
    const tampered = `${sig}.${forgedPayload}`;
    assert.equal(parseSignedRequest(tampered, APP_SECRET), null);
  });

  await test("DELIBERATE FAILURE: tampered signature (byte flipped) → rejected", () => {
    const signed = buildSignedRequest(
      { algorithm: "HMAC-SHA256", user_id: "1234567890" },
      APP_SECRET,
    );
    const [sig, payload] = signed.split(".");
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    assert.equal(parseSignedRequest(`${flipped}.${payload}`, APP_SECRET), null);
  });

  await test("wrong app secret → rejected", () => {
    const signed = buildSignedRequest(
      { algorithm: "HMAC-SHA256", user_id: "1234567890" },
      APP_SECRET,
    );
    assert.equal(parseSignedRequest(signed, "a-different-secret"), null);
  });

  await test("unsupported algorithm (correctly signed) → rejected", () => {
    const signed = buildSignedRequest(
      { algorithm: "HMAC-SHA1", user_id: "1234567890" },
      APP_SECRET,
    );
    assert.equal(parseSignedRequest(signed, APP_SECRET), null);
  });

  await test("structural garbage → rejected", () => {
    assert.equal(parseSignedRequest(null, APP_SECRET), null);
    assert.equal(parseSignedRequest("", APP_SECRET), null);
    assert.equal(parseSignedRequest("no-dot-here", APP_SECRET), null);
    assert.equal(parseSignedRequest(".payload-only", APP_SECRET), null);
    assert.equal(parseSignedRequest("sig-only.", APP_SECRET), null);
    assert.equal(parseSignedRequest("a.b.c", APP_SECRET), null);
    assert.equal(parseSignedRequest("not!base64url.YWJj", APP_SECRET), null);
    const valid = buildSignedRequest({ algorithm: "HMAC-SHA256", user_id: "1" }, APP_SECRET);
    assert.equal(parseSignedRequest(valid, null), null, "missing secret must fail closed");
  });

  await test("signed non-object JSON payload → rejected", () => {
    const encodedPayload = Buffer.from(JSON.stringify("just-a-string"), "utf-8").toString("base64url");
    const sig = createHmac("sha256", APP_SECRET).update(encodedPayload).digest("base64url");
    assert.equal(parseSignedRequest(`${sig}.${encodedPayload}`, APP_SECRET), null);
  });

  console.log("done");
})();
