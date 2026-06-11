/**
 * ContentFlow — urlScreenshotCapture tests (standalone tsx + node:assert).
 *
 * Runnable with NO browser, NO live DB, NO API key:
 *   npx tsx server/services/contentflow/urlScreenshotCapture.test.ts
 *
 * Excluded from `tsc --noEmit` (tsconfig excludes ** /*.test.ts). Mirrors
 * referenceReplication.test.ts — node assert/strict, manual runner.
 *
 * Coverage:
 *   1. isSafePublicUrl SSRF guard — table of cases (localhost, every private
 *      IPv4 range, link-local, IPv6 loopback/ULA/link-local/v4-mapped,
 *      non-http schemes, empty/garbage) all REJECTED; real public hosts/IPs
 *      ALLOWED. Includes a DELIBERATE-FAILURE fixture: a "regressed guard"
 *      that would allow 127.0.0.1 must make the table fail red — proving the
 *      guard actually catches the regression, not just runs.
 *   2. Flag-off → captureUrlForReplication does NOT launch a browser
 *      (injected launcher's launch() is never called) and returns ok:false.
 *   3. Flag-on + injected FAKE browser → two-image capture shape (hero +
 *      fullPage buffers, dims, image/png), and page/context/browser .close()
 *      all called (finally-close), even on the happy path.
 *   4. Flag-on + injected launcher whose launch() THROWS → graceful ok:false
 *      (never throws) with the reason surfaced.
 *   5. Flag-on + nav timeout (goto throws) → ok:false AND finally still closes
 *      the page/context/browser that were opened.
 *   6. OPT-IN live capture of https://example.com IF a real chromium is
 *      installed — asserts two non-empty buffers. Skipped (reported) if the
 *      browser binary is absent, so CI without browsers stays green.
 */

import assert from "node:assert/strict";
import {
  isSafePublicUrl,
  isUrlScreenshotEnabled,
  captureUrlForReplication,
  URL_SCREENSHOT_FLAG,
  type BrowserLauncher,
  type FakeBrowser,
  type FakeContext,
  type FakePage,
} from "./urlScreenshotCapture";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    failed++;
  }
}

/* ─── Fake Playwright surface ──────────────────────────────────────── */

interface CloseTracker {
  pageClosed: number;
  contextClosed: number;
  browserClosed: number;
  launchCount: number;
}

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAADyJXupAAAAC0lEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC",
  "base64",
);

/** Build a fake launcher that records close()/launch() calls. `behavior`
 *  controls failure injection. */
function makeFakeLauncher(
  tracker: CloseTracker,
  behavior: { launchThrows?: boolean; gotoThrows?: boolean } = {},
): BrowserLauncher {
  const page: FakePage = {
    async setViewportSize() {},
    async goto() {
      if (behavior.gotoThrows) throw new Error("Navigation timeout of 20000ms exceeded");
      return {};
    },
    async waitForTimeout() {},
    async evaluate<T>(): Promise<T> {
      // Simulate a 2200px tall document.
      return 2200 as unknown as T;
    },
    async screenshot() {
      return PNG_BYTES;
    },
    async close() {
      tracker.pageClosed++;
    },
  };
  const context: FakeContext = {
    async newPage() {
      return page;
    },
    async close() {
      tracker.contextClosed++;
    },
  };
  const browser: FakeBrowser = {
    async newContext() {
      return context;
    },
    async close() {
      tracker.browserClosed++;
    },
  };
  return {
    async launch() {
      tracker.launchCount++;
      if (behavior.launchThrows) throw new Error("Chromium failed to launch: missing libs");
      return browser;
    },
  };
}

function freshTracker(): CloseTracker {
  return { pageClosed: 0, contextClosed: 0, browserClosed: 0, launchCount: 0 };
}

const ENABLED_ENV = { [URL_SCREENSHOT_FLAG]: "1" } as unknown as NodeJS.ProcessEnv;
const DISABLED_ENV = {} as unknown as NodeJS.ProcessEnv;

/* ─── SSRF guard table ─────────────────────────────────────────────── */

