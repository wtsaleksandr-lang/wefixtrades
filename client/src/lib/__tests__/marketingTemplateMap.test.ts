/**
 * Unit tests for marketingTemplateMap — the kebab-case → snake_case bridge
 * between the marketing /templates + /demo CTAs and the wizard's preset
 * catalogue.
 *
 * Excluded from `tsc --noEmit` via tsconfig.json's `**\/*.test.ts` glob.
 * Runnable standalone via
 *   tsx client/src/lib/__tests__/marketingTemplateMap.test.ts
 * Uses Node's built-in `assert/strict` so no test runner dep is added —
 * matches the existing convention in contrastGuard.test.ts.
 */
import assert from 'node:assert/strict';
import { TEMPLATE_PRESETS } from '@shared/templatePresets';
import {
  MARKETING_TO_WIZARD_PRESET,
  marketingToWizardPresetId,
  buildWizardHrefForMarketingTemplate,
} from '../marketingTemplateMap';

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

/* ─── Catalogue alignment ────────────────────────────────────────── */
// Guards against a future preset rename silently breaking the redirect.

test('every mapped wizard preset id exists in TEMPLATE_PRESETS', () => {
  const presetIds = new Set(TEMPLATE_PRESETS.map((t) => t.id));
  for (const [marketingId, wizardId] of Object.entries(MARKETING_TO_WIZARD_PRESET)) {
    assert.ok(
      presetIds.has(wizardId),
      `Marketing id "${marketingId}" → wizard id "${wizardId}" not found in TEMPLATE_PRESETS`,
    );
  }
});

/* ─── marketingToWizardPresetId ──────────────────────────────────── */

test('returns the mapped wizard id for a known marketing id', () => {
  assert.equal(marketingToWizardPresetId('landscaping'), 'landscaping');
});

test('returns null for an unknown marketing id', () => {
  assert.equal(marketingToWizardPresetId('unknown-id'), null);
});

/* ─── buildWizardHrefForMarketingTemplate ────────────────────────── */

test('builds /wizard?template=<id> for a known marketing id', () => {
  assert.equal(
    buildWizardHrefForMarketingTemplate('plumbing'),
    '/wizard?template=plumbing_service',
  );
});

test('falls back to /wizard (blank) for an unknown marketing id', () => {
  assert.equal(buildWizardHrefForMarketingTemplate('unknown'), '/wizard');
});

/* ─── Done ───────────────────────────────────────────────────────── */

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
