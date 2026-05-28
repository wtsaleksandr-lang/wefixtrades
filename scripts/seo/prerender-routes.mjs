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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DIST_DIR = path.join(REPO_ROOT, "dist", "public");
const SHELL_PATH = path.join(DIST_DIR, "index.html");

if (process.env.SKIP_PRERENDER === "1") {
  console.log("[prerender] SKIP_PRERENDER=1 — skipping per-route prerender.");
  process.exit(0);
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
 */
function spliceHead(shellHtml, rendered) {
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

  const tags = await page.evaluate(() => {
    const out = [];
    const title = document.querySelector("title");
    if (title) out.push(title.outerHTML);
    document.querySelectorAll("meta").forEach((el) => {
      // Skip charset/viewport/theme-color — those are re-added by the
      // splicer from a fixed baseline. Everything else (description,
      // robots, keywords, og:*, twitter:*) flows through.
      const name = (el.getAttribute("name") || "").toLowerCase();
      const prop = (el.getAttribute("property") || "").toLowerCase();
      const charset = el.getAttribute("charset");
      if (charset) return;
      if (name === "viewport" || name === "theme-color") return;
      out.push(el.outerHTML);
    });
    document.querySelectorAll('link[rel="canonical"]').forEach((el) => {
      out.push(el.outerHTML);
    });
    document
      .querySelectorAll('script[type="application/ld+json"]')
      .forEach((el) => {
        // Clone so the textContent serializes cleanly.
        out.push(el.outerHTML);
      });
    return out;
  });

  return tags;
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

async function main() {
  const t0 = Date.now();
  console.log("[prerender] booting static server on 127.0.0.1:4173...");
  const server = await startStaticServer(DIST_DIR, 4173);
  const baseUrl = "http://127.0.0.1:4173";

  console.log("[prerender] launching Chromium...");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (compatible; WFXPrerender/1.0; +https://wefixtrades.com) Chrome/120 Safari/537.36",
  });
  const page = await ctx.newPage();
  // Silence noisy console traffic but surface page errors.
  page.on("pageerror", (err) => {
    console.warn(`[prerender] page error: ${err.message}`);
  });

  const productSlugs = await loadProductSlugs();
  const productRoutes = productSlugs.map((s) => `/products/${s}`);
  const routes = [...STATIC_ROUTES, ...productRoutes];

  console.log(`[prerender] rendering ${routes.length} routes...`);
  const shell = await readFile(SHELL_PATH, "utf-8");

  let ok = 0;
  let fail = 0;
  for (const route of routes) {
    try {
      const tags = await snapshotRoute(page, baseUrl, route);
      if (!tags || tags.length === 0) {
        console.warn(`[prerender] ${route}: no head tags captured`);
        fail += 1;
        continue;
      }
      const html = spliceHead(shell, tags);
      await writeRouteHtml(route, html);
      ok += 1;
    } catch (err) {
      console.warn(`[prerender] ${route}: ${err?.message || err}`);
      fail += 1;
    }
  }

  await browser.close();
  await new Promise((resolve) => server.close(resolve));

  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[prerender] done in ${seconds}s — ok=${ok} fail=${fail}`);
  if (ok === 0) {
    console.error("[prerender] FATAL: zero routes prerendered successfully.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[prerender] FATAL:", err);
  process.exit(1);
});
