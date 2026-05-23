/**
 * Smoke tests for <HorizontalCarousel>.
 *
 * SSR-only — exercises the render output (header bar + row + arrow group
 * presence). Pointer/scroll behaviour is browser-only and exercised by
 * the e2e suite, not here.
 *
 * Same pattern as Stack.test.tsx: Node assert/strict + renderToStaticMarkup.
 * Run standalone via
 *   tsx client/src/components/marketing/__tests__/HorizontalCarousel.test.tsx
 */
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HorizontalCarousel } from '../HorizontalCarousel';

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

const card = (key: string, label: string) =>
  React.createElement('div', { key }, label);

test('renders children inside the qq-fade-scroll-row container', () => {
  const html = renderToStaticMarkup(
    React.createElement(HorizontalCarousel, {
      'data-testid': 'review-row',
      children: [card('a', 'card-a'), card('b', 'card-b')],
    }),
  );
  assert.ok(html.includes('qq-fade-scroll-row'), `expected fade-scroll-row class: ${html}`);
  assert.ok(html.includes('card-a') && html.includes('card-b'), `expected both children: ${html}`);
  assert.ok(html.includes('data-testid="review-row"'), `expected wrapper test id: ${html}`);
  assert.ok(html.includes('data-testid="review-row-row"'), `expected row test id: ${html}`);
  assert.ok(html.includes('data-testid="review-row-arrows"'), `expected arrows test id: ${html}`);
});

test('renders heading content beside the arrow group', () => {
  const html = renderToStaticMarkup(
    React.createElement(HorizontalCarousel, {
      heading: React.createElement('h2', null, 'What customers say'),
      children: card('a', 'card-a'),
    }),
  );
  assert.ok(html.includes('What customers say'), `expected heading text: ${html}`);
  assert.ok(html.includes('cs-arrow-group'), `expected arrow group present: ${html}`);
});

test('showArrows=false hides the arrow group', () => {
  const html = renderToStaticMarkup(
    React.createElement(HorizontalCarousel, {
      showArrows: false,
      children: card('a', 'card-a'),
    }),
  );
  assert.ok(!html.includes('cs-arrow-group'), `expected NO arrow group: ${html}`);
});

test('default state — prev disabled (at start), next enabled', () => {
  const html = renderToStaticMarkup(
    React.createElement(HorizontalCarousel, {
      children: [card('a', 'card-a'), card('b', 'card-b')],
    }),
  );
  // Initial scrollLeft=0 → prev disabled, next enabled.
  const disabledCount = (html.match(/cs-arrow--disabled/g) || []).length;
  assert.equal(disabledCount, 1, `expected prev disabled at initial render, got ${disabledCount} disabled: ${html}`);
});

test('arrowTheme="light" cascades to the arrow group', () => {
  const html = renderToStaticMarkup(
    React.createElement(HorizontalCarousel, {
      arrowTheme: 'light',
      children: card('a', 'card-a'),
    }),
  );
  assert.ok(html.includes('data-theme="light"'), `expected light theme: ${html}`);
});

test('rowClassName is appended to qq-fade-scroll-row', () => {
  const html = renderToStaticMarkup(
    React.createElement(HorizontalCarousel, {
      rowClassName: 'reviews-grid',
      children: card('a', 'card-a'),
    }),
  );
  // Both classes should appear on the row element.
  assert.ok(html.includes('qq-fade-scroll-row reviews-grid'), `expected merged class list: ${html}`);
});

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
