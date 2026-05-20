/**
 * W-TWILIO — visual screenshot spec for the admin Communications page.
 *
 * Captures the empty-state of /admin/crm/communications at desktop
 * (1440x900) and mobile (390x844). Stubs /api/auth/me to satisfy
 * RequirePortal and stubs the Twilio config endpoint to a "not configured"
 * response so we exercise the warning banners + empty list. Stubs the
 * messages/calls endpoints to empty arrays so the page settles cleanly.
 *
 * Run with:
 *   npx playwright test tests/audit/w-twilio-comms-screenshot.spec.ts \
 *     --config audit.config.ts --reporter=line
 */
import { test, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const OUT_DIR = path.join(process.cwd(), 'tests/audit/_screenshots');

test.beforeAll(() => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
});

async function stubAdminApis(page: Page) {
  // Pretend the visitor is an admin so RequirePortal lets us through.
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: 1, email: 'wts.aleksandr@gmail.com', role: 'admin', name: 'Alex' },
      }),
    }),
  );

  // Sidebar makes a few count queries — stub to zero so they don't 404.
  await page.route('**/api/admin/crm/support/tickets/counts', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ open: 0, in_progress: 0, waiting_on_customer: 0 }) }),
  );
  await page.route('**/api/admin/alerts/count', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) }),
  );

  // Twilio "not configured" empty-state — exercises the warning banner.
  await page.route('**/api/admin/twilio/config', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        smsReady: false,
        voiceReady: false,
        fromNumber: null,
        missing: { sms: ['TWILIO_PHONE_NUMBER'], voice: ['TWILIO_APP_SID', 'TWILIO_API_KEY', 'TWILIO_API_KEY_SECRET'] },
      }),
    }),
  );
  await page.route('**/api/admin/twilio/messages**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages: [], hasMore: false }) }),
  );
  await page.route('**/api/admin/twilio/calls**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ calls: [] }) }),
  );
}

async function shootCommsPage(page: Page, name: string) {
  await stubAdminApis(page);
  await page.goto('/admin/crm/communications', { waitUntil: 'networkidle' });
  // Wait for the "Communications" heading to mount — proves the
  // RequirePortal gate cleared and the page rendered (not 404).
  await page.waitForSelector('text=Communications', { timeout: 8000 });
  // Let layout settle + tabs + warning banners paint.
  await page.waitForTimeout(800);
  const filepath = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: false });
  // eslint-disable-next-line no-console
  console.log(`[w-twilio-comms] ${filepath}`);
}

test.describe('W-TWILIO — desktop 1440x900', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('communications page — empty/not-configured state', async ({ page }) => {
    await shootCommsPage(page, 'w-twilio-comms-desktop');
  });
});

test.describe('W-TWILIO — mobile 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('communications page — empty/not-configured state', async ({ page }) => {
    await shootCommsPage(page, 'w-twilio-comms-mobile');
  });
});
