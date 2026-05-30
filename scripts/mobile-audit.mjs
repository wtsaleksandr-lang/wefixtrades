/**
 * Mobile-view audit — loads each public page at a phone viewport and flags:
 *   - horizontal overflow (content wider than the screen = cropping/side-scroll)
 *   - the specific elements that overflow the right edge
 *   - console errors + uncaught page errors (render crashes)
 *   - the app-level crash screen ("This page crashed" / "Something went wrong")
 *
 * Read-only: hits a live URL, changes nothing. Run:
 *   node scripts/mobile-audit.mjs [baseUrl]
 * Default baseUrl = https://wefixtrades.com
 */
import { chromium, devices } from "playwright";

const BASE = process.argv[2] || "https://wefixtrades.com";
const iPhone = devices["iPhone 13"]; // 390x844

const ROUTES = [
  "/", "/products", "/products/assistants", "/products/ai-chat", "/products/ai-voice",
  "/products/tradeline-complete", "/products/quotequick", "/products/booking-addon",
  "/products/fix-and-optimize", "/solutions/visibility", "/demos", "/demos/socialsync",
  "/demos/rankflow", "/demos/reputationshield", "/platform", "/pricing", "/pricing/quotequick",
  "/plans", "/services", "/bundles", "/templates", "/resources", "/design-showcase",
  "/about", "/blog", "/case-studies", "/for-agencies", "/for-franchises", "/for-solo-traders",
  "/wefixtrades-vs-jobber", "/wefixtrades-vs-housecall-pro", "/wefixtrades-vs-servicetitan",
  "/sitemap", "/mapguard-suite", "/compare/reputationshield-vs-nicejob", "/login", "/signup",
];

const OVERFLOW_TOL = 3; // px

async function auditRoute(page, route) {
  const errors = [];
  const onConsole = (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); };
  const onPageErr = (e) => errors.push("PAGEERROR: " + (e.message || String(e)).slice(0, 160));
  page.on("console", onConsole);
  page.on("pageerror", onPageErr);
  let nav = "ok";
  try {
    await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 35000 });
  } catch (e) {
    try { await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 20000 }); nav = "domonly"; }
    catch (e2) { page.off("console", onConsole); page.off("pageerror", onPageErr); return { route, nav: "FAILED", err: String(e2).slice(0, 120) }; }
  }
  await page.waitForTimeout(1200);
  const data = await page.evaluate((tol) => {
    const winW = window.innerWidth;
    const docW = document.documentElement.scrollWidth;
    const offenders = [];
    if (docW > winW + tol) {
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        const r = el.getBoundingClientRect();
        if (r.width < 16 || r.height < 8) continue;
        if (r.right > winW + tol && r.left >= -1) {
          const cls = (typeof el.className === "string" ? el.className : "").trim().split(/\s+/).slice(0, 4).join(".");
          offenders.push(`${el.tagName.toLowerCase()}${cls ? "." + cls : ""} (right=${Math.round(r.right)} w=${Math.round(r.width)})`);
        }
      }
    }
    const txt = (document.body.innerText || "");
    const crashed = txt.includes("This page crashed") || txt.includes("Something went wrong");
    return { winW, docW, overflow: docW - winW, offenders: offenders.slice(0, 6), crashed };
  }, OVERFLOW_TOL);
  page.off("console", onConsole);
  page.off("pageerror", onPageErr);
  return { route, nav, ...data, errors: errors.slice(0, 4) };
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...iPhone });
  const page = await ctx.newPage();
  const results = [];
  for (const route of ROUTES) {
    const r = await auditRoute(page, route);
    results.push(r);
    const flags = [];
    if (r.nav === "FAILED") flags.push("NAV-FAILED");
    if (r.crashed) flags.push("CRASHED");
    if (r.overflow > OVERFLOW_TOL) flags.push(`OVERFLOW+${r.overflow}px`);
    if (r.errors && r.errors.length) flags.push(`${r.errors.length}console-err`);
    console.log(`${flags.length ? "⚠ " : "✓ "}${route}  ${flags.join(" ") || "clean"}`);
    if (r.offenders && r.offenders.length) for (const o of r.offenders) console.log(`      ↳ ${o}`);
    if (r.errors && r.errors.length) for (const e of r.errors) console.log(`      ! ${e}`);
  }
  await browser.close();
  const problems = results.filter((r) => r.nav === "FAILED" || r.crashed || r.overflow > OVERFLOW_TOL || (r.errors && r.errors.length));
  console.log(`\n=== SUMMARY: ${problems.length}/${results.length} pages with issues ===`);
})();
