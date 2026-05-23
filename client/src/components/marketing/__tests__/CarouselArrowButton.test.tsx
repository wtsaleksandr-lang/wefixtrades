/**
 * Unit tests for <CarouselArrowButton> and <CarouselArrowGroup>.
 *
 * Same pattern as Stack.test.tsx — Node assert/strict + renderToStaticMarkup,
 * no extra runner dep. Run standalone via
 *   tsx client/src/components/marketing/__tests__/CarouselArrowButton.test.tsx
 */
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CarouselArrowButton, CarouselArrowGroup } from '../CarouselArrowButton';

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

/* ─── CarouselArrowButton ───────────────────────────────────────── */

test('renders prev button with cs-arrow class', () => {
  const html = renderToStaticMarkup(
    React.createElement(CarouselArrowButton, { direction: 'prev', onClick: () => {} }),
  );
  assert.ok(html.includes('cs-arrow'), `expected cs-arrow class: ${html}`);
  assert.ok(html.includes('aria-label="Previous"'), `expected aria-label="Previous": ${html}`);
});

test('renders next button with default aria label', () => {
  const html = renderToStaticMarkup(
    React.createElement(CarouselArrowButton, { direction: 'next', onClick: () => {} }),
  );
  assert.ok(html.includes('aria-label="Next"'), `expected aria-label="Next": ${html}`);
});

test('custom label overrides default', () => {
  const html = renderToStaticMarkup(
    React.createElement(CarouselArrowButton, {
      direction: 'next',
      onClick: () => {},
      label: 'Next review',
    }),
  );
  assert.ok(html.includes('aria-label="Next review"'), `expected custom label: ${html}`);
});

test('disabled adds cs-arrow--disabled class', () => {
  const html = renderToStaticMarkup(
    React.createElement(CarouselArrowButton, { direction: 'prev', onClick: () => {}, disabled: true }),
  );
  assert.ok(html.includes('cs-arrow--disabled'), `expected disabled class: ${html}`);
});

test('default theme is dark', () => {
  const html = renderToStaticMarkup(
    React.createElement(CarouselArrowButton, { direction: 'prev', onClick: () => {} }),
  );
  assert.ok(html.includes('data-theme="dark"'), `expected data-theme="dark": ${html}`);
});

test('light theme passed through', () => {
  const html = renderToStaticMarkup(
    React.createElement(CarouselArrowButton, {
      direction: 'prev',
      onClick: () => {},
      theme: 'light',
    }),
  );
  assert.ok(html.includes('data-theme="light"'), `expected data-theme="light": ${html}`);
});

/* ─── CarouselArrowGroup ────────────────────────────────────────── */

test('group renders both prev and next buttons', () => {
  const html = renderToStaticMarkup(
    React.createElement(CarouselArrowGroup, {
      onPrev: () => {},
      onNext: () => {},
      canPrev: true,
      canNext: true,
    }),
  );
  assert.ok(html.includes('aria-label="Previous"'), `expected prev button: ${html}`);
  assert.ok(html.includes('aria-label="Next"'), `expected next button: ${html}`);
  assert.ok(html.includes('cs-arrow-group'), `expected cs-arrow-group wrapper: ${html}`);
  assert.ok(html.includes('cs-arrow-divider'), `expected divider: ${html}`);
});

test('group disables buttons based on can flags', () => {
  const html = renderToStaticMarkup(
    React.createElement(CarouselArrowGroup, {
      onPrev: () => {},
      onNext: () => {},
      canPrev: false,
      canNext: true,
    }),
  );
  // Prev should be disabled (cs-arrow--disabled appears exactly once).
  const disabledCount = (html.match(/cs-arrow--disabled/g) || []).length;
  assert.equal(disabledCount, 1, `expected exactly one disabled button (the prev), got ${disabledCount}: ${html}`);
});

test('group both-disabled case', () => {
  const html = renderToStaticMarkup(
    React.createElement(CarouselArrowGroup, {
      onPrev: () => {},
      onNext: () => {},
      canPrev: false,
      canNext: false,
    }),
  );
  const disabledCount = (html.match(/cs-arrow--disabled/g) || []).length;
  assert.equal(disabledCount, 2, `expected both disabled: ${html}`);
});

/* ─── Done ──────────────────────────────────────────────────────── */

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
