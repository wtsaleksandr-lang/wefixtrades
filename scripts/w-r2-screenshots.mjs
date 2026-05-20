/**
 * Wave R-2 — standalone screenshot script.
 *
 * Renders two representative HTML mockups that mirror the live components
 * (client/src/components/quote-widget/steps/DepositStep.tsx and the
 * "Deposit" fieldset in client/src/components/wizard/elfsight/SettingsTab.tsx)
 * and snapshots them with Playwright. Used as the structural verification
 * artefact for Wave R-2 since the live preview requires a running server
 * + DB (out of scope for this worktree).
 *
 * Output: _screenshots/w-r2-widget.png, _screenshots/w-r2-settings.png
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, '_screenshots');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const widgetHtml = `<!doctype html>
<html><head><meta charset="utf-8"><title>W-R2 widget</title>
<style>
  body { margin:0; padding:32px; background:#f5f7fa; font-family:Inter,system-ui,sans-serif; color:#0f172a; }
  .card { max-width:420px; margin:0 auto; background:#fff; border-radius:16px; padding:28px; box-shadow:0 10px 30px rgba(15,23,42,.08); }
  .title { font-size:20px; font-weight:800; line-height:1.25; letter-spacing:-0.01em; margin:0; display:flex; align-items:center; gap:8px; }
  .sub { margin:6px 0 0; font-size:14px; color:#475569; line-height:1.45; }
  .helptip { display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; border-radius:9999px; background:#e2e8f0; color:#64748b; font-size:11px; font-weight:700; }
  .summary { display:flex; align-items:center; justify-content:space-between; padding:16px 18px; border-radius:14px; border:1px solid #e2e8f0; background:#f8fafc; margin-top:20px; }
  .summary .label { font-size:12px; font-weight:600; color:#475569; text-transform:uppercase; letter-spacing:.04em; }
  .summary .amount { font-size:24px; font-weight:800; color:#0f172a; letter-spacing:-0.01em; }
  .shield { width:26px; height:26px; color:#0d3cfc; }
  .trust { display:flex; align-items:center; gap:8px; font-size:12.5px; color:#475569; margin-top:18px; }
  .pay { width:100%; display:flex; align-items:center; justify-content:center; gap:8px; border-radius:14px; padding:16px 24px; font-size:15px; font-weight:700; color:#fff; background:#0d3cfc; border:none; cursor:pointer; box-shadow:0 6px 16px rgba(13,60,252,.25); margin-top:18px; }
  .skip { background:transparent; border:none; color:#475569; font-size:13px; font-weight:600; padding:10px 12px; cursor:pointer; text-decoration:underline; text-decoration-color:#e2e8f0; text-underline-offset:3px; display:block; margin:8px auto 0; }
  .lock { width:14px; height:14px; }
</style></head>
<body>
  <div class="card" data-testid="widget-deposit-step">
    <h3 class="title">
      Secure your slot with a 15% deposit ($75)
      <span class="helptip" title="Deposit info">i</span>
    </h3>
    <p class="sub">Charged to your card now; the rest is due after the job.</p>

    <div class="summary" data-testid="widget-deposit-amount">
      <div>
        <div class="label">Deposit due now</div>
        <div class="amount">$75</div>
      </div>
      <svg class="shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
    </div>

    <div class="trust">
      <svg class="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      Payment is processed securely by Stripe &mdash; we never see your card details.
    </div>

    <button class="pay" data-testid="widget-deposit-pay">Pay Deposit &rarr;</button>
    <button class="skip" data-testid="widget-deposit-skip">Skip &mdash; pay later</button>
  </div>
</body></html>`;

const settingsHtml = `<!doctype html>
<html><head><meta charset="utf-8"><title>W-R2 settings</title>
<style>
  body { margin:0; padding:24px; background:#f4f6f9; font-family:Inter,system-ui,sans-serif; color:#0f172a; }
  .panel { max-width:480px; margin:0 auto; display:flex; flex-direction:column; gap:18px; }
  fieldset { border:1px solid #e2e8f0; border-radius:12px; padding:14px 14px 16px; background:#fff; margin:0; }
  legend { display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:800; color:#0f172a; padding:0 6px; letter-spacing:-0.005em; }
  .info { display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; border-radius:8px; background:#e2e8f0; color:#64748b; font-size:10px; font-weight:700; }
  label.toggle { display:flex; align-items:flex-start; gap:10px; cursor:pointer; }
  label.toggle input { margin-top:3px; }
  label.toggle .head { font-weight:700; font-size:13px; color:#0f172a; }
  label.toggle .sub { display:block; font-size:12px; color:#64748b; margin-top:2px; line-height:1.4; }
  .row { margin-top:12px; }
  .row > label { display:flex; align-items:center; justify-content:space-between; font-size:12px; font-weight:700; color:#0f172a; margin-bottom:6px; }
  .seg { display:inline-flex; padding:3px; gap:2px; background:#f4f6f9; border:1px solid #e2e8f0; border-radius:10px; }
  .seg button { font:inherit; cursor:pointer; background:transparent; border:none; padding:7px 14px; font-size:12.5px; font-weight:600; color:#64748b; border-radius:7px; }
  .seg button.active { background:#fff; color:#0f172a; box-shadow:0 1px 2px rgba(15,23,42,.08); }
  .float { position:relative; }
  .float input { width:100%; height:48px; padding:18px 14px 6px; border:1px solid #cbd5e1; border-radius:10px; font-size:14px; color:#0f172a; background:#fff; box-sizing:border-box; }
  .float label.in { position:absolute; top:6px; left:14px; font-size:10.5px; font-weight:600; color:#64748b; letter-spacing:.02em; text-transform:uppercase; }
  .float .info-btn { position:absolute; top:8px; right:10px; width:18px; height:18px; border-radius:9999px; background:#e2e8f0; color:#64748b; font-size:11px; font-weight:700; display:inline-flex; align-items:center; justify-content:center; }
  .required-row { display:flex; align-items:flex-start; gap:10px; margin-top:12px; }
  .required-row input { margin-top:3px; }
  .required-row .head { font-weight:700; font-size:12.5px; color:#0f172a; }
  .required-row .sub { display:block; font-size:11.5px; color:#64748b; margin-top:2px; }
</style></head>
<body>
  <section class="panel" data-testid="editor-tabpanel-settings">
    <fieldset data-testid="settings-group-deposit" data-stripe-connected="true">
      <legend>Deposit <span class="info" title="Deposit help">i</span></legend>
      <label class="toggle">
        <input type="checkbox" checked data-testid="settings-deposit-enabled" />
        <span>
          <span class="head">Collect a deposit when customers book</span>
          <span class="sub">Adds a "Secure your slot" step after the quote. Money flows directly to your Stripe account.</span>
        </span>
      </label>

      <div class="row" data-testid="settings-deposit-fields">
        <label>Deposit type</label>
        <div class="seg" role="radiogroup" aria-label="deposit-mode" data-testid="settings-segmented-deposit">
          <button class="active" type="button">Percent (%)</button>
          <button type="button">Fixed ($)</button>
        </div>

        <div class="row">
          <div class="float">
            <input id="qq-settings-deposit-value" type="number" value="15" />
            <label class="in" for="qq-settings-deposit-value">Deposit percentage (%)</label>
            <span class="info-btn">i</span>
          </div>
        </div>

        <div class="row">
          <div class="float">
            <input id="qq-settings-deposit-label" type="text" value="Secure your slot — $75" />
            <label class="in" for="qq-settings-deposit-label">Custom label (optional)</label>
            <span class="info-btn">i</span>
          </div>
        </div>

        <label class="required-row">
          <input type="checkbox" data-testid="settings-deposit-required" />
          <span>
            <span class="head">Require deposit to confirm booking</span>
            <span class="sub">When off, customers can skip and arrange payment with you later.</span>
          </span>
        </label>
      </div>
    </fieldset>
  </section>
</body></html>`;

async function shoot(html, file, viewport) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(200);
  await page.screenshot({ path: file, fullPage: true });
  await browser.close();
  console.log('wrote', file);
}

await shoot(widgetHtml, path.join(OUT_DIR, 'w-r2-widget.png'), { width: 480, height: 720 });
await shoot(settingsHtml, path.join(OUT_DIR, 'w-r2-settings.png'), { width: 540, height: 720 });
