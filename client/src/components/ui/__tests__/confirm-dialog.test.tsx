/**
 * Smoke tests for the shared <ConfirmDialog> component.
 *
 * Run standalone via:
 *   tsx client/src/components/ui/__tests__/confirm-dialog.test.tsx
 *
 * Radix's <AlertDialog> renders nothing to static markup when `open` is
 * false (it portals into the body on mount in a real DOM). These tests
 * therefore exercise the closed-state SSR path — confirming the component
 * doesn't throw and produces no leftover markup — which is enough to
 * catch import / typing regressions in CI.
 */
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConfirmDialog } from '../confirm-dialog';

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

/* ─── closed-state renders without throwing ─────────────────────── */

test('renders nothing when open=false (SSR safe)', () => {
  const html = renderToStaticMarkup(
    React.createElement(ConfirmDialog, {
      open: false,
      onOpenChange: () => {},
      title: 'Test',
      onConfirm: () => {},
    }),
  );
  // Radix portals content on mount in the browser; with open=false on the
  // server, nothing renders. Empty string is the correct result.
  assert.equal(html, '', `expected empty markup when closed: ${html}`);
});

/* ─── default + destructive variants both type-check + render ───── */

test('accepts destructive=true without throwing', () => {
  assert.doesNotThrow(() => {
    renderToStaticMarkup(
      React.createElement(ConfirmDialog, {
        open: false,
        onOpenChange: () => {},
        title: 'Delete?',
        description: 'This cannot be undone.',
        destructive: true,
        confirmLabel: 'Delete',
        onConfirm: () => {},
      }),
    );
  });
});

test('accepts pending=true without throwing', () => {
  assert.doesNotThrow(() => {
    renderToStaticMarkup(
      React.createElement(ConfirmDialog, {
        open: false,
        onOpenChange: () => {},
        title: 'Confirm',
        pending: true,
        onConfirm: () => {},
      }),
    );
  });
});

/* ─── async onConfirm signature is accepted ─────────────────────── */

test('onConfirm may return a Promise', () => {
  assert.doesNotThrow(() => {
    renderToStaticMarkup(
      React.createElement(ConfirmDialog, {
        open: false,
        onOpenChange: () => {},
        title: 'Confirm',
        onConfirm: async () => {
          await Promise.resolve();
        },
      }),
    );
  });
});

/* ─── Done ──────────────────────────────────────────────────────── */

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
