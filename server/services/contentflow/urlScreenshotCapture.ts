/**
 * ContentFlow — LIVE web-page screenshot capture for reference replication.
 *
 * referenceReplication.ts resolves a customer reference (upload | image URL |
 * web-page URL) into image bytes a vision model then describes. For a WEB-PAGE
 * URL it currently extracts only the og:image — weak, because og:image misses
 * the real rendered layout / color / type / composition of the page.
 *
 * This module renders the page with headless Chromium (Playwright — already a
 * repo dependency, used in tests/e2e + the SEO prerender) and returns two
 * screenshots:
 *   (a) a full-page screenshot (height-clamped to avoid giant captures), and
 *   (b) an above-the-fold hero region (viewport-only 1440×900).
 * Either is a far stronger replication reference than og:image.
 *
 * SAFETY: this fetches arbitrary user-supplied URLs server-side, so an SSRF
 * guard (isSafePublicUrl) rejects non-http(s) schemes and localhost / private
 * / link-local IP targets BEFORE a browser ever navigates.
 *
 * INERT BY DEFAULT: gated behind CONTENTFLOW_URL_SCREENSHOT_ENABLED. When the
 * flag is off (default), the caller keeps using the existing og:image path
 * EXACTLY — this module is never invoked. Matches the repo's flag-off
 * convention for new heavy capabilities.
 *
 * RESOURCE HYGIENE: browser launches are heavy, so a module-level single-flight
 * serialises captures (one browser at a time per process). page/context/browser
 * are always closed in finally; a total-function timeout budget bounds the work.
 *
 * COST/PERF: screenshotting itself costs nothing (no external API). The
 * downstream vision-describe call on a FULL-PAGE image may consume more tokens
 * than a small og:image (larger image → more vision tokens). No new gate is
 * added here — reference replication is already tier-gated upstream — but the
 * caller prefers the hero (viewport-only) image for description to keep the
 * token cost modest, and only falls back to the full-page image if needed.
 *
 * NEVER throws: every failure path returns { ok:false, reason } so the caller
 * falls back to og:image. Failures are logged (no-silent-catch guard).
 */

import { createLogger } from "../../lib/logger";
import { isIP } from "node:net";

const logger = createLogger("ContentFlow:UrlScreenshot");

/* ─── Flag (inert by default) ──────────────────────────────────────── */

/** Env flag name — capture is OFF unless this is truthy. */
export const URL_SCREENSHOT_FLAG = "CONTENTFLOW_URL_SCREENSHOT_ENABLED";

/** True only when CONTENTFLOW_URL_SCREENSHOT_ENABLED is set to a truthy value. */
export function isUrlScreenshotEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env[URL_SCREENSHOT_FLAG] || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/* ─── Tunables ─────────────────────────────────────────────────────── */

const VIEWPORT_W = 1440;
const VIEWPORT_H = 900;
/** Clamp full-page capture height so a pathologically tall page can't produce
 *  a giant screenshot (memory + vision-token blow-up). */
const MAX_FULLPAGE_HEIGHT = 4000;
/** Per-navigation timeout. */
const NAV_TIMEOUT_MS = 20_000;
/** Short settle after load so late-painting heroes/fonts land. */
const SETTLE_MS = 600;
/** Total budget for the whole capture (launch + nav + 2 screenshots). A hard
 *  ceiling so a wedged browser can't hang the request indefinitely. */
const TOTAL_BUDGET_MS = 35_000;

/* ─── SSRF guard (one tested function) ─────────────────────────────── */

export interface UrlSafetyResult {
  ok: boolean;
  reason?: string;
}

/**
 * Decide whether a URL is safe to fetch/navigate server-side.
 *
 * Rejects:
 *   - non-http(s) schemes (file:, data:, gopher:, ftp:, etc.)
 *   - empty / unparseable URLs
 *   - localhost and *.localhost
 *   - literal IPs in private / loopback / link-local / unique-local ranges:
 *       IPv4: 127/8, 10/8, 172.16-31/12, 192.168/16, 169.254/16, 0/8
 *       IPv6: ::1 (loopback), fc00::/7 (unique-local), fe80::/10 (link-local),
 *             and IPv4-mapped (::ffff:a.b.c.d) re-checked as IPv4
 *
 * NOTE: a hostname that RESOLVES to a private IP via DNS is NOT caught here
 * (we deliberately do not resolve DNS — that would add latency + a DNS-rebind
 * race). For this feature the literal-IP + localhost block is the documented
 * mitigation; the captured page is only ever screenshotted (no response body is
 * returned to the user), which bounds the blast radius. If full DNS-resolution
 * SSRF hardening is later required, resolve the host and re-run isPrivateIp on
 * every resolved address before navigating.
 */
