/**
 * <PortalProductPageShell> — unit tests.
 *
 * Pattern matches AdminProductPageShell.test.tsx — Node assert/strict +
 * renderToStaticMarkup, no extra runner.
 *
 * Run standalone:
 *   tsx client/src/components/portal/PortalProductPageShell.test.tsx
 */
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Wouter's <Link> reads `location` to compute its href context. In Node SSR
// `location` is undefined; provide a minimal stub before importing the shell.
const g = globalThis as any;
if (typeof g.location === 'undefined') {
  g.location = { pathname: '/', search: '', hash: '', href: 'http://localhost/' };
}
if (typeof g.history === 'undefined') {
  g.history = { pushState: () => {}, replaceState: () => {}, state: null };
}
if (typeof g.addEventListener === 'undefined') {
  g.addEventListener = () => {};
  g.removeEventListener = () => {};
}

import {
  PortalProductPageShell,
  type ProductPortalStats,
  type PortalShellTab,
} from './PortalProductPageShell';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    // eslint-disable-next-line no-console
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    // eslint-disable-next-line no-console
    console.error(`  FAIL ${name}\n       ${(err as Error).message}`);
  }
}

const stubStats: ProductPortalStats = {
  primary: { label: 'Leads', value: 142, hint: 'Total leads this month' },
  secondary: { label: 'Response rate', value: 87, suffix: '%' },
  tertiary: { label: 'Avg position', value: '4.2' },
  quaternary: { label: 'Pages indexed', value: 56 },
};

const overviewTab: PortalShellTab = {
  id: 'overview',
  label: 'Overview',
  render: () => React.createElement('div', { 'data-testid': 'overview-body' }, 'overview-tab-body'),
};

const settingsTab: PortalShellTab = {
  id: 'settings',
  label: 'Settings',
  render: () => React.createElement('div', null, 'settings-tab-body'),
};

/* ─── Header ─────────────────────────────────────────────────────── */

test('renders product name in header', () => {
  const html = renderToStaticMarkup(
    React.createElement(PortalProductPageShell, {
      productId: 'rankflow',
      productName: 'RankFlow SEO',
      planTier: 'pro',
      stats: stubStats,
      tabs: [overviewTab],
    }),
  );
  assert.ok(html.includes('RankFlow SEO'), `expected product name in html`);
});

test('renders plan-tier pill when planTier is set', () => {
  const html = renderToStaticMarkup(
    React.createElement(PortalProductPageShell, {
      productId: 'x',
      productName: 'X',
      planTier: 'pro',
      stats: stubStats,
      tabs: [overviewTab],
    }),
  );
  assert.ok(html.includes('data-portal-shell-pill="pro"'), `expected pro tier pill`);
  assert.ok(html.includes('pro plan'), `expected pill label`);
});

test('omits plan-tier pill when planTier is null', () => {
  const html = renderToStaticMarkup(
    React.createElement(PortalProductPageShell, {
      productId: 'x',
      productName: 'X',
      planTier: null,
      stats: stubStats,
      tabs: [overviewTab],
    }),
  );
  assert.ok(!html.includes('data-portal-shell-pill'), `expected no plan pill when null`);
});

test('shows Upgrade CTA when planTier=free + upgradeCtaHref set', () => {
  const html = renderToStaticMarkup(
    React.createElement(PortalProductPageShell, {
      productId: 'x',
      productName: 'X',
      planTier: 'free',
      upgradeCtaHref: '/portal/billing',
      stats: stubStats,
      tabs: [overviewTab],
    }),
  );
  assert.ok(html.includes('portal-shell-upgrade-cta'), `expected upgrade CTA on free tier`);
  assert.ok(html.includes('/portal/billing'), `expected upgrade href`);
});