/** Each case: [url, expectedOk]. expectedOk=false → must be REJECTED. */
const SSRF_CASES: Array<[string, boolean]> = [
  // Rejected — non-http(s) schemes
  ["file:///etc/passwd", false],
  ["data:text/html,<h1>x</h1>", false],
  ["ftp://example.com/x", false],
  ["gopher://example.com", false],
  ["javascript:alert(1)", false],
  // Rejected — empty / garbage
  ["", false],
  ["   ", false],
  ["not a url", false],
  // Rejected — localhost
  ["http://localhost/", false],
  ["http://localhost:3000/admin", false],
  ["http://foo.localhost/", false],
  ["https://LOCALHOST/", false],
  // Rejected — IPv4 private / loopback / link-local
  ["http://127.0.0.1/", false],
  ["http://127.0.0.1:8080/secret", false],
  ["http://0.0.0.0/", false],
  ["http://10.0.0.5/", false],
  ["http://10.255.255.255/", false],
  ["http://172.16.0.1/", false],
  ["http://172.20.10.1/", false],
  ["http://172.31.255.255/", false],
  ["http://192.168.1.1/", false],
  ["http://169.254.169.254/latest/meta-data/", false], // cloud metadata!
  ["http://100.64.0.1/", false], // CGNAT
  // Rejected — IPv6 loopback / ULA / link-local / v4-mapped-private
  ["http://[::1]/", false],
  ["http://[::]/", false],
  ["http://[fc00::1]/", false],
  ["http://[fd12:3456::1]/", false],
  ["http://[fe80::1]/", false],
  ["http://[::ffff:127.0.0.1]/", false],
  ["http://[::ffff:10.0.0.1]/", false],
  // Allowed — real public targets
  ["https://example.com/", true],
  ["http://example.com/path?q=1", true],
  ["https://wefixtrades.com/products", true],
  ["http://8.8.8.8/", true], // public IP
  ["http://172.15.0.1/", true], // just OUTSIDE 172.16/12
  ["http://172.32.0.1/", true], // just OUTSIDE 172.16/12
  ["http://192.167.1.1/", true], // not 192.168
  ["http://[2606:4700:4700::1111]/", true], // public IPv6 (Cloudflare)
];

