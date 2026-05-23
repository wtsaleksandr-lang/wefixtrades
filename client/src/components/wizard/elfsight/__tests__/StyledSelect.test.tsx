/**
 * CONFIG-NATIVE-SELECT-1 — unit tests for the <StyledSelect> component.
 *
 * Matches the LAYOUT-3 pattern (node:assert/strict + renderToStaticMarkup).
 * Run standalone via:
 *   tsx client/src/components/wizard/elfsight/__tests__/StyledSelect.test.tsx
 *
 * Interactive behaviour (click, keyboard) cannot be exercised through SSR
 * markup alone — the open-state branches are tested by passing
 * `defaultOpen` so the popup HTML lands in the static snapshot.
 */
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StyledSelect } from '../StyledSelect';

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

const SHORT_OPTIONS = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Cherry' },
];

const LONG_OPTIONS = Array.from({ length: 10 }, (_, i) => ({
  value: `v${i}`,
  label: `Label ${i}`,
}));

/* ─── Trigger rendering ─────────────────────────────────────────── */

test('renders trigger with current value\'s label', () => {
  const html = renderToStaticMarkup(
    React.createElement(StyledSelect, {
      value: 'b',
      onChange: () => {},
      options: SHORT_OPTIONS,
    }),
  );
  assert.ok(html.includes('Banana'), `expected current label: ${html}`);
  assert.ok(!html.includes('Apple'), `closed popup shouldn\'t render other options: ${html}`);
});

test('renders placeholder when value is empty', () => {
  const html = renderToStaticMarkup(
    React.createElement(StyledSelect, {
      value: '',
      onChange: () => {},
      options: SHORT_OPTIONS,
      placeholder: 'Pick a fruit',
    }),
  );
  assert.ok(html.includes('Pick a fruit'), `expected placeholder text: ${html}`);
  assert.ok(html.includes('is-placeholder'), `expected placeholder modifier: ${html}`);
});

test('trigger renders default placeholder when none supplied + value missing', () => {
  const html = renderToStaticMarkup(
    React.createElement(StyledSelect, {
      value: '',
      onChange: () => {},
      options: SHORT_OPTIONS,
    }),
  );
  // Default placeholder uses ellipsis char U+2026.
  assert.ok(html.includes('Select'), `expected default placeholder: ${html}`);
});

test('trigger gets aria-haspopup="listbox" and aria-expanded="false" when closed', () => {
  const html = renderToStaticMarkup(
    React.createElement(StyledSelect, {
      value: 'a',
      onChange: () => {},
      options: SHORT_OPTIONS,
      ariaLabel: 'Choose fruit',
    }),
  );
  assert.ok(html.includes('aria-haspopup="listbox"'), `expected aria-haspopup: ${html}`);
  assert.ok(html.includes('aria-expanded="false"'), `expected aria-expanded=false: ${html}`);
  assert.ok(html.includes('aria-label="Choose fruit"'), `expected aria-label: ${html}`);
});

test('disabled trigger renders the disabled attribute', () => {
  const html = renderToStaticMarkup(
    React.createElement(StyledSelect, {
      value: 'a',
      onChange: () => {},
      options: SHORT_OPTIONS,
      disabled: true,
    }),
  );
  assert.ok(html.includes('disabled'), `expected disabled attribute: ${html}`);
});

test('testId prop drives data-testid on the trigger', () => {
  const html = renderToStaticMarkup(
    React.createElement(StyledSelect, {
      value: 'a',
      onChange: () => {},
      options: SHORT_OPTIONS,
      testId: 'my-select',
    }),
  );
  assert.ok(html.includes('data-testid="my-select"'), `expected testid on trigger: ${html}`);
});

/* ─── Popup rendering (defaultOpen) ─────────────────────────────── */

test('defaultOpen renders all options inside the popup', () => {
  const html = renderToStaticMarkup(
    React.createElement(StyledSelect, {
      value: 'b',
      onChange: () => {},
      options: SHORT_OPTIONS,
      defaultOpen: true,
    }),
  );
  assert.ok(html.includes('Apple'), `expected Apple option in open popup: ${html}`);
  assert.ok(html.includes('Banana'), `expected Banana option in open popup: ${html}`);
  assert.ok(html.includes('Cherry'), `expected Cherry option in open popup: ${html}`);
  assert.ok(html.includes('role="dialog"'), `expected role=dialog popup: ${html}`);
  assert.ok(html.includes('aria-modal="true"'), `expected aria-modal: ${html}`);
});

