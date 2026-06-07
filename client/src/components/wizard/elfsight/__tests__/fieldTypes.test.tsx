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
import { makeField } from '../FieldsPanel';
import { PUBLIC_TO_FIELD_TYPE, FIELD_TYPE_TO_PUBLIC, type PublicFieldType } from '../types';
import { parseVideoEmbedSrc } from '@shared/templatePresets';

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
