import { chromium } from 'playwright';

const FLAGS = ['--ignore-gpu-blocklist','--enable-gpu','--enable-webgl','--use-angle=d3d11','--enable-accelerated-2d-canvas'];
const OUT = 'C:/Users/Owner/claude-orchestrator/audits/qa-sweep';
const BASE = 'http://localhost:5320/roof3d';

// args: addrSlug, address, branch (solar|roof), viewport (desktop|mobile)
const [,, slug, address, branch, vp] = process.argv;
const VP = vp === 'mobile' ? { width: 390, height: 844 } : { width: 1320, height: 900 };
const tag = `${slug}-${vp}`;

function log(...a){ console.log(`[${tag}]`, ...a); }
const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}/${tag}-${name}.png` });
  log('shot', name);
};

const browser = await chromium.launch({ headless: false, args: FLAGS });
const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: '+e.message));

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await shot(page, '01-hero');

  // Type address char by char
  const hero = page.locator('#addrHero');
  await hero.click();
  await hero.pressSequentially(address, { delay: 55 });
  await page.waitForTimeout(1900);

  // Try to pick first pac suggestion
  const pac = page.locator('.pac-item').first();
  let picked = false;
  try {
    if (await pac.isVisible({ timeout: 1500 })) { await pac.click(); picked = true; }
  } catch {}
  if (!picked) {
    await hero.press('ArrowDown');
    await page.waitForTimeout(300);
    await hero.press('Enter');
  }
  await page.waitForTimeout(800);
  await shot(page, '02-address-picked');

  // Submit
  await page.locator('#goHero').click();
  log('submitted, waiting for select-roof...');

  // wait for select-roof continue to be visible
  try { await page.locator('#srContinue').waitFor({ state: 'visible', timeout: 25000 }); } catch(e){ log('srContinue not visible:', e.message); }
  await page.waitForTimeout(4000); // let satellite + polygons settle
  await shot(page, '03-select-roof');

  // continue
  try { await page.locator('#srContinue').click({ timeout: 5000 }); } catch(e){ log('srContinue click fail', e.message); }
  await page.waitForTimeout(3500);
  await shot(page, '04-editor');

  // editor: look for dotDone
  const dotDone = page.locator('#dotDone');
  let inEditor = false;
  try { inEditor = await dotDone.isVisible({ timeout: 4000 }); } catch {}
  if (inEditor) {
    await page.waitForTimeout(1500);
    await shot(page, '05-editor-detail');
    await dotDone.click();
    await page.waitForTimeout(2500);
    // possibly multiple houses -> keep clicking Done until branchChoice
    for (let i=0;i<4;i++){
      if (await page.locator('#branchChoice').isVisible().catch(()=>false)) break;
      const dd = page.locator('#dotDone');
      if (await dd.isVisible().catch(()=>false)) { await dd.click(); await page.waitForTimeout(2000); }
      else break;
    }
  }
  await page.waitForTimeout(2000);

  // branch choice
  try { await page.locator('#branchChoice').waitFor({ state:'visible', timeout: 12000 }); } catch(e){ log('branchChoice not visible', e.message); }
  await shot(page, '06-branch-choice');

  if (branch === 'solar') {
    await page.locator('#bcSolar').click().catch(e=>log('bcSolar click', e.message));
    await page.waitForTimeout(3500);
    await page.locator('#solarGrid').waitFor({ state:'visible', timeout: 15000 }).catch(e=>log('solarGrid wait', e.message));
    await page.waitForTimeout(2500);
    await shot(page, '07-solar-2d');
    // bill interaction
    const bill = page.locator('#sgBill');
    if (await bill.isVisible().catch(()=>false)) {
      await bill.click().catch(()=>{});
      await bill.fill('250').catch(()=>{});
      await page.waitForTimeout(1500);
      await shot(page, '08-solar-bill');
    }
    // 3D toggle
    const v3 = page.locator('#sgView3d');
    if (await v3.isVisible().catch(()=>false)) {
      await v3.click().catch(()=>{});
      log('switched to 3D, polling roofReady...');
      // poll for ready
      for (let i=0;i<20;i++){
        const r = await page.evaluate(()=>window.__roofReady===true).catch(()=>false);
        if (r) break;
        await page.waitForTimeout(1000);
      }
      await page.waitForTimeout(15000); // photoreal tiles
      await shot(page, '09-solar-3d');
    }
  } else {
    await page.locator('#bcRoof').click().catch(e=>log('bcRoof click', e.message));
    await page.waitForTimeout(3500);
    await page.locator('#roofDesign').waitFor({ state:'visible', timeout: 18000 }).catch(e=>log('roofDesign wait', e.message));
    await page.waitForTimeout(12000); // let house render
    await shot(page, '07-roof-design');
    // material chips
    const mats = page.locator('#rdMats button, #rdMats .chip');
    const nMat = await mats.count().catch(()=>0);
    if (nMat > 1) { await mats.nth(1).click().catch(()=>{}); await page.waitForTimeout(2500); await shot(page,'08-roof-material2'); }
    const cols = page.locator('#rdCols button, #rdCols .chip, #rdCols [role=button]');
    const nCol = await cols.count().catch(()=>0);
    if (nCol > 1) { await cols.nth(1).click().catch(()=>{}); await page.waitForTimeout(2500); await shot(page,'09-roof-color2'); }
  }

  await page.waitForTimeout(1000);
  await shot(page, '10-final');
  log('DONE. console errors:', errors.length);
  if (errors.length) console.log(`[${tag}] ERRORS:\n` + errors.slice(0,15).join('\n'));
} catch (e) {
  log('FATAL', e.message);
  await shot(page, '99-fatal');
  if (errors.length) console.log(`[${tag}] ERRORS:\n` + errors.slice(0,15).join('\n'));
} finally {
  await browser.close();
}
