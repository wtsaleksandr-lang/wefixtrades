/**
 * Smoke tests for the BeforeAfterSlider component.
 *
 * Runs standalone via:
 *   tsx client/src/components/marketing/__tests__/BeforeAfterSlider.test.tsx
 *
 * Mirrors the project test pattern (Stack.test.tsx): node:assert/strict +
 * react-dom/server. SSR only — interaction (pointer drag) is exercised via
 * Playwright in the broader audit-flow.spec.ts; here we only verify the
 * render contract.
 */
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BeforeAfterSlider from '../BeforeAfterSlider';

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

const BEFORE = 'data:image/png;base64,AAAA';
const AFTER = 'data:image/png;base64,BBBB';

/* ─── renders both images ───────────────────────────────────────── */

test('renders both before and after images', () => {
  const html = renderToStaticMarkup(
    React.createElement(BeforeAfterSlider, { beforeSrc: BEFORE, afterSrc: AFTER }),
  );
  assert.ok(html.includes(BEFORE), 'expected before image src in markup');
  assert.ok(html.includes(AFTER), 'expected after image src in markup');
});

/* ─── default divider position is 50% ───────────────────────────── */

test('default divider position is 50%', () => {
  const html = renderToStaticMarkup(
    React.createElement(BeforeAfterSlider, { beforeSrc: BEFORE, afterSrc: AFTER }),
  );
  // Divider element uses left:50% inline; after image is clipped 50% from right.
  assert.ok(html.includes('left:50%'), `expected divider at left:50% in markup: ${html.slice(0, 400)}`);
  assert.ok(
    html.includes('inset(0 50% 0 0)'),
    `expected after-image clip-path at 50% from right: ${html.slice(0, 400)}`,
  );
});

/* ─── honours initialPosition prop ──────────────────────────────── */

test('honours initialPosition prop', () => {
  const html = renderToStaticMarkup(
    React.createElement(BeforeAfterSlider, {
      beforeSrc: BEFORE,
      afterSrc: AFTER,
      initialPosition: 25,
    }),
  );
  assert.ok(html.includes('left:25%'), 'expected divider at left:25%');
  assert.ok(
    html.includes('inset(0 75% 0 0)'),
    'expected after-image clip-path with 75% inset from right',
  );
});

/* ─── renders the draggable handle ──────────────────────────────── */

test('renders a draggable handle on the divider', () => {
  const html = renderToStaticMarkup(
    React.createElement(BeforeAfterSlider, { beforeSrc: BEFORE, afterSrc: AFTER }),
  );
  // The divider has role="slider" and tabIndex=0 (focusable, keyboard-accessible)
  assert.ok(html.includes('role="slider"'), 'expected role="slider" on divider');
  assert.ok(html.includes('tabindex="0"'), 'expected tabindex="0" on divider');
  // The handle knob renders the ↔ glyph
  assert.ok(html.includes('↔') || html.includes('&#x2194;'), 'expected handle glyph in markup');
});

/* ─── ARIA labels for accessibility ─────────────────────────────── */

test('ARIA labels for accessibility', () => {
  const html = renderToStaticMarkup(
    React.createElement(BeforeAfterSlider, {
      beforeSrc: BEFORE,
      afterSrc: AFTER,
      beforeAlt: 'Site today',
      afterAlt: 'After WebCare fixes',
    }),
  );
  // Region wrapper
  assert.ok(
    html.includes('aria-label="Before and after website comparison"'),
    'expected region aria-label on wrapper',
  );
  // Slider semantics
  assert.ok(html.includes('aria-valuemin="0"'), 'expected aria-valuemin');
  assert.ok(html.includes('aria-valuemax="100"'), 'expected aria-valuemax');
  assert.ok(html.includes('aria-valuenow="50"'), 'expected aria-valuenow at default');
  assert.ok(
    html.includes('aria-valuetext="50% revealed"'),
    'expected aria-valuetext describing position',
  );
  // Image alt text propagates
  assert.ok(html.includes('alt="Site today"'), 'expected before alt text');
  assert.ok(html.includes('alt="After WebCare fixes"'), 'expected after alt text');
});

/* ─── renders caption when provided ─────────────────────────────── */

test('renders caption when provided', () => {
  const html = renderToStaticMarkup(
    React.createElement(BeforeAfterSlider, {
      beforeSrc: BEFORE,
      afterSrc: AFTER,
      caption: 'Projection — actual results may vary.',
    }),
  );
  assert.ok(
    html.includes('Projection') && html.includes('actual results may vary'),
    'expected caption text in markup',
  );
});

/* ─── Done ──────────────────────────────────────────────────────── */

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
