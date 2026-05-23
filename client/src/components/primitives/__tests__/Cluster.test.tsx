/**
 * LAYOUT-3 — unit tests for the <Cluster> primitive.
 *
 * Run standalone via:
 *   tsx client/src/components/primitives/__tests__/Cluster.test.tsx
 * Matches the assert/strict + renderToStaticMarkup pattern used for Stack.
 */
import assert from 'node:assert/strict';
import React, { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Cluster } from '../Cluster';

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

/* ─── default gap='normal' ──────────────────────────────────────── */

test('default gap="normal" → 8px', () => {
  const html = renderToStaticMarkup(
    React.createElement(Cluster, { children: 'x' }),
  );
  assert.ok(html.includes('gap:8px'), `expected gap:8px: ${html}`);
  assert.ok(html.includes('data-cluster="normal"'), `expected data-cluster="normal": ${html}`);
});

/* ─── gap='tight' / 'loose' ─────────────────────────────────────── */

test('gap="tight" → 4px', () => {
  const html = renderToStaticMarkup(
    React.createElement(Cluster, { gap: 'tight', children: 'x' }),
  );
  assert.ok(html.includes('gap:4px'), `expected gap:4px: ${html}`);
});

test('gap="loose" → 16px', () => {
  const html = renderToStaticMarkup(
    React.createElement(Cluster, { gap: 'loose', children: 'x' }),
  );
  assert.ok(html.includes('gap:16px'), `expected gap:16px: ${html}`);
});

/* ─── wrap behaviour ────────────────────────────────────────────── */

test('wrap=true (default) includes flex-wrap class', () => {
  const html = renderToStaticMarkup(
    React.createElement(Cluster, { children: 'x' }),
  );
  assert.ok(html.includes('flex-wrap'), `expected flex-wrap class: ${html}`);
});

test('wrap=false removes flex-wrap class', () => {
  const html = renderToStaticMarkup(
    React.createElement(Cluster, { wrap: false, children: 'x' }),
  );
  assert.ok(!html.includes('flex-wrap'), `expected NO flex-wrap class: ${html}`);
});

/* ─── alignment ─────────────────────────────────────────────────── */

test('align="end" applies via inline style', () => {
  const html = renderToStaticMarkup(
    React.createElement(Cluster, { align: 'end', children: 'x' }),
  );
  assert.ok(html.includes('align-items:end'), `expected align-items:end: ${html}`);
});

test('align defaults to "center"', () => {
  const html = renderToStaticMarkup(
    React.createElement(Cluster, { children: 'x' }),
  );
  assert.ok(html.includes('align-items:center'), `expected align-items:center: ${html}`);
});

/* ─── ref forwarding ────────────────────────────────────────────── */

test('forwards ref', () => {
  const ref = createRef<HTMLElement>();
  const element = React.createElement(Cluster, { ref, children: 'x' });
  assert.ok(element.props !== undefined, 'element should be a valid React element');
  const clusterType = element.type as unknown as { render?: unknown };
  assert.ok(typeof clusterType.render === 'function', 'Cluster should be a forwardRef component');
});

/* ─── Done ──────────────────────────────────────────────────────── */

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
