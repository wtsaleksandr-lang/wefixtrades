/**
 * <FirstVisitTooltip> — SSR smoke tests.
 *
 * Mirrors the project pattern (PortalProductPageShell.test.tsx): node:assert/strict
 * + react-dom/server. Interaction (dismiss click flow + localStorage round-trip)
 * is exercised in Playwright; here we verify the SSR contract:
 *   - anchor always renders
 *   - tooltip body does NOT render during SSR (useEffect hasn't fired)
 *   - hook visit-tracking is exercised in pure-Node where possible
 *
 * Run standalone:
 *   tsx client/src/components/portal/__tests__/FirstVisitTooltip.test.tsx
 */
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// localStorage stub for hook-level tests below. The component-level SSR tests
// never reach localStorage because useEffect doesn't run during SSR.
const memoryStore = new Map<string, string>();
const g = globalThis as any;
if (typeof g.localStorage === 'undefined') {
  g.localStorage = {
    getItem: (k: string) => (memoryStore.has(k) ? memoryStore.get(k)! : null),
    setItem: (k: string, v: string) => { memoryStore.set(k, v); },
    removeItem: (k: string) => { memoryStore.delete(k); },
    clear: () => { memoryStore.clear(); },
    key: () => null,
    length: 0,
  };
}

import { FirstVisitTooltip } from '../FirstVisitTooltip';
import { markVisited, resetFirstVisits } from '@/hooks/useFirstVisit';

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

/* ─── SSR contract ──────────────────────────────────────────────── */

test('renders the anchor element during SSR', () => {
  const html = renderToStaticMarkup(
    React.createElement(FirstVisitTooltip, {
      storageKey: 'ssr-anchor-test',
      anchor: React.createElement('button', { 'data-testid': 'my-anchor' }, 'Click me'),
      children: 'Hint body',
    }),
  );
  assert.ok(html.includes('data-testid="my-anchor"'), `expected anchor in SSR output`);
  assert.ok(html.includes('Click me'), `expected anchor child text`);
});

test('does NOT render tooltip body during SSR (useEffect deferred)', () => {
  const html = renderToStaticMarkup(
    React.createElement(FirstVisitTooltip, {
      storageKey: 'ssr-body-deferred',
      title: 'My title',
      anchor: React.createElement('div', null, 'anchor'),
      children: 'My hint copy',
    }),
  );
  assert.ok(!html.includes('role="tooltip"'), `expected no tooltip role during SSR`);
  assert.ok(!html.includes('My hint copy'), `expected hint body absent during SSR`);
  assert.ok(!html.includes('first-visit-tooltip-ssr-body-deferred'), `expected no tooltip testid during SSR`);
});

test('outer wrapper is a relative inline-block (positioning context)', () => {
  const html = renderToStaticMarkup(
    React.createElement(FirstVisitTooltip, {
      storageKey: 'wrapper-positioning',
      anchor: React.createElement('span', null, 'a'),
      children: 'hint',
    }),
  );
  assert.ok(html.includes('relative inline-block'), `expected positioning context classes`);
});

test('accepts custom wrapper className', () => {
  const html = renderToStaticMarkup(
    React.createElement(FirstVisitTooltip, {
      storageKey: 'wrapper-classname',
      anchor: React.createElement('span', null, 'a'),
      className: 'w-full block',
      children: 'hint',
    }),
  );
  assert.ok(html.includes('w-full block'), `expected custom class merged in`);
});

/* ─── Hook behaviour (pure Node, no React) ──────────────────────── */

test('markVisited + resetFirstVisits round-trip', () => {
  resetFirstVisits();
  markVisited('roundtrip-key');
  const raw = g.localStorage.getItem('portal-visited-routes');
  assert.ok(raw && raw.includes('roundtrip-key'), `expected key persisted in localStorage`);

  resetFirstVisits();
  const cleared = g.localStorage.getItem('portal-visited-routes');
  assert.equal(cleared, null, `expected localStorage cleared after reset`);
});

test('markVisited is idempotent', () => {
  resetFirstVisits();
  markVisited('idempotent-key');
  markVisited('idempotent-key');
  const raw = g.localStorage.getItem('portal-visited-routes');
  const parsed = JSON.parse(raw!);
  const count = parsed.filter((k: string) => k === 'idempotent-key').length;
  assert.equal(count, 1, `expected exactly one entry, got ${count}`);
});

/* ─── Done ──────────────────────────────────────────────────────── */

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
