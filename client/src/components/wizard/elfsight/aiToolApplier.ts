/**
 * Wave K — Apply a tool call from the AI assistant to the editor's
 * ShellState through the setters already exposed by WizardShell.
 *
 * The contract mirrors the server-side tool definitions in
 * server/services/quotequickAiTools.ts. The two halves are deliberately
 * thin so the contract is easy to audit.
 *
 * Every branch is best-effort: bad input from the model should never
 * crash the editor. If we can't apply, we throw and let AIBubble surface
 * a friendly chip / error.
 */

import { makeField } from './FieldsPanel';
import type { ShellState, ShellHeader, ShellResults, ShellStyle, ShellSettings, PublicFieldType } from './types';
import { THEME_COMBOS, comboToStyleColors } from '@shared/templatePresets';
import type { TemplateField, TemplateCalculation, TemplateConfig, TemplateOption, TemplateRateMatrix, FieldType, TrustBadge } from '@shared/templatePresets';
import { QUOTEQUICK_ICONS } from '@/data/quoteQuickIcons';

export interface AiToolCall {
  id?: string;
  name: string;
  input: Record<string, any>;
}

/**
 * U6 restyle-integrity return channel — when an applier DROPS invalid values
 * from the model's input (keeping the valid remainder), it reports the dropped
 * keys here so the chat can tell the user honestly what did NOT take, instead
 * of the success chip silently claiming the whole change landed.
 *
 * `undefined` (or an empty `droppedKeys`) means a clean apply — caller treats
 * it exactly as before (normal success chip). Currently only `set_style`
 * surfaces drops; other tools console.warn internally and return void.
 */
export interface AiApplyResult {
  droppedKeys?: string[];
}

export interface AiApplierContext {
  state: ShellState;
  setFields: (next: TemplateField[]) => void;
  setCalculations: (next: TemplateCalculation[]) => void;
  setHeader: (next: ShellHeader) => void;
  setResults: (next: ShellResults) => void;
  setStyle: (next: ShellStyle) => void;
  setSettings: (next: ShellSettings) => void;
  setLogo: (next: string | null) => void;
  /** AI-gen quality (gap 1) — writes `ShellState.businessName` so the
   *  replace_template tool's optional `business_name` param is honoured. */
  setBusinessName: (v: string) => void;
  applyTemplatePreset: (presetId: string) => void;
  replaceTemplate: (cfg: TemplateConfig) => void;
}

/* ── Field-type coercion: the model may send the canonical engine type
 *    (`select`, `radio`, `image_choice`) OR the public-friendly alias
 *    (`dropdown`, `choice`, `imageChoice`). Both map to the engine type. */
const TYPE_ALIASES: Record<string, FieldType> = {
  number: 'number',
  slider: 'slider',
  select: 'select',
  dropdown: 'select',
  radio: 'radio',
  choice: 'radio',
  multi_select: 'multi_select',
  multiselect: 'multi_select',
  toggle: 'toggle',
  text: 'text',
  image_choice: 'image_choice',
  imagechoice: 'image_choice',
  imageChoice: 'image_choice' as FieldType,
  heading: 'heading',
  // PRICING-MODELS — distance / rate-matrix / photo-upload + the friendly
  // aliases the model is likely to send.
  address_distance: 'address_distance',
  distance: 'address_distance',
  address: 'address_distance',
  rate_matrix: 'rate_matrix',
  matrix: 'rate_matrix',
  photo_upload: 'photo_upload',
  photo: 'photo_upload',
  file_upload: 'photo_upload',
};

function coerceFieldType(raw: string): FieldType | null {
  const t = TYPE_ALIASES[raw];
  return t ?? null;
}

