/**
 * Safe formula evaluator for the QuoteQuick advanced calculator builder.
 *
 * Phase 1a of the advanced-builder epic. NO `eval` / `new Function` — a
 * hand-written tokenizer + recursive-descent parser + AST evaluator.
 *
 * Supports:
 *  - arithmetic `+ - * / ^` with PEMDAS and parentheses
 *  - comparison operators `=  ==  !=  <>  <  <=  >  >=` (yield booleans)
 *  - functions: SUM MAX MIN ROUND ROUNDUP ROUNDDOWN ABS IF AND OR NOT
 *    CONTAINS RAND RANDBETWEEN
 *  - field references as bare identifiers (`rooms`) or bracketed names
 *    with spaces (`[Room count]`), resolved from the supplied context
 *  - `true` / `false` literals, string literals in `'` or `"`
 *
 * Everything is pure and side-effect free (except RAND/RANDBETWEEN), so it
 * runs identically on the server and in the customer widget.
 */

export type FormulaValue = number | string | boolean | Array<number | string>;
export type FormulaContext = Record<string, FormulaValue>;

export interface FormulaResult {
  ok: boolean;
  /** Numeric result; 0 when `ok` is false. */
  value: number;
  /** Human-readable reason when `ok` is false. */
  error?: string;
}

/** A named calculation — its `formula` may reference fields and earlier calcs. */
export interface Calculation {
  id: string;
  name: string;
  formula: string;
}

export interface CalcRunResult {
  /** Numeric result per calculation name (0 for any that errored). */
  values: Record<string, number>;
  /** Error message per calculation name that failed. */
  errors: Record<string, string>;
}

class FormulaError extends Error {}

/* ─── Tokenizer ─── */

type TokType = 'num' | 'str' | 'id' | 'op' | 'lp' | 'rp' | 'comma' | 'eof';
interface Tok { t: TokType; v: string; }

const CMP_OPS = ['==', '!=', '<>', '<=', '>=', '=', '<', '>'];

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }

    // number (123, 1.5, .5)
    if ((c >= '0' && c <= '9') || (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
      let j = i, dots = 0;
      while (j < n && ((src[j] >= '0' && src[j] <= '9') || src[j] === '.')) {
        if (src[j] === '.' && ++dots > 1) throw new FormulaError('Malformed number');
        j++;
      }
      toks.push({ t: 'num', v: src.slice(i, j) });
      i = j; continue;
    }

    // string literal
    if (c === '"' || c === "'") {
      let j = i + 1, s = '';
      while (j < n && src[j] !== c) { s += src[j]; j++; }
      if (j >= n) throw new FormulaError('Unterminated string');
      toks.push({ t: 'str', v: s });
      i = j + 1; continue;
    }

    // bracketed field reference [Field Name]
    if (c === '[') {
      let j = i + 1, s = '';
      while (j < n && src[j] !== ']') { s += src[j]; j++; }
      if (j >= n) throw new FormulaError('Unterminated [field reference]');
      const name = s.trim();
      if (!name) throw new FormulaError('Empty [field reference]');
      toks.push({ t: 'id', v: name });
      i = j + 1; continue;
    }

    // identifier (function name / bare field / true / false)
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      toks.push({ t: 'id', v: src.slice(i, j) });
      i = j; continue;
    }

    // operators — multi-char first
    const two = src.slice(i, i + 2);
    if (CMP_OPS.includes(two)) { toks.push({ t: 'op', v: two }); i += 2; continue; }
    if ('+-*/^=<>'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    if (c === '(') { toks.push({ t: 'lp', v: c }); i++; continue; }
    if (c === ')') { toks.push({ t: 'rp', v: c }); i++; continue; }
    if (c === ',') { toks.push({ t: 'comma', v: c }); i++; continue; }

    throw new FormulaError(`Unexpected character "${c}"`);
  }
  toks.push({ t: 'eof', v: '' });
  return toks;
}

/* ─── AST ─── */

type Node =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'var'; name: string }
  | { k: 'unary'; op: string; e: Node }
  | { k: 'bin'; op: string; l: Node; r: Node }
  | { k: 'call'; name: string; args: Node[] };

/* ─── Parser (recursive descent) ─── */

class Parser {
  private toks: Tok[];
  private pos = 0;
  constructor(toks: Tok[]) { this.toks = toks; }

  private peek(): Tok { return this.toks[this.pos]; }
  private next(): Tok { return this.toks[this.pos++]; }
  private expect(t: TokType): Tok {
    if (this.peek().t !== t) throw new FormulaError(`Expected "${t}"`);
    return this.next();
  }

  parse(): Node {
    const node = this.expr();
    if (this.peek().t !== 'eof') {
      throw new FormulaError(`Unexpected "${this.peek().v || this.peek().t}"`);
    }
    return node;
  }

  private expr(): Node { return this.comparison(); }

