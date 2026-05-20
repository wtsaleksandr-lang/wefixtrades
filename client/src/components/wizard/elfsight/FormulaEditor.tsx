// FormulaEditor — spreadsheet-style formula input for the Calculations panel.
//
// Wave H3. Replicates Elfsight's color-coded formula editor: fields appear as
// purple/blue tokens, calculations as green/teal tokens, function names as
// neutral text. Tokens are inserted via the "+ insert" menu so the user
// doesn't have to free-type field names (which would break on a typo).
//
// Implementation choice — to stay simple and avoid the pitfalls of a custom
// contenteditable (cursor management, copy-paste, IME, etc.), we keep an
// ordinary `<input>` as the source of truth and render a *styled preview*
// strip beneath it. The preview tokenises the formula string and paints each
// token in the right colour. The "+ insert" menu inserts canonical
// `[Reference Name]` tokens at the caret.
//
// Validation: every edit runs the formula through `evaluateFormula` against a
// synthesized context built from the current fields + earlier calcs' default
// values. If the formula references a deleted field or fails to parse, the
// error is shown inline. The PreviewPane already handles broken formulas
// gracefully (runCalculations swallows per-calc errors → 0), so the live
// preview never crashes.

import { useEffect, useMemo, useRef, useState } from 'react';
import { platformTheme } from '@/theme/platformTheme';
import type { TemplateField, TemplateCalculation } from '@shared/templatePresets';
import {
  evaluateFormula, type FormulaContext,
} from '@shared/formulaEngine';

const p = platformTheme;

/** Colour used for calculation tokens — distinct from the brand blue. */
const CALC_TOKEN_BG = '#E6F7F1';
const CALC_TOKEN_FG = '#0E8a5f';

/** Supported function names (see formulaEngine.ts). */
const FUNCTIONS = [
  'SUM', 'MAX', 'MIN', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'ABS',
  'IF', 'AND', 'OR', 'NOT', 'CONTAINS', 'RAND', 'RANDBETWEEN',
] as const;

interface Props {
  /** The unique id of this calculation row (used to scope test ids). */
  calcId: string;
  /** Current formula string. */
  value: string;
  onChange: (next: string) => void;
  /** Live list of fields available to reference. */
  fields: TemplateField[];
  /** Other calculations defined ABOVE this one (later calcs can reference earlier ones only). */
  precedingCalcs: TemplateCalculation[];
  /** Optional autofocus hint when the row first expands. */
  autoFocus?: boolean;
}

/* ── token recognition ───────────────────────────────────────────────── */

type TokenKind = 'field' | 'calc' | 'fn' | 'num' | 'op' | 'text' | 'unknown';
interface RenderedToken { kind: TokenKind; text: string; }

/**
 * Build a render-only token stream for the styled preview strip. This is
 * deliberately lenient — it does NOT try to be a real parser, only a
 * highlighter. The authoritative validation is `evaluateFormula`.
 */
