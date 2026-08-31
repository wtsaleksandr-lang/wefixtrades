// Real-GPU Playwright verification of the INTERACTIVE SOLAR PANEL GRID.
// Drives the live widget on :5341 for 1842 Glencoe St, Denver CO. Asserts real Intel/D3D11 GPU,
// reaches the Solar view, opens the grid, captures default metrics, taps to remove + add panels
// (before/after numbers), enters a monthly bill (before/after), and screenshots desktop + mobile 390px.
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const PORT = process.env.PORT || 5341;
const OUT = "C:/Users/Owner/claude-orchestrator/audits/solargrid";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ADDR = "1842 Glencoe St, Denver, CO";

const gpuArgs = ["--ignore-gpu-blocklist","--enable-gpu","--enable-webgl","--use-angle=d3d11","--enable-accelerated-2d-canvas"];

async function readMetrics(page){
  return page.evaluate(()=>{
    const t=id=>{const e=document.getElementById(id);return e?e.textContent.trim():null;};
    const m=window.__gridSelectionMetrics?window.__gridSelectionMetrics():null;
    return { panelsTxt:t("sgPanels"), kwTxt:t("sgKw"), kwhTxt:t("sgKwh"), offsetTxt:t("sgOffset"),
             priceTxt:t("sgPrice"), monthlyTxt:t("sgMonthly"),
             billBefore:t("sgBillBefore"), billAfter:t("sgBillAfter"), billSave:t("sgBillSave"),
             metrics:m, drawn:window.__sgDrawn, open:window.__sgOpen };
  });
}

const browser = await chromium.launch({ headless:false, args:gpuArgs });
const page = await browser.newPage({ viewport:{ width:1280, height:900 } });

// renderer assertion
await page.goto(`http://localhost:${PORT}/roof3d`, { waitUntil:"domcontentloaded" });
const renderer = await page.evaluate(()=>{ try{ const c=document.createElement("canvas"); const gl=c.getContext("webgl")||c.getContext("experimental-webgl"); const ext=gl.getExtension("WEBGL_debug_renderer_info"); return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);}catch(e){return "ERR:"+e.message;} });
console.log("RENDERER:", renderer);
const realGpu = /Intel|Direct3D11|ANGLE/i.test(renderer) && !/SwiftShader/i.test(renderer);
console.log("REAL GPU:", realGpu);

const report = { renderer, realGpu, steps:{} };

// === reach the Solar view ===
await page.goto(`http://localhost:${PORT}/roof3d`, { waitUntil:"domcontentloaded" });
await sleep(800);
const input = page.locator("#addrHero");
await input.click(); await input.fill("");
await input.pressSequentially(ADDR, { delay:55 });
await sleep(1900);
const items = page.locator(".pac-item");
if (await items.count() > 0) await items.first().click(); else await input.press("Enter");
await sleep(1200);
// Continue through Select-Your-Roof
try { await page.locator("#srContinue").click({ timeout:8000 }); } catch(_) { console.log("no srContinue (maybe auto-advanced)"); }

// poll roofReady
const t0=Date.now(); let ready=false;
while (Date.now()-t0 < 80000){ ready = await page.evaluate(()=>!!window.__roofReady).catch(()=>false); if(ready) break; await sleep(700); }
report.roofReady = ready;
console.log("roofReady:", ready);
await sleep(15000); // tiles + solar layers

// ensure Solar trade tab + Panels lens active; the card defaults to solar
await page.evaluate(()=>{ try{ if(typeof tradeMode!=="undefined"){} }catch(_){} });
// probe solar data + whether the open-grid button rendered
const pre = await page.evaluate(()=>{
  const sp = window.LASTB && window.LASTB.solarPotential;
  return { panels:(sp&&sp.solarPanels||[]).length, configs:(sp&&sp.solarPanelConfigs||[]).length,
           haveFlux: !!(window.LASTFLUX&&window.LASTFLUX.rasters), rendered:window.__renderedPanels,
           openBtn: !!document.querySelector("[data-opengrid]") };
});
report.solarData = pre;
console.log("solar data:", JSON.stringify(pre));
await page.screenshot({ path:`${OUT}/01-solar-card-desktop.png` });

// === open the grid ===
let opened=false;
try { await page.locator("[data-opengrid]").click({ timeout:6000 }); opened=true; } catch(e){ console.log("open-grid click failed:", e.message); }
await sleep(1500);
report.gridOpened = await page.evaluate(()=>!!window.__sgOpen);
console.log("grid opened:", report.gridOpened);
await page.screenshot({ path:`${OUT}/02-grid-default-desktop.png` });
report.steps.default = await readMetrics(page);
console.log("DEFAULT:", JSON.stringify(report.steps.default));

const before = await readMetrics(page);
report.steps.beforeRemove = before;

