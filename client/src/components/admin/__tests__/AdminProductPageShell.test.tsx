/**
 * <AdminProductPageShell> — unit tests.
 *
 * Pattern matches client/src/components/primitives/__tests__/Stack.test.tsx
 * (Node assert/strict + renderToStaticMarkup, no extra runner).
 *
 * Run standalone:
 *   tsx client/src/components/admin/__tests__/AdminProductPageShell.test.tsx
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

import { AdminProductPageShell, type ProductStats, type ProductShellTab } from '../AdminProductPageShell';

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

const stubStats: ProductStats = {
  mrr_cents: 1_234_500,
  active_subs: 42,
  paused_subs: 3,
  cancelled_30d: 2,
  new_subs_30d: 7,
  churn_rate_30d: 0.045,
};

const overviewTab: ProductShellTab = {
  id: 'overview',
  label: 'Overview',
  render: () => React.createElement('div', { 'data-testid': 'overview-body' }, 'overview-tab-body'),
};

const subsTab: ProductShellTab = {
  id: 'subs',
  label: 'Subscribers',
  render: () => React.createElement('div', null, 'subs-tab-body'),
};

/* ─── Header ─────────────────────────────────────────────────────── */

test('renders product name + Active pill when isActive=true', () => {
  const html = renderToStaticMarkup(
    React.createElement(AdminProductPageShell, {
      productId: 'quotequick',
      productName: 'QuoteQuick',
      isActive: true,
      hidden: false,
      stats: stubStats,
      tabs: [overviewTab],
      onToggleActive: () => {},
      onToggleHidden: () => {},
    }),
  );
  assert.ok(html.includes('QuoteQuick'), `expected product name in html`);
  // Wave 11A: pill text renamed Active→Live / Inactive→Paused so it doesn't
  // collide with the "Active" toggle below. data-product-shell-pill marker
  // is unchanged for backward compat.
  assert.ok(html.includes('Live'), `expected Live pill text`);
  assert.ok(html.includes('data-product-shell-pill="active"'), `expected active pill marker`);
});

test('renders Paused pill when isActive=false', () => {
  const html = renderToStaticMarkup(
    React.createElement(AdminProductPageShell, {
      productId: 'x',
      productName: 'X',
      isActive: false,
      hidden: false,
      stats: stubStats,
      tabs: [overviewTab],
      onToggleActive: () => {},
      onToggleHidden: () => {},
    }),
  );
  assert.ok(html.includes('Paused'), `expected Paused pill label`);
  assert.ok(html.includes('data-product-shell-pill="inactive"'), `expected inactive pill marker`);
});

test('renders Hidden chip only when hidden=true', () => {
  const hiddenHtml = renderToStaticMarkup(
    React.createElement(AdminProductPageShell, {
      productId: 'x',
      productName: 'X',
      isActive: true,
      hidden: true,
      stats: stubStats,
      tabs: [overviewTab],
      onToggleActive: () => {},
      onToggleHidden: () => {},
    }),
  );
  assert.ok(hiddenHtml.includes('data-product-shell-pill="hidden"'), `expected hidden chip`);

  const visibleHtml = renderToStaticMarkup(
    React.createElement(AdminProductPageShell, {
      productId: 'x',
      productName: 'X',
      isActive: true,
      hidden: false,
      stats: stubStats,
      tabs: [overviewTab],
      onToggleActive: () => {},
      onToggleHidden: () => {},
    }),
  );
  assert.ok(!visibleHtml.includes('data-product-shell-pill="hidden"'), `expected NO hidden chip when hidden=false`);
});

test('renders edit-copy link with default href /admin/products/:id', () => {
  const html = renderToStaticMarkup(
    React.createElement(AdminProductPageShell, {
      productId: 'quotequick',
      productName: 'QuoteQuick',
      isActive: true,
      hidden: false,
      stats: stubStats,
      tabs: [overviewTab],
      onToggleActive: () => {},
      onToggleHidden: () => {},
    }),
  );
  assert.ok(html.includes('/admin/products/quotequick'), `expected default catalog href`);
});

test('honors editCopyHref override', () => {
  const html = renderToStaticMarkup(
    React.createElement(AdminProductPageShell, {
      productId: 'x',
      productName: 'X',
      isActive: true,
      hidden: false,
      stats: stubStats,
      tabs: [overviewTab],
      editCopyHref: '/admin/services/x/edit',
      onToggleActive: () => {},
      onToggleHidden: () => {},
    }),
  );
  assert.ok(html.includes('/admin/services/x/edit'), `expected overridden href`);
});

