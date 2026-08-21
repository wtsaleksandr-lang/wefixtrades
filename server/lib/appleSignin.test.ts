/**
 * Sign in with Apple — unit tests for the crypto + flow that differs from the
 * other providers. Everything runs against a LOCAL EC (P-256/ES256) test
 * keypair generated in-process, so there is no network and no real Apple
 * credentials:
 *
 *   - the ES256 client_secret is signed with the test private key and
 *     VERIFIED against the matching public key (+ its header/claims decoded
 *     and asserted),
 *   - the id_token is signed with the test key and verified through the same
 *     verify path the real flow uses, with the public key injected,
 *   - the full code→profile exchange runs with fetch + key injected.
 *
 * Runnable standalone: npx tsx server/lib/appleSignin.test.ts
 * (excluded from tsc via tsconfig ** / *.test.ts).
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import {
  buildAppleClientSecret,
  verifyAppleIdToken,
  parseAppleUserName,
  exchangeAppleCodeForProfile,
  APPLE_ISSUER,
  type AppleSigningKeys,
} from "./appleSignin";

const SERVICES_ID = "com.wefixtrades.web";
const TEAM_ID = "ABCDE12345";
const KEY_ID = "KEY1234567";

// Local EC keypair standing in for Apple's signing key + JWKS.
const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
const privatePkcs8 = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();

const signingKeys: AppleSigningKeys = {
  servicesId: SERVICES_ID,
  teamId: TEAM_ID,
  keyId: KEY_ID,
  privateKey: privatePkcs8,
};

/** A resolver that always returns our test public key (stands in for JWKS). */
const localKeyResolver = async () => publicPem;

/** Sign an id_token exactly like Apple would (for verify/exchange tests). */
function signAppleIdToken(
  overrides: Record<string, unknown> = {},
  nowS = Math.floor(Date.now() / 1000),
): string {
  return jwt.sign(
    { email: "buyer@icloud.com", email_verified: "true", iat: nowS, exp: nowS + 600, ...overrides },
    privatePkcs8,
    { algorithm: "ES256", keyid: KEY_ID, issuer: APPLE_ISSUER, audience: SERVICES_ID, subject: "001234.apple.stable.sub" },
  );
}

