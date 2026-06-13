/**
 * U6 restyle-integrity — return-channel test for the set_style applier.
 *
 * Mirrors the scripts/check-formula.ts / MatrixField.resolveRate.test.ts
 * battery style (pass/fail counters, exits non-zero on any failure). Run with
 * `npm run check:style-drop`.
 *
 * Contract under test (the AI-integrity gap this fix closes): when the model's
 * set_style patch contains an INVALID colour / radius / font, the sanitiser
 * DROPS that key (keeping the valid remainder) — and now RETURNS the dropped
 * keys via AiApplyResult.droppedKeys so the chat can tell the user honestly
 * what didn't take. A fully-valid patch returns NO droppedKeys (clean apply →
 * unchanged ✓-chip behaviour).
 */
import { applyAiToolCall, describeDroppedStyleKeys, type AiApplierContext } from './aiToolApplier';
import type { ShellState, ShellStyle } from './types';

let pass = 0;
let fail = 0;

function ok(cond: boolean, label: string) {
  if (cond) { pass++; return; }
  fail++;
  console.log(`FAIL  ${label}`);
}

/** Minimal AiApplierContext — only `setStyle` is exercised by set_style; the
 *  other setters are no-op stubs. `state.style` captures what was applied so we
 *  can assert the valid remainder still lands. */
function makeCtx(): { ctx: AiApplierContext; applied: () => ShellStyle | undefined } {
  let style: ShellStyle | undefined = {} as ShellStyle;
  const state = {
    businessName: '',
    fields: [],
    calculations: [],
    style,
  } as unknown as ShellState;
  const ctx: AiApplierContext = {
    state,
    setFields: () => {},
    setCalculations: () => {},
    setHeader: () => {},
    setResults: () => {},
    setStyle: (next) => { style = next; (state as any).style = next; },
    setSettings: () => {},
    setLogo: () => {},
    setBusinessName: () => {},
    applyTemplatePreset: () => {},
    replaceTemplate: () => {},
  };
  return { ctx, applied: () => style };
}

/* ── one invalid colour → that key is dropped + reported ── */
{
  const { ctx, applied } = makeCtx();
  const result = applyAiToolCall(
    { name: 'set_style', input: { accent: 'blue' } },
    ctx,
  );
  ok(Array.isArray(result.droppedKeys) && result.droppedKeys.includes('accent'),
    'invalid colour "blue" → droppedKeys includes "accent"');
  ok(!('accent' in (applied() ?? {})),
    'invalid colour is NOT applied to style');
}

/* ── invalid value dropped, valid value still applies ── */
{
  const { ctx, applied } = makeCtx();
  const result = applyAiToolCall(
    { name: 'set_style', input: { accent: 'not-a-hex', background: '#ffffff' } },
    ctx,
  );
  ok(result.droppedKeys?.length === 1 && result.droppedKeys[0] === 'accent',
    'one bad + one good → exactly the bad key reported');
  ok((applied() as any)?.background === '#ffffff',
    'valid colour in the same patch still applies');
}

/* ── invalid radius is dropped + reported ── */
{
  const { ctx } = makeCtx();
  const result = applyAiToolCall(
    { name: 'set_style', input: { radius: 'round' } },
    ctx,
  );
  ok(result.droppedKeys?.includes('radius'),
    'non-numeric radius → droppedKeys includes "radius"');
}

/* ── fully-valid patch → NO droppedKeys (clean apply, unchanged behaviour) ── */
{
  const { ctx, applied } = makeCtx();
  const result = applyAiToolCall(
    { name: 'set_style', input: { accent: '#0d3cfc', radius: 12 } },
    ctx,
  );
  ok(!result.droppedKeys || result.droppedKeys.length === 0,
    'all-valid patch → no droppedKeys');
  ok((applied() as any)?.accent === '#0d3cfc' && (applied() as any)?.radius === 12,
    'all-valid patch applies in full');
}

/* ── a non-style tool returns no droppedKeys (return channel is set_style-only) ── */
{
  const { ctx } = makeCtx();
  const result = applyAiToolCall(
    { name: 'set_header', input: { title: 'Hi' } },
    ctx,
  );
  ok(!result.droppedKeys, 'set_header → no droppedKeys (clean result)');
}

/* ── describeDroppedStyleKeys → honest, non-alarming copy ── */
{
  ok(describeDroppedStyleKeys(['accent']) === "Couldn't apply: invalid color value",
    'single colour drop → "Couldn\'t apply: invalid color value"');
  ok(describeDroppedStyleKeys(['radius']) === "Couldn't apply: invalid corner radius",
    'single radius drop → friendly "corner radius" label');
  ok(describeDroppedStyleKeys(['accent', 'radius']) === "Ignored 2 values that weren't valid",
    'multiple drops → count summary');
  ok(describeDroppedStyleKeys([]) === '',
    'no drops → empty string');
}

console.log(`\naiToolApplier set_style drop: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
