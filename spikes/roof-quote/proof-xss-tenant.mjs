/**
 * Phase-3 STORED-XSS proof for the white-label report (review FIX 1).
 *
 * A malicious trade controls its own branding (advanced.roofWidget.trade.*).
 * Those strings are written into the report DOM via innerHTML. This harness:
 *
 *   1. Renders the APP-SERVED roof3d.html (the real production asset) with a
 *      tenant config whose branding fields carry XSS payloads:
 *        - trade.company = <img src=x onerror="window.__XSS__=1">
 *        - trade.about   = </script><script>window.__XSS2__=1</script>...
 *        - trade.logo    = javascript:window.__XSS3__=1   (must be rejected as src)
 *   2. Drives it headless, seeds the minimal report state, calls window.__openReport().
 *   3. ASSERTS window.__XSS__ / __XSS2__ / __XSS3__ are all undefined (no script ran)
 *      and the payloads appear as ESCAPED literal text in the report DOM.
 *
 * Seeding note: QUOTE / solarTiers / REGION etc. are module-scoped `let`s, so the
 * harness injects ONE test-only assignment right after `window.__openReport=openReport;`
 * (same lexical scope) — this is render-time only, the on-disk asset is never modified.
 *
 * Run: node spikes/roof-quote/proof-xss-tenant.mjs
 * (3D / WebGL / Google-Maps errors are expected and ignored.)
 */
import http from "http";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW = readFileSync(
  path.join(__dirname, "..", "..", "server", "roofQuote", "assets", "roof3d.html"),
  "utf8",
);

// mirror server escapeForScript() so the injected JSON parses identically to prod
const SEP_2028 = new RegExp(String.fromCharCode(0x2028), "g");
const SEP_2029 = new RegExp(String.fromCharCode(0x2029), "g");
function escapeForScript(json) {
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(SEP_2028, "\\u2028")
    .replace(SEP_2029, "\\u2029");
}

const XSS_IMG = `<img src=x onerror="window.__XSS__=1">`;
const XSS_SCRIPT = `</script><script>window.__XSS2__=1</script>before`;

const TENANT = {
  accent: "#aa1133",
  trade: {
    company: XSS_IMG,
    about: XSS_SCRIPT,
    tagline: `"><svg onload="window.__XSS4__=1">`,
    logo: `javascript:window.__XSS3__=1`,
    phone: `<b>555</b>`,
    license: `<i>LIC</i>`,
    promises: [{ title: `<u>p</u>`, body: `<img src=y onerror="window.__XSS5__=1">` }],
    certifications: [{ name: `<s>c</s>`, body: `<img src=z onerror="window.__XSS6__=1">` }],
    rating: `4.9<script>window.__XSS7__=1</script>`,
    reviews: 42,
  },
  features: { leadQual: true },
};

// Render with the malicious tenant + inject a render-time-only report-state seed.
const json = escapeForScript(JSON.stringify(TENANT));
const SEED = `
window.__seedReport=function(){
  QUOTE={ roofSqft:1110, facets:6, hero:"" };
  solarTiers=[{label:"Best",lo:18000,hi:22300,kw:7.2,panels:18,kwhAc:9000}];
  selTier=0; tradeMode="solar"; selWaste=1;
};`;
const SEEDED = RAW.replace(
  "window.__openReport=openReport;",
  "window.__openReport=openReport;" + SEED,
);
const HTML = SEEDED.replaceAll("__TILES__", "DUMMY_TILES_KEY").replace("__TENANT_JSON__", json);

const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end(HTML);
});

let failed = false;
function assert(cond, msg) {
  if (!cond) { failed = true; console.error("FAIL:", msg); } else console.log("PASS:", msg);
}

await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ args: ["--no-sandbox", "--ignore-gpu-blocklist", "--use-gl=swiftshader"] });
try {
  const page = await browser.newPage();
  page.on("pageerror", () => {}); // ignore WebGL / Google-Maps load errors
  await page.goto(`http://127.0.0.1:${port}/?noauto=1`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900); // boot module → applyTenant()

  // seed minimal report state (module-scoped) then open the real report
  await page.evaluate(() => { window.__seedReport(); window.__openReport(); });
  await page.waitForTimeout(400);

  // 1) NO injected script executed
  const flags = await page.evaluate(() => ({
    a: window.__XSS__, b: window.__XSS2__, c: window.__XSS3__,
    d: window.__XSS4__, e: window.__XSS5__, f: window.__XSS6__, g: window.__XSS7__,
  }));
  assert(flags.a === undefined, `company <img onerror> did NOT fire (window.__XSS__=${flags.a})`);
  assert(flags.b === undefined, `about </script><script> did NOT fire (window.__XSS2__=${flags.b})`);
  assert(flags.c === undefined, `logo javascript: src did NOT fire (window.__XSS3__=${flags.c})`);
  assert(flags.d === undefined, `tagline svg onload did NOT fire (window.__XSS4__=${flags.d})`);
  assert(flags.e === undefined, `promise <img onerror> did NOT fire (window.__XSS5__=${flags.e})`);
  assert(flags.f === undefined, `cert <img onerror> did NOT fire (window.__XSS6__=${flags.f})`);
  assert(flags.g === undefined, `rating <script> did NOT fire (window.__XSS7__=${flags.g})`);

  // 2) the report rendered and the payload survives as ESCAPED literal text
  const rep = await page.evaluate(() => {
    const el = document.getElementById("report");
    return { display: el ? getComputedStyle(el).display : "MISSING", html: el ? el.innerHTML : "" };
  });
  assert(rep.display !== "none" && rep.display !== "MISSING", `report opened (display=${rep.display})`);
  assert(rep.html.includes("&lt;img src=x onerror="), "company payload present as ESCAPED text (&lt;img...)");
  assert(!rep.html.includes("<img src=x onerror="), "company payload NOT present as a live <img> tag");
  assert(!/<script>window\.__XSS2__/.test(rep.html), "about payload did NOT inject a live <script>");

  // 3) the dangerous logo URL was dropped (no src=javascript:)
  const badImg = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#report img"))
      .some((i) => /^javascript:/i.test(i.getAttribute("src") || "")));
  assert(badImg === false, "no <img src=javascript:...> emitted for the malicious logo");

  await page.close();
} finally {
  await browser.close();
  server.close();
}
console.log(failed ? "\n✗ XSS PROOF FAILED" : "\n✓ XSS PROOF PASSED");
process.exit(failed ? 1 : 0);