let passed = 0;
let failed = 0;
async function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${label}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL ${label}`);
    console.error(`       ${(err as Error).message}`);
  }
}

async function run() {
  // ── ES256 client_secret JWT ──
  await check("client_secret: header {alg:ES256, kid} + claims iss/sub/aud/iat/exp(+300)", () => {
    const now = 1_700_000_000;
    const cs = buildAppleClientSecret(signingKeys, now);
    const decoded = jwt.decode(cs, { complete: true }) as { header: any; payload: any };
    assert.equal(decoded.header.alg, "ES256");
    assert.equal(decoded.header.kid, KEY_ID);
    assert.equal(decoded.payload.iss, TEAM_ID);
    assert.equal(decoded.payload.sub, SERVICES_ID);
    assert.equal(decoded.payload.aud, APPLE_ISSUER);
    assert.equal(decoded.payload.iat, now);
    assert.equal(decoded.payload.exp, now + 300);
  });

  await check("client_secret: verifies against the public key (iss=team, aud=apple)", () => {
    const cs = buildAppleClientSecret(signingKeys);
    const payload = jwt.verify(cs, publicPem, {
      algorithms: ["ES256"],
      issuer: TEAM_ID,
      audience: APPLE_ISSUER,
    }) as any;
    assert.equal(payload.sub, SERVICES_ID);
  });

  await check("client_secret: tolerates a single-line .p8 stored with literal \\n", () => {
    const singleLine = privatePkcs8.replace(/\n/g, "\\n");
    const cs = buildAppleClientSecret({ ...signingKeys, privateKey: singleLine });
    const decoded = jwt.decode(cs, { complete: true }) as { header: any; payload: any };
    assert.equal(decoded.header.alg, "ES256");
    assert.equal(decoded.payload.sub, SERVICES_ID);
  });

  // ── id_token verification ──
  await check("id_token: accepts a well-formed token → sub/email/email_verified", async () => {
    const token = signAppleIdToken();
    const claims = await verifyAppleIdToken(token, SERVICES_ID, localKeyResolver);
    assert.equal(claims.sub, "001234.apple.stable.sub");
    assert.equal(claims.email, "buyer@icloud.com");
    assert.equal(claims.email_verified, "true");
  });

  await check("id_token: rejects a token minted for a different audience", async () => {
    const token = signAppleIdToken();
    await assert.rejects(() => verifyAppleIdToken(token, "com.someone.else", localKeyResolver));
  });

  // ── parseAppleUserName (first-consent name) ──
  await check("parseAppleUserName: extracts a full name from first-consent user JSON", () => {
    assert.equal(
      parseAppleUserName('{"name":{"firstName":"Ada","lastName":"Lovelace"},"email":"x@y.z"}'),
      "Ada Lovelace",
    );
  });

  await check("parseAppleUserName: tolerates absence / blank / malformed → null", () => {
    assert.equal(parseAppleUserName(undefined), null);
    assert.equal(parseAppleUserName(""), null);
    assert.equal(parseAppleUserName("not json"), null);
    assert.equal(parseAppleUserName('{"name":{}}'), null);
  });

  // ── exchangeAppleCodeForProfile (fetch + key injected, no network) ──
  await check("exchange: signs client_secret, posts the code, verifies id_token, returns profile", async () => {
    const idToken = signAppleIdToken();
    let captured: { url: string; body: string } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      captured = { url: String(url), body: String(init.body) };
      return { ok: true, json: async () => ({ id_token: idToken }) } as unknown as Response;
    }) as unknown as typeof fetch;

    const profile = await exchangeAppleCodeForProfile(
      "the-auth-code",
      "Ada Lovelace",
      { ...signingKeys, redirectUri: "https://wefixtrades.com/api/auth/apple/callback" },
      { fetchImpl, keyResolver: localKeyResolver },
    );

    assert.deepEqual(profile, {
      sub: "001234.apple.stable.sub",
      email: "buyer@icloud.com",
      email_verified: true,
      name: "Ada Lovelace",
    });
    assert.equal(captured!.url, "https://appleid.apple.com/auth/token");
    const sent = new URLSearchParams(captured!.body);
    assert.equal(sent.get("grant_type"), "authorization_code");
    assert.equal(sent.get("client_id"), SERVICES_ID);
    assert.equal(sent.get("code"), "the-auth-code");
    // client_secret is a JWT (3 dot-separated segments) with our kid.
    assert.equal((sent.get("client_secret") || "").split(".").length, 3);
    const csHeader = jwt.decode(sent.get("client_secret")!, { complete: true }) as { header: any };
    assert.equal(csHeader.header.kid, KEY_ID);
  });

  await check("exchange: throws when Apple returns no id_token", async () => {
    const fetchImpl = (async () => ({ ok: true, json: async () => ({}) }) as unknown as Response) as unknown as typeof fetch;
    await assert.rejects(
      () =>
        exchangeAppleCodeForProfile(
          "c",
          null,
          { ...signingKeys, redirectUri: "r" },
          { fetchImpl, keyResolver: localKeyResolver },
        ),
      /no id_token/,
    );
  });

  await check("exchange: name is null on a later sign-in (no first-consent user blob)", async () => {
    const idToken = signAppleIdToken();
    const fetchImpl = (async () => ({ ok: true, json: async () => ({ id_token: idToken }) }) as unknown as Response) as unknown as typeof fetch;
    const profile = await exchangeAppleCodeForProfile(
      "c",
      null,
      { ...signingKeys, redirectUri: "r" },
      { fetchImpl, keyResolver: localKeyResolver },
    );
    assert.equal(profile.name, null);
    assert.equal(profile.sub, "001234.apple.stable.sub");
  });

  console.log(`\nappleSignin.test.ts — ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
