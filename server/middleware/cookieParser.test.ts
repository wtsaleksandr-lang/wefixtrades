/**
 * Cookie-parser middleware + referral read-path regression test.
 *
 * The referral bug this guards: Express does not populate `req.cookies`, and
 * this repo ships no cookie-parser, so `req.cookies` was ALWAYS undefined —
 * the `wft_ref` cookie was written on the `?ref=` click but never read back at
 * signup, so `linkReferralOnSignup` always bailed. This test proves the
 * middleware now populates `req.cookies` from a REAL `Cookie` header and that
 * the attribution layer reads the referral cookie back WITHOUT any manual
 * `(req as any).cookies` injection.
 *
 * attribution.ts imports server/db at module scope (throws without
 * DATABASE_URL), so set a dummy URL FIRST then dynamically import — the DB
 * loader is never reached; parseRefCookie is pure.
 *
 * Run: npx tsx server/middleware/cookieParser.test.ts  (CI: check:cookie-parser)
 */
import assert from "node:assert/strict";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://ref:ref@127.0.0.1:1/ref_no_connect";
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
  const { parseCookieHeader, cookieParser } = await import("./cookieParser");
  const { parseRefCookie } = await import("../affiliate/attribution");
  const { REF_COOKIE_NAME, normalizeCode } = await import("../affiliate/programs");

  check("parseCookieHeader: empty / undefined / null → {}", () => {
    assert.deepEqual(parseCookieHeader(undefined), {});
    assert.deepEqual(parseCookieHeader(null), {});
    assert.deepEqual(parseCookieHeader(""), {});
  });

  check("parseCookieHeader: multiple cookies, trims, first-name-wins", () => {
    const jar = parseCookieHeader("a=1; b=2 ;  a=3 ");
    assert.equal(jar.a, "1");
    assert.equal(jar.b, "2");
  });

  check("parseCookieHeader: URL-decodes the value", () => {
    assert.equal(parseCookieHeader("x=hello%20world").x, "hello world");
  });

  check("parseCookieHeader: malformed %-encoding keeps the raw value", () => {
    assert.equal(parseCookieHeader("x=%E0%A4%A").x, "%E0%A4%A");
  });

  check("parseCookieHeader: strips a single pair of surrounding quotes", () => {
    assert.equal(parseCookieHeader('x="quoted"').x, "quoted");
  });

  check("parseCookieHeader: ignores nameless / malformed segments", () => {
    const jar = parseCookieHeader("=novalue; novalue; ok=1");
    assert.equal(jar.ok, "1");
    assert.equal(Object.keys(jar).length, 1);
  });

  // The core regression: middleware populates req.cookies from a real Cookie
  // header, and attribution reads wft_ref back with NO manual injection.
  check("cookieParser middleware populates req.cookies → attribution reads wft_ref", () => {
    const req: any = {
      headers: { cookie: `${REF_COOKIE_NAME}=ABCD2345~deadbeefcafe; other=1` },
    };
    let nexted = false;
    cookieParser(req, {} as any, () => {
      nexted = true;
    });
    assert.equal(nexted, true, "middleware must call next()");
    assert.ok(req.cookies, "req.cookies must be populated");
    assert.equal(req.cookies[REF_COOKIE_NAME], "ABCD2345~deadbeefcafe");

    const parsed = parseRefCookie(req.cookies[REF_COOKIE_NAME]);
    assert.ok(parsed, "attribution must parse the referral cookie back out");
    assert.equal(parsed!.code, normalizeCode("ABCD2345"));
    assert.equal(parsed!.token, "deadbeefcafe");
  });

  console.log(`\n[cookieParser.test] ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

void main();
