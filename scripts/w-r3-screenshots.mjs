/**
 * Wave R3 — static-HTML Playwright screenshots.
 *
 * Spins up Chromium against an inline HTML payload that mirrors the
 * rendered UI for the two key surfaces:
 *   1. The "Save + share this quote" modal (price-reveal step UX)
 *   2. The /q/:slug public viewer page
 *
 * Static fixtures are used here because the dev server isn't available
 * in the worktree sandbox — sibling worktrees (W-R1 / W-R2) followed
 * the same approach. Output: _screenshots/w-r3-*.png
 */

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '..', '_screenshots');
mkdirSync(outDir, { recursive: true });

const shareModalHtml = `
<!doctype html><html><head><meta charset="utf-8"><title>R3 share modal</title>
<style>
  body { margin:0; padding:0; font-family: "Inter", system-ui, sans-serif;
         background: rgba(15,23,42,0.5); min-height: 100vh; }
  .card { background:#fff; border-radius:1.5em; max-width:460px; width:calc(100% - 32px);
          margin:60px auto; padding:24px; box-shadow:0 12px 40px rgba(15,23,42,0.18); color:#0f172a; }
  .row { display:flex; justify-content:space-between; gap:12px; margin-bottom:14px; }
  .title { font-size:17px; font-weight:700; margin:0 0 4px; }
  .sub { font-size:13px; color:#5b6573; margin:0; line-height:1.5; }
  .close { background:transparent; border:none; cursor:pointer; padding:4px; color:#5b6573; }
  .url-row { display:flex; gap:8px; align-items:stretch; border:1px solid #e1e7ef;
             border-radius:0.75em; padding:4px 4px 4px 12px; background:#f7f9fc; }
  .url-row input { flex:1; border:none; background:transparent; font-size:13px;
                   font-family: "SF Mono", "Menlo", monospace; color:#0f172a; outline:none; min-width:0; }
  .copy-btn { display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:700;
              color:#fff; background:#0d3cfc; border:none; border-radius:0.5em;
              padding:8px 14px; cursor:pointer; }
  .intents { display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; margin-top:14px; }
  .intent { display:inline-flex; align-items:center; justify-content:center; gap:6px;
            font-size:13px; font-weight:600; color:#0f172a; background:#fff;
            border:1px solid #e1e7ef; border-radius:0.75em; padding:10px 8px;
            text-decoration:none; }
  .tip { font-size:12px; color:#94a3b8; margin:14px 0 0; line-height:1.5; }
</style></head>
<body>
  <div class="card">
    <div class="row">
      <div>
        <p class="title">Your shareable quote link</p>
        <p class="sub">Send it to your customer — they can revisit it any time.
          You can edit the values later from the same link on this device.</p>
      </div>
      <button class="close">✕</button>
    </div>
    <div class="url-row">
      <input value="https://aplus-painters.your-quote.net/q/k3p1xq8z" readonly />
      <button class="copy-btn">⧉ Copy</button>
    </div>
    <div class="intents">
      <a class="intent" href="#">💬 SMS</a>
      <a class="intent" href="#">💬 WhatsApp</a>
      <a class="intent" href="#">✉ Email</a>
    </div>
    <p class="tip">Tip: bookmark this link on your phone so you can pull it up for your customer later.</p>
  </div>
</body></html>
`;

const publicViewHtml = `
<!doctype html><html><head><meta charset="utf-8"><title>R3 public viewer</title>
<style>
  body { margin:0; padding:0; font-family: "Inter", system-ui, sans-serif;
         background:#eef1f6; min-height: 100vh; color:#0f172a; }
  .wrap { max-width:640px; margin:0 auto; padding:40px 20px 20px; }
  .header { display:flex; align-items:center; gap:14px; margin-bottom:24px; }
  .logo { height:44px; width:44px; border-radius:0.75em; background:#0d3cfc;
          color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:18px; }
  .biz { font-size:17px; font-weight:700; margin:0; line-height:1.25; }
  .tag { font-size:13px; color:#5b6573; margin:2px 0 0; line-height:1.4; }
  .card { background:#fff; border-radius:1.5em; border:1px solid #e1e7ef;
          box-shadow:0 12px 40px rgba(15,23,42,0.08); padding:28px 24px; }
  .label { font-size:12px; font-weight:600; color:#5b6573;
           text-transform:uppercase; letter-spacing:.04em; margin:0 0 6px; }
  .total { font-size:36px; font-weight:800; margin:0;
           font-family:"SF Mono", monospace; line-height:1; letter-spacing:-.02em; }
  .saved { font-size:12px; color:#94a3b8; margin:8px 0 0; }
  .edit-btn { display:inline-flex; align-items:center; gap:6px;
              font-size:13px; font-weight:600; color:#0d3cfc;
              background:rgba(13,60,252,0.08); border:1px solid rgba(13,60,252,0.2);
              border-radius:0.75em; padding:8px 12px; cursor:pointer; }
  .head-row { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:18px; }
  .breakdown { border-top:1px solid #e1e7ef; padding-top:14px;
               display:flex; flex-direction:column; gap:10px; }
  .line { display:flex; justify-content:space-between; align-items:center; gap:12px; }
  .line .lbl { font-size:14px; color:#5b6573; flex:1 1 auto; }
  .line .amt { font-weight:600; color:#0f172a;
               font-family:"SF Mono", monospace; font-size:14px; }
  .note { font-size:13px; color:#5b6573; text-align:center; margin:18px 0 0; line-height:1.5; }
  .footer { display:flex; justify-content:center; margin-top:32px; padding-top:20px;
            border-top:1px solid #e1e7ef; font-size:12px; color:#5b6573; }
</style></head>
<body>
  <div class="wrap">
    <div class="header">
      <div class="logo">A+</div>
      <div>
        <p class="biz">A+ Painters of Toronto</p>
        <p class="tag">Interior & exterior painting since 2014</p>
      </div>
    </div>
    <div class="card">
      <div class="head-row">
        <div>
          <p class="label">Your Estimate</p>
          <p class="total">$2,840.00</p>
          <p class="saved">Saved May 20, 2026</p>
        </div>
        <button class="edit-btn">✎ Edit values</button>
      </div>
      <div class="breakdown">
        <div class="line"><span class="lbl">Wall area · 1,200 sq ft</span><span class="amt">$1,800.00</span></div>
        <div class="line"><span class="lbl">Trim & doors (3 rooms)</span><span class="amt">$640.00</span></div>
        <div class="line"><span class="lbl">Premium paint upgrade</span><span class="amt">$400.00</span></div>
      </div>
    </div>
    <p class="note">This is your saved quote. The contractor can update values; refresh to see changes.</p>
    <div class="footer">QuoteQuick by WeFixTrades — get your own free quoting widget →</div>
  </div>
</body></html>
`;

async function shoot(html, file, viewport) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: file, fullPage: false });
  await browser.close();
  console.log('wrote', file);
}

await shoot(shareModalHtml, resolve(outDir, 'w-r3-share-modal.png'), { width: 520, height: 480 });
await shoot(publicViewHtml, resolve(outDir, 'w-r3-public-view.png'), { width: 720, height: 560 });