  private comparison(): Node {
    let l = this.additive();
    if (this.peek().t === 'op' && CMP_OPS.includes(this.peek().v)) {
      const op = this.next().v;
      l = { k: 'bin', op, l, r: this.additive() };
    }
    return l;
  }

  private additive(): Node {
    let l = this.multiplicative();
    while (this.peek().t === 'op' && (this.peek().v === '+' || this.peek().v === '-')) {
      const op = this.next().v;
      l = { k: 'bin', op, l, r: this.multiplicative() };
    }
    return l;
  }

  private multiplicative(): Node {
    let l = this.power();
    while (this.peek().t === 'op' && (this.peek().v === '*' || this.peek().v === '/')) {
      const op = this.next().v;
      l = { k: 'bin', op, l, r: this.power() };
    }
    return l;
  }

  private power(): Node {
    const l = this.unary();
    if (this.peek().t === 'op' && this.peek().v === '^') {
      this.next();
      return { k: 'bin', op: '^', l, r: this.power() }; // right-associative
    }
    return l;
  }

  private unary(): Node {
    if (this.peek().t === 'op' && (this.peek().v === '-' || this.peek().v === '+')) {
      const op = this.next().v;
      return { k: 'unary', op, e: this.unary() };
    }
    return this.primary();
  }

  private primary(): Node {
    const tk = this.peek();
    if (tk.t === 'num') { this.next(); return { k: 'num', v: parseFloat(tk.v) }; }
    if (tk.t === 'str') { this.next(); return { k: 'str', v: tk.v }; }
    if (tk.t === 'lp') {
      this.next();
      const e = this.expr();
      this.expect('rp');
      return e;
    }
    if (tk.t === 'id') {
      this.next();
      if (this.peek().t === 'lp') {
        this.next();
        const args: Node[] = [];
        if (this.peek().t !== 'rp') {
          args.push(this.expr());
          while (this.peek().t === 'comma') { this.next(); args.push(this.expr()); }
        }
        this.expect('rp');
        return { k: 'call', name: tk.v, args };
      }
      const low = tk.v.toLowerCase();
      if (low === 'true') return { k: 'num', v: 1 };
      if (low === 'false') return { k: 'num', v: 0 };
      return { k: 'var', name: tk.v };
    }
    throw new FormulaError(`Unexpected "${tk.v || tk.t}"`);
  }
}

/* ─── Evaluator ─── */

type Val = number | string | boolean | Array<number | string>;

function toNum(v: Val): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (Array.isArray(v)) return v.reduce<number>((s, x) => s + toNum(x as Val), 0);
  const f = parseFloat(String(v));
  return isFinite(f) ? f : 0;
}

function toBool(v: Val): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (Array.isArray(v)) return v.length > 0;
  const s = String(v).trim().toLowerCase();
  return s !== '' && s !== '0' && s !== 'false';
}

/** Flatten arguments (expanding arrays) into a flat list of numbers. */
function flattenNums(vals: Val[]): number[] {
  const out: number[] = [];
  for (const v of vals) {
    if (Array.isArray(v)) for (const x of v) out.push(toNum(x as Val));
    else out.push(toNum(v));
  }
  return out;
}

function roundTo(x: number, places: number, mode: 'round' | 'up' | 'down'): number {
  const p = Math.max(0, Math.min(10, Math.trunc(places)));
  const f = Math.pow(10, p);
  const scaled = x * f;
  const r = mode === 'up' ? Math.ceil(scaled) : mode === 'down' ? Math.floor(scaled) : Math.round(scaled);
  return r / f;
}

function looseEqual(a: Val, b: Val): boolean {
  if (typeof a === 'number' || typeof b === 'number') return toNum(a) === toNum(b);
  if (typeof a === 'boolean' || typeof b === 'boolean') return toBool(a) === toBool(b);
  return String(a) === String(b);
}

function resolveVar(name: string, ctx: FormulaContext): Val {
  if (Object.prototype.hasOwnProperty.call(ctx, name)) return ctx[name];
  // case-insensitive fallback so the builder isn't strict about casing
  const lower = name.toLowerCase();
  for (const k of Object.keys(ctx)) {
    if (k.toLowerCase() === lower) return ctx[k];
  }
  return 0; // an unanswered field counts as 0
}

