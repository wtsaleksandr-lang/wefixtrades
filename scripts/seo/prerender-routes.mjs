#!/usr/bin/env node
/**
 * SEO Wave E — Per-route prerender.
 *
 * Problem: the Vite-React SPA serves the same `dist/public/index.html`
 * shell for every URL. Per-route `<title>`, `<meta description>`,
 * `<link rel="canonical">`, and JSON-LD are injected client-side by
 * `<PageMeta>`. Googlebot evaluates JS so it sees them — but Bing's
 * primary index plus the LLM crawlers (ChatGPT, Claude, Perplexity)
 * do NOT execute JS, so every URL looks like a duplicate of `/`.
 *
 * Fix: at build time, after Vite has emitted `dist/public/`, spin up
 * a tiny static server, drive a headless Chromium (via Playwright,
 * already in devDeps) across the route list, wait for PageMeta to
 * hydrate, then snapshot the rendered `<head>` (title, meta, link
 * canonical, og:*, twitter:*, ld+json scripts) and splice those head
 * tags back into a copy of the original SPA shell. The body stays
 * the un-hydrated React mount-point so client-side hydration still
 * runs as normal — once the SPA boots, React Router takes over and
 * subsequent navigations are unchanged.
 *
 * Output: `dist/public/<route>/index.html` per prerendered route.
 * The original `dist/public/index.html` is left untouched (still the
 * fallback shell for any URL not in the prerender list).
 *
 * Skip with `SKIP_PRERENDER=1` for quick dev builds.
 */
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

/**
 * Wave 90 — critical-route allowlist.
 *
 * Routes whose prerender failure must be treated as a HARD BUILD ERROR.
 * Historically the build step swallowed prerender exit-codes
 * ("non-fatal — skipping") which shipped an unhydrated
 * /sms-consent-disclosure to production and blocked the A2P 10DLC
 * campaign vetting. These routes are scraped by external bots that do
 * NOT execute JavaScript, so an unhydrated shell is silently fatal.
 *
 * Keep this list short and intentional. Adding a route here promotes
 * any prerender hiccup on it from "warn" to "abort the deploy".
 */
