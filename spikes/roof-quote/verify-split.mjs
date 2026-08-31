// Headed real-GPU verification for the "Split your roof" feature.
// Run: PORT=5100 node verify-split.mjs   (server must already be serving on $PORT)
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import path from "path";

const PORT = process.env.PORT || 5100;
const OUT = process.argv[2] || "C:/Users/Owner/AppData/Local/Temp/claude/c--Users-Owner-claude-orchestrator/f34f9730-5f88-4a6b-982d-55bc9b30a918/scratchpad/roof-split";
mkdirSync(OUT, { recursive: true });
const ADDR = "1842 Glencoe St, Denver, CO";
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + ".png") });
const log = (...a) => console.log("[verify]", ...a);

async function reachEditor(page) {
  // type the address into whichever entry is visible, submit, wait for the roof to be ready, open the dot editor.
  await page.waitForTimeout(1500);
  const heroVisible = await page.locator("#addrHero").isVisible().catch(() => false);
  if (heroVisible) {
    await page.fill("#addrHero", ADDR);
    await page.waitForTimeout(400);
    await page.keyboard.press("Enter");
  } else {
    await page.fill("#addr", ADDR);
    await page.click("#go");
  }
  // Select-Roof step → Continue
  await page.waitForSelector("#srContinue", { state: "visible", timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(3000);
  for (let i = 0; i < 3; i++) {
    const srVis = await page.locator("#srContinue").isVisible().catch(() => false);
    if (!srVis) break;
    await page.click("#srContinue").catch(() => {});
    await page.waitForTimeout(2000);
  }
  // wait for the roof pipeline (can be slow on first uncached fetch)
  await page.waitForFunction(() => window.__roofReady === true, { timeout: 120000 });
  await page.waitForTimeout(2500);
  // open the dot editor (mounts #dotEditor + #dotHud)
  await page.evaluate(() => { try { window.__editRoofOutline(); } catch (e) {} });
  await page.waitForSelector("#dotHud", { state: "visible", timeout: 20000 });
  await page.waitForTimeout(1500);
}

async function run(viewport, tag) {
  const browser = await chromium.launch({
    headless: false,
    args: ["--ignore-gpu-blocklist", "--enable-gpu", "--enable-webgl", "--use-angle=d3d11", "--enable-unsafe-swiftshader"],
  });
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push("PAGEERROR: " + e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
  await reachEditor(page);

  // renderer check (must NOT be SwiftShader)
  const renderer = await page.evaluate(() => {
    try { const c = document.createElement("canvas"); const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
      const ext = gl.getExtension("WEBGL_debug_renderer_info"); return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL); } catch (e) { return "n/a:" + e.message; }
  });
  log(tag, "renderer =", renderer);

  // ── 1) OFF BY DEFAULT — split button present + inactive, no divider state ──
  const offState = await page.evaluate(() => ({
    splitBtn: !!document.getElementById("dotSplit"),
    splitActive: !!(window.__RoofSplit && window.__RoofSplit.active()),
    splittingClass: document.getElementById("dotHud").classList.contains("dh-splitting"),
    area: document.getElementById("dotArea") ? document.getElementById("dotArea").textContent : null,
    squares: document.getElementById("dotSq") ? document.getElementById("dotSq").textContent : null,
  }));
  log(tag, "OFF-by-default:", JSON.stringify(offState));
  await shot(page, tag + "-1-off-default");

  // ── 2) ACTIVATE SPLIT — divider + handles appear ──
  await page.click("#dotSplit");
  await page.waitForTimeout(900);
  const activeState = await page.evaluate(() => {
    const s = window.__RoofSplit._state();
    const h = window.__RoofSplit.handlesScreen();
    return { active: window.__RoofSplit.active(), state: s, handles: h, splittingClass: document.getElementById("dotHud").classList.contains("dh-splitting") };
  });
  log(tag, "ACTIVE:", JSON.stringify(activeState));
  await shot(page, tag + "-2-divider-active");

  const txt = (page, id) => page.evaluate(i => { const e = document.getElementById(i); return e ? e.textContent : null; }, id);

  // ── drag the divider LINE BODY (midpoint between handles, on-canvas) to translate it, proving real drag ──
  if (activeState.handles && activeState.handles.A && activeState.handles.B) {
    const a = activeState.handles.A, b = activeState.handles.B;
    // pick a point on the segment that lands inside the viewport
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const clampX = Math.max(20, Math.min(viewport.width - 20, mid[0]));
    const clampY = Math.max(20, Math.min(viewport.height - 20, mid[1]));
    await page.mouse.move(clampX, clampY);
    await page.mouse.down();
    await page.mouse.move(clampX + 40, clampY + 30, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    await shot(page, tag + "-2b-divider-dragged");
    log(tag, "after drag:", JSON.stringify(await page.evaluate(() => window.__RoofSplit._state())));
  }

  // ── 3) PICK THE USER'S SIDE (the larger, real-unit half) then APPLY ──
  const sideAreas = await page.evaluate(() => window.__RoofSplit.sideAreas());
  log(tag, "side areas (m²):", JSON.stringify(sideAreas));
  const before = {
    area: await txt(page, "dotArea"),
    squares: await txt(page, "dotSq"),
    perim: await txt(page, "dotPerim"),
  };
  // pick the side with the larger clipped area (= the user's own unit); pos→1, neg→0
  const pick = (sideAreas && sideAreas.pos >= sideAreas.neg) ? 1 : 0;
  await page.evaluate(s => window.__RoofSplit.pickSide(s), pick);
  await page.waitForTimeout(500);
  await shot(page, tag + "-3-side-picked");
  const applyDisabled = await page.evaluate(() => document.getElementById("dotSplitApply").disabled);
  log(tag, "picked side", pick, "→ applyDisabled =", applyDisabled);

  await page.click("#dotSplitApply");
  await page.waitForTimeout(900);
  const after = {
    area: await txt(page, "dotArea"),
    squares: await txt(page, "dotSq"),
    perim: await txt(page, "dotPerim"),
    applied: await page.evaluate(() => window.__RoofSplit.applied()),
  };
  log(tag, "BEFORE clip:", JSON.stringify(before));
  log(tag, "AFTER  clip:", JSON.stringify(after));
  await shot(page, tag + "-4-after-clip");

  // ── 4) REMOVE SPLIT — numbers restore ──
  // re-open split toolbar isn't needed; the Use-whole-roof button still exists while applied
  const restored = await page.evaluate(() => {
    // click the remove button if visible, else call removeSplit
    const rm = document.getElementById("dotSplitRemove");
    if (rm) rm.click(); else window.__RoofSplit.removeSplit();
    return true;
  });
  await page.waitForTimeout(900);
  const afterRestore = {
    area: await txt(page, "dotArea"),
    squares: await txt(page, "dotSq"),
    perim: await txt(page, "dotPerim"),
    active: await page.evaluate(() => window.__RoofSplit.active()),
  };
  log(tag, "AFTER restore:", JSON.stringify(afterRestore));
  await shot(page, tag + "-5-restored");

  const num = s => parseFloat(String(s).replace(/[^\d.]/g, "")) || 0;
  const bSq = num(before.squares), aSq = num(after.squares), rSq = num(afterRestore.squares);
  const summary = {
    renderer, errors, off: offState, sideAreas, pickedSide: pick, applied: after.applied, before, after, afterRestore,
    // "dropped" = the clip reduced the roof (picked the larger half, so expect a meaningful drop but not to ~0)
    dropped: aSq > 0 && aSq < bSq * 0.9,
    restoredOk: Math.abs(rSq - bSq) <= Math.max(0.6, bSq * 0.05),
    swiftshader: /swiftshader|software/i.test(renderer),
  };
  log(tag, "SUMMARY:", JSON.stringify(summary, null, 2));
  await browser.close();
  return summary;
}

const desktop = await run({ width: 1280, height: 900 }, "desktop");
const mobile = await run({ width: 375, height: 760 }, "mobile");
console.log("\n===== RESULT =====");
console.log("desktop:", JSON.stringify({ dropped: desktop.dropped, applied: desktop.applied, restoredOk: desktop.restoredOk, swiftshader: desktop.swiftshader, errs: desktop.errors.length, sq: [desktop.before.squares, desktop.after.squares, desktop.afterRestore.squares] }));
console.log("mobile :", JSON.stringify({ dropped: mobile.dropped, applied: mobile.applied, restoredOk: mobile.restoredOk, swiftshader: mobile.swiftshader, errs: mobile.errors.length, sq: [mobile.before.squares, mobile.after.squares, mobile.afterRestore.squares] }));
if (desktop.errors.length) console.log("desktop errors:", desktop.errors.slice(0, 8));
if (mobile.errors.length) console.log("mobile errors:", mobile.errors.slice(0, 8));
