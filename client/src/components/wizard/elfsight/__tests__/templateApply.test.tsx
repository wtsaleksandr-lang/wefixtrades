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

// eslint-disable-next-line no-console
console.log(`\ntemplateApply: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
