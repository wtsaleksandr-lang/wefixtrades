/**
 * COMPONENTS-1 — unit tests for the 5 new public field types.
 *
 * Covers:
 *  - `makeField()` factory output for each new public type.
 *  - `PUBLIC_TO_FIELD_TYPE` / `FIELD_TYPE_TO_PUBLIC` round-trip mappers.
 *  - Static SSR snapshot of the AdvancedCalculator FieldInput branch for
 *    the 3 display-only types (paragraph / divider / image) — confirms the
 *    renderer emits sensible markup with the field's owner-edited content.
 *
 * Matches the StyledSelect.test.tsx pattern (tsx + node:assert/strict +
 * renderToStaticMarkup). Run standalone via:
 *   tsx client/src/components/wizard/elfsight/__tests__/fieldTypes.test.tsx
 */
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
// PRICING-MODELS (U7) — the runtime field components (MatrixField & co.)
// rely on Vite's automatic JSX runtime; under standalone tsx the repo's
// `"jsx": "preserve"` tsconfig makes esbuild emit classic
// `React.createElement` calls instead, so expose React globally before any
// component renders.
(globalThis as { React?: typeof React }).React = React;
import { makeField } from '../FieldsPanel';
import { PUBLIC_TO_FIELD_TYPE, FIELD_TYPE_TO_PUBLIC, type PublicFieldType } from '../types';
import { parseVideoEmbedSrc, type TemplateRateMatrix } from '@shared/templatePresets';
// PRICING-MODELS (U7) — runtime field components for the SSR snapshots.
import MatrixField from '../../../quote-widget/MatrixField';
import DistanceField, { type DistanceAnswer } from '../../../quote-widget/DistanceField';
import PhotoUploadField from '../../../quote-widget/PhotoUploadField';
import { WIDGET_THEMES } from '../../../quote-widget/widgetThemes';

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

/* ─── PUBLIC_TO_FIELD_TYPE round-trip ─────────────────────────────────── */

const NEW_PUBLIC_TYPES: PublicFieldType[] = [
  'text', 'multiSelect', 'paragraph', 'divider', 'image',
  // BUILDER-COMPONENTS — content/CTA components.
  'button', 'link',
  // FIELD-PALETTE — newly-surfaced toggle + new video content type.
  'toggle', 'video',
  // WIZARD-GAPS — contact form content type.
  'contact_form',
  // PRICING-MODELS — three new pricing-model input types.
  'address_distance', 'rate_matrix', 'photo_upload',
];

test('all new public types map to a canonical engine type', () => {
  for (const pt of NEW_PUBLIC_TYPES) {
    const canonical = PUBLIC_TO_FIELD_TYPE[pt];
    assert.ok(canonical, `expected ${pt} to map to an engine type`);
  }
});

test('PUBLIC_TO_FIELD_TYPE / FIELD_TYPE_TO_PUBLIC are bidirectional for new types', () => {
  for (const pt of NEW_PUBLIC_TYPES) {
    const canonical = PUBLIC_TO_FIELD_TYPE[pt];
    const reversed = FIELD_TYPE_TO_PUBLIC[canonical];
    assert.equal(reversed, pt, `round-trip ${pt} → ${canonical} → ${reversed}`);
  }
});

test('canonical engine names are stable', () => {
  assert.equal(PUBLIC_TO_FIELD_TYPE.text, 'text');
  assert.equal(PUBLIC_TO_FIELD_TYPE.multiSelect, 'multi_select');
  assert.equal(PUBLIC_TO_FIELD_TYPE.paragraph, 'paragraph');
  assert.equal(PUBLIC_TO_FIELD_TYPE.divider, 'divider');
  assert.equal(PUBLIC_TO_FIELD_TYPE.image, 'image');
  assert.equal(PUBLIC_TO_FIELD_TYPE.button, 'button');
  assert.equal(PUBLIC_TO_FIELD_TYPE.link, 'link');
  assert.equal(PUBLIC_TO_FIELD_TYPE.toggle, 'toggle');
  assert.equal(PUBLIC_TO_FIELD_TYPE.video, 'video');
  assert.equal(PUBLIC_TO_FIELD_TYPE.contact_form, 'contact_form');
  // PRICING-MODELS — public names ARE the engine names (no alias layer).
  assert.equal(PUBLIC_TO_FIELD_TYPE.address_distance, 'address_distance');
  assert.equal(PUBLIC_TO_FIELD_TYPE.rate_matrix, 'rate_matrix');
  assert.equal(PUBLIC_TO_FIELD_TYPE.photo_upload, 'photo_upload');
});