async function main() {
  console.log("urlScreenshotCapture.test.ts");

  /* 1. SSRF guard table */
  await test("isSafePublicUrl: SSRF table — private/localhost/non-http rejected, public allowed", () => {
    for (const [url, expectedOk] of SSRF_CASES) {
      const res = isSafePublicUrl(url);
      assert.equal(
        res.ok,
        expectedOk,
        `case ${JSON.stringify(url)} expected ok=${expectedOk} but got ok=${res.ok} (reason: ${res.reason})`,
      );
    }
  });

  /* 1b. DELIBERATE-FAILURE fixture — a regressed guard that allows 127.0.0.1
   *     MUST be caught by the table assertion. We simulate the regression and
   *     prove the same assertion logic fails red. If this "expected failure"
   *     does NOT throw, the table is toothless → real test fails. */
  await test("SSRF table catches a regressed guard (deliberate-failure fixture)", () => {
    const regressedGuard = (u: string) =>
      u.includes("127.0.0.1") ? { ok: true } : isSafePublicUrl(u);
    let tableCaughtRegression = false;
    try {
      for (const [url, expectedOk] of SSRF_CASES) {
        const res = regressedGuard(url);
        assert.equal(res.ok, expectedOk, `regressed: ${url}`);
      }
    } catch {
      tableCaughtRegression = true;
    }
    assert.equal(
      tableCaughtRegression,
      true,
      "the SSRF table must FAIL against a guard that wrongly allows 127.0.0.1",
    );
  });

  /* 1c. flag helper */
  await test("isUrlScreenshotEnabled: truthy values on, everything else off", () => {
    for (const v of ["1", "true", "TRUE", "yes", "on"]) {
      assert.equal(isUrlScreenshotEnabled({ [URL_SCREENSHOT_FLAG]: v } as any), true, `value ${v}`);
    }
    for (const v of ["", "0", "false", "no", "off", "maybe"]) {
      assert.equal(isUrlScreenshotEnabled({ [URL_SCREENSHOT_FLAG]: v } as any), false, `value ${v}`);
    }
    assert.equal(isUrlScreenshotEnabled({} as any), false, "unset → off");
  });

  /* 2. flag-off → no launch attempted */
  await test("flag-off: captureUrlForReplication never launches a browser, returns ok:false", async () => {
    const tracker = freshTracker();
    const launcher = makeFakeLauncher(tracker);
    const res = await captureUrlForReplication("https://example.com/", {
      launcher,
      env: DISABLED_ENV,
    });
    assert.equal(res.ok, false, "disabled → ok:false");
    assert.equal(tracker.launchCount, 0, "browser must NOT be launched when flag off");
  });

  /* 2b. SSRF rejection short-circuits before launch even when flag on */
  await test("flag-on + unsafe url: rejected by SSRF before any launch", async () => {
    const tracker = freshTracker();
    const launcher = makeFakeLauncher(tracker);
    const res = await captureUrlForReplication("http://169.254.169.254/", {
      launcher,
      env: ENABLED_ENV,
    });
    assert.equal(res.ok, false);
    assert.equal(tracker.launchCount, 0, "unsafe url must not reach launch");
    if (!res.ok) assert.match(res.reason, /unsafe url/i);
  });

  /* 3. flag-on + fake browser → two-image shape + finally-close */
  await test("flag-on: captures hero + fullPage buffers and closes page/context/browser", async () => {
    const tracker = freshTracker();
    const launcher = makeFakeLauncher(tracker);
    const res = await captureUrlForReplication("https://example.com/", {
      launcher,
      env: ENABLED_ENV,
    });
    assert.equal(res.ok, true, "should succeed with fake browser");
    if (res.ok) {
      assert.equal(res.mediaType, "image/png");
      assert.ok(res.hero.buffer.length > 0, "hero buffer non-empty");
      assert.ok(res.fullPage.buffer.length > 0, "fullPage buffer non-empty");
      assert.equal(res.hero.width, 1440, "hero is viewport width");
      assert.equal(res.hero.height, 900, "hero is viewport-only height");
      assert.equal(res.fullPage.width, 1440);
      // evaluate() returned 2200, under the 4000 clamp → fullPage height 2200.
      assert.equal(res.fullPage.height, 2200, "fullPage clamped to measured doc height");
    }
    assert.equal(tracker.launchCount, 1, "launched exactly once");
    assert.equal(tracker.pageClosed, 1, "page closed in finally");
    assert.equal(tracker.contextClosed, 1, "context closed in finally");
    assert.equal(tracker.browserClosed, 1, "browser closed in finally");
  });

  /* 4. launch throws → graceful ok:false */
  await test("flag-on: launch failure returns ok:false (never throws)", async () => {
    const tracker = freshTracker();
    const launcher = makeFakeLauncher(tracker, { launchThrows: true });
    const res = await captureUrlForReplication("https://example.com/", {
      launcher,
      env: ENABLED_ENV,
    });
    assert.equal(res.ok, false, "launch failure → graceful ok:false");
    if (!res.ok) assert.match(res.reason, /launch/i);
    assert.equal(tracker.browserClosed, 0, "no browser to close (launch failed)");
  });

  /* 5. nav timeout → ok:false AND opened resources still closed */
  await test("flag-on: nav timeout returns ok:false and finally still closes resources", async () => {
    const tracker = freshTracker();
    const launcher = makeFakeLauncher(tracker, { gotoThrows: true });
    const res = await captureUrlForReplication("https://example.com/", {
      launcher,
      env: ENABLED_ENV,
    });
    assert.equal(res.ok, false, "nav timeout → ok:false");
    if (!res.ok) assert.match(res.reason, /timeout/i);
    assert.equal(tracker.pageClosed, 1, "page still closed after nav failure");
    assert.equal(tracker.contextClosed, 1, "context still closed after nav failure");
    assert.equal(tracker.browserClosed, 1, "browser still closed after nav failure");
  });

  /* 6. OPT-IN live capture — only if a real chromium binary is installed. */
  await test("LIVE (opt-in): real chromium capture of example.com, or skip", async () => {
    let chromium: any;
    try {
      ({ chromium } = await import("playwright"));
    } catch (e: any) {
      console.log(`    (skipped — playwright import failed: ${e?.message || e})`);
      return;
    }
    // Probe whether the browser binary is actually installed without failing
    // the suite: try a real launch; if it throws (no binary in CI), skip.
    let realBrowser: any = null;
    try {
      realBrowser = await chromium.launch({ headless: true });
    } catch (e: any) {
      console.log(`    (skipped — no chromium binary available: ${e?.message || e})`);
      return;
    } finally {
      if (realBrowser) {
        try {
          await realBrowser.close();
        } catch {
          /* probe-only browser; close failure is non-fatal and reported here */
          console.log("    (probe browser close failed — ignored)");
        }
      }
    }

    const res = await captureUrlForReplication("https://example.com/", { env: ENABLED_ENV });
    assert.equal(res.ok, true, `live capture should succeed: ${res.ok ? "" : (res as any).reason}`);
    if (res.ok) {
      assert.ok(res.hero.buffer.length > 100, "live hero buffer is a real PNG");
      assert.ok(res.fullPage.buffer.length > 100, "live fullPage buffer is a real PNG");
      console.log(
        `    (LIVE RAN — hero=${res.hero.buffer.length}B fullPage=${res.fullPage.buffer.length}B ${res.fullPage.width}x${res.fullPage.height})`,
      );
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
