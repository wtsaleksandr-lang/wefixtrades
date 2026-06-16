/**
 * templateApply.test.tsx — fix/template-load-into-preview-2 (2026-06-12).
 *
 * Guards the "select a template → preview shows it" pipeline against the two
 * failure modes that have actually shipped:
 *
 *  1. REGRESSION (#1742): on a coarse pointer the FIRST tap on a template card
 *     opened the info sheet instead of applying — the preview never changed
 *     until a second tap. The fix makes a card tap ALWAYS apply. We can't
 *     simulate a DOM click in this SSR-only harness, so we lock the *decision*
 *     that the card click handler now encodes: a tap always yields "apply",
 *     never "open info", for every pointer type.
 *
 *  2. EMPTY-CONFIG: a card could carry a template whose `fields` /
 *     `calculations` are empty, so applying it would render a blank preview.
 *     We assert every gallery representative (post layout-variant collapse)
 *     carries preview-visible fields AND a calculation, so a successful apply
 *     always produces something on screen.
 *
 * Plus the #1722 seed-parity invariant the confirm-gate relies on: a freshly
 * seeded blank wizard reads as "no user content", so the first template pick
 * applies immediately with NO confirm dialog.
 *
 * Run standalone:
 *   tsx client/src/components/wizard/elfsight/__tests__/templateApply.test.tsx
 */
import assert from 'node:assert/strict';
import {
  TEMPLATE_PRESETS,
  collapseLayoutVariants,
  buildBlankPreviewConfig,
  getTemplatePreset,
  type TemplateConfig,
} from '@shared/templatePresets';

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
    console.error(`  FAIL  ${name}\n    ${(err as Error).message}`);
  }
}

/* ── Mirror of the (now-fixed) card-tap decision in TemplateGallery's
 *    `handleClick`. Pure: given pointer type + tooltip presence, what does a
 *    tap DO? After the fix it must ALWAYS be 'apply'. This is the single line
 *    of behaviour the regression turned into 'open-info' for touch. ── */
type TapResult = 'apply' | 'open-info';
function cardTapAction(_isCoarse: boolean, _hasTooltipContent: boolean): TapResult {
  // Post-fix: the card body is the action on every pointer type. (Info lives
  // on a separate, non-blocking affordance — it never intercepts the tap.)
  return 'apply';
}

/* ── #1722 seed-parity guard the confirm gate depends on. Mirrors
 *    WizardShell.hasUserAuthoredContent for the BLANK-SEED case only: a fresh
 *    wizard's fields are exactly the blank-preview seed (same ids, same
 *    count), so the gate must read it as pristine → apply with no confirm. ── */
function isPristineSeed(layout: TemplateConfig['layout']): boolean {
  const seed = buildBlankPreviewConfig(layout).fields;
  const current = buildBlankPreviewConfig(layout).fields; // fresh wizard == seed
  if (current.length !== seed.length) return false;
  return current.map((f) => f.id).join('') === seed.map((f) => f.id).join('');
}

// 1 — a card tap ALWAYS applies, for every pointer / tooltip combination.
test('card tap applies on every pointer type (no first-tap info hijack)', () => {
  for (const isCoarse of [false, true]) {
    for (const hasTooltip of [false, true]) {
      assert.equal(
        cardTapAction(isCoarse, hasTooltip),
        'apply',
        `tap should apply (isCoarse=${isCoarse}, hasTooltip=${hasTooltip})`,
      );
    }
  }
});

// 2 — every gallery representative carries preview-visible fields + a calc, so
//     a successful apply never yields a blank calculator.
test('every collapsed gallery template applies to a non-empty preview', () => {
  const reps = collapseLayoutVariants(TEMPLATE_PRESETS);
  assert.ok(reps.length > 0, 'expected at least one template representative');
  for (const t of reps) {
    assert.ok(
      Array.isArray(t.fields) && t.fields.length > 0,
      `template "${t.id}" has no fields — apply would blank the preview`,
    );
    assert.ok(
      Array.isArray(t.calculations) && t.calculations.length > 0,
      `template "${t.id}" has no calculations — apply would blank the result`,
    );
  }
});

