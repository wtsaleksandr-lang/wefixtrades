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
import type { TemplateField, TemplateCalculation, TemplateConfig, TemplateOption, FieldType } from '@shared/templatePresets';

export interface AiToolCall {
  id?: string;
  name: string;
  input: Record<string, any>;
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
  multi_select: 'dropdown', // closest public equivalent
  toggle: null,
  text: null,
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

function applySetStyle(input: any, ctx: AiApplierContext): void {
  const patch = (input.patch ?? input) as Partial<ShellStyle>;
  if (!patch || typeof patch !== 'object') throw new Error('patch required');
  ctx.setStyle({ ...(ctx.state.style ?? {}), ...patch });
}

function applySetSettings(input: any, ctx: AiApplierContext): void {
  const patch = (input.patch ?? input) as Partial<ShellSettings>;
  if (!patch || typeof patch !== 'object') throw new Error('patch required');
  ctx.setSettings({ ...(ctx.state.settings ?? {}), ...patch });
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
  ctx.replaceTemplate(cfg);
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

export function applyAiToolCall(call: AiToolCall, ctx: AiApplierContext): void {
  switch (call.name) {
    case 'add_field': return applyAddField(call.input, ctx);
    case 'remove_field': return applyRemoveField(call.input, ctx);
    case 'edit_field': return applyEditField(call.input, ctx);
    case 'add_calculation': return applyAddCalc(call.input, ctx);
    case 'remove_calculation': return applyRemoveCalc(call.input, ctx);
    case 'edit_calculation': return applyEditCalc(call.input, ctx);
    case 'set_header': return applySetHeader(call.input, ctx);
    case 'set_results': return applySetResults(call.input, ctx);
    case 'set_style': return applySetStyle(call.input, ctx);
    case 'set_settings': return applySetSettings(call.input, ctx);
    case 'set_logo': return applySetLogo(call.input, ctx);
    case 'apply_template': return applyApplyTemplate(call.input, ctx);
    case 'replace_template': return applyReplaceTemplate(call.input, ctx);
    case 'prefill_fields': return applyPrefill(call.input, ctx);
    default: throw new Error(`unknown tool ${call.name}`);
  }
}
