/**
 * ContentFlow — REAL rendered-webpage reference capture (Playwright).
 *
 * Upgrade over the og:image proxy in referenceReplication.ts: when a
 * customer hands us a web-page URL as a design reference, the system should
 * SEE the rendered page, not just its social-share thumbnail. This module
 * launches a headless Chromium via Playwright (already a repo dependency —
 * the SEO prerender pipeline in scripts/seo/prerender-routes.mjs drives the
 * same browser at build time), renders the page at 1440×900, and returns a
 * full-page PNG capped at ~3000px tall.
 *
 * DEPLOYMENT NOTE (Replit prod): Chromium must be available in the
 * container — the same provisioning the prerender scripts rely on
 * (`npx playwright install chromium` / playwright's cached browser dir).
 * When the browser is missing, launch fails and we fall back gracefully to
 * the existing og:image path, so the server NEVER hard-depends on a browser
 * being installed. Playwright is imported LAZILY (never top-level) for the
 * same reason. No new dependencies are added.
 *
 * Feature flag: REFERENCE_SCREENSHOT_ENABLED === "true" (inert default —
 * off means the og:image behaviour shipped in #1695 is unchanged).
 *
 * SSRF (CRITICAL): a headless browser is a much sharper SSRF primitive than
 * a plain fetch, so every navigation target is validated BEFORE launch
 * (scheme allow-list, hostname denylist, DNS resolution checked against the
 * shared private-range rule in server/lib/webhookSsrfGuard.ts) and AGAIN
 * after navigation (page.url() post-redirect re-check). SSRF rejections are
 * TERMINAL — they do not fall back to the og:image fetch, because the
 * target itself is hostile.
 */

import { createLogger } from "../../lib/logger";
import { isPrivateAddress } from "../../lib/webhookSsrfGuard";
import type { ReferenceMediaType } from "./referenceReplication";

const logger = createLogger("ContentFlow:RefCapture");

/* ─── Tunables ──────────────────────────────────────────────────────── */

/** Desktop design-review viewport. */
export const CAPTURE_VIEWPORT = { width: 1440, height: 900 } as const;
/** Full-page capture height cap — bounds the PNG payload sent to vision. */
export const MAX_CAPTURE_HEIGHT_PX = 3_000;
/** page.goto navigation budget. */
const GOTO_TIMEOUT_MS = 20_000;
/** Hard wall-clock budget for the WHOLE capture (launch→screenshot). The
 *  request path must never hang on a wedged browser. */
const HARD_TIMEOUT_MS = 30_000;

const UA = "Mozilla/5.0 (compatible; WeFixTradesBot/1.0; +https://wefixtrades.com)";

/* ─── Flag ──────────────────────────────────────────────────────────── */

export function isScreenshotCaptureEnabled(): boolean {
  return process.env.REFERENCE_SCREENSHOT_ENABLED === "true";
}

/* ─── SSRF guard ────────────────────────────────────────────────────── */

/** Hostnames that must never be navigated regardless of DNS. */
const BLOCKED_HOSTNAME = (host: string): boolean =>
  host === "localhost" ||
  host.endsWith(".localhost") ||
  host.endsWith(".local") ||
  host.endsWith(".internal") || // covers metadata.google.internal
  host === "metadata" ||
  host === "instance-data"; // AWS legacy metadata alias

export interface TargetValidation {
  ok: boolean;
  reason?: string;
}

/**
 * Validate a navigation target against SSRF.
 *
 * - http(s) schemes only (file://, gopher://, etc. rejected).
 * - Internal hostname denylist (localhost, *.internal, metadata aliases).
 * - IP-literal hosts checked directly; hostnames DNS-resolved with
 *   { all: true } — ANY private / loopback / link-local / metadata-range
 *   address rejects the whole URL (multi-A-record smuggling).
 *
 * `opts.isPrivate` is injectable ONLY so the test suite can prove a
 * regressed private-range rule turns the suite red (deliberate-failure
 * fixture). Production callers never pass it.
 */