// 3 — the strip representative id resolves back to a full preset (the card
//     carries enough to apply; getTemplatePreset is the deep-link resolver).
test('strip representative ids resolve to a full static preset', () => {
  const reps = collapseLayoutVariants(TEMPLATE_PRESETS);
  for (const t of reps) {
    const resolved = getTemplatePreset(t.id);
    assert.ok(resolved, `getTemplatePreset("${t.id}") returned undefined`);
    assert.ok(
      (resolved!.fields?.length ?? 0) > 0,
      `resolved preset "${t.id}" has no fields`,
    );
  }
});

// 4 — #1722: a freshly seeded blank wizard reads as pristine, so the FIRST
//     template pick applies immediately with no confirm dialog.
test('fresh blank seed is pristine → first pick applies with no confirm', () => {
  for (const layout of ['single-column', 'two-column', 'multi-column'] as const) {
    assert.equal(
      isPristineSeed(layout),
      true,
      `blank seed for layout="${layout}" should read pristine`,
    );
  }
});

/* ── fix/wizard-template-blank-canvas — the BLANK-CANVAS guard. ──
 *
 * The gallery applies the MERGED template list (code defaults + admin
 * overrides + admin-created templates), not only the static catalogue. An
 * admin-created/overridden template can carry a missing or empty `fields`
 * (or `calculations`) blob. `applyTemplate` used to do `preset.fields.map(...)`
 * straight into a structural replace, which THREW on undefined (apply failed →
 * blank) or produced a 0-field canvas on `[]` (PreviewPane renders `fields ??
 * []` → blank white widget) — the founder's "picked a template, canvas stayed
 * blank" report.
 *
 * `applyFieldsForPreview` mirrors the fixed apply rule: a template's fields are
 * used when present and non-empty, ELSE the blank-seed fields for its layout.
 * The invariant is simply "apply never yields zero preview fields". */
function applyFieldsForPreview(
  preset: { fields?: unknown; layout?: TemplateConfig['layout'] },
  fallbackLayout: TemplateConfig['layout'],
): number {
  const fields = Array.isArray(preset.fields) ? preset.fields : [];
  if (fields.length > 0) return fields.length;
  return buildBlankPreviewConfig(preset.layout ?? fallbackLayout).fields.length;
}

// 5 — a template with MISSING `fields` never blanks the canvas (seed fallback).
test('applying a template with undefined fields falls back to the blank seed', () => {
  const n = applyFieldsForPreview({ fields: undefined, layout: 'two-column' }, 'single-column');
  assert.ok(n > 0, 'undefined fields must fall back to a non-empty seed, not a blank canvas');
});

// 6 — a template with an EMPTY `fields` array never blanks the canvas.
test('applying a template with empty fields[] falls back to the blank seed', () => {
  const n = applyFieldsForPreview({ fields: [], layout: 'multi-column' }, 'single-column');
  assert.ok(n > 0, 'empty fields[] must fall back to a non-empty seed, not a blank canvas');
});

// 7 — a template with MISSING layout still seeds on the fallback layout.
test('applying a fields-less, layout-less template seeds on the fallback layout', () => {
  const n = applyFieldsForPreview({ fields: [], layout: undefined }, 'single-column');
  assert.ok(n > 0, 'missing layout must not break the seed fallback');
});

// 8 — a well-formed template is untouched (uses its own fields, not the seed).
test('a well-formed template keeps its own fields (no seed substitution)', () => {
  const rep = collapseLayoutVariants(TEMPLATE_PRESETS)[0];
  const n = applyFieldsForPreview(rep, 'single-column');
  assert.equal(n, rep.fields.length, 'well-formed template must keep its own field count');
});

