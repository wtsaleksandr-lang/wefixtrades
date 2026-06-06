import { chromium } from 'playwright';
const URL = 'http://localhost:5099/wizard?template=driveway_paving';
const OUT = '_audit/waveB';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
async function dismiss(){ const b=page.locator('[data-testid="lead-modal-backdrop"]'); if(await b.count()&&await b.isVisible().catch(()=>false)){await page.keyboard.press('Escape');await page.waitForTimeout(200);} }
async function tab(t){await dismiss();await page.locator(`[data-testid="editor-tabs"] [data-testid="editor-tab-${t}"]`).click();await page.waitForTimeout(300);}

// Install a MutationObserver that records any element that ever gets qq-edit-highlight
async function armObserver(){
  await page.evaluate(()=>{
    window.__hl = [];
    const o = new MutationObserver((muts)=>{
      for(const m of muts){
        if(m.type==='attributes' && m.target.classList && m.target.classList.contains('qq-edit-highlight')){
          window.__hl.push(m.target.getAttribute('data-testid')||m.target.getAttribute('data-edit-key')||m.target.className.slice(0,60));
        }
      }
    });
    o.observe(document.body,{attributes:true,subtree:true,attributeFilter:['class']});
    window.__hlObs=o;
  });
}
async function readObs(){ return await page.evaluate(()=>window.__hl||[]); }

// TRUST
await tab('build'); await armObserver();
await page.locator('[data-testid="trust-badge-row"]').click();
await page.waitForTimeout(900);
console.log('anchor trust-badges exists:', await page.locator('[data-edit-key="trust-badges"]').count());
console.log('trust highlight events:', JSON.stringify(await readObs()));
await page.screenshot({ path: `${OUT}/f2-06b-trust-highlight.png` });

// TIER
await tab('build'); await armObserver();
await page.locator('[data-testid="tier-card-1"]').click();
await page.waitForTimeout(900);
console.log('anchor tiered exists:', await page.locator('[data-edit-key="tiered"]').count());
console.log('tier highlight events:', JSON.stringify(await readObs()));
await page.screenshot({ path: `${OUT}/f2-07b-tier-highlight.png` });

await browser.close();