const CRITICAL_ROUTES = [
  "/sms-consent-disclosure",
  "/privacy",
  "/terms",
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DIST_DIR = path.join(REPO_ROOT, "dist", "public");
const SHELL_PATH = path.join(DIST_DIR, "index.html");

// Wave 99 — SKIP_PRERENDER is IGNORED on production builds.
// See script/build.ts isPrerenderSkipped() for the diagnostic. Without
// this gate, a stray SKIP_PRERENDER=1 in the Replit deploy env ships
// dist/public/ with zero route HTML files, which sends the TCR vetting
// bot, Bing, and the LLM crawlers an empty SPA shell.
if (process.env.SKIP_PRERENDER === "1") {
  const isProdBuild =
    process.env.NODE_ENV === "production" ||
    process.env.REPLIT_DEPLOYMENT === "1" ||
    !!process.env.REPL_DEPLOYMENT_ID ||
    !!process.env.REPLIT_DEPLOYMENT_ID;
  if (isProdBuild) {
    console.log(
      `[prerender] SKIP_PRERENDER=1 IGNORED — production builds must prerender. ` +
        `Detected: NODE_ENV=${process.env.NODE_ENV ?? "<unset>"}, ` +
        `REPLIT_DEPLOYMENT=${process.env.REPLIT_DEPLOYMENT ?? "<unset>"}, ` +
        `REPL_DEPLOYMENT_ID=${process.env.REPL_DEPLOYMENT_ID ? "<set>" : "<unset>"}.`,
    );
  } else {
    console.log("[prerender] SKIP_PRERENDER=1 — skipping per-route prerender.");
    process.exit(0);
  }
}

if (!existsSync(SHELL_PATH)) {
  console.error(`[prerender] FATAL: ${SHELL_PATH} not found. Run \`vite build\` first.`);
  process.exit(1);
}

/**
 * Static curated route list. Mirrors `server/routes/sitemapRoutes.ts`
 * (static portion). Kept in sync manually — the sitemap source still
 * imports `PRODUCT_PAGES` for the dynamic product pages, which we
 * pull in below.
 */
const STATIC_ROUTES = [
  "/",
  "/products",
  "/pricing",
  "/pricing/quotequick",
  "/services",
  "/templates",
  "/demo",
  "/demos",
  "/docs",
  "/docs/embed",
  "/docs/domain",
  "/docs/booking",
  "/docs/ai",
  "/docs/mapguard",
  "/docs/reputationshield",
  "/docs/webhooks",
  "/docs/troubleshooting",
  "/docs/api",
  "/features/instant-quotes",
  "/features/booking",
  "/features/ai-employee",
  "/features/sms",
  "/features/calculator-engine",
  "/solutions/visibility",
  // SEO — 12 trade-specific solution landings. Each has a unique <PageMeta>
  // (title, description, canonical) defined in client/src/pages/solutions/SolutionPage.tsx.
  // Listed here so Bing + LLM crawlers (no JS execution) get the
  // hydrated head tags instead of the SPA shell.
  "/solutions/for-plumbers",
  "/solutions/for-hvac",
  "/solutions/for-electricians",
  "/solutions/for-roofers",
  "/solutions/for-cleaners",
  "/solutions/for-landscapers",
  "/solutions/for-pest-control",
  "/solutions/for-garage-door",
  "/solutions/for-locksmiths",
  "/solutions/for-painters",
  "/solutions/for-remodelers",
  "/solutions/for-general-contractors",
  "/tools/free-audit",
  // Free Tools Wave 1 — 4 standalone Brightlocal-style tool pages. Each
  // is a public lead magnet with unique <PageMeta>, FAQ + (where relevant)
  // HowTo JSON-LD. Hydrated head needed for non-JS crawlers (Bing, LLMs).
  "/tools/google-review-link-generator",
  "/tools/local-search-checker",
  "/tools/citation-checker",
  "/tools/local-rankflux",
  // Wave 2 — Local Rank Grid (free) + Citation Builder (paid service).
  // Both need hydrated head tags for non-JS crawlers (Bing, LLMs).
  "/tools/local-rank-grid",
  "/citation-builder",
  // ContentFlow Phase 1 — 5 public prompt-library SEO landings.
  // Bing + LLM crawlers (no JS exec) need hydrated head tags here.
  "/tools/plumbing-ai-content-prompts",
  "/tools/hvac-ai-content-prompts",
  "/tools/electrical-ai-content-prompts",
  "/tools/roofing-ai-content-prompts",
  "/tools/landscaping-ai-content-prompts",
  // ContentFlow standalone marketing landing — broad-audience SEO entry.
  "/contentflow",
  "/products/quickquotepro/demo",
  "/products/quickquotepro/build-with-ai",
  "/about",
  "/blog",
  "/case-studies",
  // Audience landing pages (Brightlocal-style) — Bing + LLM crawlers need
  // hydrated head tags here.
  "/for-agencies",
  "/for-franchises",
  "/for-solo-traders",
  // Competitor comparison pages — long-form FAQPage + Article JSON-LD needs
  // to be hydrated for crawlers that don't execute JS.
  "/wefixtrades-vs-jobber",
  "/wefixtrades-vs-housecall-pro",
  "/wefixtrades-vs-servicetitan",
  // Human-friendly HTML sitemap.
  "/sitemap",
  "/resources",
  "/contact",
  "/privacy",
  "/terms",
  "/sms-consent-disclosure",
];

async function loadProductSlugs() {
  // Dynamically import the typed product config from the client.
  // `tsx` is in devDeps so a .ts import works only via tsx loader,
  // but at this build stage we only need the slugs — quickest path is
  // to read & regex the TS file. Robust enough for our use; tested
  // by counting against the sitemap.
  const productsPath = path.join(REPO_ROOT, "client", "src", "config", "products.ts");
  const src = await readFile(productsPath, "utf-8");
  const slugs = [];
  const re = /slug:\s*"([a-z0-9-]+)"/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (!slugs.includes(m[1])) slugs.push(m[1]);
  }
  return slugs;
}

/**
 * Tiny static file server. Serves dist/public; falls back to
 * dist/public/index.html for unknown paths so the SPA router can
 * handle the route after hydration.
 */
function startStaticServer(rootDir, port) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        if (urlPath.endsWith("/")) urlPath += "index.html";
        let filePath = path.join(rootDir, urlPath);
        // path-traversal guard
        if (!filePath.startsWith(rootDir)) {
          res.statusCode = 403;
          res.end("forbidden");
          return;
        }
        if (!existsSync(filePath)) {
          // SPA fallback
          filePath = path.join(rootDir, "index.html");
        }
        const ext = path.extname(filePath).toLowerCase();
        const mime = {
          ".html": "text/html; charset=utf-8",
          ".js": "application/javascript; charset=utf-8",
          ".mjs": "application/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".json": "application/json; charset=utf-8",
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".webp": "image/webp",
          ".woff": "font/woff",
          ".woff2": "font/woff2",
          ".ico": "image/x-icon",
        }[ext] || "application/octet-stream";
        const buf = await readFile(filePath);
        res.setHeader("Content-Type", mime);
        res.end(buf);
      } catch (err) {
        res.statusCode = 500;
        res.end(String(err?.message || err));
      }
    });
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

