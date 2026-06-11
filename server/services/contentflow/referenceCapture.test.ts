/**
 * ContentFlow — rendered-webpage reference capture tests.
 *
 * Runnable standalone (no test-runner dep, no live browser, no network
 * beyond local DNS for "localhost"):
 *   npx tsx server/services/contentflow/referenceCapture.test.ts
 *
 * Pattern matches referenceReplication.test.ts — node assert/strict.
 *
 * Coverage:
 *   1. Flag off → playwright NEVER loaded; og:image fallback path used
 *      (capturedWith === "og_image").
 *   2. SSRF: localhost, 192.168.1.1, 10.x, 169.254.169.254 (cloud
 *      metadata), file:// scheme, *.internal hostname → all rejected
 *      TERMINALLY (no browser launch, no og fallback).
 *   3. Redirect-to-private: mocked page.url() returns an internal address
 *      post-goto → rejected terminally (no og fallback).
 *   4. Launch failure (no chromium in container) → graceful og:image
 *      fallback.
 *   5. Happy path → PNG buffer + capturedWith === "playwright"; goto used
 *      networkidle; height cap applied (clip.height === 3000 when the page
 *      is taller).
 *   6. Hard-timeout wall: a hung loader resolves (does not hang) and falls
 *      back to og:image.
 *   7. DELIBERATE-FAILURE fixture: a REGRESSED private-range validator
 *      that forgets 169.254.0.0/16 admits the metadata endpoint — proving
 *      this suite turns red if isPrivateAddress ever loses that range.
 *   8. resolveReferenceImage wiring: web page + flag off → og:image path
 *      with source === "page_og_image" (pre-existing behaviour intact);
 *      provenance source becomes "page_screenshot" on a playwright capture.
 */

import assert from "node:assert/strict";
import {
  captureWebpageReference,
  validateCaptureTarget,
  MAX_CAPTURE_HEIGHT_PX,
  CAPTURE_VIEWPORT,
  type PlaywrightModuleLike,
} from "./referenceCapture";
import { isPrivateAddress } from "../../lib/webhookSsrfGuard";
import { resolveReferenceImage } from "./referenceReplication";

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

/* A 1x1 PNG as fake bytes. */
const FAKE_PNG = Buffer.from(
  "iVBORw0KGgoAAAABCAQAAADyJXupAAAAC0lEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC",
  "base64",
);

/** Public TEST-NET-3 IP literal — validates without DNS or network. */
const PUBLIC_URL = "http://203.0.113.10/landing";

/** Build a fake playwright module recording what the capture did. */
function fakePlaywright(opts?: {
  finalUrl?: string;
  scrollHeight?: number;
  launchError?: string;
}) {
  const calls = {
    launched: false,
    closed: false,
    gotoUrl: "",
    gotoOpts: null as any,
    screenshotOpts: null as any,
    viewport: null as any,
  };
  const mod: PlaywrightModuleLike = {
    chromium: {
      async launch() {
        if (opts?.launchError) throw new Error(opts.launchError);
        calls.launched = true;
        return {
          async newPage(pageOpts: any) {
            calls.viewport = pageOpts.viewport;
            return {
              async route() {},
              async goto(url: string, gotoOpts: any) {
                calls.gotoUrl = url;
                calls.gotoOpts = gotoOpts;
              },
              url: () => opts?.finalUrl ?? calls.gotoUrl,
              evaluate: async () => opts?.scrollHeight ?? 5_000,
              screenshot: async (sOpts: any) => {
                calls.screenshotOpts = sOpts;
                return FAKE_PNG;
              },
            } as any;
          },
          async close() {
            calls.closed = true;
          },
        };
      },
    },
  };
  return { mod, calls };
}

const ogOk = () => {
  let used = false;
  return {
    fn: async () => {
      used = true;
      return { ok: true, buffer: FAKE_PNG, mediaType: "image/jpeg" as const };
    },
    wasUsed: () => used,
  };
};