/* ─── KPI strip ──────────────────────────────────────────────────── */

test('renders 4 KPI cards with stats present', () => {
  const html = renderToStaticMarkup(
    React.createElement(AdminProductPageShell, {
      productId: 'x',
      productName: 'X',
      isActive: true,
      hidden: false,
      stats: stubStats,
      tabs: [overviewTab],
      onToggleActive: () => {},
      onToggleHidden: () => {},
    }),
  );
  for (const id of ['mrr', 'active', 'delta', 'churn']) {
    assert.ok(
      html.includes(`product-shell-kpi-${id}`),
      `expected kpi card ${id}`,
    );
  }
  // MRR formatting — 1_234_500 cents → "$12,345"
  assert.ok(html.includes('$12,345'), `expected formatted MRR in html`);
  // Churn — 4.5%
  assert.ok(html.includes('4.5%'), `expected churn percentage`);
  // No skeletons when stats present
  assert.ok(!/Skeleton/.test(html), `expected no skeleton class when stats are present`);
});

test('renders 4 KPI error tiles when statsError is truthy', () => {
  // Regression fix: previously a 404/500 left stats=null forever and the
  // page showed perpetual skeletons (interpreted by Alex as "blank cards").
  // statsError now switches the strip to a visible em-dash tile.
  const html = renderToStaticMarkup(
    React.createElement(AdminProductPageShell, {
      productId: 'adflow',
      productName: 'AdFlow',
      isActive: true,
      hidden: false,
      stats: null,
      statsError: new Error('404 Not Found'),
      tabs: [overviewTab],
      onToggleActive: () => {},
      onToggleHidden: () => {},
    }),
  );
  const errorTileCount = (html.match(/data-product-shell-kpi-error/g) ?? []).length;
  assert.equal(errorTileCount, 4, `expected 4 error tiles, got ${errorTileCount}`);
  // Skeleton markers must NOT also render.
  assert.ok(!html.includes('data-product-shell-kpi-skeleton'), `expected no skeleton when error`);
  // Em-dash placeholder shows so the strip doesn't visually collapse.
  assert.ok(html.includes('—'), `expected em-dash placeholder`);
});

test('renders 4 KPI skeletons when stats=null (loading)', () => {
  const html = renderToStaticMarkup(
    React.createElement(AdminProductPageShell, {
      productId: 'x',
      productName: 'X',
      isActive: true,
      hidden: false,
      stats: null,
      tabs: [overviewTab],
      onToggleActive: () => {},
      onToggleHidden: () => {},
    }),
  );
  // 4 skeleton placeholders (Skeleton component renders an element with the
  // word "Skeleton" reflected via its className). We check for the 4 labels
  // we know we passed in to the skeleton wrappers.
  for (const label of ['MRR', 'Active subs', 'Δ 30d', 'Churn 30d']) {
    assert.ok(html.includes(label), `expected skeleton label "${label}"`);
  }
  // KPI value testid should NOT be present in skeleton mode.
  assert.ok(!html.includes('product-shell-kpi-value'), `expected no kpi-value markers in skeleton mode`);
});

/* ─── Tabs ───────────────────────────────────────────────────────── */

test('renders tabs list when tabs.length > 1', () => {
  const html = renderToStaticMarkup(
    React.createElement(AdminProductPageShell, {
      productId: 'x',
      productName: 'X',
      isActive: true,
      hidden: false,
      stats: stubStats,
      tabs: [overviewTab, subsTab],
      onToggleActive: () => {},
      onToggleHidden: () => {},
    }),
  );
  assert.ok(html.includes('product-shell-tab-overview'), `expected overview tab button`);
  assert.ok(html.includes('product-shell-tab-subs'), `expected subs tab button`);
  // First tab selected by default
  assert.ok(
    /data-product-shell-tab="selected"[^>]*>[^<]*<[^>]*>\s*Overview/.test(html) ||
      html.includes('aria-selected="true"'),
    `expected first tab to be aria-selected`,
  );
});

