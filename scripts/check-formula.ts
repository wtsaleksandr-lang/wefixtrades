/**
 * Test battery for shared/formulaEngine.ts — run with `npm run test:formula`.
 * Exits non-zero on any failure so it can gate CI later.
 */
import { evaluateFormula, runCalculations, validateFormula, type FormulaContext } from '../shared/formulaEngine';

let pass = 0;
let fail = 0;

function val(expr: string, ctx: FormulaContext, want: number, label?: string) {
  const r = evaluateFormula(expr, ctx);
  const name = label || expr;
  if (!r.ok) { fail++; console.log(`FAIL  ${name}  → error: ${r.error}`); return; }
  if (Math.abs(r.value - want) > 1e-9) { fail++; console.log(`FAIL  ${name}  → got ${r.value}, want ${want}`); return; }
  pass++;
}

function err(expr: string, ctx: FormulaContext = {}, label?: string) {
  const r = evaluateFormula(expr, ctx);
  if (r.ok) { fail++; console.log(`FAIL  ${label || expr}  → expected an error, got ${r.value}`); return; }
  pass++;
}

function approx(expr: string, ctx: FormulaContext, lo: number, hi: number, label: string) {
  const r = evaluateFormula(expr, ctx);
  if (!r.ok || r.value < lo || r.value > hi) {
    fail++; console.log(`FAIL  ${label}  → got ${r.ok ? r.value : r.error}, want ${lo}..${hi}`);
  } else pass++;
}

/* ── arithmetic + precedence ── */
val('2+3', {}, 5);
val('2+3*4', {}, 14);
val('(2+3)*4', {}, 20);
val('7-2-1', {}, 4);            // left-associative
val('10/4', {}, 2.5);
val('2^3^2', {}, 512);          // right-associative: 2^(3^2)
val('2^10', {}, 1024);
val('-3+5', {}, 2);
val('2 * -3', {}, -6);
val('1.5 + .5', {}, 2);
val('100 * (1 - 0.2)', {}, 80);

/* ── comparisons (booleans coerce to 1/0) ── */
val('5>3', {}, 1);
val('3>5', {}, 0);
val('5>=5', {}, 1);
val('4=4', {}, 1);
val('4==4', {}, 1);
val('4!=5', {}, 1);
val('4<>4', {}, 0);
val('2<3', {}, 1);

/* ── field references ── */
val('rooms * 10', { rooms: 3 }, 30);
val('[Room count] * 10', { 'Room count': 3 }, 30);
val('missing + 5', {}, 5, 'unanswered field → 0');
val('ROOMS', { rooms: 4 }, 4, 'case-insensitive field');

/* ── literals / IF ── */
val('IF(true, 10, 20)', {}, 10);
val('IF(false, 10, 20)', {}, 20);
val('IF(qty > 5, 100, 50)', { qty: 8 }, 100);
val('IF(qty > 5, 100, 50)', { qty: 2 }, 50);
val('IF(qty > 5, 100)', { qty: 2 }, 0, 'IF without else → 0');

/* ── SUM / MAX / MIN over args and arrays ── */
val('SUM(1,2,3)', {}, 6);
val('SUM(items)', { items: [2, 3, 5] }, 10);
val('items * 2', { items: [1, 2, 3] }, 12, 'bare multi-select sums');
val('MAX(3,9,1)', {}, 9);
val('MAX(prices)', { prices: [4, 8, 2] }, 8);
val('MIN(3,9,1)', {}, 1);

/* ── ROUND family ── */
val('ROUND(3.14159, 2)', {}, 3.14);
val('ROUND(3.7)', {}, 4);
val('ROUNDUP(3.1)', {}, 4);
val('ROUNDUP(3.14, 1)', {}, 3.2);
val('ROUNDDOWN(3.9)', {}, 3);
val('ROUNDDOWN(3.19, 1)', {}, 3.1);
val('ABS(-7)', {}, 7);

/* ── logic functions ── */
val('AND(true, true)', {}, 1);
val('AND(1, 0)', {}, 0);
val('OR(0, 1)', {}, 1);
val('OR(0, 0)', {}, 0);
val('NOT(0)', {}, 1);
val('NOT(5)', {}, 0);

/* ── CONTAINS ── */
val("CONTAINS(opts, 'pro')", { opts: ['basic', 'pro'] }, 1);
val("CONTAINS(opts, 'x')", { opts: ['basic', 'pro'] }, 0);
val("CONTAINS('hello world', 'world')", {}, 1);

/* ── realistic nested expressions ── */
val('IF(AND(a>0, b>0), a*b, 0)', { a: 3, b: 4 }, 12);
val('ROUND((base + qty * rate) * (1 + tax), 2)', { base: 50, qty: 3, rate: 20, tax: 0.1 }, 121);
val("base + IF(CONTAINS(addons, 'eco'), 25, 0)", { base: 100, addons: ['eco'] }, 125);

/* ── randomness (range only) ── */
approx('RAND()', {}, 0, 0.999999, 'RAND in [0,1)');
val('RANDBETWEEN(1,1)', {}, 1);
approx('RANDBETWEEN(5,10)', {}, 5, 10, 'RANDBETWEEN in range');

/* ── errors ── */
err('5/0', {}, 'division by zero');
err('FOO(1)', {}, 'unknown function');
err('2 +', {}, 'trailing operator');
err('(2+3', {}, 'unmatched paren');
err('2 3', {}, 'unexpected token');
err("'abc", {}, 'unterminated string');
err('[unclosed', {}, 'unterminated field ref');

/* ── empty ── */
val('', {}, 0, 'empty formula → 0');
val('   ', {}, 0, 'whitespace formula → 0');

/* ── runCalculations: chaining ── */
{
  const r = runCalculations(
    [
      { id: '1', name: 'subtotal', formula: 'qty * rate' },
      { id: '2', name: 'total', formula: 'subtotal * (1 + tax)' },
    ],
    { qty: 2, rate: 10, tax: 0.2 },
  );
  if (r.values.subtotal === 20 && Math.abs(r.values.total - 24) < 1e-9) pass++;
  else { fail++; console.log(`FAIL  runCalculations chaining → ${JSON.stringify(r.values)}`); }
}

/* ── runCalculations: error isolation ── */
{
  const r = runCalculations([{ id: '1', name: 'bad', formula: '1/0' }], {});
  if (r.errors.bad && r.values.bad === 0) pass++;
  else { fail++; console.log(`FAIL  runCalculations error isolation → ${JSON.stringify(r)}`); }
}

/* ── validateFormula ── */
{
  const ok = validateFormula('2 + rooms * 3');
  const bad = validateFormula('2 +');
  if (ok.valid && !bad.valid) pass++;
  else { fail++; console.log('FAIL  validateFormula'); }
}

console.log(`\nformula engine: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
