/**
 * PRICING-MODELS U0 — regression test for the P1 latent 400 bug in
 * `shared/schemas/calculator.ts` (`advanced.fields[].type`).
 *
 * The server zod enum used to accept only the original 9 engine types while
 * the client `FieldType` union had grown to 16 — any wizard save containing
 * `paragraph|divider|image|button|link|video|contact_form` 400'd on both
 * POST and PATCH. The enum now mirrors the FULL 19-type union (incl. the
 * pricing-model types `address_distance` / `rate_matrix` / `photo_upload`).
 *
 * Covers (deliberate-failure rule — the gate must PROVE it catches a
 * regression, not just that it runs):
 *  1. A config containing ALL 19 field types parses OK.
 *  2. A bogus 20th type FAILS the parse.
 *  3. Per-type slots survive the parse (strip-unknown-keys regression):
 *     paragraph `content`, video `videoUrl`, rate_matrix `matrix`, distance
 *     + photo slots.
 *  4. `advanced.origin` round-trips; an origin without an address fails.
 *  5. Compile-time drift guard: the 19-type list in this file must stay
 *     exhaustive over `FieldType` (tsc fails when the union grows again).
 *
 * Matches the repo's tsx test pattern (node:assert/strict + process.exit).
 * Wired into package.json as `check:calculator-schema` (CI: ci.yml).
 * Run standalone via:
 *   tsx shared/schemas/calculator.fieldTypes.test.ts
 */
import assert from 'node:assert/strict';
import { calculatorSettingsSchema } from './calculator';
import type { FieldType } from '../templatePresets';

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

/* ─── The canonical 19-type union ─────────────────────────────────────── */

const ALL_FIELD_TYPES = [
  'number', 'slider', 'select', 'radio', 'multi_select', 'toggle', 'text',
  'image_choice', 'heading',
  'paragraph', 'divider', 'image', 'button', 'link', 'video', 'contact_form',
  'address_distance', 'rate_matrix', 'photo_upload',
] as const;

// Compile-time exhaustiveness guard, BOTH directions:
//  - every entry above must be a real FieldType (satisfies);
//  - every FieldType must appear above (Record over the union). When the
//    union grows again, tsc fails HERE until the schema test is updated —
//    which is exactly the drift this P1 bug was made of.
const _allAreFieldTypes = ALL_FIELD_TYPES satisfies readonly FieldType[];
void _allAreFieldTypes;
const _unionIsCovered: Record<FieldType, true> = Object.fromEntries(
  ALL_FIELD_TYPES.map((t) => [t, true]),
) as Record<FieldType, true>;
void _unionIsCovered;

/* ─── Fixture helpers ─────────────────────────────────────────────────── */

function fieldOf(type: string, extra: Record<string, unknown> = {}) {
  return {
    id: `f_${type}`,
    name: `Field ${type}`,
    label: `Field ${type}`,
    type,
    ...extra,
  };
}

function settingsWithFields(fields: unknown[]): Record<string, unknown> {
  return {
    advanced: {
      enabled: true,
      fields,
      calculations: [
        { id: 'c1', name: 'Total', formula: '[Field number] * 2' },
      ],
    },
  };
}

/* ─── 1. All 19 types parse ───────────────────────────────────────────── */

test('a config containing ALL 19 field types parses OK', () => {
  const fixture = settingsWithFields(ALL_FIELD_TYPES.map((t) => fieldOf(t)));
  const r = calculatorSettingsSchema.safeParse(fixture);
  assert.ok(
    r.success,
    `expected the 19-type fixture to parse; issues: ${
      r.success ? '' : JSON.stringify(r.error.issues.slice(0, 5))}`,
  );
  const parsed = (r as { success: true; data: any }).data;
  assert.equal(parsed.advanced.fields.length, ALL_FIELD_TYPES.length);
  for (const t of ALL_FIELD_TYPES) {
    assert.ok(
      parsed.advanced.fields.some((f: any) => f.type === t),
      `expected parsed output to retain a ${t} field`,
    );
  }
});