/** Engine type → corresponding `PublicFieldType` so we can reuse makeField. */
const ENGINE_TO_PUBLIC: Record<FieldType, PublicFieldType | null> = {
  number: 'number',
  slider: 'slider',
  select: 'dropdown',
  radio: 'choice',
  image_choice: 'imageChoice',
  heading: 'heading',
  // COMPONENTS-1 — multi_select and text now have first-class public types
  // (Wave U-F1), so the AI tool applier can hydrate them directly via
  // makeField rather than degrading to dropdown / null.
  multi_select: 'multiSelect',
  // FIELD-PALETTE — toggle now has a first-class public type (surfaced in the
  // picker), so the AI tool applier hydrates it directly via makeField.
  toggle: 'toggle',
  text: 'text',
  paragraph: 'paragraph',
  divider: 'divider',
  image: 'image',
  // BUILDER-COMPONENTS — content/CTA components. First-class public types so
  // the AI tool applier can hydrate them via makeField.
  button: 'button',
  link: 'link',
  // FIELD-PALETTE — video embed (YouTube / Vimeo).
  video: 'video',
  // WIZARD-GAPS — contact form content component.
  contact_form: 'contact_form',
  // PRICING-MODELS — first-class public types (canonical names pass through)
  // so the AI tool applier hydrates them via makeField with sane defaults.
  address_distance: 'address_distance',
  rate_matrix: 'rate_matrix',
  photo_upload: 'photo_upload',
};

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function coerceOptions(raw: any): TemplateOption[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: TemplateOption[] = [];
  for (const o of raw) {
    if (!o || typeof o !== 'object') continue;
    const label = String(o.label ?? '').trim();
    if (!label) continue;
    const value = Number(o.value ?? 0);
    out.push({ id: uid('opt'), label, value: Number.isFinite(value) ? value : 0 });
  }
  return out.length ? out : undefined;
}

/* ── PRICING-MODELS (U5) — validated freedom on the new field types'
 *    optional params, mirroring the U6 style-sanitiser policy: known keys
 *    are checked, invalid values are DROPPED (console.warn, never throw),
 *    the valid remainder applies. An incoherent `matrix` is dropped whole —
 *    the field still creates with the seeded default from makeField. */

function coerceBoolean(raw: any): boolean | undefined {
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true' || raw === 1 || raw === '1') return true;
  if (raw === 'false' || raw === 0 || raw === '0') return false;
  return undefined;
}

function slugify(label: string): string {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** rows/cols: non-empty array of { id, label }. Missing ids are derived by
 *  slugifying the label (the prompt tells the model to do exactly that). */
function coerceMatrixAxis(raw: any): Array<{ id: string; label: string }> | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: Array<{ id: string; label: string }> = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const label = String(entry.label ?? '').trim();
    if (!label) continue;
    let id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : slugify(label);
    if (!id) id = uid('m');
    if (seen.has(id)) id = `${id}_${out.length}`;
    seen.add(id);
    out.push({ id, label });
  }
  return out.length ? out : null;
}

/** Validate a `rate_matrix` config from the model. Returns null (drop whole
 *  matrix) when rows/cols are incoherent; numeric rate cells are coerced
 *  (strings accepted), NaN cells dropped — `missingCell` covers the holes. */
function sanitiseRateMatrix(raw: any): TemplateRateMatrix | null {
  if (!raw || typeof raw !== 'object') return null;
  const rows = coerceMatrixAxis(raw.rows);
  const cols = coerceMatrixAxis(raw.cols);
  if (!rows || !cols) return null;
  const rates: Record<string, Record<string, number>> = {};
  const rawRates = raw.rates && typeof raw.rates === 'object' ? raw.rates : {};
  for (const row of rows) {
    rates[row.id] = {};
    // The model addresses rates by id; tolerate label-keyed cells too.
    const rawRow = rawRates[row.id] ?? rawRates[row.label];
    if (!rawRow || typeof rawRow !== 'object') continue;
    for (const col of cols) {
      const cell = rawRow[col.id] ?? rawRow[col.label];
      const n = typeof cell === 'string' ? Number(cell) : cell;
      if (typeof n === 'number' && Number.isFinite(n)) rates[row.id][col.id] = n;
    }
  }
  const matrix: TemplateRateMatrix = {
    rowLabel: String(raw.rowLabel ?? '').trim() || 'Pickup zone',
    colLabel: String(raw.colLabel ?? '').trim() || 'Drop-off zone',
    rows,
    cols,
    rates,
  };
  if (raw.missingCell === 'zero' || raw.missingCell === 'custom_quote') matrix.missingCell = raw.missingCell;
  return matrix;
}

const PRICING_PARAM_KEYS = ['distanceUnit', 'roundTrip', 'allowManualDistance', 'maxDistanceMiles', 'matrix', 'maxPhotos'] as const;

/** Sanitise the pricing-model params present on `src` (add_field input or an
 *  edit_field patch). Only keys present on `src` are considered — strictly
 *  additive; absent keys leave the field's factory defaults untouched. */