function tokenizeForRender(
  formula: string,
  fieldNames: Set<string>,
  calcNames: Set<string>,
): RenderedToken[] {
  const out: RenderedToken[] = [];
  const n = formula.length;
  let i = 0;
  let plain = '';
  const flushPlain = () => {
    if (plain) { out.push({ kind: 'text', text: plain }); plain = ''; }
  };

  while (i < n) {
    const c = formula[i];

    // [Bracketed Reference] — fields or calcs.
    if (c === '[') {
      flushPlain();
      let j = i + 1;
      while (j < n && formula[j] !== ']') j++;
      const inner = formula.slice(i + 1, j).trim();
      const closed = j < n;
      const text = formula.slice(i, closed ? j + 1 : j);
      let kind: TokenKind = 'unknown';
      if (fieldNames.has(inner) || [...fieldNames].some((f) => f.toLowerCase() === inner.toLowerCase())) {
        kind = 'field';
      } else if (calcNames.has(inner) || [...calcNames].some((c) => c.toLowerCase() === inner.toLowerCase())) {
        kind = 'calc';
      }
      out.push({ kind, text });
      i = closed ? j + 1 : n;
      continue;
    }

    // identifier — function or bare ref (we don't try to colour bare refs,
    // since the user is steered to bracketed references).
    if (/[A-Za-z_]/.test(c)) {
      flushPlain();
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(formula[j])) j++;
      const ident = formula.slice(i, j);
      const upper = ident.toUpperCase();
      const isFn = (FUNCTIONS as readonly string[]).includes(upper) && formula[j] === '(';
      out.push({ kind: isFn ? 'fn' : 'text', text: ident });
      i = j;
      continue;
    }

    // number
    if ((c >= '0' && c <= '9') || (c === '.' && formula[i + 1] >= '0' && formula[i + 1] <= '9')) {
      flushPlain();
      let j = i;
      while (j < n && (/[0-9.]/.test(formula[j]))) j++;
      out.push({ kind: 'num', text: formula.slice(i, j) });
      i = j;
      continue;
    }

    // operators / punctuation / whitespace — group runs to keep the token
    // count modest in the preview strip.
    if (/[+\-*/^()=<>!,\s]/.test(c)) {
      // group whitespace into one plain text token, group operators into
      // small individual tokens (kind 'op') so they stay visually distinct.
      if (/\s/.test(c)) {
        plain += c; i++; continue;
      }
      flushPlain();
      out.push({ kind: 'op', text: c });
      i++;
      continue;
    }

    // string literal — just dump as plain.
    if (c === '"' || c === "'") {
      flushPlain();
      const q = c;
      let j = i + 1;
      while (j < n && formula[j] !== q) j++;
      const closed = j < n;
      out.push({ kind: 'text', text: formula.slice(i, closed ? j + 1 : j) });
      i = closed ? j + 1 : n;
      continue;
    }

    plain += c; i++;
  }
  flushPlain();
  return out;
}

/* ── insert menu ─────────────────────────────────────────────────────── */

type InsertItem =
  | { kind: 'field'; label: string; insertion: string }
  | { kind: 'calc';  label: string; insertion: string }
  | { kind: 'fn';    label: string; insertion: string; signature: string };

interface InsertMenuProps {
  calcId: string;
  items: InsertItem[];
  onPick: (insertion: string) => void;
}