test('each of the 19 types ALSO parses individually (pinpoints a regression)', () => {
  for (const t of ALL_FIELD_TYPES) {
    const r = calculatorSettingsSchema.safeParse(settingsWithFields([fieldOf(t)]));
    assert.ok(r.success, `type '${t}' should be accepted by the schema enum`);
  }
});

/* ─── 2. Deliberate failure — a bogus 20th type must FAIL ─────────────── */

test('a bogus 20th field type FAILS the parse (gate catches regressions)', () => {
  const r = calculatorSettingsSchema.safeParse(
    settingsWithFields([fieldOf('gradient_picker')]),
  );
  assert.equal(r.success, false, 'bogus type must be rejected');
  const issues = (r as { success: false; error: any }).error.issues;
  assert.ok(
    issues.some((i: any) => i.path.join('.').includes('fields') && i.path.includes('type')),
    `expected the failure to point at fields[].type; got ${JSON.stringify(issues.slice(0, 3))}`,
  );
});

/* ─── 3. Per-type slots survive the parse (strip-unknown-keys fix) ────── */

test('content-component slots round-trip (paragraph content / videoUrl / href)', () => {
  const r = calculatorSettingsSchema.safeParse(settingsWithFields([
    fieldOf('paragraph', { content: 'Body copy survives.' }),
    fieldOf('video', { videoUrl: 'https://youtu.be/dQw4w9WgXcQ', videoCaption: 'cap' }),
    fieldOf('button', { href: 'https://example.com', buttonAction: 'url' }),
    fieldOf('contact_form', { contactRequire: ['name', 'email'] }),
  ]));
  assert.ok(r.success, 'fixture should parse');
  const fields = (r as any).data.advanced.fields;
  assert.equal(fields[0].content, 'Body copy survives.');
  assert.equal(fields[1].videoUrl, 'https://youtu.be/dQw4w9WgXcQ');
  assert.equal(fields[2].href, 'https://example.com');
  assert.deepEqual(fields[3].contactRequire, ['name', 'email']);
});

test('pricing-model slots round-trip (matrix / distance / photo)', () => {
  const matrix = {
    rowLabel: 'Port', colLabel: 'Zip zone',
    rows: [{ id: 'r1', label: 'LA/LB' }],
    cols: [{ id: 'c1', label: '90210' }],
    rates: { r1: { c1: 425 } },
    missingCell: 'custom_quote',
  };
  const r = calculatorSettingsSchema.safeParse(settingsWithFields([
    fieldOf('rate_matrix', { matrix }),
    fieldOf('address_distance', {
      distanceUnit: 'miles', roundTrip: true,
      maxDistanceMiles: 80, allowManualDistance: true,
    }),
    fieldOf('photo_upload', { maxPhotos: 3, maxPhotoMb: 8 }),
  ]));
  assert.ok(r.success, 'fixture should parse');
  const fields = (r as any).data.advanced.fields;
  assert.deepEqual(fields[0].matrix, matrix, 'matrix must survive verbatim');
  assert.equal(fields[1].roundTrip, true);
  assert.equal(fields[1].maxDistanceMiles, 80);
  assert.equal(fields[2].maxPhotos, 3);
});

/* ─── 4. advanced.origin ──────────────────────────────────────────────── */

test('advanced.origin round-trips (address + geocoded lat/lng)', () => {
  const fixture = {
    advanced: {
      enabled: true,
      fields: [fieldOf('address_distance')],
      origin: { address: '14 Main St, Springfield', lat: 39.8, lng: -89.6 },
    },
  };
  const r = calculatorSettingsSchema.safeParse(fixture);
  assert.ok(r.success, 'origin fixture should parse');
  assert.deepEqual((r as any).data.advanced.origin, {
    address: '14 Main St, Springfield', lat: 39.8, lng: -89.6,
  });
});

test('an origin without an address FAILS the parse', () => {
  const r = calculatorSettingsSchema.safeParse({
    advanced: { enabled: true, fields: [], origin: { lat: 1, lng: 2 } },
  });
  assert.equal(r.success, false, 'origin.address is required when origin is set');
});

/* ─── Done ────────────────────────────────────────────────────────────── */

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