// First prove a REAL canvas tap toggles a panel — click the centroid of an actual selected panel.
const cvBox = await page.locator("#sgCanvas").boundingBox();
const ctr = await page.evaluate(()=>window.__sgFirstSelectedCenter());
const beforeTap = await page.evaluate(()=>window.__gridSelectionMetrics().panels);
if (ctr){ await page.mouse.click(cvBox.x + ctr.x, cvBox.y + ctr.y); await sleep(350); }
const afterTap = await page.evaluate(()=>window.__gridSelectionMetrics().panels);
report.steps.realTap = { ctr, beforeTap, afterTap, changed: beforeTap!==afterTap };
console.log("REAL CANVAS TAP:", JSON.stringify(report.steps.realTap));
// tap the SAME spot again → toggles back on (proves add via real pointer)
if (ctr){ await page.mouse.click(cvBox.x + ctr.x, cvBox.y + ctr.y); await sleep(350); }
const afterTap2 = await page.evaluate(()=>window.__gridSelectionMetrics().panels);
report.steps.realTapBack = { afterTap2, restored: afterTap2===beforeTap };
console.log("REAL CANVAS TAP BACK:", JSON.stringify(report.steps.realTapBack));

// === remove several panels (deterministic toggle of 6 selected → off) ===
await page.evaluate(()=>window.__sgToggleN(6,false));
await sleep(400);
const afterRemove = await readMetrics(page);
report.steps.afterRemove = afterRemove;
await page.screenshot({ path:`${OUT}/03-grid-after-remove-desktop.png` });
console.log("AFTER REMOVE 6:", JSON.stringify(afterRemove));

// === add some back (toggle 4 unselected → on) ===
await page.evaluate(()=>window.__sgToggleN(4,true));
await sleep(400);
const afterAdd = await readMetrics(page);
report.steps.afterAdd = afterAdd;
await page.screenshot({ path:`${OUT}/04-grid-after-add-desktop.png` });
console.log("AFTER ADD 4:", JSON.stringify(afterAdd));

// === enter a monthly bill ===
await page.locator("#sgBill").click();
await page.locator("#sgBill").fill("220");
await sleep(600);
const withBill = await readMetrics(page);
report.steps.withBill = withBill;
await page.screenshot({ path:`${OUT}/05-grid-bill-desktop.png` });
console.log("WITH BILL $220:", JSON.stringify(withBill));

// === commit + verify card headline reflects the custom system ===
try { await page.locator("#sgDoneBtn").click({ timeout:4000 }); } catch(_){}
await sleep(1200);
report.afterCommit = await page.evaluate(()=>({
  quoteFromGrid: window.__quoteFromGrid, quotePanels: window.__quotePanels,
  selPanels: window.__selPanels
}));
await page.screenshot({ path:`${OUT}/06-card-after-commit-desktop.png` });
console.log("AFTER COMMIT:", JSON.stringify(report.afterCommit));

// === Roofing tab regression check ===
try { await page.evaluate(()=>{ const t=document.querySelector('.qtab[data-t="roof"]'); if(t) t.click(); }); await sleep(1500);
  await page.screenshot({ path:`${OUT}/07-roofing-tab-desktop.png` });
  report.roofingTabOk = await page.evaluate(()=>!!document.querySelector(".qprice, .qprompt, .mat-row"));
} catch(e){ report.roofingErr = e.message; }

// === MOBILE 390px ===
const mp = await browser.newPage({ viewport:{ width:390, height:844 }, isMobile:true });
await mp.goto(`http://localhost:${PORT}/roof3d`, { waitUntil:"domcontentloaded" });
await sleep(800);
const mi = mp.locator("#addrHero"); await mi.click(); await mi.fill("");
await mi.pressSequentially(ADDR, { delay:55 }); await sleep(1900);
const mItems = mp.locator(".pac-item");
if (await mItems.count() > 0) await mItems.first().click(); else await mi.press("Enter");
await sleep(1200);
try { await mp.locator("#srContinue").click({ timeout:8000 }); } catch(_){}
const mt0=Date.now(); let mready=false;
while (Date.now()-mt0 < 80000){ mready = await mp.evaluate(()=>!!window.__roofReady).catch(()=>false); if(mready) break; await sleep(700); }
await sleep(15000);
try { await mp.locator("[data-opengrid]").click({ timeout:6000 }); } catch(e){ console.log("mobile open-grid failed:", e.message); }
await sleep(1500);
await mp.screenshot({ path:`${OUT}/08-grid-default-mobile390.png` });
// mobile tap + bill
const mcv = await mp.locator("#sgCanvas").boundingBox();
if (mcv){ for(let i=0;i<4;i++){ await mp.mouse.click(mcv.x+mcv.width*(0.35+0.08*i), mcv.y+mcv.height*0.45); await sleep(180); } }
await mp.locator("#sgBill").fill("180"); await sleep(600);
report.mobile = await readMetrics(mp);
await mp.screenshot({ path:`${OUT}/09-grid-mobile390-bill.png` });
console.log("MOBILE:", JSON.stringify(report.mobile));

await browser.close();
console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(report, null, 2));
