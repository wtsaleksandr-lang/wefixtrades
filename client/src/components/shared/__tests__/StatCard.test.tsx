/**
 * Smoke tests for the shared <StatCard> + <StatCardGrid> components.
 *
 * Runs standalone via `tsx client/src/components/shared/__tests__/StatCard.test.tsx`.
 * Pattern matches client/src/components/primitives/__tests__/Stack.test.tsx —
 * Node assert/strict, renderToStaticMarkup, no extra runner dep.
 */
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StatCard, StatCardGrid } from '../StatCard';

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

/* ─── StatCard render ───────────────────────────────────────────── */

test('renders label and value', () => {
  const html = renderToStaticMarkup(
    React.createElement(StatCard, { label: 'Total', value: 42 }),
  );
  assert.ok(html.includes('Total'), `expected label in html: ${html}`);
  assert.ok(html.includes('42'), `expected value in html: ${html}`);
});

test('renders optional suffix', () => {
  const html = renderToStaticMarkup(
    React.createElement(StatCard, { label: 'Rate', value: '92', suffix: '%' }),
  );
  assert.ok(html.includes('%'), `expected suffix in html: ${html}`);
});

test('renders hint node before label', () => {
  const html = renderToStaticMarkup(
    React.createElement(StatCard, {
      label: 'Active',
      value: 7,
      hint: React.createElement('span', { 'data-testid': 'hint' }, '?'),
    }),
  );
  assert.ok(html.includes('data-testid="hint"'), `expected hint in html: ${html}`);
});

/* ─── tone variants ─────────────────────────────────────────────── */

test('tone="warn" applies amber tint', () => {
  const html = renderToStaticMarkup(
    React.createElement(StatCard, { label: 'Failed', value: 3, tone: 'warn' }),
  );
  assert.ok(html.includes('border-amber-200'), `expected amber border: ${html}`);
});

test('tone="danger" applies red tint', () => {
  const html = renderToStaticMarkup(
    React.createElement(StatCard, { label: 'Errors', value: 5, tone: 'danger' }),
  );
  assert.ok(html.includes('border-red-200'), `expected red border: ${html}`);
});

test('tone="success" applies emerald tint', () => {
  const html = renderToStaticMarkup(
    React.createElement(StatCard, { label: 'OK', value: 99, tone: 'success' }),
  );
  assert.ok(html.includes('border-emerald-200'), `expected emerald border: ${html}`);
});

test('default tone has no tint classes', () => {
  const html = renderToStaticMarkup(
    React.createElement(StatCard, { label: 'Plain', value: 1 }),
  );
  assert.ok(!html.includes('border-amber-200'), `no amber: ${html}`);
  assert.ok(!html.includes('border-red-200'), `no red: ${html}`);
  assert.ok(!html.includes('border-emerald-200'), `no emerald: ${html}`);
});

/* ─── StatCardGrid ──────────────────────────────────────────────── */

test('StatCardGrid wraps children in canonical responsive grid', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      StatCardGrid,
      null,
      React.createElement(StatCard, { label: 'A', value: 1 }),
      React.createElement(StatCard, { label: 'B', value: 2 }),
    ),
  );
  assert.ok(html.includes('grid'), `expected grid class: ${html}`);
  assert.ok(html.includes('gap-3'), `expected gap-3: ${html}`);
  assert.ok(html.includes('auto-rows-fr'), `expected auto-rows-fr: ${html}`);
  assert.ok(html.includes('grid-cols-2'), `expected grid-cols-2: ${html}`);
  assert.ok(html.includes('A'), `expected child A: ${html}`);
  assert.ok(html.includes('B'), `expected child B: ${html}`);
});

/* ─── Done ──────────────────────────────────────────────────────── */

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
