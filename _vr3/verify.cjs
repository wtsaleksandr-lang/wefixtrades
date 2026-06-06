const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const DIR = 'C:/Users/Owner/.codex/wt-preview/_vr3';
const URL = 'http://localhost:5099/wizard';

const TABS = {
  style: {
    tab: 'editor-tab-style', panel: 'editor-tabpanel-style',
    core: ['style-group-theme','style-group-typography','style-group-colours'],
    adv:  ['style-group-layout','style-group-shape','style-group-branding','style-group-brand-kit','style-group-brand-studio','style-group-button-copy','style-group-trust-badges','style-group-floating-launcher'],
  },
  settings: {
    tab: 'editor-tab-settings', panel: 'editor-tabpanel-settings',
    core: ['settings-group-numberformat'],
    adv:  ['settings-group-pricing','settings-group-deposit','settings-group-scheduling','settings-group-brand-badge','settings-group-trade','settings-group-business-profile'],
  },
};

async function vis(scope, tid) {
  const loc = scope.locator(`[data-testid="${tid}"]`);
  const count = await loc.count();
  if (count === 0) return { count: 0, visible: false };
  let visible = false;
  try { visible = await loc.first().isVisible(); } catch (e) {}
  return { count, visible };
}

async function run() {
  const browser = await chromium.launch();
  const results = [];

  for (const profile of ['desktop','mobile']) {
    const ctxOpts = profile === 'desktop'
      ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }
      : { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

    for (const [tabName, cfg] of Object.entries(TABS)) {
      const ctx = await browser.newContext(ctxOpts);
      const page = await ctx.newPage();
      const consoleErrors = [];
      page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
      page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + e.message));

      const r = { profile, tab: tabName, core: {}, advCollapsed: {}, advExpanded: {}, notes: [], console: [] };

      await page.goto(URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);

      const tabEl = page.locator(`[data-testid="${cfg.tab}"]`);
      if (await tabEl.count() === 0) { r.notes.push(`TAB NOT FOUND: ${cfg.tab}`); results.push(r); await ctx.close(); continue; }
      await tabEl.first().dispatchEvent('click');
      await page.waitForTimeout(900);

      const panelEl = page.locator(`[data-testid="${cfg.panel}"]`);
      r.panelExists = await panelEl.count() > 0;

      await page.screenshot({ path: path.join(DIR, `${profile}-${tabName}-collapsed.png`) });
      if (r.panelExists) { try { await panelEl.first().screenshot({ path: path.join(DIR, `${profile}-${tabName}-collapsed-panel.png`) }); } catch(e){ r.notes.push('panel shot fail: '+e.message);} }

      for (const t of cfg.core) r.core[t] = await vis(page, t);
      for (const t of cfg.adv)  r.advCollapsed[t] = await vis(page, t);

      const dupes = {};
      for (const t of [...cfg.core, ...cfg.adv]) {
        const c = await page.locator(`[data-testid="${t}"]`).count();
        if (c > 1) dupes[t] = c;
      }
      if (Object.keys(dupes).length) r.notes.push('DUPLICATES: ' + JSON.stringify(dupes));

      const label = page.locator('.qq-adv-toggle-label');
      let toggleFound = false;
      if (await label.count() > 0) {
        const btn = page.locator('.qq-adv-toggle, button:has(.qq-adv-toggle-label), [role="button"]:has(.qq-adv-toggle-label)');
        let target = (await btn.count() > 0) ? btn.first() : label.first();
        try {
          await target.scrollIntoViewIfNeeded();
          await target.dispatchEvent('click');
          toggleFound = true;
          await page.waitForTimeout(900);
        } catch (e) { r.notes.push('toggle click fail: ' + e.message); }
      } else {
        r.notes.push('ADVANCED TOGGLE LABEL NOT FOUND');
      }
      r.toggleFound = toggleFound;

      await page.screenshot({ path: path.join(DIR, `${profile}-${tabName}-expanded.png`) });
      if (r.panelExists) { try { await panelEl.first().screenshot({ path: path.join(DIR, `${profile}-${tabName}-expanded-panel.png`) }); } catch(e){} }

      for (const t of cfg.adv) r.advExpanded[t] = await vis(page, t);

      r.console = [...consoleErrors];
      results.push(r);
      await ctx.close();
    }
  }

  await browser.close();
  fs.writeFileSync(path.join(DIR, 'results.json'), JSON.stringify(results, null, 2));

  for (const r of results) {
    console.log(`\n===== ${r.profile.toUpperCase()} / ${r.tab.toUpperCase()} =====`);
    console.log('panelExists:', r.panelExists, '| toggleFound:', r.toggleFound);
    console.log('-- CORE (expect visible) --');
    for (const [t,v] of Object.entries(r.core)) console.log(`  ${t}: count=${v.count} visible=${v.visible}`);
    console.log('-- ADV when COLLAPSED (expect hidden) --');
    for (const [t,v] of Object.entries(r.advCollapsed)) console.log(`  ${t}: count=${v.count} visible=${v.visible}`);
    console.log('-- ADV when EXPANDED (expect visible) --');
    for (const [t,v] of Object.entries(r.advExpanded)) console.log(`  ${t}: count=${v.count} visible=${v.visible}`);
    if (r.notes.length) console.log('NOTES:', r.notes.join(' | '));
    console.log('CONSOLE ERRORS:', r.console.length ? r.console.slice(0,8).join(' || ') : 'none');
  }
}

run().catch(e => { console.error('FATAL', e); process.exit(1); });