function InsertMenu({ calcId, items, onPick }: InsertMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const fields = items.filter((i) => i.kind === 'field');
  const calcs = items.filter((i) => i.kind === 'calc');
  const fns = items.filter((i) => i.kind === 'fn');

  return (
    <div ref={ref} className="qq-formula-insert-root">
      <button
        type="button"
        className="qq-formula-insert-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        data-testid={`calc-row-insert-trigger-${calcId}`}
      >
        <span aria-hidden="true">+</span>
        <span>Insert</span>
      </button>
      {open && (
        <div
          role="menu"
          className="qq-formula-insert-menu"
          data-testid={`calc-row-insert-menu-${calcId}`}
        >
          {fields.length > 0 && (
            <div className="qq-formula-insert-group">
              <div className="qq-formula-insert-grouphdr">Fields</div>
              {fields.map((it) => (
                <button
                  key={`f-${it.label}`}
                  type="button"
                  role="menuitem"
                  className="qq-formula-insert-item is-field"
                  onClick={() => { onPick(it.insertion); setOpen(false); }}
                  data-testid={`calc-row-insert-field-${calcId}-${it.label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`}
                >
                  <span className="qq-token qq-token--field">{it.label}</span>
                </button>
              ))}
            </div>
          )}
          {calcs.length > 0 && (
            <div className="qq-formula-insert-group">
              <div className="qq-formula-insert-grouphdr">Calculations</div>
              {calcs.map((it) => (
                <button
                  key={`c-${it.label}`}
                  type="button"
                  role="menuitem"
                  className="qq-formula-insert-item is-calc"
                  onClick={() => { onPick(it.insertion); setOpen(false); }}
                  data-testid={`calc-row-insert-calc-${calcId}-${it.label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`}
                >
                  <span className="qq-token qq-token--calc">{it.label}</span>
                </button>
              ))}
            </div>
          )}
          {fns.length > 0 && (
            <div className="qq-formula-insert-group">
              <div className="qq-formula-insert-grouphdr">Functions</div>
              <div className="qq-formula-insert-fns">
                {fns.map((it) => (
                  <button
                    key={`fn-${it.label}`}
                    type="button"
                    role="menuitem"
                    className="qq-formula-insert-item is-fn"
                    onClick={() => { onPick(it.insertion); setOpen(false); }}
                    title={it.signature}
                    data-testid={`calc-row-insert-fn-${calcId}-${it.label.toLowerCase()}`}
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {items.length === 0 && (
            <div className="qq-formula-insert-empty">Add a field first to reference it here.</div>
          )}
        </div>
      )}
      <style>{`
        .qq-formula-insert-root { position: relative; display: inline-block; }
        .qq-formula-insert-trigger {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 6px 10px; border-radius: 7px;
          font: inherit; font-size: 11.5px; font-weight: 700; cursor: pointer;
          background: ${p.colors.accentLighter}; color: ${p.colors.accent};
          border: 1px dashed ${p.colors.accent};
          transition: background 0.1s ease;
        }
        .qq-formula-insert-trigger:hover {
          background: ${p.colors.accentLight};
        }
        .qq-formula-insert-menu {
          position: absolute; right: 0; top: calc(100% + 6px); z-index: 60;
          width: 280px; max-height: 320px; overflow-y: auto;
          padding: 6px;
          background: #fff; border-radius: 10px;
          border: 1px solid ${p.colors.borderLight};
          box-shadow: ${p.shadows.lg};
          display: flex; flex-direction: column; gap: 4px;
        }
        .qq-formula-insert-group { display: flex; flex-direction: column; gap: 2px; }
        .qq-formula-insert-grouphdr {
          padding: 6px 6px 2px;
          font-size: 10.5px; font-weight: 700;
          color: ${p.colors.subtle};
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .qq-formula-insert-item {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 8px; border-radius: 6px;
          font: inherit; font-size: 12px; cursor: pointer; text-align: left;
          background: transparent; border: none; color: ${p.colors.body};
          transition: background 0.1s ease;
        }
        .qq-formula-insert-item:hover { background: ${p.colors.surfaceRaised}; }
        .qq-formula-insert-fns {
          display: flex; flex-wrap: wrap; gap: 3px; padding: 2px 4px 4px;
        }
        .qq-formula-insert-fns .qq-formula-insert-item {
          padding: 4px 8px; font-size: 11px; font-weight: 700;
          background: ${p.colors.surfaceRaised};
          border-radius: 5px; color: ${p.colors.heading};
        }
        .qq-formula-insert-fns .qq-formula-insert-item:hover {
          background: ${p.colors.accentLighter}; color: ${p.colors.accent};
        }
        .qq-formula-insert-empty {
          padding: 12px 8px; font-size: 11.5px; color: ${p.colors.subtle};
          text-align: center;
        }
        .qq-token {
          display: inline-block; padding: 1px 6px; border-radius: 4px;
          font-size: 11.5px; font-weight: 700; line-height: 1.6;
        }
        .qq-token--field {
          background: ${p.colors.accentLighter}; color: ${p.colors.accent};
        }
        .qq-token--calc {
          background: ${CALC_TOKEN_BG}; color: ${CALC_TOKEN_FG};
        }
      `}</style>
    </div>
  );
}

/* ── editor ──────────────────────────────────────────────────────────── */

export default function FormulaEditor({
  calcId, value, onChange, fields, precedingCalcs, autoFocus,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Cache the live caret position so insert-at-caret behaves correctly even
  // when the menu briefly steals focus.
  const caretRef = useRef<number>(value.length);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      // Move caret to end on first focus.
      const end = inputRef.current.value.length;
      inputRef.current.setSelectionRange(end, end);
      caretRef.current = end;
    }
  }, [autoFocus]);

  /* known names — used by the renderer AND the validator. */
  const fieldNames = useMemo(() => new Set(fields.map((f) => f.name)), [fields]);
  const calcNames = useMemo(() => new Set(precedingCalcs.map((c) => c.name)), [precedingCalcs]);

  /* synthesise a context with fields' defaults + previous calcs' values
     (just 0 — we don't need a numerically accurate dry-run, only structural).
     Field values use their `default_value` (numeric) or 0 for non-numeric. */
  const dryRunContext = useMemo<FormulaContext>(() => {
    const ctx: FormulaContext = {};
    for (const f of fields) {
      if (typeof f.default_value === 'number') ctx[f.name] = f.default_value;
      else if (f.options && f.options.length) ctx[f.name] = f.options[0].value;
      else ctx[f.name] = 0;
    }
    for (const c of precedingCalcs) ctx[c.name] = 0;
    return ctx;
  }, [fields, precedingCalcs]);

  /* live validation — never throws. */
  const validation = useMemo(() => {
    if (!value.trim()) return { ok: true as const, missing: [] as string[] };
    // Find bracketed references that resolve to neither a field nor a calc.
    const refs: string[] = [];
    const re = /\[([^\]]+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(value))) refs.push(m[1].trim());
    const missing = refs.filter((r) =>
      !fieldNames.has(r) && !calcNames.has(r) &&
      ![...fieldNames].some((f) => f.toLowerCase() === r.toLowerCase()) &&
      ![...calcNames].some((c) => c.toLowerCase() === r.toLowerCase()),
    );
    const evald = evaluateFormula(value, dryRunContext);
    if (missing.length) {
      return {
        ok: false as const,
        error: missing.length === 1
          ? `Unknown reference: [${missing[0]}]`
          : `Unknown references: ${missing.map((r) => `[${r}]`).join(', ')}`,
        missing,
      };
    }
    if (!evald.ok) return { ok: false as const, error: evald.error || 'Invalid formula', missing: [] };
    return { ok: true as const, missing: [] };
  }, [value, dryRunContext, fieldNames, calcNames]);

  /* tokens for the styled preview strip. */
  const tokens = useMemo(
    () => tokenizeForRender(value, fieldNames, calcNames),
    [value, fieldNames, calcNames],
  );

  /* insert items for the "+ insert" menu. */
  const insertItems = useMemo<InsertItem[]>(() => {
    const items: InsertItem[] = [];
    for (const f of fields) items.push({ kind: 'field', label: f.name, insertion: `[${f.name}]` });
    for (const c of precedingCalcs) items.push({ kind: 'calc', label: c.name, insertion: `[${c.name}]` });
    items.push({ kind: 'fn', label: 'SUM',       insertion: 'SUM(', signature: 'SUM(a, b, …)' });
    items.push({ kind: 'fn', label: 'MAX',       insertion: 'MAX(', signature: 'MAX(a, b, …)' });
    items.push({ kind: 'fn', label: 'MIN',       insertion: 'MIN(', signature: 'MIN(a, b, …)' });
    items.push({ kind: 'fn', label: 'ROUND',     insertion: 'ROUND(', signature: 'ROUND(n, places)' });
    items.push({ kind: 'fn', label: 'ROUNDUP',   insertion: 'ROUNDUP(', signature: 'ROUNDUP(n, places)' });
    items.push({ kind: 'fn', label: 'ROUNDDOWN', insertion: 'ROUNDDOWN(', signature: 'ROUNDDOWN(n, places)' });
    items.push({ kind: 'fn', label: 'ABS',       insertion: 'ABS(', signature: 'ABS(n)' });
    items.push({ kind: 'fn', label: 'IF',        insertion: 'IF(', signature: 'IF(cond, then, else)' });
    items.push({ kind: 'fn', label: 'AND',       insertion: 'AND(', signature: 'AND(a, b, …)' });
    items.push({ kind: 'fn', label: 'OR',        insertion: 'OR(', signature: 'OR(a, b, …)' });
    items.push({ kind: 'fn', label: 'NOT',       insertion: 'NOT(', signature: 'NOT(a)' });
    items.push({ kind: 'fn', label: 'CONTAINS',  insertion: 'CONTAINS(', signature: 'CONTAINS(haystack, needle)' });
    return items;
  }, [fields, precedingCalcs]);

  const handleInsert = (insertion: string) => {
    const el = inputRef.current;
    const caret = el ? (el.selectionStart ?? caretRef.current) : caretRef.current;
    const next = value.slice(0, caret) + insertion + value.slice(caret);
    onChange(next);
    // Restore caret after React's next paint.
    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      const newCaret = caret + insertion.length;
      inputRef.current.focus();
      inputRef.current.setSelectionRange(newCaret, newCaret);
      caretRef.current = newCaret;
    });
  };

  return (
    <div className="qq-formula-editor" data-testid={`calc-row-formula-${calcId}`}>
      <div className="qq-formula-toolbar">
        <span className="qq-formula-label">Formula</span>
        <InsertMenu calcId={calcId} items={insertItems} onPick={handleInsert} />
      </div>
      <input
        ref={inputRef}
        type="text"
        value={value}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        placeholder="e.g. [Quantity] * 10 + [Add-ons]"
        onChange={(e) => { onChange(e.target.value); caretRef.current = e.target.selectionStart ?? 0; }}
        onKeyUp={(e) => { caretRef.current = (e.currentTarget.selectionStart ?? 0); }}
        onClick={(e) => { caretRef.current = (e.currentTarget.selectionStart ?? 0); }}
        className={`qq-formula-input${validation.ok ? '' : ' is-invalid'}`}
        data-testid={`calc-row-formula-input-${calcId}`}
        aria-invalid={!validation.ok}
        aria-describedby={!validation.ok ? `calc-row-formula-error-${calcId}` : undefined}
      />
      {/* styled preview strip — colour-coded tokens. */}
      {value.trim() !== '' && (
        <div
          className="qq-formula-preview"
          data-testid={`calc-row-formula-preview-${calcId}`}
          aria-hidden="true"
        >
          {tokens.map((t, i) => {
            const cls =
              t.kind === 'field'   ? 'qq-fp-token qq-fp-field' :
              t.kind === 'calc'    ? 'qq-fp-token qq-fp-calc' :
              t.kind === 'unknown' ? 'qq-fp-token qq-fp-unknown' :
              t.kind === 'fn'      ? 'qq-fp-token qq-fp-fn' :
              t.kind === 'num'     ? 'qq-fp-token qq-fp-num' :
              t.kind === 'op'      ? 'qq-fp-token qq-fp-op' :
              'qq-fp-plain';
            return <span key={i} className={cls}>{t.text}</span>;
          })}
        </div>
      )}
      {!validation.ok && (
        <div
          id={`calc-row-formula-error-${calcId}`}
          className="qq-formula-error"
          data-testid={`calc-row-formula-error-${calcId}`}
        >
          {validation.error}
        </div>
      )}

      <style>{`
        .qq-formula-editor {
          display: flex; flex-direction: column; gap: 6px;
        }
        .qq-formula-toolbar {
          display: flex; align-items: center; justify-content: space-between;
          gap: 8px;
        }
        .qq-formula-label {
          font-size: 11px; font-weight: 700; color: ${p.colors.heading};
          letter-spacing: 0.02em; text-transform: uppercase;
        }
        .qq-formula-input {
          width: 100%; padding: 8px 10px; box-sizing: border-box;
          font: inherit; font-size: 12.5px; color: ${p.colors.body};
          background: #fff; border: 1px solid ${p.colors.border};
          border-radius: 7px; outline: none;
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
          transition: border-color 0.1s ease, box-shadow 0.1s ease;
        }
        .qq-formula-input:focus {
          border-color: ${p.colors.accent}; box-shadow: ${p.shadows.focus};
        }
        .qq-formula-input.is-invalid {
          border-color: ${p.colors.danger};
        }
        .qq-formula-input.is-invalid:focus {
          box-shadow: 0 0 0 3px ${p.colors.dangerLight};
        }
        .qq-formula-preview {
          display: flex; flex-wrap: wrap; align-items: center;
          gap: 2px;
          padding: 6px 8px; min-height: 26px; box-sizing: border-box;
          border-radius: 6px;
          background: ${p.colors.surfaceRaised};
          border: 1px dashed ${p.colors.borderLight};
          line-height: 1.45;
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
          font-size: 11.5px;
          white-space: pre-wrap;
        }
        .qq-fp-token {
          display: inline-block; padding: 1px 6px; border-radius: 4px;
          font-weight: 700;
        }
        .qq-fp-field {
          background: ${p.colors.accentLighter}; color: ${p.colors.accent};
        }
        .qq-fp-calc {
          background: ${CALC_TOKEN_BG}; color: ${CALC_TOKEN_FG};
        }
        .qq-fp-unknown {
          background: ${p.colors.dangerLight}; color: ${p.colors.danger};
          text-decoration: underline wavy ${p.colors.danger};
          text-underline-offset: 2px;
        }
        .qq-fp-fn {
          background: transparent; color: ${p.colors.heading};
          font-weight: 700; padding: 0 1px;
        }
        .qq-fp-num {
          color: ${p.colors.heading}; padding: 0 1px;
        }
        .qq-fp-op {
          color: ${p.colors.subtle}; padding: 0 1px;
        }
        .qq-fp-plain { color: ${p.colors.body}; }

        .qq-formula-error {
          font-size: 11.5px; font-weight: 600; color: ${p.colors.danger};
          padding-top: 1px;
        }
      `}</style>
    </div>
  );
}
