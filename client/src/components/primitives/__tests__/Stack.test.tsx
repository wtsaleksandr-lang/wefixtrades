/**
 * LAYOUT-3 — unit tests for the <Stack> primitive.
 *
 * Excluded from `tsc --noEmit` is implicit via tsconfig pattern for *.test.ts;
 * this file uses .tsx so we keep the assertions in tsx form. Runs standalone
 * via `tsx client/src/components/primitives/__tests__/Stack.test.tsx`.
 * Pattern matches client/src/lib/contrastGuard.test.ts — Node assert/strict,
 * no extra runner dep.
 */
import assert from 'node:assert/strict';
import React, { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Stack } from '../Stack';

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

/* ─── render ────────────────────────────────────────────────────── */

test('renders children', () => {
  const html = renderToStaticMarkup(
    React.createElement(Stack, { children: React.createElement('span', null, 'hello-stack') }),
  );
  assert.ok(html.includes('hello-stack'), `expected children in html: ${html}`);
});

/* ─── gap='input' ───────────────────────────────────────────────── */

test('gap="input" → 2px gap and data-input-cluster attribute', () => {
  const html = renderToStaticMarkup(
    React.createElement(Stack, { gap: 'input', children: 'x' }),
  );
  assert.ok(html.includes('gap:2px'), `expected gap:2px in style: ${html}`);
  assert.ok(html.includes('data-stack="input"'), `expected data-stack="input": ${html}`);
  assert.ok(html.includes('data-input-cluster=""'), `expected data-input-cluster="": ${html}`);
});

/* ─── gap='card' ────────────────────────────────────────────────── */

test('gap="card" → 16px gap, no data-input-cluster', () => {
  const html = renderToStaticMarkup(
    React.createElement(Stack, { gap: 'card', children: 'x' }),
  );
  assert.ok(html.includes('gap:16px'), `expected gap:16px in style: ${html}`);
  assert.ok(html.includes('data-stack="card"'), `expected data-stack="card": ${html}`);
  assert.ok(!html.includes('data-input-cluster'), `expected NO data-input-cluster: ${html}`);
});

/* ─── gap='section' ─────────────────────────────────────────────── */

test('gap="section" → 0 gap', () => {
  const html = renderToStaticMarkup(
    React.createElement(Stack, { gap: 'section', children: 'x' }),
  );
  assert.ok(html.includes('gap:0'), `expected gap:0 in style: ${html}`);
  assert.ok(html.includes('data-stack="section"'), `expected data-stack="section": ${html}`);
});

/* ─── ref forwarding ────────────────────────────────────────────── */

test('forwards ref', () => {
  // forwardRef + SSR doesn't attach refs (DOM-only), so we verify the
  // ref typing/shape compiles and the element is a valid forwardRef.
  const ref = createRef<HTMLElement>();
  const element = React.createElement(Stack, { ref, children: 'x' });
  assert.ok(element.props !== undefined, 'element should be a valid React element');
  // Stack is a forwardRef component; React tags these with $$typeof internally,
  // and `type` is the forwardRef object containing `render`.
  const stackType = element.type as unknown as { render?: unknown };
  assert.ok(typeof stackType.render === 'function', 'Stack should be a forwardRef component');
});

/* ─── custom as="section" ───────────────────────────────────────── */

test('custom as="section" renders <section>', () => {
  const html = renderToStaticMarkup(
    React.createElement(Stack, { as: 'section', children: 'x' }),
  );
  assert.ok(html.startsWith('<section'), `expected <section> root: ${html}`);
});

/* ─── default flex-col class ────────────────────────────────────── */

test('applies flex flex-col classes', () => {
  const html = renderToStaticMarkup(
    React.createElement(Stack, { children: 'x' }),
  );
  assert.ok(html.includes('flex flex-col') || html.includes('flex-col'), `expected flex-col: ${html}`);
});

/* ─── Done ──────────────────────────────────────────────────────── */

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