function sanitisePricingParams(src: Record<string, any>): { clean: Partial<TemplateField>; dropped: string[] } {
  const clean: Partial<TemplateField> = {};
  const dropped: string[] = [];
  if ('distanceUnit' in src) {
    if (src.distanceUnit === 'miles' || src.distanceUnit === 'km') clean.distanceUnit = src.distanceUnit;
    else dropped.push('distanceUnit');
  }
  if ('roundTrip' in src) {
    const b = coerceBoolean(src.roundTrip);
    if (b !== undefined) clean.roundTrip = b;
    else dropped.push('roundTrip');
  }
  if ('allowManualDistance' in src) {
    const b = coerceBoolean(src.allowManualDistance);
    if (b !== undefined) clean.allowManualDistance = b;
    else dropped.push('allowManualDistance');
  }
  if ('maxDistanceMiles' in src) {
    const n = Number(src.maxDistanceMiles);
    if (Number.isFinite(n) && n > 0) clean.maxDistanceMiles = n;
    else dropped.push('maxDistanceMiles');
  }
  if ('matrix' in src) {
    const m = sanitiseRateMatrix(src.matrix);
    if (m) clean.matrix = m;
    else dropped.push('matrix');
  }
  if ('maxPhotos' in src) {
    const n = Number(src.maxPhotos);
    if (Number.isFinite(n)) clean.maxPhotos = Math.min(5, Math.max(1, Math.round(n)));
    else dropped.push('maxPhotos');
  }
  return { clean, dropped };
}

/* ─── Tool implementations ─── */

function applyAddField(input: any, ctx: AiApplierContext): void {
  const type = coerceFieldType(String(input.type ?? ''));
  if (!type) throw new Error(`unknown field type ${input.type}`);
  const label = String(input.label ?? input.name ?? 'New field');

  let base: TemplateField;
  const publicType = ENGINE_TO_PUBLIC[type];
  if (publicType) {
    base = { ...makeField(publicType), label, name: label, type };
  } else {
    base = { id: uid(type), name: label, label, type };
  }
  if (typeof input.default_value === 'number') base.default_value = input.default_value;
  if (typeof input.min === 'number') base.min = input.min;
  if (typeof input.max === 'number') base.max = input.max;
  if (typeof input.step === 'number') base.step = input.step;
  if (typeof input.unit === 'string') base.unit = input.unit;
  if (typeof input.on_value === 'number') base.on_value = input.on_value;
  const opts = coerceOptions(input.options);
  if (opts) base.options = opts;

  // PRICING-MODELS — validated freedom on distance / matrix / photo params.
  const { clean: pricingParams, dropped } = sanitisePricingParams(input);
  Object.assign(base, pricingParams);
  if (dropped.length) {
    console.warn(`[quotequick-ai] add_field ignored invalid values: ${dropped.join(', ')}`);
  }

  ctx.setFields([...ctx.state.fields, base]);
}

function applyRemoveField(input: any, ctx: AiApplierContext): void {
  const id = String(input.id ?? '');
  if (!id) throw new Error('id required');
  ctx.setFields(ctx.state.fields.filter(f => f.id !== id));
}

function applyEditField(input: any, ctx: AiApplierContext): void {
  const id = String(input.id ?? '');
  if (!id) throw new Error('id required');
  const patch = (input.patch ?? {}) as Partial<TemplateField>;
  const sanitisedPatch: Partial<TemplateField> = { ...patch };
  if (typeof patch.type === 'string') {
    const t = coerceFieldType(patch.type as any);
    if (t) sanitisedPatch.type = t;
    else delete sanitisedPatch.type;
  }
  if (patch.options) {
    const opts = coerceOptions(patch.options);
    if (opts) sanitisedPatch.options = opts;
    else delete sanitisedPatch.options;
  }
  // PRICING-MODELS — validated freedom on distance / matrix / photo params:
  // strip every pricing key from the raw patch, re-apply only the validated
  // remainder (invalid values are dropped, not merged).
  const { clean: pricingParams, dropped } = sanitisePricingParams(patch as Record<string, any>);
  for (const key of PRICING_PARAM_KEYS) delete (sanitisedPatch as Record<string, any>)[key];
  Object.assign(sanitisedPatch, pricingParams);
  if (dropped.length) {
    console.warn(`[quotequick-ai] edit_field ignored invalid values: ${dropped.join(', ')}`);
  }
  ctx.setFields(ctx.state.fields.map(f => f.id === id ? { ...f, ...sanitisedPatch, id: f.id } : f));
}