function evalNode(node: Node, ctx: FormulaContext): Val {
  switch (node.k) {
    case 'num': return node.v;
    case 'str': return node.v;
    case 'var': return resolveVar(node.name, ctx);

    case 'unary': {
      const e = toNum(evalNode(node.e, ctx));
      return node.op === '-' ? -e : e;
    }

    case 'bin': {
      const op = node.op;
      if (op === '+' || op === '-' || op === '*' || op === '/' || op === '^') {
        const l = toNum(evalNode(node.l, ctx));
        const r = toNum(evalNode(node.r, ctx));
        switch (op) {
          case '+': return l + r;
          case '-': return l - r;
          case '*': return l * r;
          case '/':
            if (r === 0) throw new FormulaError('Division by zero');
            return l / r;
          case '^': return Math.pow(l, r);
        }
      }
      // comparison
      const lv = evalNode(node.l, ctx);
      const rv = evalNode(node.r, ctx);
      switch (op) {
        case '=': case '==': return looseEqual(lv, rv);
        case '!=': case '<>': return !looseEqual(lv, rv);
        case '<': return toNum(lv) < toNum(rv);
        case '<=': return toNum(lv) <= toNum(rv);
        case '>': return toNum(lv) > toNum(rv);
        case '>=': return toNum(lv) >= toNum(rv);
      }
      throw new FormulaError(`Unknown operator "${op}"`);
    }

    case 'call': {
      const name = node.name.toUpperCase();
      const args = node.args;
      const ev = (n: Node) => evalNode(n, ctx);
      switch (name) {
        case 'SUM':
          return flattenNums(args.map(ev)).reduce((s, x) => s + x, 0);
        case 'MAX': {
          const nums = flattenNums(args.map(ev));
          return nums.length ? Math.max(...nums) : 0;
        }
        case 'MIN': {
          const nums = flattenNums(args.map(ev));
          return nums.length ? Math.min(...nums) : 0;
        }
        case 'ABS':
          return Math.abs(toNum(ev(args[0] ?? { k: 'num', v: 0 })));
        case 'ROUND':
          return roundTo(toNum(ev(args[0])), args[1] ? toNum(ev(args[1])) : 0, 'round');
        case 'ROUNDUP':
          return roundTo(toNum(ev(args[0])), args[1] ? toNum(ev(args[1])) : 0, 'up');
        case 'ROUNDDOWN':
          return roundTo(toNum(ev(args[0])), args[1] ? toNum(ev(args[1])) : 0, 'down');
        case 'IF':
          if (args.length < 2) throw new FormulaError('IF needs at least 2 arguments');
          return toBool(ev(args[0])) ? ev(args[1]) : (args[2] ? ev(args[2]) : 0);
        case 'AND':
          return args.every((a) => toBool(ev(a)));
        case 'OR':
          return args.some((a) => toBool(ev(a)));
        case 'NOT':
          return !toBool(ev(args[0] ?? { k: 'num', v: 0 }));
        case 'CONTAINS': {
          const hay = ev(args[0]);
          const needle = ev(args[1]);
          if (Array.isArray(hay)) return hay.some((x) => looseEqual(x as Val, needle));
          return String(hay).toLowerCase().includes(String(needle).toLowerCase());
        }
        case 'RAND':
          return Math.random();
        case 'RANDBETWEEN': {
          const lo = Math.trunc(toNum(ev(args[0])));
          const hi = Math.trunc(toNum(ev(args[1])));
          if (hi < lo) throw new FormulaError('RANDBETWEEN: high < low');
          return lo + Math.floor(Math.random() * (hi - lo + 1));
        }
        default:
          throw new FormulaError(`Unknown function "${node.name}"`);
      }
    }
  }
}

/* ─── Public API ─── */

/**
 * Evaluate a single formula expression against a context of field values.
 * Never throws — failures are returned as `{ ok: false, error }`.
 */
export function evaluateFormula(expr: string, ctx: FormulaContext = {}): FormulaResult {
  try {
    if (!expr || !expr.trim()) return { ok: true, value: 0 };
    const ast = new Parser(tokenize(expr)).parse();
    const num = toNum(evalNode(ast, ctx));
    if (!isFinite(num)) return { ok: false, value: 0, error: 'Result is not a finite number' };
    return { ok: true, value: num };
  } catch (e) {
    return { ok: false, value: 0, error: e instanceof FormulaError ? e.message : 'Invalid formula' };
  }
}

/**
 * Run an ordered list of named calculations. Each calculation can reference
 * fields from `context` and the result of any earlier calculation (by name),
 * so subtotals can chain into a total.
 */
export function runCalculations(calcs: Calculation[], context: FormulaContext = {}): CalcRunResult {
  const values: Record<string, number> = {};
  const errors: Record<string, string> = {};
  const ctx: FormulaContext = { ...context };
  for (const calc of calcs) {
    const r = evaluateFormula(calc.formula, ctx);
    values[calc.name] = r.value;
    ctx[calc.name] = r.value;
    if (!r.ok && r.error) errors[calc.name] = r.error;
  }
  return { values, errors };
}

/**
 * Static check that a formula parses (used by the builder UI to flag a bad
 * formula before it is saved). Does not evaluate.
 */
export function validateFormula(expr: string): { valid: boolean; error?: string } {
  try {
    if (!expr || !expr.trim()) return { valid: true };
    new Parser(tokenize(expr)).parse();
    return { valid: true };
  } catch (e) {
    return { valid: false, error: e instanceof FormulaError ? e.message : 'Invalid formula' };
  }
}
