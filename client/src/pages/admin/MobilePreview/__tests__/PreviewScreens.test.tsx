/**
 * Smoke tests for the admin mobile-preview parity update.
 *
 * Confirms the 6-tab structure matches the softphone RN navigator and that
 * AskScreen / VoicemailScreen / CallsScreen dialer / MessagesScreen compose
 * bar render their key DOM elements. Pattern matches
 * client/src/components/primitives/__tests__/Stack.test.tsx — tsx + Node
 * assert/strict + renderToStaticMarkup, no runner dependency.
 *
 * Run: tsx client/src/pages/admin/MobilePreview/__tests__/PreviewScreens.test.tsx
 */
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AskScreen,
  VoicemailScreen,
  CallsScreen,
  MessagesScreen,
  TabBar,
  type TabKey,
} from '../PreviewScreens';

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

/* ─── tab order ─────────────────────────────────────────────────── */

test('TabBar renders all 6 tabs in the softphone RN order', () => {
  const html = renderToStaticMarkup(
    React.createElement(TabBar, { active: 'calls' as TabKey, onChange: () => {} }),
  );
  const order: TabKey[] = ['calls', 'ask', 'voicemail', 'messages', 'duty', 'settings'];
  const labels = ['Calls', 'Ask', 'Voicemail', 'Messages', 'Duty', 'Settings'];
  assert.equal(order.length, 6, 'expected 6 tab keys');
  let cursor = 0;
  for (const label of labels) {
    const idx = html.indexOf(`>${label}<`, cursor);
    assert.ok(idx >= 0, `expected label "${label}" after position ${cursor} in: ${html}`);
    cursor = idx;
  }
});

/* ─── AskScreen ────────────────────────────────────────────────── */

test('AskScreen renders an input element (compose bar)', () => {
  const html = renderToStaticMarkup(React.createElement(AskScreen));
  assert.ok(/<input\b/.test(html), `expected an <input> in AskScreen: ${html}`);
});

test('AskScreen renders the suggestion chips', () => {
  const html = renderToStaticMarkup(React.createElement(AskScreen));
  assert.ok(html.includes('Summarize last call'), 'expected suggestion chip "Summarize last call"');
  assert.ok(html.includes('Draft a follow-up'), 'expected suggestion chip "Draft a follow-up"');
  assert.ok(html.includes('Find unpaid jobs'), 'expected suggestion chip "Find unpaid jobs"');
});

/* ─── VoicemailScreen ──────────────────────────────────────────── */

test('VoicemailScreen renders at least 3 list items', () => {
  const html = renderToStaticMarkup(React.createElement(VoicemailScreen));
  // Each sample voicemail surfaces its caller string in an <h2>.
  const callerMatches = html.match(/Sarah · Plumbing lead|Marcus · ETA question|Unknown · 555-0188/g);
  assert.ok(callerMatches && callerMatches.length >= 3, `expected ≥3 voicemail rows, got: ${callerMatches?.length ?? 0}`);
});

/* ─── CallsScreen dialer ───────────────────────────────────────── */

test('CallsScreen renders a "+ New call" button', () => {
  const html = renderToStaticMarkup(React.createElement(CallsScreen, {}));
  assert.ok(html.includes('+ New call'), `expected "+ New call" launcher in: ${html.slice(0, 500)}…`);
});

/* ─── MessagesScreen compose ───────────────────────────────────── */

test('MessagesScreen renders a compose input', () => {
  const html = renderToStaticMarkup(React.createElement(MessagesScreen, {}));
  assert.ok(/<input\b/.test(html), `expected compose <input> in MessagesScreen`);
  assert.ok(html.includes('Type a reply'), `expected "Type a reply" placeholder`);
});

/* ─── Done ─────────────────────────────────────────────────────── */

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