function applyAddCalc(input: any, ctx: AiApplierContext): void {
  const name = String(input.name ?? '').trim();
  const formula = String(input.formula ?? '').trim();
  if (!name || !formula) throw new Error('name + formula required');
  const fmtRaw = String(input.format ?? 'currency');
  const format: TemplateCalculation['format'] = (fmtRaw === 'number' || fmtRaw === 'percent') ? fmtRaw : 'currency';
  const calc: TemplateCalculation = {
    id: uid('calc'),
    name,
    formula,
    format,
  };
  ctx.setCalculations([...ctx.state.calculations, calc]);
}

function applyRemoveCalc(input: any, ctx: AiApplierContext): void {
  const id = String(input.id ?? '');
  if (!id) throw new Error('id required');
  ctx.setCalculations(ctx.state.calculations.filter(c => c.id !== id));
}

function applyEditCalc(input: any, ctx: AiApplierContext): void {
  const id = String(input.id ?? '');
  if (!id) throw new Error('id required');
  const patch = (input.patch ?? {}) as Partial<TemplateCalculation>;
  ctx.setCalculations(ctx.state.calculations.map(c => c.id === id ? { ...c, ...patch, id: c.id } : c));
}

function applySetHeader(input: any, ctx: AiApplierContext): void {
  ctx.setHeader({
    ...(ctx.state.header ?? {}),
    ...(typeof input.title === 'string' ? { title: input.title } : {}),
    ...(typeof input.subtitle === 'string' ? { subtitle: input.subtitle } : {}),
  });
}

function applySetResults(input: any, ctx: AiApplierContext): void {
  ctx.setResults({
    ...(ctx.state.results ?? {}),
    ...(typeof input.heading === 'string' ? { heading: input.heading } : {}),
    ...(typeof input.footnote === 'string' ? { footnote: input.footnote } : {}),
  });
  if (typeof input.cta_label === 'string') {
    ctx.setSettings({ ...(ctx.state.settings ?? {}), ctaLabel: input.cta_label });
  }
}

/* ── U6 restyle integrity — validate the AI's style patch before merging.
 *
 * The human style menu validates hex via StyleTab's safeHex; the AI path
 * previously merged a bare object with zero validation, so a bad colour
 * (`"blue"`, `"rgb(0,0,0)"`) or an out-of-range radius landed in ShellStyle
 * verbatim. Policy: VALIDATED FREEDOM — known keys are checked (invalid
 * values are DROPPED, not merged), every other key passes through untouched
 * so lesser-known valid ShellStyle keys keep working. */

/** Mirrors HEX_RE in StyleTab.tsx — 3- or 6-digit hex. */
const STYLE_HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** ShellStyle colour-token keys (see AdvStyle in shared/templatePresets.ts). */
const STYLE_COLOR_KEYS = [
  'accent', 'ctaColor', 'background', 'text', 'resultsBg',
  'secondary', 'surface', 'border', 'success', 'error',
] as const;

/** The 9 AdvFontFamily ids (shared/templatePresets.ts). */
const STYLE_FONT_FAMILIES = new Set([
  'system', 'inter', 'manrope', 'satoshi', 'geist', 'jakarta', 'plex', 'outfit', 'sora',
]);

/** Mirrors StyleTab's safeHex: accept `#abc`/`#aabbcc` with or without `#`. */
function safeStyleHex(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (STYLE_HEX_RE.test(v)) return v.toLowerCase();
  if (STYLE_HEX_RE.test('#' + v)) return ('#' + v).toLowerCase();
  return null;
}

/** Validate known keys; return the cleaned patch + the keys we dropped. */
function sanitiseStylePatch(patch: Record<string, any>): { clean: Partial<ShellStyle>; dropped: string[] } {
  const clean: Record<string, any> = { ...patch };
  const dropped: string[] = [];
  for (const key of STYLE_COLOR_KEYS) {
    if (!(key in clean)) continue;
    const hex = safeStyleHex(clean[key]);
    if (hex) clean[key] = hex;
    else { delete clean[key]; dropped.push(key); }
  }
  if ('radius' in clean) {
    const n = Number(clean.radius);
    if (Number.isFinite(n)) clean.radius = Math.min(24, Math.max(0, n));
    else { delete clean.radius; dropped.push('radius'); }
  }
  if ('fontFamily' in clean && (typeof clean.fontFamily !== 'string' || !STYLE_FONT_FAMILIES.has(clean.fontFamily))) {
    delete clean.fontFamily;
    dropped.push('fontFamily');
  }
  if ('customCss' in clean) {
    if (typeof clean.customCss !== 'string') {
      delete clean.customCss;
      dropped.push('customCss');
    } else {
      // @import pulls in an external stylesheet whose rules cannot be scoped
      // to the widget root — strip it (defense in depth with scopeCustomCss
      // in AdvancedCalculator.tsx, which also strips it at render).
      clean.customCss = clean.customCss.replace(/@import\b[^;]*(;|$)/gi, '');
    }
  }
  return { clean: clean as Partial<ShellStyle>, dropped };
}

