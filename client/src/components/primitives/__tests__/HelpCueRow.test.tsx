/**
 * LAYOUT-3 — unit tests for the <HelpCueRow> primitive.
 *
 * Run standalone via:
 *   tsx client/src/components/primitives/__tests__/HelpCueRow.test.tsx
 */
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HelpCueRow } from '../HelpCueRow';

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

/* ─── full render ───────────────────────────────────────────────── */

test('renders cue + title + actions', () => {
  const html = renderToStaticMarkup(
    React.createElement(HelpCueRow, {
      cue: React.createElement('i', null, 'CUE'),
      title: 'Hello title',
      actions: React.createElement('button', null, 'ACT'),
    }),
  );
  assert.ok(html.includes('CUE'), `expected cue: ${html}`);
  assert.ok(html.includes('Hello title'), `expected title: ${html}`);
  assert.ok(html.includes('ACT'), `expected actions: ${html}`);
});

/* ─── help-cue anchor ───────────────────────────────────────────── */

test('cue gets data-help-cue-anchor="top-left"', () => {
  const html = renderToStaticMarkup(
    React.createElement(HelpCueRow, {
      cue: React.createElement('i', null, 'X'),
      title: 'T',
    }),
  );
  assert.ok(
    html.includes('data-help-cue-anchor="top-left"'),
    `expected data-help-cue-anchor: ${html}`,
  );
});

/* ─── truncate class on title ───────────────────────────────────── */

test('title has truncate class', () => {
  const html = renderToStaticMarkup(
    React.createElement(HelpCueRow, {
      cue: React.createElement('i', null, 'X'),
      title: 'long-title',
    }),
  );
  assert.ok(html.includes('truncate'), `expected truncate class: ${html}`);
});

/* ─── actions slot is optional ──────────────────────────────────── */

test('no actions → no right-slot div', () => {
  const html = renderToStaticMarkup(
    React.createElement(HelpCueRow, {
      cue: React.createElement('i', null, 'X'),
      title: 'T',
    }),
  );
  // The right slot is uniquely identified by "items-center gap-1 shrink-0";
  // the left slot uses "items-center gap-2 min-w-0".
  assert.ok(!html.includes('gap-1 shrink-0'), `expected no right slot: ${html}`);
});

/* ─── variant defaults to 'header' ──────────────────────────────── */

test('default variant="header" → data-help-cue-row="header" + mb-2', () => {
  const html = renderToStaticMarkup(
    React.createElement(HelpCueRow, {
      cue: React.createElement('i', null, 'X'),
      title: 'T',
    }),
  );
  assert.ok(
    html.includes('data-help-cue-row="header"'),
    `expected data-help-cue-row="header": ${html}`,
  );
  assert.ok(html.includes('mb-2'), `expected mb-2: ${html}`);
});

test('variant="label" → data-help-cue-row="label" + mb-1', () => {
  const html = renderToStaticMarkup(
    React.createElement(HelpCueRow, {
      cue: React.createElement('i', null, 'X'),
      title: 'T',
      variant: 'label',
    }),
  );
  assert.ok(
    html.includes('data-help-cue-row="label"'),
    `expected data-help-cue-row="label": ${html}`,
  );
  assert.ok(html.includes('mb-1'), `expected mb-1: ${html}`);
});

/* ─── Done ──────────────────────────────────────────────────────── */

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