/**
 * Splice the rendered head tags into a fresh copy of the shell.
 *
 * Strategy: pull the captured rendered tags (title, all <meta>, all
 * <link rel="canonical">, all <script type="application/ld+json">)
 * out of the live DOM. Strip the SAME tag categories from the
 * shell, then inject the rendered set before `</head>`. Body stays
 * as the original shell's empty React mount-point so hydration
 * happens as normal.
 *
 * Wave 88 — body-noscript splice. Some routes (notably
 * `/sms-consent-disclosure`, scraped by the Twilio / TCR A2P 10DLC
 * vetting bot, which does NOT execute JavaScript) need critical content
 * visible to no-JS crawlers. The page renders the fallback inside a
 * `<noscript>` block in its React tree; here we lift that block out of
 * the captured DOM and inline it inside the shell's `<div id="root">`.
 * Hydration is unaffected — React 18 happily mounts over arbitrary
 * SSR-emitted children of the root.
 */
function spliceHead(shellHtml, rendered, noscriptBody) {
  let out = shellHtml;
  // Remove existing <title>, all <meta>, <link rel="canonical">, and
  // existing JSON-LD scripts. We keep <link rel="icon">, <link
  // rel="preconnect">, <link rel="preload">, <link rel="stylesheet">,
  // and module scripts — those carry the asset graph for hydration.
  out = out.replace(/<title>[^<]*<\/title>/gi, "");
  out = out.replace(/<meta\b[^>]*>\s*/gi, "");
  out = out.replace(/<link\b[^>]*rel=["']canonical["'][^>]*>\s*/gi, "");
  out = out.replace(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\s*/gi,
    "",
  );

  // Re-add the universal charset + viewport + theme-color first
  // (these came off the shell during the meta-strip above).
  const baseline = [
    `<meta charset="UTF-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1.0" />`,
    `<meta name="theme-color" content="#0B0F14" />`,
  ].join("\n    ");

  const injected = `${baseline}\n    ${rendered.join("\n    ")}`;
  out = out.replace("</head>", `    ${injected}\n  </head>`);

  // Wave 88 — inline any captured noscript-fallback body content inside
  // the React mount, wrapped in a real `<noscript>` tag so it only
  // renders for no-JS clients (the TCR A2P vetting bot etc.). Hydrated
  // browsers ignore <noscript> entirely. Only routes that actually emit
  // a `data-noscript-fallback` element (currently just
  // /sms-consent-disclosure) get this; other routes pass through with
  // an unchanged shell body.
  if (noscriptBody && noscriptBody.trim().length > 0) {
    out = out.replace(
      '<div id="root"></div>',
      `<div id="root"><noscript>${noscriptBody}</noscript></div>`,
    );
  }
  return out;
}

async function snapshotRoute(page, baseUrl, route) {
  const url = `${baseUrl}${route}`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  // PageMeta runs inside useEffect on mount. Give the route a brief
  // window after networkidle for the meta upsert to settle. Crawlers
  // need the final values, not the shell defaults.
  await page.waitForFunction(
    () => {
      const t = document.title || "";
      // PageMeta sets `${title} · WeFixTrades` — wait for that suffix
      // or for a canonical link distinct from the page URL (covers
      // routes where PageMeta hasn't mounted yet).
      const canonical = document.querySelector('link[rel="canonical"]');
      return t.includes("·") || !!canonical;
    },
    { timeout: 8_000 },
  ).catch(() => {
    // Don't hard-fail if a route doesn't render PageMeta — we'll
    // capture whatever head it has and the shell defaults remain.
  });

  const captured = await page.evaluate(() => {
    const tags = [];
    const title = document.querySelector("title");
    if (title) tags.push(title.outerHTML);
    document.querySelectorAll("meta").forEach((el) => {
      // Skip charset/viewport/theme-color — those are re-added by the
      // splicer from a fixed baseline. Everything else (description,
      // robots, keywords, og:*, twitter:*) flows through.
      const name = (el.getAttribute("name") || "").toLowerCase();
      const prop = (el.getAttribute("property") || "").toLowerCase();
      const charset = el.getAttribute("charset");
      if (charset) return;
      if (name === "viewport" || name === "theme-color") return;
      tags.push(el.outerHTML);
    });
    document.querySelectorAll('link[rel="canonical"]').forEach((el) => {
      tags.push(el.outerHTML);
    });
    document
      .querySelectorAll('script[type="application/ld+json"]')
      .forEach((el) => {
        // Clone so the textContent serializes cleanly.
        tags.push(el.outerHTML);
      });

    // Wave 88 — also capture body content marked with
    // `data-noscript-fallback`. Components that need crawler-visible
    // content (e.g. the SMS consent disclosure, fetched by the Twilio /
    // TCR A2P 10DLC vetting bot which does not execute JS) render a
    // hidden `<div data-noscript-fallback="...">` with the disclosure
    // copy. We serialize that div's innerHTML; the splicer wraps it in
    // a real `<noscript>` tag and inlines it into the shell's
    // `<div id="root">`. Most routes emit no such element and this
    // returns an empty string.
    //
    // Why not a literal <noscript> in the React tree? In a JS-enabled
    // browser, <noscript> contents are parsed as raw text/CDATA and are
    // not addressable as DOM children, so querySelector cannot extract
    // them during capture. A plain hidden div is fully addressable.
    const fallbacks = document.querySelectorAll("[data-noscript-fallback]");
    const noscriptBody = Array.from(fallbacks)
      .map((el) => el.innerHTML)
      .join("\n");

    return { tags, noscriptBody };
  });

  return captured;
}

async function writeRouteHtml(route, html) {
  // "/" → dist/public/index.html (overwrite shell? no — we keep the
  // original shell for arbitrary-URL fallback). For "/" we write
  // dist/public/index.html directly since that IS the home route.
  const rel = route === "/" ? "index.html" : path.join(route.replace(/^\//, ""), "index.html");
  const outPath = path.join(DIST_DIR, rel);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, html, "utf-8");
}

/**
 * Wave 90 — static-template fallback writer.
 *
 * Maps routes to a hand-written HTML template that mirrors the React
 * page content. Used when the Playwright path can't render a critical
 * route (Chromium fails to launch, route throws, etc.). Keeps the
 * A2P 10DLC consent vetting unblocked even if Playwright is broken.
 *
 * Returns true if a template was found AND successfully written.
 */
// Wave 95 — fallback mapping for all critical routes whose Playwright
// prerender may fail when headless Chromium can't launch. The Wave 90
// fallback only covered /sms-consent-disclosure; /privacy and /terms are
// also in CRITICAL_ROUTES and are TCR-relevant (the A2P 10DLC vetting bot
// may inspect them to verify business legitimacy), so they need static
// fallbacks too.
const CRITICAL_TEMPLATE_FALLBACKS = {
  "/sms-consent-disclosure": "consent-disclosure-template.html",
  "/privacy": "privacy-template.html",
  "/terms": "terms-template.html",
};

async function tryWriteTemplateFallback(route) {
  const filename = CRITICAL_TEMPLATE_FALLBACKS[route];
  if (!filename) return false;
  const templatePath = path.join(__dirname, filename);
  if (!existsSync(templatePath)) return false;
  try {
    const html = await readFile(templatePath, "utf-8");
    await writeRouteHtml(route, html);
    console.log(
      `[prerender] ${route}: wrote static-template fallback (${html.length} bytes)`,
    );
    return true;
  } catch (err) {
    console.warn(
      `[prerender] ${route}: template fallback failed: ${err?.message || err}`,
    );
    return false;
  }
}

async function main() {
  const t0 = Date.now();
  // Wave 88 — port is overridable to avoid EADDRINUSE collisions with a
  // long-running `vite preview` or an orphan prerender server in dev.
  const port = Number(process.env.PRERENDER_PORT) || 4173;
  console.log(`[prerender] booting static server on 127.0.0.1:${port}...`);
  const server = await startStaticServer(DIST_DIR, port);
  const baseUrl = `http://127.0.0.1:${port}`;

  // Tracks routes that succeeded by ANY means (Playwright or template
  // fallback). Used at exit to verify every CRITICAL_ROUTES entry is
  // present — if not, the build aborts.
  const succeeded = new Set();

  // Wave 90 — try the Playwright path first. If Chromium itself fails
  // to launch (e.g. missing Nix system libs), we DON'T abort — we fall
  // through to the static-template fallback for whichever critical
  // routes have one, then enforce the critical-route gate at the end.
  let browser = null;
  let ctx = null;
  let page = null;
  try {
    console.log("[prerender] launching Chromium...");
    browser = await chromium.launch();
    ctx = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (compatible; WFXPrerender/1.0; +https://wefixtrades.com) Chrome/120 Safari/537.36",
    });
    page = await ctx.newPage();
    // Silence noisy console traffic but surface page errors.
    page.on("pageerror", (err) => {
      console.warn(`[prerender] page error: ${err.message}`);
    });
  } catch (err) {
    console.warn(
      `[prerender] Chromium launch failed (${err?.message || err}); will rely on static-template fallback for critical routes.`,
    );
    browser = null;
  }

  const productSlugs = await loadProductSlugs();
  const productRoutes = productSlugs.map((s) => `/products/${s}`);
  const routes = [...STATIC_ROUTES, ...productRoutes];

  console.log(`[prerender] rendering ${routes.length} routes...`);
  const shell = await readFile(SHELL_PATH, "utf-8");

  let ok = 0;
  let fail = 0;
  const failedCritical = [];

  if (page) {
    for (const route of routes) {
      // Wave 100 — critical compliance routes (TCR / A2P 10DLC vetting,
      // Bing, LLM crawlers) ship the hand-written template instead of
      // the Playwright head-only splice. The Playwright path captures
      // <head> tags into the empty SPA shell, leaving the body as just
      // an empty <div id="root"> — fine for SEO meta but useless to the
      // TCR scraper which needs the actual policy/consent text inline.
      // The Wave 90/95 templates contain the full body content; their
      // heads include title/description/canonical/OG/robots so SEO is
      // preserved.
      if (CRITICAL_TEMPLATE_FALLBACKS[route]) {
        const wrote = await tryWriteTemplateFallback(route);
        if (wrote) {
          succeeded.add(route);
          ok += 1;
        } else {
          fail += 1;
          failedCritical.push(route);
        }
        continue;
      }
      try {
        const { tags, noscriptBody } = await snapshotRoute(page, baseUrl, route);
        if (!tags || tags.length === 0) {
          console.warn(`[prerender] ${route}: no head tags captured`);
          fail += 1;
          if (CRITICAL_ROUTES.includes(route)) failedCritical.push(route);
          continue;
        }
        const html = spliceHead(shell, tags, noscriptBody);
        await writeRouteHtml(route, html);
        succeeded.add(route);
        ok += 1;
      } catch (err) {
        console.warn(`[prerender] ${route}: ${err?.message || err}`);
        fail += 1;
        if (CRITICAL_ROUTES.includes(route)) failedCritical.push(route);
      }
    }
  } else {
    // Chromium never launched — every route is a failure for the
    // Playwright path. Mark critical routes for fallback attempts.
    for (const route of routes) {
      fail += 1;
      if (CRITICAL_ROUTES.includes(route)) failedCritical.push(route);
    }
  }

  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));

  // Wave 90 — attempt static-template fallback for any CRITICAL route
  // that failed the Playwright path. The template emits hand-written
  // HTML with the disclosure copy inlined, so the A2P 10DLC vetting
  // scraper sees the required content even when Playwright is broken.
  if (failedCritical.length > 0) {
    console.log(
      `[prerender] attempting template fallback for ${failedCritical.length} failed critical route(s)...`,
    );
    for (const route of failedCritical) {
      const wrote = await tryWriteTemplateFallback(route);
      if (wrote) succeeded.add(route);
    }
  }

  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[prerender] done in ${seconds}s — ok=${ok} fail=${fail}`);

  // Wave 90 — enforce the critical-route gate. If any route in
  // CRITICAL_ROUTES still doesn't have a generated index.html
  // (neither Playwright nor template fallback succeeded), abort the
  // build so the deploy doesn't silently ship a broken consent /
  // privacy / terms page like prior waves did.
  const stillMissingCritical = CRITICAL_ROUTES.filter(
    (route) => !succeeded.has(route),
  );
  if (stillMissingCritical.length > 0) {
    console.error(
      `[prerender] FATAL: critical route(s) not generated: ${stillMissingCritical.join(", ")}`,
    );
    process.exit(1);
  }

  if (ok === 0 && succeeded.size === 0) {
    console.error("[prerender] FATAL: zero routes prerendered successfully.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[prerender] FATAL:", err);
  process.exit(1);
});