/** Friendly word for each droppable style key, for the chat "couldn't apply"
 *  note. Colour-token keys collapse to "color value" so the user sees plain
 *  language rather than internal token names (`ctaColor`, `resultsBg`, …). */
const STYLE_KEY_LABELS: Record<string, string> = {
  radius: 'corner radius',
  fontFamily: 'font',
  customCss: 'custom CSS',
};

/** Build the honest, non-alarming note shown when set_style dropped values.
 *  e.g. ["accent"] → "Couldn't apply: invalid color value"
 *       ["accent","radius"] → "Ignored 2 values that weren't valid" */
export function describeDroppedStyleKeys(dropped: string[]): string {
  if (dropped.length === 0) return '';
  if (dropped.length === 1) {
    const key = dropped[0];
    const label =
      STYLE_KEY_LABELS[key]
      ?? ((STYLE_COLOR_KEYS as readonly string[]).includes(key) ? 'color value' : key);
    return `Couldn't apply: invalid ${label}`;
  }
  return `Ignored ${dropped.length} values that weren't valid`;
}

function applySetStyle(input: any, ctx: AiApplierContext): AiApplyResult {
  const patch = (input.patch ?? input) as Record<string, any>;
  if (!patch || typeof patch !== 'object') throw new Error('patch required');
  const { clean, dropped } = sanitiseStylePatch(patch);
  if (dropped.length) {
    // The valid remainder still applies; the drop is also logged for debugging.
    // The dropped keys are RETURNED so AIBubble can append an honest "couldn't
    // apply" note alongside the success chip — otherwise the chip would claim
    // the whole restyle landed when an invalid colour/radius/font was silently
    // discarded here.
    console.warn(`[quotequick-ai] set_style ignored invalid values: ${dropped.join(', ')}`);
  }
  ctx.setStyle({ ...(ctx.state.style ?? {}), ...clean });
  return dropped.length ? { droppedKeys: dropped } : {};
}

function applySetSettings(input: any, ctx: AiApplierContext): void {
  const patch = (input.patch ?? input) as Partial<ShellSettings>;
  if (!patch || typeof patch !== 'object') throw new Error('patch required');
  const clean: Record<string, any> = { ...patch };
  // PRICING-MODELS — `origin` is the business anchor for address_distance.
  // Keep only a sane { address } (trimmed, ≤200 chars); the server geocodes
  // on save, so AI-supplied lat/lng are dropped (never trust hallucinated
  // coordinates). Invalid shapes are dropped, the rest of the patch applies.
  if ('origin' in clean) {
    const o = clean.origin;
    const address = o && typeof o === 'object' && typeof o.address === 'string'
      ? o.address.trim().slice(0, 200)
      : '';
    if (address) {
      clean.origin = { address };
    } else {
      delete clean.origin;
      console.warn('[quotequick-ai] set_settings ignored invalid origin (need { address: string })');
    }
  }
  ctx.setSettings({ ...(ctx.state.settings ?? {}), ...(clean as Partial<ShellSettings>) });
}

function applySetLogo(input: any, ctx: AiApplierContext): void {
  const dataUrl = String(input.data_url ?? '').trim();
  if (!dataUrl) throw new Error('data_url required');
  ctx.setLogo(dataUrl);
}

function applyApplyTemplate(input: any, ctx: AiApplierContext): void {
  const presetId = String(input.preset_id ?? '');
  if (!presetId) throw new Error('preset_id required');
  ctx.applyTemplatePreset(presetId);
}