export async function validateCaptureTarget(
  rawUrl: string,
  opts?: { isPrivate?: (ip: string) => boolean },
): Promise<TargetValidation> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "reference url is not a valid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `blocked scheme ${url.protocol} — only http(s) may be captured` };
  }

  /* Strip IPv6 brackets for literal checks. */
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return { ok: false, reason: "reference url has no hostname" };
  if (BLOCKED_HOSTNAME(host)) {
    return { ok: false, reason: `blocked internal hostname "${host}"` };
  }

  const isPrivate = opts?.isPrivate ?? isPrivateAddress;

  const net = await import("node:net");
  if (net.isIP(host)) {
    if (isPrivate(host)) {
      return { ok: false, reason: `blocked private/internal address ${host}` };
    }
    return { ok: true };
  }

  const dns = await import("node:dns");
  let lookups: Array<{ address: string }>;
  try {
    lookups = await dns.promises.lookup(host, { all: true });
  } catch {
    return { ok: false, reason: `hostname "${host}" did not resolve` };
  }
  if (!lookups.length) {
    return { ok: false, reason: `hostname "${host}" resolved to no addresses` };
  }
  const bad = lookups.find((a) => isPrivate(a.address));
  if (bad) {
    return { ok: false, reason: `hostname "${host}" resolves to private/internal address ${bad.address}` };
  }
  return { ok: true };
}

/** Internal marker so SSRF rejections stay TERMINAL (no og fallback). */
class SsrfBlockedError extends Error {}

/* ─── Playwright structural types (lazy import — keep `playwright` out of
 *     the type graph too, so tsc never needs its types here) ──────────── */

interface PageLike {
  route(pattern: string, handler: (route: any) => unknown): Promise<void>;
  goto(url: string, opts: { waitUntil: string; timeout: number }): Promise<unknown>;
  url(): string;
  evaluate(script: string): Promise<unknown>;
  screenshot(opts: {
    type: "png";
    clip: { x: number; y: number; width: number; height: number };
  }): Promise<Buffer | Uint8Array>;
}

interface BrowserLike {
  newPage(opts: {
    viewport: { width: number; height: number };
    userAgent: string;
  }): Promise<PageLike>;
  close(): Promise<void>;
}

export interface PlaywrightModuleLike {
  chromium: {
    launch(opts: { headless: boolean; args?: string[] }): Promise<BrowserLike>;
  };
}

/** Default lazy loader — NEVER hoist this to a top-level import: the server
 *  must boot in containers with no browsers/playwright runtime deps. */
async function loadPlaywright(): Promise<PlaywrightModuleLike> {
  const mod = await import("playwright");
  return mod as unknown as PlaywrightModuleLike;
}

/* ─── Capture ───────────────────────────────────────────────────────── */

export interface OgFallbackResult {
  ok: boolean;
  buffer?: Buffer;
  mediaType?: ReferenceMediaType;
  reason?: string;
}

export interface CaptureWebpageOpts {
  /**
   * Fallback supplier — the EXISTING og:image path (referenceReplication
   * passes a closure over the page HTML it already fetched, so the logic
   * is not duplicated here). Invoked when the flag is off or the
   * playwright path fails for any non-SSRF reason.
   */
  ogFallback?: () => Promise<OgFallbackResult>;
  /** Test seams. Production callers leave all of these unset. */
  enabled?: boolean;
  playwrightLoader?: () => Promise<PlaywrightModuleLike>;
  isPrivate?: (ip: string) => boolean;
  hardTimeoutMs?: number;
  gotoTimeoutMs?: number;
}

export interface CapturedReference {
  ok: boolean;
  imageBuffer?: Buffer;
  mediaType?: ReferenceMediaType;
  capturedWith?: "playwright" | "og_image";
  reason?: string;
}

/**
 * Capture a webpage reference as a REAL rendered screenshot, falling back
 * to the existing og:image path. NEVER throws; NEVER hangs (30s hard wall).
 *
 * Resolution order:
 *   1. SSRF-validate the URL. Blocked → TERMINAL failure (no fallback).
 *   2. Flag on → playwright: launch headless Chromium, 1440×900, block
 *      media resources, goto networkidle (20s), re-validate page.url()
 *      post-redirect, full-page PNG clipped to ≤3000px tall.
 *   3. Flag off / launch failed / capture failed → ogFallback (the
 *      og:image logic the caller already owns).
 */