test('hides Upgrade CTA when planTier is pro/business/enterprise', () => {
  for (const tier of ['pro', 'business', 'enterprise'] as const) {
    const html = renderToStaticMarkup(
      React.createElement(PortalProductPageShell, {
        productId: 'x',
        productName: 'X',
        planTier: tier,
        upgradeCtaHref: '/portal/billing',
        stats: stubStats,
        tabs: [overviewTab],
      }),
    );
    assert.ok(!html.includes('portal-shell-upgrade-cta'), `expected NO upgrade CTA on ${tier} tier`);
  }
});

test('renders admin deep-link when adminLinkHref is set', () => {
  const html = renderToStaticMarkup(
    React.createElement(PortalProductPageShell, {
      productId: 'rankflow',
      productName: 'RankFlow',
      planTier: 'pro',
      adminLinkHref: '/admin/products/rankflow',
      stats: stubStats,
      tabs: [overviewTab],
    }),
  );
  assert.ok(html.includes('portal-shell-admin-link'), `expected admin link marker`);
  assert.ok(html.includes('/admin/products/rankflow'), `expected admin href`);
});

test('omits admin deep-link when adminLinkHref absent', () => {
  const html = renderToStaticMarkup(
    React.createElement(PortalProductPageShell, {
      productId: 'x',
      productName: 'X',
      planTier: 'pro',
      stats: stubStats,
      tabs: [overviewTab],
    }),
  );
  assert.ok(!html.includes('portal-shell-admin-link'), `expected no admin link marker`);
});

/* ─── KPI strip ──────────────────────────────────────────────────── */

test('renders all provided stat slots', () => {
  const html = renderToStaticMarkup(
    React.createElement(PortalProductPageShell, {
      productId: 'x',
      productName: 'X',
      planTier: 'pro',
      stats: stubStats,
      tabs: [overviewTab],
    }),
  );
  assert.ok(html.includes('Leads'), `expected primary label`);
  assert.ok(html.includes('Response rate'), `expected secondary label`);
  assert.ok(html.includes('Avg position'), `expected tertiary label`);
  assert.ok(html.includes('Pages indexed'), `expected quaternary label`);
  for (const i of [0, 1, 2, 3]) {
    assert.ok(html.includes(`portal-shell-kpi-${i}`), `expected kpi slot ${i}`);
  }
});

test('renders only primary slot when others omitted', () => {
  const html = renderToStaticMarkup(
    React.createElement(PortalProductPageShell, {
      productId: 'x',
      productName: 'X',
      planTier: 'pro',
      stats: { primary: { label: 'Leads', value: 5 } },
      tabs: [overviewTab],
    }),
  );
  assert.ok(html.includes('portal-shell-kpi-0'), `expected primary kpi`);
  assert.ok(!html.includes('portal-shell-kpi-1'), `expected no secondary kpi`);
});

test('renders 4 KPI skeletons when stats=null (loading)', () => {
  const html = renderToStaticMarkup(
    React.createElement(PortalProductPageShell, {
      productId: 'x',
      productName: 'X',
      planTier: 'pro',
      stats: null,
      tabs: [overviewTab],
    }),
  );
  const skeletons = (html.match(/data-portal-shell-kpi-skeleton/g) ?? []).length;
  assert.equal(skeletons, 4, `expected 4 skeletons in loading state, got ${skeletons}`);
  assert.ok(!html.includes('portal-shell-kpi-value'), `expected no kpi value markers when loading`);
});

test('renders suffix next to numeric value', () => {
  const html = renderToStaticMarkup(
    React.createElement(PortalProductPageShell, {
      productId: 'x',
      productName: 'X',
      planTier: 'pro',
      stats: { primary: { label: 'Response rate', value: 87, suffix: '%' } },
      tabs: [overviewTab],
    }),
  );
  assert.ok(html.includes('%'), `expected suffix in rendered KPI`);
});

/* ─── Setup banner ───────────────────────────────────────────────── */

