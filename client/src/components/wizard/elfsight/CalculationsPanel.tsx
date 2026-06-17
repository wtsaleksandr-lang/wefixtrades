// CalculationsPanel — Build > Calculations section (Wave H3).
//
// Owns the list of calculations rendered as <CalculationRow/>s. Add / remove /
// reorder / edit all flow through `onChange(nextCalcs)`. The parent
// (`BuildTab`) hands the updated array back up to `WizardShell`, which
// re-renders the preview through `PreviewPane`.
//
// Each calculation's formula editor can reference any field AND any
// calculation defined ABOVE it — that mirrors the runtime `runCalculations`
// engine which evaluates calcs in order.

import { useRef, useState } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { platformTheme } from '@/theme/platformTheme';
import type { TemplateCalculation, TemplateField } from '@shared/templatePresets';
import CalculationRow from './CalculationRow';
import InfoCue from './InfoCue';

const p = platformTheme;

interface Props {
  calculations: TemplateCalculation[];
  fields: TemplateField[];
  onChange: (next: TemplateCalculation[]) => void;
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Words that carry no naming value at the start of a calc description:
 *  imperative verbs ("multiply"), articles/prepositions, and connector filler.
 *  Stripped from the FRONT only so a phrase like "Job Total" survives intact. */
const FILLER_WORDS = new Set([
  'calculate', 'compute', 'work', 'out', 'figure', 'find', 'get', 'give', 'show',
  'multiply', 'add', 'sum', 'subtract', 'divide', 'total', 'tally', 'combine',
  'take', 'make', 'set', 'return', 'output', 'estimate',
  'the', 'a', 'an', 'of', 'by', 'to', 'with', 'and', 'plus', 'then', 'for',
  'up', 'all', 'each', 'per', 'from', 'into', 'this', 'that', 'it', 'me',
]);

/** Derive a short, sensible calc name from the user's plain-English description.
 *  Strips leading imperative verbs / articles / connector filler and pure
 *  numbers, then title-cases the first couple of meaningful words into a
 *  noun-y label (e.g. "multiply quantity by 75 ..." → "Quantity") instead of
 *  echoing the raw prompt. De-duped against existing names by the caller. */
function nameFromDescription(desc: string, existing: TemplateCalculation[]): string {
  const cleaned = desc.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  let words = cleaned.split(' ').filter(Boolean);
  // Drop leading filler / verbs / bare numbers so we land on the first real noun.
  while (
    words.length > 1
    && (FILLER_WORDS.has(words[0].toLowerCase()) || /^\d+([.,]\d+)?$/.test(words[0]))
  ) {
    words.shift();
  }
  // Also drop any remaining bare-number tokens, then keep the first 2 nouny words.
  words = words.filter((w) => !/^\d+([.,]\d+)?$/.test(w)).slice(0, 2);
  let base = words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
    .trim();
  if (base.length > 28) base = base.slice(0, 28).trim();
  if (!base) base = 'Calculation';
  const taken = new Set(existing.map((c) => c.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`.toLowerCase())) n++;
  return `${base} ${n}`;
}

/** The blank-preview seed calc (buildBlankPreviewConfig in templatePresets.ts)
 *  ships a single placeholder calc with this exact name + formula. We retire it
 *  the moment the user adds their first real calc so it stops winning the
 *  headline as a static $100 row. The formula is the unique signature — no real
 *  template uses `[Service] * [Quantity] + [Add-ons]`, and we only match when
 *  it's the SOLE calc, so populated templates (many of which legitimately ship
 *  their own "Estimated Total") are never touched. */
const SEED_CALC_NAME = 'Estimated Total';
const SEED_CALC_FORMULA = '[Service] * [Quantity] + [Add-ons]';
function isBlankSeedOnly(calcs: TemplateCalculation[]): boolean {
  return (
    calcs.length === 1
    && calcs[0].name === SEED_CALC_NAME
    && (calcs[0].formula || '').replace(/\s+/g, ' ').trim() === SEED_CALC_FORMULA
  );
}

/** True when no existing calc is already flagged as the primary headline. */
function hasPrimary(calcs: TemplateCalculation[]): boolean {
  return calcs.some((c) => c.resultMode === 'primary');
}

/** Build the next calc list when appending `next`.
 *  - If `next` carries a real formula AND nothing is currently primary AND the
 *    only existing calc is the blank seed → drop the seed and make `next` the
 *    primary headline. (First real calc becomes the big number.)
 *  - Else if `next` is the first real calc and nothing is primary yet (empty
 *    list) → still mark it primary so a from-scratch build gets a headline.
 *  - Otherwise append unchanged (preserves templates with their own primary). */
function appendCalc(
  calcs: TemplateCalculation[], next: TemplateCalculation,
): TemplateCalculation[] {
  const hasFormula = (next.formula || '').trim() !== '';
  if (!hasFormula || hasPrimary(calcs)) {
    return [...calcs, next];
  }
  const primaryNext: TemplateCalculation = { ...next, resultMode: 'primary' };
  if (isBlankSeedOnly(calcs)) {
    // Retire the stale seed entirely — it would otherwise win `legacyHeadline`
    // (via result_calc) and/or show as a $100 breakdown row.
    return [primaryNext];
  }
  if (calcs.length === 0) {
    return [primaryNext];
  }
  return [...calcs, next];
}

/** Default calc appended when the user clicks "Add calculation". */
function makeBlankCalc(existing: TemplateCalculation[]): TemplateCalculation {
  // Pick a non-colliding default name.
  const base = 'Subtotal';
  let name = base;
  let n = 2;
  const taken = new Set(existing.map((c) => c.name.toLowerCase()));
  while (taken.has(name.toLowerCase())) name = `${base} ${n++}`;
  return {
    id: uid('calc'),
    name,
    formula: '',
    // Default to currency so both the breakdown row and (once it becomes the
    // primary headline) the big number render as money — matching the shared
    // `calc()` helper default in templatePresets.ts. Was 'number', which showed
    // bare figures like `113.4` instead of `$113.40`.
    format: 'currency',
  };
}

export default function CalculationsPanel({ calculations, fields, onChange }: Props) {
  const isEmpty = calculations.length === 0;
  // Track which row was JUST added so we can auto-expand it on first render.
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  // ID-prefix counter so we don't re-trigger autofocus on later re-renders.
  const seenRef = useRef<Set<string>>(new Set());

  // Panel-level "describe your formula" AI generator. Reuses the SAME
  // /api/ai/formula-help endpoint that FormulaEditor's per-row FormulaAIButton
  // uses; on success it appends a NEW calculation via the existing add path.
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleAdd = () => {
    const next = makeBlankCalc(calculations);
    setJustAddedId(next.id);
    seenRef.current.add(next.id);
    // Manual adds start with an EMPTY formula, so appendCalc just appends here
    // (no primary seizing yet). The first real formula the user types in the
    // row promotes it to the headline + retires the seed via handleRowChange.
    onChange(appendCalc(calculations, next));
  };

  /** Generate a brand-new calculation from a plain-English description.
   *  Mirrors FormulaEditor.FormulaAIButton's request body exactly
   *  (prompt + availableFields + precedingCalcs), then creates the calc
   *  through the same onChange add path handleAdd uses — never bypassing it. */
  const handleGenerate = async () => {
    const trimmed = aiPrompt.trim();
    if (!trimmed || aiBusy) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/formula-help', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: trimmed,
          // All fields and ALL current calcs are valid references for a new
          // calc appended to the end of the list (it sees everything above it).
          availableFields: fields.map((f) => f.name),
          precedingCalcs: calculations.map((c) => c.name),
        }),
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Honest, friendly messages for the budget-gated / auth / outage codes
        // the endpoint enforces; otherwise surface the server's own message.
        if (res.status === 401) {
          setAiError('Sign in to use AI formula help.');
        } else if (res.status === 402 || res.status === 403 || res.status === 429) {
          setAiError(data?.message || data?.error || "You've reached your AI usage limit for now. Try again later or upgrade your plan.");
        } else if (res.status === 503) {
          setAiError('AI is unavailable right now — try again shortly.');
        } else {
          setAiError(data?.message || data?.error || `Couldn't generate a calculation (HTTP ${res.status}).`);
        }
        return;
      }
      const formula = typeof data?.formula === 'string' ? data.formula.trim() : '';
      if (!formula) {
        setAiError('AI returned an empty formula.');
        return;
      }
      // Build the new calc off the blank-calc default (correct id/format),
      // override name + formula, and append through the existing add path.
      const blank = makeBlankCalc(calculations);
      const next: TemplateCalculation = {
        ...blank,
        name: nameFromDescription(trimmed, calculations),
        formula,
      };
      setJustAddedId(next.id);
      seenRef.current.add(next.id);
      // The AI calc arrives WITH a formula, so appendCalc promotes it to the
      // primary headline (and retires the stale blank seed) when nothing is
      // primary yet — making the user's first generated calc the big number.
      onChange(appendCalc(calculations, next));
      setAiPrompt('');
    } catch (err: any) {
      setAiError(String(err?.message ?? 'Network error'));
    } finally {
      setAiBusy(false);
    }
  };

  const handleRowChange = (idx: number, next: TemplateCalculation) => {
    const arr = [...calculations];
    arr[idx] = next;
    // First-real-calc → headline (manual path): when the user types the FIRST
    // formula into a freshly-added row and nothing is primary yet, promote this
    // row to the primary headline and retire the stale blank seed if it's the
    // only other calc. Mirrors the AI/append path so a manually-built calc also
    // drives the big number instead of leaving the static $100 seed winning.
    const becameReal =
      (next.formula || '').trim() !== '' && (calculations[idx]?.formula || '').trim() === '';
    if (becameReal && next.resultMode !== 'primary' && !hasPrimary(arr)) {
      const others = arr.filter((_, i) => i !== idx);
      if (others.length === 0 || isBlankSeedOnly(others)) {
        // Drop the seed (if present) and make this row the headline.
        const promoted: TemplateCalculation = { ...next, resultMode: 'primary' };
        onChange([promoted]);
        return;
      }
      // Other real calcs already exist but none is primary → still promote this
      // one so the user gets a headline, but keep the others intact.
      arr[idx] = { ...next, resultMode: 'primary' };
    }
    onChange(arr);
  };

  const handleRemove = (idx: number) => {
    const arr = calculations.filter((_, i) => i !== idx);
    onChange(arr);
  };

  const handleMove = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= calculations.length) return;
    const arr = [...calculations];
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    onChange(arr);
  };

  return (
    <section
      data-theme="light"
      className="qq-calcs-panel"
      data-testid="editor-calculations-panel"
      aria-label="Calculator calculations"
      // Rule-B escape hatch — this panel legitimately carries TWO cues:
      // the "Pricing" section-header cue and the "Describe a calculation"
      // input-field cue (Rule 5 + input-field rules both mandate one each).
      data-cue-allowed-multiple
    >
      <header className="qq-calcs-header">
        <div>
          <h3 className="qq-calcs-title">
            {/* QW-1 — cue moved to FIRST child (top-left of the header) to
             * match the THEME/NUMBER-FORMATTING pattern on every other tab
             * (DESIGN-SYSTEM hard rule §2 + §5). */}
            <InfoCue
              testid="build-section-calcs"
              region="result"
              text="Math that turns field values into a quote. Each calculation can reference any field above and any earlier calculation; the one you flag as 'primary' becomes the headline number."
            />
            <span>Pricing</span>
          </h3>
        </div>
        {!isEmpty && (
          <button
            type="button"
            className="qq-calcs-add"
            onClick={handleAdd}
            data-testid="add-calculation-trigger"
          >
            <span aria-hidden="true">+</span>
            <span>Add calculation</span>
          </button>
        )}
      </header>

      {/* Panel-level "describe your formula" AI generator. Surfaces the
          Elfsight-style plain-English → formula capability at the section
          level (it also exists per-row in FormulaEditor) so it's discoverable
          before any calc exists. Title-in-field textarea + Generate; on
          success a NEW calculation is appended through the existing add path. */}
      <div className="qq-calcs-ai" data-testid="calcs-ai-generator">
        <label className="qq-calcs-ai-field">
          <span className="qq-calcs-ai-titlecue">
            {/* QW-1 — cue moved top-left (before the label) so the whole Build
             * surface uses one cue position (DESIGN-SYSTEM rule §2/§5). */}
            <InfoCue
              testid="calcs-ai-describe"
              region="result"
              text="Type the pricing rule in plain English — e.g. 'add 10% tax to the subtotal, then a $25 booking fee' — and AI converts it into a new calculation appended to the list below."
            />
            <span className="qq-calcs-ai-title">Describe a calculation</span>
          </span>
          <textarea
            className="qq-calcs-ai-input"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="e.g. Add 10% tax to the subtotal, then a $25 booking fee"
            rows={2}
            disabled={aiBusy}
            data-testid="calcs-ai-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleGenerate();
              }
            }}
          />
        </label>
        <div className="qq-calcs-ai-actions">
          <button
            type="button"
            className="qq-calcs-ai-go"
            onClick={handleGenerate}
            disabled={aiBusy || !aiPrompt.trim()}
            data-testid="calcs-ai-generate"
          >
            <span aria-hidden="true">✨</span>
            <span>{aiBusy ? 'Generating…' : 'Generate calculation'}</span>
          </button>
        </div>
        {aiError && (
          <div className="qq-calcs-ai-err" role="alert" data-testid="calcs-ai-error">
            {aiError}
          </div>
        )}
      </div>

      {isEmpty ? (
        <div className="qq-calcs-empty" data-testid="editor-calculations-empty">
          <div className="qq-calcs-empty-illus" aria-hidden="true">∑</div>
          <p className="qq-calcs-empty-title">No calculations yet</p>
          <button
            type="button"
            className="qq-calcs-add is-emphasis"
            onClick={handleAdd}
            data-testid="add-calculation-trigger-empty"
          >
            <span aria-hidden="true">+</span>
            <span>Add calculation</span>
          </button>
        </div>
      ) : (
        <SortableContext
          items={calculations.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          <ol className="qq-calcs-list" data-testid="editor-calculations-list">
            {calculations.map((c, i) => (
              <li key={c.id}>
                <CalculationRow
                  calc={c}
                  index={i}
                  total={calculations.length}
                  fields={fields}
                  precedingCalcs={calculations.slice(0, i)}
                  onChange={(next) => handleRowChange(i, next)}
                  onRemove={() => handleRemove(i)}
                  onMoveUp={() => handleMove(i, -1)}
                  onMoveDown={() => handleMove(i, 1)}
                  defaultExpanded={c.id === justAddedId}
                />
              </li>
            ))}
          </ol>
        </SortableContext>
      )}

      <style>{`
        .qq-calcs-panel {
          /* W-SECTIONS — tightened gap (12 → 6px) so the section title
           * sits right above the first input row. */
          display: flex; flex-direction: column; gap: 6px;
        }
        .qq-calcs-header {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px;
          margin: 0 0 0;
        }
        .qq-calcs-title {
          /* W-SECTIONS — subtle all-caps label, per Alex's global rule
           * "section titles smaller, more subtle, closer to inputs".
           * QW-1 — inline-flex with the InfoCue as the FIRST child so the
           * cue sits top-left of the section title (matches every other tab).
           * Wave 94 — color bumped from p.colors.muted (#6B7280) to
           * p.colors.body (#374151) so the label clears WCAG-AA on the
           * #E4EDF1 panel background. Previous 4.07:1 → ~9:1. */
          margin: 0;
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 11.5px; font-weight: 600;
          color: ${p.colors.body};
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .qq-calcs-sub {
          margin: 3px 0 0; font-size: 11.5px; color: ${p.colors.subtle};
          line-height: 1.6;
        }
        /* Panel-level "describe your formula" AI generator card. */
        .qq-calcs-ai {
          display: flex; flex-direction: column; gap: 8px;
          padding: 10px 12px; border-radius: 10px;
          background: ${p.colors.accentLighter};
          border: 1px solid ${p.colors.accentLight};
        }
        .qq-calcs-ai-field {
          display: flex; flex-direction: column; gap: 2px;
        }
        .qq-calcs-ai-titlecue {
          display: inline-flex; align-items: center; gap: 6px;
        }
        .qq-calcs-ai-title {
          font-size: 11.5px; font-weight: 600;
          color: ${p.colors.body};
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .qq-calcs-ai-input {
          width: 100%; box-sizing: border-box; resize: vertical;
          min-height: 48px;
          font: inherit; font-size: 13px; line-height: 1.45;
          padding: 8px 10px; border-radius: 8px;
          background: #fff; color: ${p.colors.heading};
          border: 1px solid ${p.colors.border};
        }
        .qq-calcs-ai-input::placeholder { color: ${p.colors.muted}; }
        .qq-calcs-ai-input:focus {
          outline: 2px solid ${p.colors.accentLight};
          outline-offset: 0; border-color: ${p.colors.accent};
        }
        .qq-calcs-ai-input:disabled { opacity: 0.6; cursor: not-allowed; }
        .qq-calcs-ai-actions {
          display: flex; justify-content: flex-end;
        }
        .qq-calcs-ai-go {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 8px;
          font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer;
          background: ${p.colors.accent}; color: #fff;
          border: 1px solid ${p.colors.accent};
          box-shadow: ${p.shadows.button};
          transition: background 0.12s ease, border-color 0.12s ease;
        }
        .qq-calcs-ai-go:hover:not(:disabled) {
          background: ${p.colors.accentDark}; border-color: ${p.colors.accentDark};
        }
        .qq-calcs-ai-go:disabled {
          opacity: 0.55; cursor: not-allowed; box-shadow: none;
        }
        .qq-calcs-ai-err {
          font-size: 11.5px; line-height: 1.4;
          padding: 7px 10px; border-radius: 8px;
          color: ${p.colors.danger};
          background: ${p.colors.dangerLight};
          border: 1px solid ${p.colors.danger};
        }
        @media (max-width: 480px) {
          .qq-calcs-ai-go { width: 100%; justify-content: center; }
        }
        .qq-calcs-helptoken {
          display: inline-block; margin: 0 3px;
          padding: 0 5px; border-radius: 4px;
          font-size: 10.5px; font-weight: 700;
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
        }
        .qq-calcs-helptoken--field {
          background: ${p.colors.accentLighter}; color: ${p.colors.accent};
        }
        .qq-calcs-helptoken--calc {
          background: #E6F7F1; color: #0E8a5f;
        }
        .qq-calcs-add {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 12px; border-radius: 8px;
          font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer;
          background: #fff; color: ${p.colors.heading};
          border: 1px dashed ${p.colors.border};
          transition: border-color 0.12s ease, background 0.12s ease, color 0.12s ease;
          flex-shrink: 0;
        }
        .qq-calcs-add:hover {
          border-color: ${p.colors.accent};
          color: ${p.colors.accent};
          background: ${p.colors.accentLighter};
        }
        .qq-calcs-add.is-emphasis {
          padding: 10px 16px; font-size: 13px;
          background: ${p.colors.accent}; color: #fff;
          border: 1px solid ${p.colors.accent};
          box-shadow: ${p.shadows.button};
        }
        .qq-calcs-add.is-emphasis:hover {
          background: ${p.colors.accentDark};
          border-color: ${p.colors.accentDark};
          color: #fff;
          box-shadow: ${p.shadows.buttonHover};
        }
        /* Wave N — match the smaller mobile sizing applied to "+ Add field"
           in AddFieldMenu. Empty-state emphasis variant keeps its prominence. */
        @media (max-width: 480px) {
          .qq-calcs-add:not(.is-emphasis) {
            padding: 6px 10px;
            font-size: 12px;
            min-height: 32px;
            gap: 4px;
          }
        }
        .qq-calcs-list {
          list-style: none; margin: 0; padding: 0;
          display: flex; flex-direction: column; gap: 8px;
        }
        .qq-calcs-empty {
          display: flex; flex-direction: column; align-items: center;
          gap: 8px; padding: 28px 18px; text-align: center;
          background: ${p.colors.surfaceRaised};
          border: 1px dashed ${p.colors.border}; border-radius: 12px;
        }
        .qq-calcs-empty-illus {
          width: 46px; height: 46px; border-radius: 50%;
          background: #E6F7F1; color: #0E8a5f;
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 22px; font-weight: 700;
        }
        .qq-calcs-empty-title {
          margin: 4px 0 0; font-size: 14px; font-weight: 700;
          color: ${p.colors.heading};
        }
        .qq-calcs-empty-sub {
          margin: 0 0 10px; max-width: 360px;
          font-size: 12.5px; color: ${p.colors.muted}; line-height: 1.55;
        }
        /* ── Dark editor chrome ─────────────────────────────────────────
           The panel hardcodes light-theme grays (#374151 title, a
           light-lavender AI card with a white textarea) that read
           dark-on-dark / visually inconsistent on the #1e293b dark editor.
           Repaint under the shared dark tokens; light mode is untouched. */
        .qq-editor-shell[data-theme="dark"] .qq-calcs-title {
          color: var(--qq-text, #f1f5f9);
        }
        .qq-editor-shell[data-theme="dark"] .qq-calcs-sub {
          color: var(--qq-muted, #94a3b8);
        }
        /* Re-theme the "Describe a calculation" AI island for dark mode:
           dark panel + border, light title, and a dark (not white) textarea. */
        .qq-editor-shell[data-theme="dark"] .qq-calcs-ai {
          background: var(--qq-surface, #243149);
          border-color: var(--qq-border, rgba(255,255,255,0.12));
        }
        .qq-editor-shell[data-theme="dark"] .qq-calcs-ai-title {
          color: var(--qq-text, #f1f5f9);
        }
        .qq-editor-shell[data-theme="dark"] .qq-calcs-ai-input {
          background: #1e293b;
          color: var(--qq-text, #f1f5f9);
          border-color: var(--qq-border, rgba(255,255,255,0.14));
        }
        .qq-editor-shell[data-theme="dark"] .qq-calcs-ai-input::placeholder {
          color: var(--qq-muted, #94a3b8);
        }
      `}</style>
    </section>
  );
}
