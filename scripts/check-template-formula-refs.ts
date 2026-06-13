/**
 * Guard: every bracketed `[ref]` in a template preset's calc formula — and each
 * template's `result_calc` — must resolve to a real field name or calc name in
 * that same template.
 *
 * WHY: the formula engine (shared/formulaEngine.ts `resolveVar`) resolves a
 * reference against a context keyed by FIELD NAMES + CALC NAMES (see
 * AdvancedCalculator.tsx:1858-1859 `ctx[f.name] = …`, then runCalculations
 * chains each calc's name). An UNKNOWN ref does NOT error — it silently
 * resolves to 0. So a typo'd bracketed ref produces a wrong-but-plausible quote
 * with no signal. That is exactly the `door_installation` bug (PR #595 →
 * #1796): the "Service Total" calc referenced `[Removal]`, but the field is
 * named "Remove Old Door", so the $95/door removal charge silently vanished —
 * undercharging ~$285 on a 3-door job. It shipped and survived every guard for
 * months. This locks the whole class shut.
 *
 * Resolution mirrors the engine exactly: bracketed refs are unambiguous field
 * references (the tokenizer turns `[…]` into a field token), matched
 * case-INSENSITIVELY against field+calc names (resolveVar lowercases). IDs are
 * intentionally NOT in the known set — the engine does not resolve by id (the
 * `[Removal]` bug case-insensitively matched the id `removal` yet still hit 0).
 *
 * Scope: bracketed `[refs]` only (zero false-positive: brackets are always
 * field references, never functions/literals) + `result_calc` existence. Bare
 * single-word identifier refs are out of scope (they collide with function
 * names and need full parsing to disambiguate) — acceptable because template
 * field names contain spaces and are therefore always bracketed in practice.
 *
 * Run: `npm run check:template-formula-refs` (tsx; no DB).
 */
import { TEMPLATE_PRESETS } from "../shared/templatePresets";

type Finding = { template: string; where: string; ref: string; formula?: string };

const findings: Finding[] = [];
let templateCount = 0;
let calcCount = 0;
let refCount = 0;

const BRACKET_REF = /\[([^\]]+)\]/g;

for (const t of TEMPLATE_PRESETS) {
  templateCount++;
  const fieldNames = (t.fields ?? []).map((f) => (f.name ?? "").trim().toLowerCase());
  const calcNames = (t.calculations ?? []).map((c) => (c.name ?? "").trim().toLowerCase());
  const known = new Set<string>([...fieldNames, ...calcNames].filter(Boolean));

  for (const c of t.calculations ?? []) {
    calcCount++;
    const formula = c.formula ?? "";
    let m: RegExpExecArray | null;
    BRACKET_REF.lastIndex = 0;
    while ((m = BRACKET_REF.exec(formula)) !== null) {
      refCount++;
      const ref = m[1].trim();
      if (!known.has(ref.toLowerCase())) {
        findings.push({
          template: t.id,
          where: `calc "${c.name}"`,
          ref: `[${m[1]}]`,
          formula,
        });
      }
    }
  }

  // result_calc must name an existing calculation (else the headline number is
  // decoupled and silently falls back / renders 0).
  const rc = (t.result_calc ?? "").trim();
  if (rc) {
    const calcNameSet = new Set(calcNames);
    if (!calcNameSet.has(rc.toLowerCase())) {
      findings.push({ template: t.id, where: "result_calc", ref: rc });
    }
  }
}

if (findings.length > 0) {
  console.error(
    `\ncheck:template-formula-refs — ${findings.length} dead reference(s) found:\n`,
  );
  for (const f of findings) {
    console.error(`  ✗ [${f.template}] ${f.where}: unresolved ${f.ref}`);
    if (f.formula) console.error(`      in formula: ${f.formula}`);
    console.error(
      `      → no field or calculation in this template is named ${f.ref}. ` +
        `The engine silently resolves it to 0 → wrong quote. Fix the ref to a real field/calc name.`,
    );
  }
  console.error(
    `\nScanned ${templateCount} templates / ${calcCount} calcs / ${refCount} bracketed refs.`,
  );
  process.exit(1);
}

console.log(
  `check:template-formula-refs — OK (${templateCount} templates, ${calcCount} calcs, ${refCount} bracketed refs, 0 dead).`,
);
process.exit(0);