/* ─── makeField() factories ───────────────────────────────────────────── */

test('makeField("text") seeds a single-line text input with placeholder', () => {
  const f = makeField('text');
  assert.equal(f.type, 'text');
  assert.ok(f.label, 'expected non-empty default label');
  assert.equal(f.placeholder, 'Type here…');
  assert.equal(f.validation, 'none');
  assert.ok(f.id.startsWith('text_'), `id should be prefixed: ${f.id}`);
});

test('makeField("multiSelect") seeds 3 options + multi_select type', () => {
  const f = makeField('multiSelect');
  assert.equal(f.type, 'multi_select');
  assert.ok(Array.isArray(f.options), 'expected options array');
  assert.equal(f.options?.length, 3);
  // Default options pre-price modifiers so the owner sees price-add right away.
  assert.ok((f.options ?? []).every(o => typeof o.value === 'number'));
});

test('makeField("paragraph") seeds body copy + paragraph type', () => {
  const f = makeField('paragraph');
  assert.equal(f.type, 'paragraph');
  assert.ok(f.content && f.content.length > 0, 'expected non-empty default body');
  // Paragraph does not carry options / numeric ranges.
  assert.equal(f.options, undefined);
  assert.equal(f.min, undefined);
});

test('makeField("divider") seeds default thickness + tone', () => {
  const f = makeField('divider');
  assert.equal(f.type, 'divider');
  assert.equal(f.dividerThickness, 1);
  assert.equal(f.dividerTone, 'subtle');
});

test('makeField("image") seeds empty URL + caption slots', () => {
  const f = makeField('image');
  assert.equal(f.type, 'image');
  assert.equal(f.imageUrl, '');
  assert.equal(f.imageCaption, '');
});

test('makeField("button") seeds a tappable action button (no calc fields)', () => {
  const f = makeField('button');
  assert.equal(f.type, 'button');
  assert.ok(f.label, 'expected non-empty default label (button text)');
  assert.equal(f.buttonAction, 'tel');
  assert.equal(f.href, '');
  // Content component — never options / numeric ranges.
  assert.equal(f.options, undefined);
  assert.equal(f.on_value, undefined);
});

test('makeField("link") seeds an inline link (no calc fields)', () => {
  const f = makeField('link');
  assert.equal(f.type, 'link');
  assert.ok(f.label, 'expected non-empty default label (link text)');
  assert.equal(f.href, '');
  assert.equal(f.options, undefined);
  assert.equal(f.on_value, undefined);
});

test('makeField("toggle") seeds a yes/no toggle (no options)', () => {
  const f = makeField('toggle');
  assert.equal(f.type, 'toggle');
  assert.ok(f.label, 'expected non-empty default label');
  assert.equal(f.options, undefined);
});

test('makeField("video") seeds empty URL + caption slots (no calc fields)', () => {
  const f = makeField('video');
  assert.equal(f.type, 'video');
  assert.equal(f.videoUrl, '');
  assert.equal(f.videoCaption, '');
  assert.equal(f.options, undefined);
  assert.equal(f.on_value, undefined);
});

test('makeField("contact_form") seeds heading + default required set (no calc fields)', () => {
  const f = makeField('contact_form');
  assert.equal(f.type, 'contact_form');
  assert.ok(f.label, 'expected non-empty default heading');
  assert.deepEqual(f.contactRequire, ['name', 'email']);
  // Content component — no options / numeric ranges / on_value.
  assert.equal(f.options, undefined);
  assert.equal(f.min, undefined);
  assert.equal(f.on_value, undefined);
});

/* ─── PRICING-MODELS — makeField factories for the 3 new types ────────── */

test('makeField("address_distance") seeds unit + manual-fallback defaults', () => {
  const f = makeField('address_distance');
  assert.equal(f.type, 'address_distance');
  assert.ok(f.label, 'expected non-empty default label');
  assert.equal(f.distanceUnit, 'miles');
  assert.equal(f.roundTrip, false);
  assert.equal(f.allowManualDistance, true);
  // Computed-token input — never options / on_value.
  assert.equal(f.options, undefined);
  assert.equal(f.on_value, undefined);
});