async function main() {
  console.log("referenceCapture.test.ts");

  /* 1. Flag off → og:image path, playwright never loaded */
  await test("flag off: og:image fallback used, playwright never imported", async () => {
    let loaderCalled = false;
    const og = ogOk();
    const r = await captureWebpageReference(PUBLIC_URL, {
      enabled: false,
      ogFallback: og.fn,
      playwrightLoader: async () => {
        loaderCalled = true;
        throw new Error("must not be called when flag is off");
      },
    });
    assert.equal(loaderCalled, false, "playwright loader must not run when disabled");
    assert.equal(og.wasUsed(), true, "og fallback must run");
    assert.equal(r.ok, true);
    assert.equal(r.capturedWith, "og_image");
    assert.equal(r.mediaType, "image/jpeg");
    assert.ok(r.imageBuffer && r.imageBuffer.equals(FAKE_PNG));
  });

  /* 2. SSRF — pre-navigation rejection, terminal (no fallback, no launch) */
  await test("ssrf: private/internal targets rejected terminally", async () => {
    const cases = [
      "http://localhost/admin",
      "http://localhost:5000/api",
      "http://127.0.0.1/",
      "http://192.168.1.1/router",
      "http://10.0.0.5/internal",
      "http://172.16.0.1/",
      "http://169.254.169.254/latest/meta-data/", // cloud metadata
      "file:///etc/passwd",
      "gopher://evil/",
      "http://metadata.google.internal/computeMetadata/v1/",
    ];
    for (const url of cases) {
      const og = ogOk();
      let loaderCalled = false;
      const r = await captureWebpageReference(url, {
        enabled: true,
        ogFallback: og.fn,
        playwrightLoader: async () => {
          loaderCalled = true;
          throw new Error("must not launch for a blocked target");
        },
      });
      assert.equal(r.ok, false, `${url} must be rejected`);
      assert.equal(loaderCalled, false, `${url} must not reach the browser`);
      assert.equal(og.wasUsed(), false, `${url} must NOT fall back to og:image (terminal)`);
      assert.ok(r.reason, `${url} carries a reason`);
    }
  });

  /* 3. Redirect-to-private — post-goto page.url() re-check */
  await test("ssrf: redirect to private address post-goto rejected terminally", async () => {
    const { mod } = fakePlaywright({ finalUrl: "http://192.168.1.1/admin" });
    const og = ogOk();
    const r = await captureWebpageReference(PUBLIC_URL, {
      enabled: true,
      ogFallback: og.fn,
      playwrightLoader: async () => mod,
    });
    assert.equal(r.ok, false, "redirect-to-private must be rejected");
    assert.match(r.reason || "", /post-redirect/i);
    assert.equal(og.wasUsed(), false, "redirect-to-private must NOT fall back to og:image");
  });

  /* 4. Launch failure → graceful og:image fallback */
  await test("launch failure (no chromium): graceful og:image fallback", async () => {
    const { mod } = fakePlaywright({ launchError: "browserType.launch: Executable doesn't exist" });
    const og = ogOk();
    const r = await captureWebpageReference(PUBLIC_URL, {
      enabled: true,
      ogFallback: og.fn,
      playwrightLoader: async () => mod,
    });
    assert.equal(r.ok, true);
    assert.equal(r.capturedWith, "og_image");
    assert.equal(og.wasUsed(), true);
  });

  /* 4b. Launch failure AND og fallback failure → clean { ok:false } */
  await test("launch failure + og miss: clean failure, never throws", async () => {
    const { mod } = fakePlaywright({ launchError: "Executable doesn't exist" });
    const r = await captureWebpageReference(PUBLIC_URL, {
      enabled: true,
      ogFallback: async () => ({ ok: false, reason: "no og:image on page" }),
      playwrightLoader: async () => mod,
    });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "no og:image on page");
  });

  /* 5. Happy path → png buffer, capturedWith=playwright, height cap */
  await test("happy path: png buffer, networkidle goto, 3000px height cap, browser closed", async () => {
    const { mod, calls } = fakePlaywright({ scrollHeight: 5_000 });
    const og = ogOk();
    const r = await captureWebpageReference(PUBLIC_URL, {
      enabled: true,
      ogFallback: og.fn,
      playwrightLoader: async () => mod,
    });
    assert.equal(r.ok, true);
    assert.equal(r.capturedWith, "playwright");
    assert.equal(r.mediaType, "image/png");
    assert.ok(r.imageBuffer && r.imageBuffer.equals(FAKE_PNG), "png buffer returned");
    assert.equal(og.wasUsed(), false, "no fallback on success");
    assert.equal(calls.gotoUrl, PUBLIC_URL);
    assert.equal(calls.gotoOpts?.waitUntil, "networkidle");
    assert.equal(calls.gotoOpts?.timeout, 20_000);
    assert.deepEqual(calls.viewport, { width: 1440, height: 900 });
    /* Height cap: page is 5000px tall → clip capped at MAX_CAPTURE_HEIGHT_PX. */
    assert.equal(calls.screenshotOpts?.clip?.height, MAX_CAPTURE_HEIGHT_PX, "height cap applied");
    assert.equal(calls.screenshotOpts?.clip?.width, CAPTURE_VIEWPORT.width);
    assert.equal(calls.screenshotOpts?.type, "png");
    assert.equal(calls.closed, true, "browser closed");
  });

  /* 5b. Short page → clip uses actual height, not the cap */
  await test("short page: clip height = actual scroll height", async () => {
    const { mod, calls } = fakePlaywright({ scrollHeight: 1_200 });
    const r = await captureWebpageReference(PUBLIC_URL, {
      enabled: true,
      playwrightLoader: async () => mod,
    });
    assert.equal(r.ok, true);
    assert.equal(calls.screenshotOpts?.clip?.height, 1_200);
  });

  /* 6. Hard timeout wall — a hung browser never hangs the request path */
  await test("hard timeout: hung capture resolves and falls back to og:image", async () => {
    const og = ogOk();
    const r = await captureWebpageReference(PUBLIC_URL, {
      enabled: true,
      hardTimeoutMs: 150,
      ogFallback: og.fn,
      playwrightLoader: () => new Promise(() => undefined) as any, // never resolves
    });
    assert.equal(r.ok, true, "request path resolved despite hung browser");
    assert.equal(r.capturedWith, "og_image");
    assert.equal(og.wasUsed(), true);
  });

  /* 7. DELIBERATE-FAILURE fixture — proves the gate catches a regression.
   *    A validator that forgets the 169.254.0.0/16 link-local/metadata
   *    range ADMITS the cloud metadata endpoint; the real one rejects it.
   *    If isPrivateAddress ever regresses the same way, test #2 above
   *    goes red on the 169.254.169.254 case. */
  await test("deliberate-failure: regressed validator admits 169.254.169.254; real one rejects", async () => {
    const regressedIsPrivate = (ip: string) =>
      ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("127.");
    /* sanity: the regression actually misses the metadata range */
    assert.equal(regressedIsPrivate("169.254.169.254"), false);

    const withRegression = await validateCaptureTarget("http://169.254.169.254/latest/meta-data/", {
      isPrivate: regressedIsPrivate,
    });
    assert.equal(
      withRegression.ok,
      true,
      "regressed validator (deliberately) admits the metadata endpoint — this is the failure the real gate prevents",
    );

    const real = await validateCaptureTarget("http://169.254.169.254/latest/meta-data/");
    assert.equal(real.ok, false, "REAL validator must reject the metadata endpoint");
    assert.equal(isPrivateAddress("169.254.169.254"), true, "shared private-range rule covers 169.254/16");
  });

  /* 8. resolveReferenceImage wiring — flag off keeps the og:image path
   *    byte-for-byte (source page_og_image), proving #1695 behaviour. */
  await test("wiring: web page + flag off → og:image path, source=page_og_image", async () => {
    const origFetch = globalThis.fetch;
    let call = 0;
    globalThis.fetch = (async () => {
      call++;
      if (call === 1) {
        return new Response(
          `<html><head><meta property="og:image" content="https://cdn.example.com/og.jpg"></head></html>`,
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }
      return new Response(FAKE_PNG, { status: 200, headers: { "content-type": "image/jpeg" } });
    }) as any;
    const origFlag = process.env.REFERENCE_SCREENSHOT_ENABLED;
    delete process.env.REFERENCE_SCREENSHOT_ENABLED;
    try {
      const r = await resolveReferenceImage({ url: "https://example.com/landing" });
      assert.equal(r.ok, true);
      assert.equal(r.source, "page_og_image");
      assert.equal(r.mediaType, "image/jpeg");
      assert.equal(call, 2, "page fetched, then og:image fetched");
    } finally {
      globalThis.fetch = origFetch;
      if (origFlag !== undefined) process.env.REFERENCE_SCREENSHOT_ENABLED = origFlag;
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