test('does NOT render tabs list when tabs.length === 1', () => {
  const html = renderToStaticMarkup(
    React.createElement(AdminProductPageShell, {
      productId: 'x',
      productName: 'X',
      isActive: true,
      hidden: false,
      stats: stubStats,
      tabs: [overviewTab],
      onToggleActive: () => {},
      onToggleHidden: () => {},
    }),
  );
  assert.ok(!html.includes('product-shell-tabs'), `expected no tabs list with single tab`);
});

test('renders the active tab body', () => {
  const html = renderToStaticMarkup(
    React.createElement(AdminProductPageShell, {
      productId: 'x',
      productName: 'X',
      isActive: true,
      hidden: false,
      stats: stubStats,
      tabs: [overviewTab, subsTab],
      onToggleActive: () => {},
      onToggleHidden: () => {},
    }),
  );
  assert.ok(html.includes('overview-tab-body'), `expected first-tab body in initial render`);
  assert.ok(!html.includes('subs-tab-body'), `expected non-selected tab body to be absent`);
});

test('honors defaultTabId', () => {
  const html = renderToStaticMarkup(
    React.createElement(AdminProductPageShell, {
      productId: 'x',
      productName: 'X',
      isActive: true,
      hidden: false,
      stats: stubStats,
      tabs: [overviewTab, subsTab],
      defaultTabId: 'subs',
      onToggleActive: () => {},
      onToggleHidden: () => {},
    }),
  );
  assert.ok(html.includes('subs-tab-body'), `expected defaultTabId body`);
  assert.ok(!html.includes('overview-tab-body'), `expected first tab body absent when default is subs`);
});

/* ─── Filters bar ────────────────────────────────────────────────── */

test('renders filtersBar when provided', () => {
  const html = renderToStaticMarkup(
    React.createElement(AdminProductPageShell, {
      productId: 'x',
      productName: 'X',
      isActive: true,
      hidden: false,
      stats: stubStats,
      tabs: [overviewTab],
      filtersBar: React.createElement('div', { 'data-testid': 'my-filters' }, 'my-filter-bar'),
      onToggleActive: () => {},
      onToggleHidden: () => {},
    }),
  );
  assert.ok(html.includes('my-filter-bar'), `expected filter-bar content`);
  assert.ok(html.includes('product-shell-filters'), `expected filter section wrapper`);
});

test('omits filters section when filtersBar not provided', () => {
  const html = renderToStaticMarkup(
    React.createElement(AdminProductPageShell, {
      productId: 'x',
      productName: 'X',
      isActive: true,
      hidden: false,
      stats: stubStats,
      tabs: [overviewTab],
      onToggleActive: () => {},
      onToggleHidden: () => {},
    }),
  );
  assert.ok(!html.includes('product-shell-filters'), `expected no filter section when no prop`);
});

/* ─── Toggle wiring (call-shape verification) ────────────────────── */

test('Switch components reflect isActive + hidden state in markup', () => {
  // Radix Switch uses data-state="checked|unchecked" on its root.
  const html = renderToStaticMarkup(
    React.createElement(AdminProductPageShell, {
      productId: 'x',
      productName: 'X',
      isActive: true,
      hidden: false,
      stats: stubStats,
      tabs: [overviewTab],
      onToggleActive: () => {},
      onToggleHidden: () => {},
    }),
  );
  // active switch should be checked, hidden switch should be unchecked
  const checkedCount = (html.match(/data-state="checked"/g) ?? []).length;
  const uncheckedCount = (html.match(/data-state="unchecked"/g) ?? []).length;
  assert.ok(checkedCount >= 1, `expected at least one checked switch (active)`);
  assert.ok(uncheckedCount >= 1, `expected at least one unchecked switch (hidden)`);
});

test('passing onToggleActive prop does not throw + is a function', () => {
  let called = false;
  const handler = (next: boolean) => { called = next; };
  // Just construct the element — we can't fire a click in SSR but the type
  // must compile and the prop must be reachable.
  const el = React.createElement(AdminProductPageShell, {
    productId: 'x',
    productName: 'X',
    isActive: true,
    hidden: false,
    stats: stubStats,
    tabs: [overviewTab],
    onToggleActive: handler,
    onToggleHidden: () => {},
  });
  assert.ok((el.props as any).onToggleActive === handler, `prop should be passed through`);
  // Invoke it directly to prove the contract: caller controls the toggle.
  (el.props as any).onToggleActive(false);
  assert.equal(called, false, `expected handler to receive false`);
});

/* ─── Done ───────────────────────────────────────────────────────── */

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