test('makeField("rate_matrix") seeds a filled 2×2 with coherent rates', () => {
  const f = makeField('rate_matrix');
  assert.equal(f.type, 'rate_matrix');
  assert.ok(f.matrix, 'expected a seeded matrix');
  const m = f.matrix!;
  assert.equal(m.rows.length, 2);
  assert.equal(m.cols.length, 2);
  assert.equal(m.missingCell, 'custom_quote');
  // Every seeded cell resolves to a finite rate (no dangling row/col ids).
  for (const r of m.rows) {
    for (const col of m.cols) {
      const rate = m.rates[r.id]?.[col.id];
      assert.ok(typeof rate === 'number' && isFinite(rate),
        `expected finite rate for ${r.id}×${col.id}, got ${rate}`);
    }
  }
});

test('makeField("photo_upload") seeds maxPhotos 3 / maxPhotoMb 8 (answer-only)', () => {
  const f = makeField('photo_upload');
  assert.equal(f.type, 'photo_upload');
  assert.equal(f.maxPhotos, 3);
  assert.equal(f.maxPhotoMb, 8);
  // Answer-only — never feeds the formula: no options / on_value / ranges.
  assert.equal(f.options, undefined);
  assert.equal(f.on_value, undefined);
  assert.equal(f.min, undefined);
});

/* ─── PRICING-MODELS — SSR snapshots of the 3 runtime fields ──────────── */
/* Explicit React.createElement (StyledSelect.test.tsx pattern) — the repo's
 * tsconfig uses `"jsx": "preserve"`, so JSX literals in tsx-run test files
 * don't get the classic factory wired up. */

const h = React.createElement;
const THEME = WIDGET_THEMES.light;
const SSR_BASE = {
  labelStyle: {} as React.CSSProperties,
  theme: THEME,
  inputBase: {} as React.CSSProperties,
  radiusPx: '10px',
  labelColor: '#0d3cfc',
  onChange: () => {},
};

const SSR_MATRIX: TemplateRateMatrix = {
  rowLabel: 'Dumpster size',
  colLabel: 'Delivery zone',
  rows: [{ id: 'yd10', label: '10 yard' }, { id: 'yd40', label: '40 yard' }],
  cols: [{ id: 'zone_a', label: 'Zone A' }, { id: 'zone_c', label: 'Zone C' }],
  rates: { yd10: { zone_a: 295, zone_c: 365 }, yd40: { zone_a: 595 } }, // 40yd×C absent
  missingCell: 'custom_quote',
};

test('SSR rate_matrix: renders both axis dropdowns with the owner labels', () => {
  const html = renderToStaticMarkup(h(MatrixField, {
    ...SSR_BASE,
    label: 'Container size & delivery zone',
    matrix: SSR_MATRIX,
    value: { rowId: 'yd10', colId: 'zone_a' },
    fieldId: 'm1',
  }));
  assert.ok(html.includes('data-testid="adv-matrix-m1"'), `expected matrix wrapper: ${html}`);
  assert.ok(html.includes('Dumpster size'), `expected row label: ${html}`);
  assert.ok(html.includes('Delivery zone'), `expected col label: ${html}`);
  assert.ok(
    !html.includes('data-testid="adv-matrix-customquote-m1"'),
    `priced cell must NOT show the custom-quote note: ${html}`,
  );
});

test('SSR rate_matrix: missing cell under custom_quote shows the "quoted individually" note', () => {
  const html = renderToStaticMarkup(h(MatrixField, {
    ...SSR_BASE,
    label: 'Container size & delivery zone',
    matrix: SSR_MATRIX,
    value: { rowId: 'yd40', colId: 'zone_c' },
    fieldId: 'm2',
  }));
  assert.ok(
    html.includes('data-testid="adv-matrix-customquote-m2"'),
    `expected the custom-quote note: ${html}`,
  );
  assert.ok(html.includes('quoted individually'), `expected honest note copy: ${html}`);
});