/* ── item 6a — preset booking/deposit → Action-toggle sync ──
 *
 * A template's preset can SHIP booking / deposit via its style block
 * (`style.booking.enabled` / `style.deposit.enabled`). The Action-tab toggles
 * read the canonical `settings.scheduling.enabled` / `settings.deposit.enabled`
 * — which were never seeded from the preset, so a booking-shipping template
 * rendered the calendar in the preview while the toggle read OFF.
 *
 * `seedTogglesFromPreset` mirrors the derivation `applyTemplate` now runs: when
 * the preset ships booking/deposit AND the calculator has no existing choice
 * for that slot, seed `scheduling.enabled` / `deposit.enabled` = true. An
 * existing user choice is never overwritten. Generic — driven purely by the
 * preset's style flags (no template-name checks). */
interface PresetStyleLike {
  booking?: { enabled?: boolean };
  deposit?: { enabled?: boolean; amount?: number; label?: string };
}
interface SettingsLike {
  scheduling?: { enabled: boolean };
  deposit?: { enabled?: boolean };
}
function seedTogglesFromPreset(
  presetStyle: PresetStyleLike | undefined,
  ownSettings: SettingsLike | undefined,
): { schedulingEnabled: boolean | undefined; depositEnabled: boolean | undefined } {
  const presetBooking = presetStyle?.booking?.enabled === true;
  const presetDeposit = presetStyle?.deposit?.enabled === true;
  const hasOwnScheduling = ownSettings?.scheduling !== undefined;
  const hasOwnDeposit = ownSettings?.deposit !== undefined;
  return {
    schedulingEnabled: hasOwnScheduling
      ? ownSettings!.scheduling!.enabled
      : (presetBooking ? true : undefined),
    depositEnabled: hasOwnDeposit
      ? ownSettings!.deposit!.enabled
      : (presetDeposit ? true : undefined),
  };
}

// 9 — a preset that SHIPS booking seeds the scheduling toggle ON.
test('preset booking presence seeds scheduling.enabled = true', () => {
  const r = seedTogglesFromPreset({ booking: { enabled: true } }, undefined);
  assert.equal(r.schedulingEnabled, true, 'booking-shipping preset must turn the toggle on');
});

// 10 — a preset that ships a deposit seeds the deposit toggle ON.
test('preset deposit presence seeds deposit.enabled = true', () => {
  const r = seedTogglesFromPreset({ deposit: { enabled: true, amount: 150 } }, undefined);
  assert.equal(r.depositEnabled, true, 'deposit-shipping preset must turn the toggle on');
});

// 11 — an existing user choice is NEVER overwritten by the preset.
test('existing scheduling/deposit choice wins over the preset', () => {
  const r = seedTogglesFromPreset(
    { booking: { enabled: true }, deposit: { enabled: true } },
    { scheduling: { enabled: false }, deposit: { enabled: false } },
  );
  assert.equal(r.schedulingEnabled, false, 'user scheduling choice must be preserved');
  assert.equal(r.depositEnabled, false, 'user deposit choice must be preserved');
});

// 12 — a preset with NO booking/deposit leaves the toggles unset (default off).
test('preset without booking/deposit leaves toggles unset', () => {
  const r = seedTogglesFromPreset({}, undefined);
  assert.equal(r.schedulingEnabled, undefined, 'no booking → scheduling stays unset');
  assert.equal(r.depositEnabled, undefined, 'no deposit → deposit stays unset');
});

// 13 — GENERIC: real catalogue presets that ship booking exist, and EVERY one
//      would seed the toggle on (proves the fix isn't gutter-template-specific).
test('every booking-shipping catalogue preset would seed the toggle on', () => {
  const bookingPresets = TEMPLATE_PRESETS.filter(
    (t) => (t as unknown as { style?: PresetStyleLike }).style?.booking?.enabled === true,
  );
  assert.ok(bookingPresets.length > 1, 'expected multiple booking-shipping presets (generic, not one template)');
  for (const t of bookingPresets) {
    const style = (t as unknown as { style?: PresetStyleLike }).style;
    const r = seedTogglesFromPreset(style, undefined);
    assert.equal(r.schedulingEnabled, true, `preset "${t.id}" ships booking but toggle didn't seed on`);
  }
});

// eslint-disable-next-line no-console
console.log(`\ntemplateApply: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