test('renders setupBanner above KPI strip when provided', () => {
  const banner = React.createElement('div', null, 'finish-setup-banner-content');
  const html = renderToStaticMarkup(
    React.createElement(PortalProductPageShell, {
      productId: 'x',
      productName: 'X',
      planTier: 'pro',
      stats: stubStats,
      setupBanner: banner,
      tabs: [overviewTab],
    }),
  );
  assert.ok(html.includes('finish-setup-banner-content'), `expected banner content`);
  assert.ok(html.includes('portal-shell-setup-banner'), `expected banner section marker`);
});

test('omits setupBanner section when not provided', () => {
  const html = renderToStaticMarkup(
    React.createElement(PortalProductPageShell, {
      productId: 'x',
      productName: 'X',
      planTier: 'pro',
      stats: stubStats,
      tabs: [overviewTab],
    }),
  );
  assert.ok(!html.includes('portal-shell-setup-banner'), `expected no banner section`);
});

/* ─── Tabs ───────────────────────────────────────────────────────── */

test('renders tabs list when tabs.length > 1', () => {
  const html = renderToStaticMarkup(
    React.createElement(PortalProductPageShell, {
      productId: 'x',
      productName: 'X',
      planTier: 'pro',
      stats: stubStats,
      tabs: [overviewTab, settingsTab],
    }),
  );
  assert.ok(html.includes('portal-shell-tab-overview'), `expected overview tab`);
  assert.ok(html.includes('portal-shell-tab-settings'), `expected settings tab`);
  assert.ok(html.includes('aria-selected="true"'), `expected one tab to be aria-selected`);
});

test('does NOT render tabs list when tabs.length === 1', () => {
  const html = renderToStaticMarkup(
    React.createElement(PortalProductPageShell, {
      productId: 'x',
      productName: 'X',
      planTier: 'pro',
      stats: stubStats,
      tabs: [overviewTab],
    }),
  );
  assert.ok(!html.includes('portal-shell-tabs'), `expected no tabs list with single tab`);
});

test('renders the default-selected tab body', () => {
  const html = renderToStaticMarkup(
    React.createElement(PortalProductPageShell, {
      productId: 'x',
      productName: 'X',
      planTier: 'pro',
      stats: stubStats,
      tabs: [overviewTab, settingsTab],
    }),
  );
  assert.ok(html.includes('overview-tab-body'), `expected first-tab body`);
  assert.ok(!html.includes('settings-tab-body'), `expected non-selected tab body absent`);
});

test('honors defaultTabId', () => {
  const html = renderToStaticMarkup(
    React.createElement(PortalProductPageShell, {
      productId: 'x',
      productName: 'X',
      planTier: 'pro',
      stats: stubStats,
      tabs: [overviewTab, settingsTab],
      defaultTabId: 'settings',
    }),
  );
  assert.ok(html.includes('settings-tab-body'), `expected defaultTabId body`);
  assert.ok(!html.includes('overview-tab-body'), `expected overview body absent`);
});

/* ─── Filters bar ────────────────────────────────────────────────── */

test('renders filtersBar when provided', () => {
  const html = renderToStaticMarkup(
    React.createElement(PortalProductPageShell, {
      productId: 'x',
      productName: 'X',
      planTier: 'pro',
      stats: stubStats,
      filtersBar: React.createElement('div', null, 'my-filter-bar'),
      tabs: [overviewTab],
    }),
  );
  assert.ok(html.includes('my-filter-bar'), `expected filter-bar content`);
  assert.ok(html.includes('portal-shell-filters'), `expected filter section wrapper`);
});

test('omits filters section when filtersBar not provided', () => {
  const html = renderToStaticMarkup(
    React.createElement(PortalProductPageShell, {
      productId: 'x',
      productName: 'X',
      planTier: 'pro',
      stats: stubStats,
      tabs: [overviewTab],
    }),
  );
  assert.ok(!html.includes('portal-shell-filters'), `expected no filter section when no prop`);
});

/* ─── Done ───────────────────────────────────────────────────────── */

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
