import { chromium } from 'playwright';
const BASE = 'http://localhost:5099';
const DIR = 'C:\\Users\\Owner\\.codex\\wt-preview\\_vr\\';
const out = n => DIR + n;
const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport:{width:412,height:915}, deviceScaleFactor:2, isMobile:true, hasTouch:true,
    userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 7) Mobile' });
  const page = await ctx.newPage();
  const note=(...a)=>console.log(...a);
  await page.goto(BASE + '/wizard', { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(2500);

  // Publish button geometry & what overlaps it
  const pinfo = await page.evaluate(()=>{
    const b = Array.from(document.querySelectorAll('button')).find(x=>/publish/i.test(x.innerText||''));
    if(!b) return null;
    const r=b.getBoundingClientRect();
    const cx=r.left+r.width/2, cy=r.top+r.height/2;
    const top = document.elementFromPoint(cx,cy);
    return { box:{x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)},
             topEl: top? (top.tagName+'.'+(top.className||'').toString().slice(0,40)+' testid='+(top.getAttribute('data-testid')||'')) : 'none',
             isPublish: top===b || b.contains(top) };
  });
  note('PUBLISH BTN (build tab, no sheet):', JSON.stringify(pinfo));

  // click publish directly via JS to bypass overlap, then check overlay
  const opened1 = await page.evaluate(()=>{
    const b = Array.from(document.querySelectorAll('button')).find(x=>/publish/i.test(x.innerText||''));
    b && b.click(); return true;
  });
  await page.waitForTimeout(1200);
  let ov = await page.locator('[data-testid="editor-publish-overlay"]').count();
  note('OVERLAY AFTER JS-CLICK (build tab):', ov);
  if (ov) {
    const t = await page.locator('[data-testid="editor-publish-overlay"]').innerText();
    note('OVERLAY TEXT:\n', t.slice(0,1600));
    note('billed monthly?', /billed monthly/i.test(t), '| one-time?', /one[- ]time/i.test(t), '| monthly?', /monthly/i.test(t));
    await page.screenshot({ path: out('m4-publish-modal.png') });
    note('CLOSE COUNT:', await page.locator('[data-testid="editor-publish-close"]').count());
    await page.locator('[data-testid="editor-publish-close"]').first().click().catch(()=>{});
    await page.waitForTimeout(600);
    note('OVERLAY AFTER CLOSE:', await page.locator('[data-testid="editor-publish-overlay"]').count());
  } else {
    await page.screenshot({ path: out('m4-publish-state.png') });
  }

  // Now test real tap on Publish while Action sheet is OPEN (the failure case)
  await page.locator('[data-testid="editor-tab-action"]').click();
  await page.waitForTimeout(1000);
  const pinfo2 = await page.evaluate(()=>{
    const b = Array.from(document.querySelectorAll('button')).find(x=>/publish/i.test(x.innerText||''));
    if(!b) return null;
    const r=b.getBoundingClientRect(); const cx=r.left+r.width/2, cy=r.top+r.height/2;
    const top=document.elementFromPoint(cx,cy);
    return { visible:r.width>0&&r.height>0, y:Math.round(r.top),
      topEl: top?(top.tagName+' testid='+(top.getAttribute('data-testid')||'')):'none',
      reachable: top===b||b.contains(top) };
  });
  note('PUBLISH BTN (action sheet OPEN):', JSON.stringify(pinfo2));

  // sheet scrollability
  const sheet = await page.evaluate(()=>{
    const p=document.querySelector('[data-testid="editor-tabpanel-action"]');
    if(!p) return null;
    // find nearest scroll container
    let el=p, info=[];
    for(let i=0;i<4&&el;i++){ const s=getComputedStyle(el); info.push({tag:el.tagName, cls:(el.className||'').toString().slice(0,30), oy:s.overflowY, sh:el.scrollHeight, ch:el.clientHeight}); el=el.parentElement; }
    return info;
  });
  note('SHEET SCROLL CHAIN:', JSON.stringify(sheet));
  await page.screenshot({ path: out('m3-action-sheet-recheck.png') });

  await browser.close();
  note('\nDONE');
};
run().catch(e=>{console.error('FATAL',e);process.exit(1);});
