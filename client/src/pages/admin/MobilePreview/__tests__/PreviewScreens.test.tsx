/**
 * Smoke tests for the admin mobile-preview parity update.
 *
 * Confirms the post-redesign tab structure (5 tabs + centered Duty FAB,
 * Voicemail moved off the bar) renders correctly, and that the polish-wave
 * pieces — per-mode duty card colors, theme toggle, and the voicemail
 * sub-screen entry points — are present in the rendered markup.
 *
 * Pattern matches client/src/components/primitives/__tests__/Stack.test.tsx —
 * tsx + Node assert/strict + renderToStaticMarkup, no runner dependency.
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
  DutyScreen,
  TabBar,
  ThemeToggle,
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

test('TabBar renders the 5-tab premium order (Calls, Ask, Duty FAB, Messages, Settings)', () => {
  const html = renderToStaticMarkup(
    React.createElement(TabBar, { active: 'calls' as TabKey, onChange: () => {} }),
  );
  // Side tabs render their labels in DOM order. The Duty FAB sits as the
  // last element (it's absolutely positioned centered), so we check the
  // four side labels appear in left-to-right order plus the FAB testid.
  const labels = ['Calls', 'Ask', 'Messages', 'Settings'];
  let cursor = 0;
  for (const label of labels) {
    const idx = html.indexOf(`>${label}<`, cursor);
    assert.ok(idx >= 0, `expected label "${label}" after position ${cursor}`);
    cursor = idx;
  }
  assert.ok(html.includes('data-testid="tabbar-duty-fab"'), 'expected Duty FAB testid');
});

test('TabBar Voicemail is NOT in the tab bar (moved to sub-screen)', () => {
  const html = renderToStaticMarkup(
    React.createElement(TabBar, { active: 'calls' as TabKey, onChange: () => {} }),
  );
  assert.ok(!html.includes('>Voicemail<'), 'expected Voicemail label not in TabBar');
});

test('TabBar FAB ring color reflects current duty mode', () => {
  const htmlAvailable = renderToStaticMarkup(
    React.createElement(TabBar, { active: 'calls' as TabKey, onChange: () => {}, dutyMode: 'available' }),
  );
  assert.ok(/wft-mp-fab-available/.test(htmlAvailable), 'expected wft-mp-fab-available class when dutyMode=available');
  const htmlNight = renderToStaticMarkup(
    React.createElement(TabBar, { active: 'calls' as TabKey, onChange: () => {}, dutyMode: 'after_hours' }),
  );
  assert.ok(/wft-mp-fab-after_hours/.test(htmlNight), 'expected wft-mp-fab-after_hours class when dutyMode=after_hours');
});

/* ─── AskScreen ────────────────────────────────────────────────── */

test('AskScreen renders an input element (compose bar)', () => {
  const html = renderToStaticMarkup(React.createElement(AskScreen, {}));
  assert.ok(/<input\b/.test(html), 'expected an <input> in AskScreen');
});

test('AskScreen renders the suggestion chips', () => {
  const html = renderToStaticMarkup(React.createElement(AskScreen, {}));
  assert.ok(html.includes('Summarize last call'), 'expected suggestion chip "Summarize last call"');
  assert.ok(html.includes('Draft a follow-up'), 'expected suggestion chip "Draft a follow-up"');
  assert.ok(html.includes('Find unpaid jobs'), 'expected suggestion chip "Find unpaid jobs"');
});

test('AskScreen renders the theme toggle in the header', () => {
  const html = renderToStaticMarkup(React.createElement(AskScreen, {}));
  assert.ok(html.includes('data-testid="mobile-preview-theme-toggle"'), 'expected theme toggle in AskScreen header');
});

/* ─── VoicemailScreen ──────────────────────────────────────────── */

test('VoicemailScreen renders at least 3 list items', () => {
  const html = renderToStaticMarkup(React.createElement(VoicemailScreen, {}));
  const callerMatches = html.match(/Sarah · Plumbing lead|Marcus · ETA question|Unknown · 555-0188/g);
  assert.ok(callerMatches && callerMatches.length >= 3, `expected >=3 voicemail rows, got: ${callerMatches?.length ?? 0}`);
});

test('VoicemailScreen renders Back button when onBack is provided', () => {
  const html = renderToStaticMarkup(
    React.createElement(VoicemailScreen, { onBack: () => {} }),
  );
  assert.ok(html.includes('data-testid="voicemail-back"'), 'expected Back button testid');
});

/* ─── CallsScreen ───────────────────────────────────────── */

test('CallsScreen renders a "+ New call" button', () => {
  const html = renderToStaticMarkup(React.createElement(CallsScreen, {}));
  assert.ok(html.includes('+ New call'), 'expected "+ New call" launcher');
});

test('CallsScreen renders Voicemail inbox entry when onOpenVoicemail is provided', () => {
  const html = renderToStaticMarkup(
    React.createElement(CallsScreen, { onOpenVoicemail: () => {} }),
  );
  assert.ok(html.includes('data-testid="open-voicemail-from-calls"'), 'expected voicemail entry from Calls');
});

/* ─── MessagesScreen ─────────────────────────────────────── */

test('MessagesScreen renders a compose input', () => {
  const html = renderToStaticMarkup(React.createElement(MessagesScreen, {}));
  assert.ok(/<input\b/.test(html), 'expected compose <input> in MessagesScreen');
  assert.ok(html.includes('Type a reply'), 'expected "Type a reply" placeholder');
});

test('MessagesScreen renders Voicemail inbox entry when onOpenVoicemail is provided', () => {
  const html = renderToStaticMarkup(
    React.createElement(MessagesScreen, { onOpenVoicemail: () => {} }),
  );
  assert.ok(html.includes('data-testid="open-voicemail-from-messages"'), 'expected voicemail entry from Messages');
});

/* ─── DutyScreen — per-mode color classes ───────────────────────── */

test('DutyScreen renders per-mode color classes on each card', () => {
  const html = renderToStaticMarkup(
    React.createElement(DutyScreen, { currentMode: 'available', onSelect: () => {} }),
  );
  assert.ok(/wft-mp-mode-available/.test(html), 'expected wft-mp-mode-available class');
  assert.ok(/wft-mp-mode-on_the_job/.test(html), 'expected wft-mp-mode-on_the_job class');
  assert.ok(/wft-mp-mode-after_hours/.test(html), 'expected wft-mp-mode-after_hours class');
});

test('DutyScreen marks the currently-selected mode is-active', () => {
  const html = renderToStaticMarkup(
    React.createElement(DutyScreen, { currentMode: 'on_the_job', onSelect: () => {} }),
  );
  // The on_the_job card should carry both wft-mp-mode-on_the_job and is-active.
  assert.ok(/wft-mp-mode-on_the_job[^"]*is-active/.test(html), 'expected is-active on selected mode card');
});

/* ─── ThemeToggle ───────────────────────────────────────────────── */

test('ThemeToggle exposes accessible label that reflects the next state', () => {
  const lightHtml = renderToStaticMarkup(
    React.createElement(ThemeToggle, { theme: 'light', onToggle: () => {} }),
  );
  assert.ok(lightHtml.includes('Switch to dark mode'), 'expected "Switch to dark mode" label when in light theme');
  const darkHtml = renderToStaticMarkup(
    React.createElement(ThemeToggle, { theme: 'dark', onToggle: () => {} }),
  );
  assert.ok(darkHtml.includes('Switch to light mode'), 'expected "Switch to light mode" label when in dark theme');
});

/* ─── Done ─────────────────────────────────────────────────────── */

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