export function isSafePublicUrl(rawUrl: string): UrlSafetyResult {
  const input = (rawUrl || "").trim();
  if (!input) return { ok: false, reason: "url is empty" };

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return { ok: false, reason: "url is not a valid URL" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: `scheme ${parsed.protocol} not allowed (http/https only)` };
  }

  // Hostname may be bracketed for IPv6: [::1] → ::1
  let host = parsed.hostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);

  if (!host) return { ok: false, reason: "url has no host" };
  if (host === "localhost" || host.endsWith(".localhost")) {
    return { ok: false, reason: "localhost is not allowed" };
  }

  const ipKind = isIP(host); // 0 = not an IP, 4 = IPv4, 6 = IPv6
  if (ipKind !== 0 && isPrivateIp(host, ipKind)) {
    return { ok: false, reason: `private/loopback/link-local IP not allowed: ${host}` };
  }

  return { ok: true };
}

/** True if a LITERAL IP string is in a private/loopback/link-local range. */
export function isPrivateIp(host: string, kind: number): boolean {
  if (kind === 4) return isPrivateIpv4(host);
  if (kind === 6) return isPrivateIpv6(host);
  return false;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    // Not a clean dotted-quad — treat as unsafe (don't navigate to something odd).
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 127) return true; // loopback
  if (a === 10) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 169 && b === 254) return true; // link-local
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a >= 224) return true; // multicast / reserved (224+)
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  // IPv4-mapped, dotted-decimal form (::ffff:a.b.c.d) — re-check embedded IPv4.
  const mappedDotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(lower);
  if (mappedDotted) return isPrivateIpv4(mappedDotted[1]);
  // IPv4-mapped, HEX form (::ffff:7f00:1) — Node's URL parser normalises
  // ::ffff:127.0.0.1 to this. Decode the two hex groups back to a dotted quad
  // and re-check. (Also tolerate ::ffff:0:7f00:1 / leading zeros.)
  const mappedHex = /^::ffff:(?:0:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(lower);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    const dotted = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return isPrivateIpv4(dotted);
  }
  // Unique-local fc00::/7  → first byte 0xfc or 0xfd → prefix "fc"/"fd".
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  // Link-local fe80::/10 → fe8/fe9/fea/feb.
  if (/^fe[89ab]/.test(lower)) return true;
  return false;
}

/* ─── Capture ──────────────────────────────────────────────────────── */

export interface CapturedImage {
  buffer: Buffer;
  width: number;
  height: number;
}

export type CaptureSuccess = {
  ok: true;
  /** Above-the-fold viewport-only screenshot (1440×900). Preferred for
   *  vision-describe (smaller → fewer tokens). */
  hero: CapturedImage;
  /** Full-page screenshot, height-clamped. Richer layout signal. */
  fullPage: CapturedImage;
  /** PNG, matching Playwright's default screenshot encoding. */
  mediaType: "image/png";
};

export type CaptureFailure = { ok: false; reason: string };
export type CaptureResult = CaptureSuccess | CaptureFailure;

/**
 * Minimal structural duck-types of the slice of the Playwright API we use, so
 * the launcher can be dependency-injected in unit tests WITHOUT importing the
 * real `playwright` package (CI may lack the browser binary).
 */