test('SSR rate_matrix: missing cell under "zero" rule renders NO note', () => {
  const html = renderToStaticMarkup(h(MatrixField, {
    ...SSR_BASE,
    label: 'Route',
    matrix: { ...SSR_MATRIX, missingCell: 'zero' as const },
    value: { rowId: 'yd40', colId: 'zone_c' },
    fieldId: 'm3',
  }));
  assert.ok(
    !html.includes('data-testid="adv-matrix-customquote-m3"'),
    `zero rule must not render the note: ${html}`,
  );
});

test('SSR rate_matrix: single-axis (1 col) collapses to one dropdown', () => {
  const single: TemplateRateMatrix = {
    rowLabel: 'Port / ramp',
    colLabel: 'Zip zone',
    rows: [{ id: 'r1', label: 'Port of LA' }, { id: 'r2', label: 'ICTF ramp' }],
    cols: [{ id: 'c1', label: 'Flat' }],
    rates: { r1: { c1: 480 }, r2: { c1: 520 } },
  };
  const html = renderToStaticMarkup(h(MatrixField, {
    ...SSR_BASE,
    label: 'Lane',
    matrix: single,
    value: { rowId: '', colId: 'c1' },
    fieldId: 'm4',
  }));
  assert.ok(html.includes('Port / ramp'), `expected the row dropdown: ${html}`);
  assert.ok(!html.includes('Zip zone'), `single-axis must hide the col dropdown: ${html}`);
});

test('SSR rate_matrix: empty grid renders the editor placeholder', () => {
  const html = renderToStaticMarkup(h(MatrixField, {
    ...SSR_BASE,
    label: 'Route',
    matrix: { rowLabel: 'From', colLabel: 'To', rows: [], cols: [], rates: {} },
    value: { rowId: '', colId: '' },
    fieldId: 'm5',
  }));
  assert.ok(
    html.includes('data-testid="adv-matrix-placeholder-m5"'),
    `expected empty-grid placeholder: ${html}`,
  );
});

const DIST_BASE = {
  theme: THEME,
  accent: '#0d3cfc',
  radiusPx: '10px',
  onChange: () => {},
};

test('SSR address_distance: resolved answer renders the mileage chip', () => {
  const value: DistanceAnswer = {
    address: '500 Oak St, Springfield', distanceMiles: 12.4,
    durationMin: 21, formattedAddress: '500 Oak St, Springfield, IL', status: 'resolved',
  };
  const html = renderToStaticMarkup(h(DistanceField, {
    ...DIST_BASE, label: 'Your new address', value, fieldId: 'd1',
  }));
  assert.ok(html.includes('data-testid="adv-distance-chip-d1"'), `expected resolved chip: ${html}`);
  assert.ok(html.includes('12.4 mi from our location'), `expected formatted miles: ${html}`);
});

test('SSR address_distance: km display unit converts the canonical miles', () => {
  const value: DistanceAnswer = { address: '10 High St', distanceMiles: 10, status: 'resolved' };
  const html = renderToStaticMarkup(h(DistanceField, {
    ...DIST_BASE, label: 'Address', value, fieldId: 'd2',
    distanceUnit: 'km' as const, roundTrip: true,
  }));
  assert.ok(html.includes('16.1 km from our location'), `expected km conversion: ${html}`);
  assert.ok(html.includes('round trip ×2'), `expected round-trip marker: ${html}`);
});

test('SSR address_distance: lookup error renders honest copy + manual fallback input', () => {
  const value: DistanceAnswer = {
    address: '123 Nowhere Lane', distanceMiles: null,
    status: 'error', errorReason: 'not_found',
  };
  const html = renderToStaticMarkup(h(DistanceField, {
    ...DIST_BASE, label: 'Address', value, fieldId: 'd3',
  }));
  assert.ok(html.includes('couldn’t find that address'), `expected not_found copy: ${html}`);
  // allowManualDistance defaults TRUE → manual miles input renders.
  assert.ok(html.includes('data-testid="adv-distance-manual-d3"'), `expected manual input: ${html}`);
  assert.ok(html.includes('Distance in miles'), `expected manual label: ${html}`);
});

