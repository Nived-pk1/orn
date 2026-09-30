/**
 * Element counts from a formula string (CHEM-003, CHEM-005). The rule compares ATOM COUNTS, never strings: `C2H5OH`, `CH3COOH`
 * and a Hill formula from the structure all reduce to counts first. Reads condensed forms (`CH3COOH`), groups with counts
 * (`Ca(OH)2`, `Al2(SO4)3`, brackets too), Unicode subscripts, dot-separated components with a multiplier (`CuSO4.5H2O`) and an
 * UNAMBIGUOUS charge suffix (`H3O+`, `SO4^2-`, superscripts), which is ignored (the charge is CHEM-004's). Anything else (an R
 * group, `Ph`, a letter that is no element, an unbalanced bracket, a sign after digits such as `Al3+`, which could be a count) is
 * `not readable`, with the reason: the caller reports "not compared", never a guess. Bounded: at most 200 characters, groups
 * nested at most 16 deep (an explicit stack, no recursion), counts up to 100,000.
 */
import { isElementSymbol } from '../rdkit/elements';

export const MAX_FORMULA_CHARS = 200;
const MAX_NESTING = 16;
const MAX_COUNT = 100_000;

export type ElementCounts = Readonly<Record<string, number>>;
export type FormulaRead = { readonly ok: true; readonly counts: ElementCounts } | { readonly ok: false; readonly reason: string };

const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';
const SEPARATORS = /[.·•∙⋅]/;
const fail = (reason: string): FormulaRead => ({ ok: false, reason });

const digitsOf = (text: string): string => [...text].map((c) => (SUBSCRIPTS.includes(c) ? String(SUBSCRIPTS.indexOf(c)) : c)).join('');

/** Removes an unambiguous charge suffix. `undefined`: a sign after plain digits (`Al3+`, `SO42-`), which is ambiguous. */
function withoutCharge(text: string): string | undefined {
  const superscript = /[⁰¹²³⁴⁵⁶⁷⁸⁹]*[⁺⁻]$/u.exec(text);
  if (superscript !== null) return text.slice(0, superscript.index);
  const caret = /\^\d*[+-]$/.exec(text);
  if (caret !== null) return text.slice(0, caret.index);
  if (/[+-]$/.test(text)) {
    const body = text.slice(0, -1);
    return /[0-9]$/.test(body) ? undefined : body;
  }
  return text;
}

function add(into: Record<string, number>, symbol: string, count: number): boolean {
  const next = (into[symbol] ?? 0) + count;
  if (next > MAX_COUNT) return false;
  into[symbol] = next;
  return true;
}

/** One component (no separators, no charge, no multiplier). */
function readComponent(text: string): FormulaRead {
  const stack: Record<string, number>[] = [{}];
  const closers: string[] = [];
  let i = 0;
  const count = (): number | undefined => {
    let j = i;
    while (j < text.length && text.charCodeAt(j) >= 48 && text.charCodeAt(j) <= 57) j += 1;
    const value = j === i ? 1 : Number(text.slice(i, j));
    i = j;
    return value >= 1 && value <= MAX_COUNT ? value : undefined;
  };
  while (i < text.length) {
    const c = text.charAt(i);
    if (c === '(' || c === '[') {
      if (stack.length > MAX_NESTING) return fail('the groups are nested too deeply');
      stack.push({});
      closers.push(c === '(' ? ')' : ']');
      i += 1;
    } else if (c === ')' || c === ']') {
      if (closers.pop() !== c) return fail('the brackets do not match');
      i += 1;
      const times = count();
      if (times === undefined) return fail('a group count is out of range');
      const group = stack.pop() ?? {};
      const outer = stack[stack.length - 1] ?? {};
      for (const [symbol, n] of Object.entries(group)) if (!add(outer, symbol, n * times)) return fail('a count is too large');
    } else if (c >= 'A' && c <= 'Z') {
      const two = text.slice(i, i + 2);
      const lower = /^[A-Z][a-z]$/.test(two);
      const symbol = lower ? two : c;
      if (!isElementSymbol(symbol)) return fail(`"${lower ? two : c}" is not an element symbol`);
      i += symbol.length;
      const n = count();
      if (n === undefined || !add(stack[stack.length - 1] ?? {}, symbol, n)) return fail('a count is out of range');
    } else return fail(`"${c}" is not part of a formula`);
  }
  if (closers.length > 0) return fail('a bracket is not closed');
  const counts = stack[0] ?? {};
  return Object.keys(counts).length === 0 ? fail('the formula has no atoms') : { ok: true, counts };
}

export function parseFormula(entered: string): FormulaRead {
  const trimmed = entered.trim();
  if (trimmed.length === 0) return fail('the formula is empty');
  if (trimmed.length > MAX_FORMULA_CHARS) return fail(`the formula has more than ${MAX_FORMULA_CHARS} characters`);
  const bare = withoutCharge(digitsOf(trimmed.replace(/\s+/g, '')));
  if (bare === undefined) return fail('a charge sign follows digits, which could be an atom count (write the charge as ^2+ or as a superscript)');
  const total: Record<string, number> = {};
  for (const part of bare.split(SEPARATORS)) {
    const lead = /^[0-9]+/.exec(part);
    const multiplier = lead === null ? 1 : Number(lead[0]);
    if (multiplier < 1 || multiplier > MAX_COUNT) return fail('a component multiplier is out of range');
    const read = readComponent(lead === null ? part : part.slice(lead[0].length));
    if (!read.ok) return read;
    for (const [symbol, n] of Object.entries(read.counts)) if (!add(total, symbol, n * multiplier)) return fail('a count is too large');
  }
  return { ok: true, counts: total };
}

/** `a - b` per element, nonzero entries only, sorted by symbol. */
export function countDifferences(a: ElementCounts, b: ElementCounts): ElementCounts {
  const out: Record<string, number> = {};
  for (const symbol of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    const delta = Math.round(((a[symbol] ?? 0) - (b[symbol] ?? 0)) * 1e9) / 1e9;
    if (Math.abs(delta) > 1e-9) out[symbol] = delta;
  }
  return out;
}

/** Hill order text of counts, e.g. `C2H6O`; readable, for messages. */
export function countsText(counts: ElementCounts): string {
  const symbols = Object.keys(counts).sort();
  const hasCarbon = symbols.includes('C');
  const ordered = hasCarbon ? ['C', ...(symbols.includes('H') ? ['H'] : []), ...symbols.filter((s) => s !== 'C' && s !== 'H')] : symbols;
  return ordered.map((s) => `${s}${counts[s] === 1 ? '' : String(counts[s])}`).join('');
}

/** Multiplies every count (a stoichiometric coefficient) and adds it into `into`. */
export function addScaled(into: Record<string, number>, counts: ElementCounts, factor: number): void {
  for (const [symbol, n] of Object.entries(counts)) into[symbol] = (into[symbol] ?? 0) + n * factor;
}