export async function captureWebpageReference(
  url: string,
  opts: CaptureWebpageOpts = {},
): Promise<CapturedReference> {
  /* 1. SSRF gate — applies to BOTH paths (a hostile URL gets nothing). */
  const target = await validateCaptureTarget(url, { isPrivate: opts.isPrivate });
  if (!target.ok) {
    logger.warn(`capture blocked (ssrf): ${target.reason}`);
    return { ok: false, reason: target.reason };
  }

  const enabled = opts.enabled ?? isScreenshotCaptureEnabled();
  let playwrightFailure: string | undefined;

  if (enabled) {
    const res = await captureViaPlaywright(url, opts);
    if (res.ok) return res;
    if (res.ssrfBlocked) {
      /* Post-redirect landed somewhere internal — terminal, no fallback. */
      logger.warn(`capture blocked post-redirect (ssrf): ${res.reason}`);
      return { ok: false, reason: res.reason };
    }
    playwrightFailure = res.reason;
    logger.warn(`playwright capture failed — falling back to og:image: ${res.reason}`);
  }

  /* 3. Graceful fallback to the existing og:image path. */
  if (opts.ogFallback) {
    const og = await opts.ogFallback();
    if (og.ok && og.buffer) {
      return {
        ok: true,
        imageBuffer: og.buffer,
        mediaType: og.mediaType ?? "image/png",
        capturedWith: "og_image",
      };
    }
    return {
      ok: false,
      reason: og.reason ?? playwrightFailure ?? "reference capture failed",
    };
  }
  return {
    ok: false,
    reason:
      playwrightFailure ??
      "screenshot capture disabled (REFERENCE_SCREENSHOT_ENABLED) and no og:image fallback supplied",
  };
}

async function captureViaPlaywright(
  url: string,
  opts: CaptureWebpageOpts,
): Promise<CapturedReference & { ssrfBlocked?: boolean }> {
  const hardMs = opts.hardTimeoutMs ?? HARD_TIMEOUT_MS;
  const gotoMs = opts.gotoTimeoutMs ?? GOTO_TIMEOUT_MS;
  let browser: BrowserLike | null = null;

  const work = (async (): Promise<CapturedReference> => {
    const loader = opts.playwrightLoader ?? loadPlaywright;
    const { chromium } = await loader();
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-dev-shm-usage"],
    });
    const page = await browser.newPage({
      viewport: { ...CAPTURE_VIEWPORT },
      userAgent: UA,
    });
    /* Skip obviously-irrelevant heavy resources (video/audio autoplay). */
    await page.route("**/*", (route: any) => {
      try {
        if (route.request().resourceType() === "media") return route.abort();
      } catch {
        /* route introspection failed — let it through */
      }
      return route.continue();
    });
    await page.goto(url, { waitUntil: "networkidle", timeout: gotoMs });

    /* Post-redirect SSRF re-check — the page may have 30x'd internally. */
    const finalUrl = page.url();
    const recheck = await validateCaptureTarget(finalUrl, { isPrivate: opts.isPrivate });
    if (!recheck.ok) {
      throw new SsrfBlockedError(`post-redirect target blocked: ${recheck.reason} (${finalUrl})`);
    }

    /* Full-page height, capped so the vision payload stays bounded. */
    const rawHeight = Number(await page.evaluate("document.documentElement.scrollHeight"));
    const fullHeight = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : CAPTURE_VIEWPORT.height;
    const height = Math.min(fullHeight, MAX_CAPTURE_HEIGHT_PX);

    const shot = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: CAPTURE_VIEWPORT.width, height },
    });
    return {
      ok: true,
      imageBuffer: Buffer.isBuffer(shot) ? shot : Buffer.from(shot),
      mediaType: "image/png",
      capturedWith: "playwright",
    };
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const wall = new Promise<CapturedReference>((resolve) => {
    timer = setTimeout(
      () => resolve({ ok: false, reason: `screenshot capture exceeded ${hardMs}ms hard timeout` }),
      hardMs,
    );
  });

  try {
    return await Promise.race([
      work.catch((err: any) =>
        err instanceof SsrfBlockedError
          ? { ok: false, reason: err.message, ssrfBlocked: true as const }
          : { ok: false, reason: `playwright capture failed: ${err?.message || err}` },
      ),
      wall,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (browser) {
      /* Close even on timeout so a wedged page can't leak a Chromium. */
      (browser as BrowserLike)
        .close()
        .catch((err: any) => logger.warn(`browser close failed: ${err?.message || err}`));
    }
  }
}