function applyReplaceTemplate(input: any, ctx: AiApplierContext): void {
  const cfg = input.template_config as TemplateConfig | undefined;
  if (!cfg || typeof cfg !== 'object') throw new Error('template_config required');
  // Minimal sanity-check — the WizardShell helper will fill in missing
  // optional bits but we at least need fields[] + calculations[].
  if (!Array.isArray(cfg.fields)) throw new Error('fields[] required');
  if (!Array.isArray(cfg.calculations)) throw new Error('calculations[] required');

  // ── AI-gen quality (Wave 66) — optional niche-aware params on the
  // replace_template tool (see server/services/quotequickAiTools.ts).
  // Every branch is strictly additive: absent/invalid input leaves the
  // config exactly as before, so this is merge-order-safe with the
  // server-side schema change. We spread into a copy so the model's raw
  // input object is never mutated.
  const next: TemplateConfig = { ...cfg };

  // Gap 2 — `palette`: curated THEME_COMBOS id → explicit style block, so
  // applyTemplate uses it instead of falling back to
  // deriveStyleFromCategory(undefined) ('mortgage' blue). Mirrors the
  // colour slots + bgMode that deriveStyleFromCategory emits; invalid or
  // missing ids keep the current category-derived fallback.
  if (typeof input.palette === 'string') {
    const combo = THEME_COMBOS.find((c) => c.id === input.palette);
    if (combo) next.style = { ...comboToStyleColors(combo), bgMode: 'solid' };
  }

  // Gap 4 — `default_icon`: allowlist-validated against the curated
  // QUOTEQUICK_ICONS registry; unknown names are dropped (renderer would
  // silently show nothing for a bogus key).
  if (
    typeof input.default_icon === 'string' &&
    Object.prototype.hasOwnProperty.call(QUOTEQUICK_ICONS, input.default_icon)
  ) {
    next.defaultIcon = input.default_icon;
  }

  // Gap 5 — `trustBadges`: sanitise like the image-fusion path
  // (imageTemplateToConfig.ts) — cap at 4 for visual balance, require a
  // non-empty label (trimmed, ≤30 chars), keep the icon as-is (the
  // TrustBadgeRow renderer falls back to BadgeCheck on unknown icons).
  if (Array.isArray(input.trustBadges)) {
    const badges: TrustBadge[] = (input.trustBadges as any[])
      .map((b) => {
        if (!b || typeof b !== 'object' || typeof b.label !== 'string') return null;
        const label = b.label.trim().slice(0, 30);
        if (!label) return null;
        return { label, icon: b.icon } as TrustBadge;
      })
      .filter((b): b is TrustBadge => b !== null)
      .slice(0, 4);
    if (badges.length > 0) next.trustBadges = badges;
  }

  // Gap 1 — `business_name`: the user's stated name, never invented (the
  // prompt forbids it). Written to ShellState BEFORE the structural
  // replace so the header fallback + save payload pick it up together.
  if (typeof input.business_name === 'string' && input.business_name.trim() !== '') {
    ctx.setBusinessName(input.business_name.trim());
  }

  ctx.replaceTemplate(next);
}

function applyPrefill(input: any, ctx: AiApplierContext): void {
  const values = input.values as Record<string, number> | undefined;
  if (!values || typeof values !== 'object') throw new Error('values required');
  const next = ctx.state.fields.map(f => {
    const v = values[f.id];
    if (typeof v === 'number') return { ...f, default_value: v };
    // Also try matching by label so the model doesn't have to know ids.
    const byLabel = values[f.label];
    if (typeof byLabel === 'number') return { ...f, default_value: byLabel };
    return f;
  });
  ctx.setFields(next);
}

/* ─── Dispatcher ─── */

/**
 * Apply a tool call. Returns an {@link AiApplyResult} so the caller can surface
 * dropped-value information (currently only `set_style` populates it); every
 * other tool returns an empty result, which the caller treats as a clean apply.
 * Throws on hard failures (unknown tool, missing required input) exactly as
 * before — AIBubble already catches those and renders a failure chip.
 */
export function applyAiToolCall(call: AiToolCall, ctx: AiApplierContext): AiApplyResult {
  switch (call.name) {
    case 'add_field': applyAddField(call.input, ctx); return {};
    case 'remove_field': applyRemoveField(call.input, ctx); return {};
    case 'edit_field': applyEditField(call.input, ctx); return {};
    case 'add_calculation': applyAddCalc(call.input, ctx); return {};
    case 'remove_calculation': applyRemoveCalc(call.input, ctx); return {};
    case 'edit_calculation': applyEditCalc(call.input, ctx); return {};
    case 'set_header': applySetHeader(call.input, ctx); return {};
    case 'set_results': applySetResults(call.input, ctx); return {};
    case 'set_style': return applySetStyle(call.input, ctx);
    case 'set_settings': applySetSettings(call.input, ctx); return {};
    case 'set_logo': applySetLogo(call.input, ctx); return {};
    case 'apply_template': applyApplyTemplate(call.input, ctx); return {};
    case 'replace_template': applyReplaceTemplate(call.input, ctx); return {};
    case 'prefill_fields': applyPrefill(call.input, ctx); return {};
    default: throw new Error(`unknown tool ${call.name}`);
  }
}
