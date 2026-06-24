// verify-option1.mjs — headless verification for the Option-1 roof-widget rebuild.
// Verifies on surfaces that DO render under software-GPU Playwright: the 2D #matCanvas
// and our own Three.js #scene. NOT Google's photoreal tiles (blank headless).
//
// Usage: node verify-option1.mjs <PORT> <OUTDIR> <TAG>  (then it runs both addresses).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const PORT = process.argv[2] || "5310";
const OUT  = process.argv[3] || "C:/Users/Owner/claude-orchestrator/audits/option1";
const TAG  = process.argv[4] || "after";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);

// assertNoOverlap: any two VISIBLE interactive bars/buttons overlapping >2px in BOTH axes fails.
async function assertNoOverlap(page, ids) {
  return await page.evaluate((ids) => {
    const vis = [];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      vis.push({ id, r: { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom } });
    }
    const fails = [];
    for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
      // Skip DOM containment (parent/child): a nested toggle is *inside* its bar by design
      // (#sunHeatToggle lives inside #sunbar). Only two INDEPENDENT bars colliding is a real defect.
      const ea = document.getElementById(vis[i].id), eb = document.getElementById(vis[j].id);
      if (ea && eb && (ea.contains(eb) || eb.contains(ea))) continue;
      const a = vis[i].r, b = vis[j].r;
      const ox = Math.min(a.right, b.right) - Math.max(a.x, b.x);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
      if (ox > 2 && oy > 2) fails.push({ a: vis[i].id, b: vis[j].id, ox: Math.round(ox), oy: Math.round(oy) });
    }
    return { visible: vis.map(v => v.id), fails };
  }, ids);
}

const BARS = ["sunbar", "matbar", "measToggle", "sunHeatToggle", "card", "roofReport", "matHint"];

async function shoot(page, name) {
  const f = path.join(OUT, name);
  await page.screenshot({ path: f });
  log("  📸", name);
  return f;
}

async function loadAddress(page, addr, port) {
  let nav = false;
  for (let a = 0; a < 3 && !nav; a++) {
    try { await page.goto(`http://localhost:${port}/roof3d?noauto=1`, { waitUntil: "domcontentloaded", timeout: 60000 }); nav = true; }
    catch (e) { log("  goto retry", a + 1, e.message.slice(0, 60)); await sleep(3000); }
  }
  await page.waitForSelector("#addr", { timeout: 15000 });
  await page.fill("#addr", addr);
  await page.click("#go");
  // wait for roof ready (model + first paint)
  let ready = false;
  for (let i = 0; i < 120; i++) {
    ready = await page.evaluate(() => window.__roofReady === true);
    if (ready) break;
    await sleep(1000);
  }
  await sleep(2500); // let the default lens settle
  return ready;
}

async function clickIfVisible(page, sel) {
  const el = await page.$(sel);
  if (!el) return false;
  const shown = await el.evaluate(e => { const cs = getComputedStyle(e); return cs.display !== "none" && cs.visibility !== "hidden"; });
  if (!shown) return false;
  await el.click();
  return true;
}

async function run() {
  const exe = chromium.executablePath();
  const browser = await chromium.launch({ headless: true, executablePath: exe, args: ["--use-gl=swiftshader", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
  const results = {};

  // ---- viewport helper -------------------------------------------------
  async function suite(addr, slug, viewport, vpName) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    page.on("console", m => { const t = m.text(); if (/error|fail|exception/i.test(t)) log("    [console]", t.slice(0, 160)); });
    const r = { addr, vpName, steps: {} };
    log(`\n=== ${addr} @ ${vpName} (${viewport.width}x${viewport.height}) ===`);
    const ready = await loadAddress(page, addr, PORT);
    r.ready = ready;
    log("  roofReady:", ready);

    // diagnostics dump
    r.diag = await page.evaluate(() => ({
      trade: window.__trade, analysis: window.__analysis, mode: window.__mode,
      roofMeas: window.__roofMeas || null, sunDone: window.__sunDone || null,
      measFacets: window.__measFacets || null, footprintEN: (window.__footprintEN && window.__footprintEN.length) || 0,
      matRoofPx: window.__matRoofPx || null,
      hasAccessStr: !!document.body.innerText.match(/Accessibility:\s*investigate/i),
      sceneEdges3D: window.__measScene3D || null,
    }));
    log("  diag:", JSON.stringify(r.diag));

    // default view
    await shoot(page, `${TAG}-${slug}-${vpName}-00-default.png`);

    // --- Measure lens (2D default) ---
    if (await clickIfVisible(page, "#bLabels")) {
      await sleep(3500);
      r.steps.measure2d = await assertNoOverlap(page, BARS);
      await shoot(page, `${TAG}-${slug}-${vpName}-10-measure2d.png`);
      // toggle to 3D (our Three.js scene)
      const t3d = await page.$('#measToggle [data-v="3d"]');
      if (t3d) {
        await t3d.click(); await sleep(3000);
        r.steps.measure3d = await assertNoOverlap(page, BARS);
        r.measScene3D = await page.evaluate(() => window.__measScene3D || null);
        await shoot(page, `${TAG}-${slug}-${vpName}-11-measure3d.png`);
        // back to top-down (non-fatal)
        try { const td = await page.$('#measToggle [data-v="diagram"]'); if (td) await td.click({ timeout: 4000 }); await sleep(1200); } catch (e) { log("  (toggle-back skipped)", e.message.slice(0, 50)); }
      }
      await clickIfVisible(page, "#bLabels"); // exit measure
      await sleep(800);
    }

    // --- Sun lens ---
    if (await clickIfVisible(page, "#bSun")) {
      await sleep(3500);
      r.steps.sun = await assertNoOverlap(page, BARS);
      r.sunDone = await page.evaluate(() => ({ sunDone: window.__sunDone, heatCells: window.__heatCells }));
      await shoot(page, `${TAG}-${slug}-${vpName}-20-sun.png`);
      await clickIfVisible(page, "#bSun"); // exit
      await sleep(800);
    }

    // --- Materials lens --- (use the canonical entry: switches to roof trade + opens catalogue)
    await page.evaluate(() => { if (typeof window.__openMaterials === "function") window.__openMaterials(); });
    await sleep(4000);
    r.steps.materials = await assertNoOverlap(page, BARS);
    r.matInfo = await page.evaluate(() => ({ matRoofPx: window.__matRoofPx, matbar: getComputedStyle(document.getElementById("matbar")).display, sunbar: getComputedStyle(document.getElementById("sunbar")).display, canvasShown: getComputedStyle(document.getElementById("matCanvas")).display, matMode: window.__analysis }));
    await shoot(page, `${TAG}-${slug}-${vpName}-30-materials.png`);

    await ctx.close();
    return r;
  }

  const slugify = (a) => a.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
  const ADDRS = (process.argv[5])
    ? [[process.argv[5], slugify(process.argv[5])]]
    : [
        ["30 Angus Rd, Hamilton ON", "angus"],
        ["4521 T St, Sacramento CA", "sacramento"],
      ];
  for (const [addr, slug] of ADDRS) {
    results[slug] = {};
    results[slug].desktop = await suite(addr, slug, { width: 1280, height: 860 }, "desktop");
    results[slug].mobile  = await suite(addr, slug, { width: 375, height: 760 }, "mobile");
  }

  await browser.close();
  log("\n\n===== SUMMARY =====");
  log(JSON.stringify(results, null, 2));
}
run().catch(e => { console.error("VERIFY ERROR:", e); process.exit(1); });