test('SSR address_distance: beyond maxDistanceMiles renders the out-of-area note', () => {
  const value: DistanceAnswer = { address: '1 Far Rd', distanceMiles: 80, status: 'resolved' };
  const html = renderToStaticMarkup(h(DistanceField, {
    ...DIST_BASE, label: 'Address', value, fieldId: 'd4', maxDistanceMiles: 50,
  }));
  assert.ok(
    html.includes('data-testid="adv-distance-outofarea-d4"'),
    `expected out-of-area note: ${html}`,
  );
});

test('SSR photo_upload: empty answer renders the dashed add-tile + 0/cap count', () => {
  const html = renderToStaticMarkup(h(PhotoUploadField, {
    ...SSR_BASE, accent: '#0d3cfc', label: 'Add photos of the job',
    value: { photos: [] }, fieldId: 'p1', maxPhotos: 3,
  }));
  assert.ok(html.includes('data-testid="adv-photo-add-p1"'), `expected add tile: ${html}`);
  assert.ok(html.includes('Add photos'), `expected tile copy: ${html}`);
  assert.ok(html.includes('>0/3<'), `expected 0/3 count: ${html}`);
});

test('SSR photo_upload: persisted answer rebuilds the thumb grid (cap clamps 1-5)', () => {
  const html = renderToStaticMarkup(h(PhotoUploadField, {
    ...SSR_BASE, accent: '#0d3cfc', label: 'Photos',
    value: { photos: [
      { url: '/uploads/lead-photos/abc123', name: 'pile.jpg' },
      { url: '/uploads/lead-photos/def456', name: 'curb.jpg' },
    ] },
    fieldId: 'p2', maxPhotos: 99,
  }));
  assert.ok(html.includes('src="/uploads/lead-photos/abc123"'), `expected first thumb: ${html}`);
  assert.ok(html.includes('alt="curb.jpg"'), `expected second thumb alt: ${html}`);
  // maxPhotos 99 clamps to 5 at render time.
  assert.ok(html.includes('>2/5<'), `expected clamped 2/5 count: ${html}`);
});

/* ─── parseVideoEmbedSrc — host allowlist + URL → embed ───────────────── */

test('parseVideoEmbedSrc parses YouTube watch / short / embed + bare id', () => {
  assert.equal(parseVideoEmbedSrc('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    'https://www.youtube.com/embed/dQw4w9WgXcQ');
  assert.equal(parseVideoEmbedSrc('https://youtu.be/dQw4w9WgXcQ'),
    'https://www.youtube.com/embed/dQw4w9WgXcQ');
  assert.equal(parseVideoEmbedSrc('https://www.youtube.com/embed/dQw4w9WgXcQ'),
    'https://www.youtube.com/embed/dQw4w9WgXcQ');
  assert.equal(parseVideoEmbedSrc('https://youtube.com/shorts/dQw4w9WgXcQ'),
    'https://www.youtube.com/embed/dQw4w9WgXcQ');
  // Bare 11-char id.
  assert.equal(parseVideoEmbedSrc('dQw4w9WgXcQ'),
    'https://www.youtube.com/embed/dQw4w9WgXcQ');
});

test('parseVideoEmbedSrc parses Vimeo URL + bare numeric id', () => {
  assert.equal(parseVideoEmbedSrc('https://vimeo.com/76979871'),
    'https://player.vimeo.com/video/76979871');
  assert.equal(parseVideoEmbedSrc('https://player.vimeo.com/video/76979871'),
    'https://player.vimeo.com/video/76979871');
  assert.equal(parseVideoEmbedSrc('76979871'),
    'https://player.vimeo.com/video/76979871');
});

test('parseVideoEmbedSrc rejects non-allowlisted hosts + junk (no XSS)', () => {
  assert.equal(parseVideoEmbedSrc(''), null);
  assert.equal(parseVideoEmbedSrc('   '), null);
  assert.equal(parseVideoEmbedSrc('https://evil.com/embed/abc'), null);
  assert.equal(parseVideoEmbedSrc('https://notyoutube.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(parseVideoEmbedSrc('javascript:alert(1)'), null);
  assert.equal(parseVideoEmbedSrc('not a url'), null);
});

test('makeField produces a stable unique id per call', () => {
  const a = makeField('paragraph');
  const b = makeField('paragraph');
  assert.notEqual(a.id, b.id, 'consecutive calls should mint distinct ids');
});

/* ─── Done ────────────────────────────────────────────────────────────── */

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