export interface FakePage {
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  goto(url: string, opts: { timeout: number; waitUntil: string }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate<T>(fn: () => T): Promise<T>;
  screenshot(opts: { fullPage?: boolean; clip?: { x: number; y: number; width: number; height: number } }): Promise<Buffer>;
  close(): Promise<void>;
}
export interface FakeContext {
  newPage(): Promise<FakePage>;
  close(): Promise<void>;
}
export interface FakeBrowser {
  newContext(opts?: unknown): Promise<FakeContext>;
  close(): Promise<void>;
}
export interface BrowserLauncher {
  launch(opts: { headless: boolean }): Promise<FakeBrowser>;
}

export interface CaptureOpts {
  /** Injectable launcher for tests. Defaults to the real Playwright chromium. */
  launcher?: BrowserLauncher;
  /** Override env for flag/testing. */
  env?: NodeJS.ProcessEnv;
}

/* Module-level single-flight: browser launches are heavy, so serialise
 * captures to one at a time per process. A new capture awaits the previous
 * one's settle (success OR failure) before launching its own browser. */
let inFlight: Promise<void> = Promise.resolve();

function withSingleFlight<T>(fn: () => Promise<T>): Promise<T> {
  const run = inFlight.then(fn, fn);
  // Keep the chain alive but swallow the result/error for the NEXT waiter's gate.
  inFlight = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Race a promise against a total-budget timeout. Rejects with a clear reason
 *  if the budget is exceeded (caller maps it to ok:false). */
function withBudget<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} exceeded ${ms}ms budget`));
    }, ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Capture a live web page for reference replication.
 *
 * Returns { ok:false, reason } on ANY problem (unsafe URL, launch failure,
 * navigation timeout, screenshot error, budget exceeded) so the caller falls
 * back to the og:image path. NEVER throws.
 */
export async function captureUrlForReplication(
  url: string,
  opts: CaptureOpts = {},
): Promise<CaptureResult> {
  const env = opts.env ?? process.env;

  if (!isUrlScreenshotEnabled(env)) {
    return { ok: false, reason: "url screenshot capture disabled (flag off)" };
  }

  const safety = isSafePublicUrl(url);
  if (!safety.ok) {
    logger.warn(`url screenshot blocked by SSRF guard: ${safety.reason}`, { url });
    return { ok: false, reason: `unsafe url: ${safety.reason}` };
  }

  return withSingleFlight(() =>
    withBudget(doCapture(url, opts), TOTAL_BUDGET_MS, "url screenshot capture").catch(
      (err: any) => {
        const reason = err?.message || String(err);
        logger.warn(`url screenshot capture failed: ${reason}`, { url });
        return { ok: false, reason } as CaptureFailure;
      },
    ),
  );
}

/** Resolve the real Playwright chromium launcher lazily — imported only when
 *  the flag is on and a capture is actually attempted, so unit tests (which
 *  inject a fake launcher) never pull the playwright module graph. */
async function resolveLauncher(opts: CaptureOpts): Promise<BrowserLauncher> {
  if (opts.launcher) return opts.launcher;
  // Matches the repo's existing launch pattern (scripts/seo/prerender-routes.mjs,
  // scripts/capture-template-screenshots.mjs): chromium.launch({ headless: true }),
  // no extra args needed in the Replit Nix container.
  const { chromium } = await import("playwright");
  return chromium as unknown as BrowserLauncher;
}

async function doCapture(url: string, opts: CaptureOpts): Promise<CaptureResult> {
  const launcher = await resolveLauncher(opts);

  let browser: FakeBrowser | null = null;
  let context: FakeContext | null = null;
  let page: FakePage | null = null;

  try {
    browser = await launcher.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: VIEWPORT_W, height: VIEWPORT_H },
      deviceScaleFactor: 1,
      userAgent:
        "Mozilla/5.0 (compatible; WeFixTradesBot/1.0; +https://wefixtrades.com) Chrome/120 Safari/537.36",
    });
    page = await context.newPage();
    await page.setViewportSize({ width: VIEWPORT_W, height: VIEWPORT_H });

    await page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: "domcontentloaded" });
    // Short settle so late-painting heroes / web-fonts land before we snap.
    await page.waitForTimeout(SETTLE_MS);

    // Measure the real rendered document height in-page, then clamp it. The
    // evaluate body runs INSIDE the browser (Playwright serialises it), so it
    // may only reference browser globals (document/window) — never Node-side
    // constants.
    const docHeight = await page
      .evaluate(() => {
        const b = document.body;
        const e = document.documentElement;
        return Math.max(
          b ? b.scrollHeight : 0,
          b ? b.offsetHeight : 0,
          e ? e.scrollHeight : 0,
          e ? e.offsetHeight : 0,
          typeof window !== "undefined" ? window.innerHeight : 0,
        );
      })
      .catch((e: any) => {
        logger.warn(`doc-height evaluate failed, using viewport height: ${e?.message || e}`);
        return VIEWPORT_H;
      });

    const clampedHeight = Math.min(
      typeof docHeight === "number" && docHeight > 0 ? docHeight : VIEWPORT_H,
      MAX_FULLPAGE_HEIGHT,
    );

    // (a) Full-page screenshot — clamped via an explicit clip so an enormous
    //     page never produces a giant capture. Playwright's fullPage:true would
    //     capture the WHOLE document; we instead clip to the clamped height.
    const fullPageBuf = await page.screenshot({
      clip: { x: 0, y: 0, width: VIEWPORT_W, height: clampedHeight },
    });

    // (b) Above-the-fold hero — viewport-only.
    const heroBuf = await page.screenshot({
      clip: { x: 0, y: 0, width: VIEWPORT_W, height: VIEWPORT_H },
    });

    if (!fullPageBuf?.length || !heroBuf?.length) {
      return { ok: false, reason: "screenshot produced empty buffer" };
    }

    return {
      ok: true,
      mediaType: "image/png",
      hero: { buffer: heroBuf, width: VIEWPORT_W, height: VIEWPORT_H },
      fullPage: { buffer: fullPageBuf, width: VIEWPORT_W, height: clampedHeight },
    };
  } catch (err: any) {
    const reason = err?.message || String(err);
    logger.warn(`url capture error during render: ${reason}`, { url });
    return { ok: false, reason };
  } finally {
    // Always release resources, innermost-first. Each close is guarded so one
    // failing close still lets the others run (and is logged, not swallowed).
    if (page) {
      try {
        await page.close();
      } catch (e: any) {
        logger.warn(`page.close failed: ${e?.message || e}`);
      }
    }
    if (context) {
      try {
        await context.close();
      } catch (e: any) {
        logger.warn(`context.close failed: ${e?.message || e}`);
      }
    }
    if (browser) {
      try {
        await browser.close();
      } catch (e: any) {
        logger.warn(`browser.close failed: ${e?.message || e}`);
      }
    }
  }
}