test('selected option carries data-current="true"; siblings carry "false"', () => {
  const html = renderToStaticMarkup(
    React.createElement(StyledSelect, {
      value: 'b',
      onChange: () => {},
      options: SHORT_OPTIONS,
      defaultOpen: true,
      testId: 'fruits',
    }),
  );
  // Order-independent assertions on the testid-bearing option markup.
  assert.ok(
    /data-current="true"[^>]*data-testid="fruits-option-b"|data-testid="fruits-option-b"[^>]*data-current="true"/.test(
      html,
    ),
    `expected Banana to be marked current: ${html}`,
  );
  // Apple should NOT be current.
  const appleSegment = html.match(/data-testid="fruits-option-a"[^>]*/)?.[0] ?? '';
  assert.ok(!appleSegment.includes('data-current="true"'), `Apple shouldn\'t be current: ${appleSegment}`);
});

test('searchable defaults to false for <= 8 options', () => {
  const html = renderToStaticMarkup(
    React.createElement(StyledSelect, {
      value: 'a',
      onChange: () => {},
      options: SHORT_OPTIONS,
      defaultOpen: true,
      testId: 'fruits',
    }),
  );
  assert.ok(
    !html.includes('data-testid="fruits-search"'),
    `expected NO search input for short list: ${html}`,
  );
});

test('searchable auto-enables for > 8 options', () => {
  const html = renderToStaticMarkup(
    React.createElement(StyledSelect, {
      value: 'v0',
      onChange: () => {},
      options: LONG_OPTIONS,
      defaultOpen: true,
      testId: 'long',
    }),
  );
  assert.ok(
    html.includes('data-testid="long-search"'),
    `expected search input for long list: ${html}`,
  );
});

test('searchable=false overrides the >8 default', () => {
  const html = renderToStaticMarkup(
    React.createElement(StyledSelect, {
      value: 'v0',
      onChange: () => {},
      options: LONG_OPTIONS,
      defaultOpen: true,
      testId: 'long',
      searchable: false,
    }),
  );
  assert.ok(
    !html.includes('data-testid="long-search"'),
    `expected search to be suppressed: ${html}`,
  );
});

test('searchable=true forces search even for short lists', () => {
  const html = renderToStaticMarkup(
    React.createElement(StyledSelect, {
      value: 'a',
      onChange: () => {},
      options: SHORT_OPTIONS,
      defaultOpen: true,
      testId: 'fruits',
      searchable: true,
    }),
  );
  assert.ok(
    html.includes('data-testid="fruits-search"'),
    `expected forced search: ${html}`,
  );
});

test('option hint is rendered as a sublabel when provided', () => {
  const html = renderToStaticMarkup(
    React.createElement(StyledSelect, {
      value: 'a',
      onChange: () => {},
      options: [{ value: 'a', label: 'Apple', hint: 'red and crunchy' }],
      defaultOpen: true,
    }),
  );
  assert.ok(html.includes('red and crunchy'), `expected hint: ${html}`);
});

test('popup head title falls back to ariaLabel when title omitted', () => {
  const html = renderToStaticMarkup(
    React.createElement(StyledSelect, {
      value: 'a',
      onChange: () => {},
      options: SHORT_OPTIONS,
      defaultOpen: true,
      ariaLabel: 'Choose fruit',
    }),
  );
  assert.ok(html.includes('Choose fruit'), `expected fallback title from ariaLabel: ${html}`);
});

test('explicit title takes precedence over ariaLabel for the header', () => {
  const html = renderToStaticMarkup(
    React.createElement(StyledSelect, {
      value: 'a',
      onChange: () => {},
      options: SHORT_OPTIONS,
      defaultOpen: true,
      ariaLabel: 'a11y label',
      title: 'Choose carefully',
    }),
  );
  assert.ok(html.includes('Choose carefully'), `expected explicit title: ${html}`);
});

test('backdrop carries data-theme so CONTRAST-2 sees a theme scope', () => {
  const html = renderToStaticMarkup(
    React.createElement(StyledSelect, {
      value: 'a',
      onChange: () => {},
      options: SHORT_OPTIONS,
      defaultOpen: true,
    }),
  );
  assert.ok(html.includes('data-theme="light"'), `expected data-theme wrapper: ${html}`);
});

test('theme="dark" propagates to the backdrop wrapper', () => {
  const html = renderToStaticMarkup(
    React.createElement(StyledSelect, {
      value: 'a',
      onChange: () => {},
      options: SHORT_OPTIONS,
      defaultOpen: true,
      theme: 'dark',
    }),
  );
  assert.ok(html.includes('data-theme="dark"'), `expected dark theme: ${html}`);
});

/* ─── Done ──────────────────────────────────────────────────────── */

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
