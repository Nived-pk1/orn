/**
 * The quick-entry grammar (ADR-040 addendum, step 6.7b, Q2): one text line becomes stages of terms and a list of products. Pure, total and
 * bounded: it never throws, looks at no more than `MAX_QUICK_LINE` characters, and every input gives a result - an entry, or errors in words
 * with the position.
 *
 *   <left> -> <right>        the arrow may be "->", "→" or "=>"; exactly one
 *   left                     terms joined by " + " (a "+" with a space or the line start before it and a space or the end after it)
 *   term                     a name, a formula or a SMILES string, optionally followed by "( ... )": CONDITION TEXT for the term's stage
 *   ", then "                on the left starts the next stage; the terms after it are that stage's
 *   right                    products joined by " + "
 *
 * A "(" opens condition text only when whitespace comes before it and a term before that (so "2-(bromomethyl)furan" and "CC(=O)O" keep their
 * parentheses). Condition text may nest brackets. Nothing here knows a chemical name: what a term IS is the resolver's question.
 */

export const MAX_QUICK_LINE = 1_000;
export const MAX_QUICK_TERMS = 24;
const MAX_ERRORS = 8;

export type QuickArrow = '->' | '→' | '=>';

export interface QuickTerm {
  /** The name, formula or SMILES, trimmed, whitespace runs collapsed. */
  readonly text: string;
  /** The text inside the "( ... )" that followed the term, trimmed; absent when there was none. */
  readonly condition?: string;
  /** Where the term's text is in the line. */
  readonly start: number;
  readonly end: number;
}

export interface QuickStage {
  readonly terms: readonly QuickTerm[];
}

export interface QuickEntry {
  readonly stages: readonly QuickStage[];
  readonly products: readonly QuickTerm[];
  readonly arrow: QuickArrow;
}

export interface QuickError {
  /** In words, naming the place ("after 'ethanol +'"). */
  readonly message: string;
  /** Index into the line, 0 to its length. */
  readonly position: number;
}

export type QuickParse = { readonly ok: true; readonly entry: QuickEntry } | { readonly ok: false; readonly errors: readonly QuickError[] };

const EXAMPLE = 'ethanol + PCC (CH2Cl2) -> ethanal';
const MASK = '\u0001';
const ARROWS = /->|=>|→/g;
const STAGE_BREAK = /,\s*then(?=\s|$)/gi;
const SEPARATOR = /(?:^|\s)\+(?=\s|$)/g;

interface Group {
  readonly open: number;
  readonly close: number;
}

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** The last characters of `line.slice(from, to)`, for "after '...'". */
function placeOf(line: string, from: number, to: number): string {
  const text = collapse(line.slice(from, to));
  return text.length > 30 ? `…${text.slice(-30)}` : text;
}

/** Condition groups are masked (every character becomes MASK) so splitting looks only at the structure around them. */
function maskGroups(line: string, errors: QuickError[]): { readonly masked: string; readonly groups: readonly Group[] } {
  const groups: Group[] = [];
  const opens = (at: number): boolean => {
    if (at === 0 || !/\s/.test(line.charAt(at - 1))) return false;
    const before = line.slice(0, at).trimEnd();
    return before !== '' && !/(?:^|\s)\+$/.test(before) && !/[,>→]$/.test(before);
  };
  const units = line.split(MASK).join('\u0002').split('');
  for (let i = 0; i < units.length; i += 1) {
    if (units[i] !== '(' || !opens(i)) continue;
    let depth = 0;
    let close = -1;
    for (let j = i; j < units.length; j += 1) {
      if (units[j] === '(') depth += 1;
      else if (units[j] === ')') {
        depth -= 1;
        if (depth === 0) {
          close = j;
          break;
        }
      }
    }
    if (close < 0) {
      errors.push({ position: i, message: `The '(' after '${placeOf(line, 0, i)}' is never closed: add a ')' or remove it` });
      units[i] = MASK;
      continue;
    }
    groups.push({ open: i, close });
    for (let k = i; k <= close; k += 1) units[k] = MASK;
    i = close;
  }
  return { masked: units.join(''), groups };
}

interface Piece {
  readonly start: number;
  readonly end: number;
}

function splitOn(masked: string, from: number, to: number, pattern: RegExp): { readonly pieces: readonly Piece[]; readonly breaks: readonly number[] } {
  const segment = masked.slice(from, to);
  const pieces: Piece[] = [];
  const breaks: number[] = [];
  let at = 0;
  const re = new RegExp(pattern.source, pattern.flags);
  for (let m = re.exec(segment); m !== null; m = re.exec(segment)) {
    pieces.push({ start: from + at, end: from + m.index });
    breaks.push(from + m.index);
    at = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex += 1;
  }
  pieces.push({ start: from + at, end: to });
  return { pieces, breaks };
}

interface Side {
  readonly line: string;
  readonly masked: string;
  readonly groups: readonly Group[];
  readonly errors: QuickError[];
}

const unbalanced = (masked: string): number | 'open' | undefined => {
  let depth = 0;
  for (let i = 0; i < masked.length; i += 1) {
    if (masked[i] === '(') depth += 1;
    else if (masked[i] === ')') {
      depth -= 1;
      if (depth < 0) return i;
    }
  }
  return depth > 0 ? 'open' : undefined;
};

/** One term of `piece`; undefined (with its errors recorded) when it is empty or wrong. `prefixFrom`: where the stage or side began, for "after '...'". */
function readTerm(side: Side, piece: Piece, prefixFrom: number, where: string, products: boolean): QuickTerm | undefined {
  const { line, masked, groups, errors } = side;
  const rawMasked = masked.slice(piece.start, piece.end);
  if (rawMasked.trim() === '') {
    const prefix = placeOf(line, prefixFrom, piece.start);
    errors.push({ position: piece.end, message: prefix === '' ? `Empty term at the start of the ${where}: write a name, a formula or a SMILES string there` : `Empty term after '${prefix}': write a name, a formula or a SMILES string there` });
    return undefined;
  }
  const inside = groups.filter((g) => g.open >= piece.start && g.close < piece.end);
  const firstOpen = inside[0]?.open ?? piece.end;
  const nameRaw = line.slice(piece.start, firstOpen);
  const name = collapse(nameRaw);
  const balance = unbalanced(rawMasked);
  if (balance !== undefined) {
    const at = balance === 'open' ? piece.start + Math.max(0, rawMasked.lastIndexOf('(')) : piece.start + balance;
    errors.push({ position: at, message: `Unbalanced parentheses in '${collapse(line.slice(piece.start, piece.end))}': every '(' needs a ')'` });
    return undefined;
  }
  let condition: string | undefined;
  if (inside.length > 0) {
    const group = inside[0] as Group;
    if (products) {
      errors.push({ position: group.open, message: `Condition text belongs before the arrow: the ( ... ) after '${name}' cannot be on the products side` });
      return undefined;
    }
    if (inside.length > 1) {
      errors.push({ position: (inside[1] as Group).open, message: `A term can have only one ( ... ) of condition text (after '${placeOf(line, prefixFrom, (inside[1] as Group).open)}')` });
      return undefined;
    }
    if (line.slice(group.close + 1, piece.end).trim() !== '') {
      errors.push({ position: group.close + 1, message: `Found text after the condition text of '${name}': the ( ... ) must end the term` });
      return undefined;
    }
    condition = collapse(line.slice(group.open + 1, group.close));
    if (condition === '') {
      errors.push({ position: group.open, message: `Empty ( ) after '${name}': write the conditions inside it, or remove it` });
      return undefined;
    }
  }
  if (name === '') {
    errors.push({ position: piece.start, message: `Empty term at the start of the ${where}: write a name, a formula or a SMILES string there` });
    return undefined;
  }
  const lead = nameRaw.length - nameRaw.trimStart().length;
  const start = piece.start + lead;
  return { text: name, ...(condition === undefined ? {} : { condition }), start, end: start + nameRaw.trim().length };
}

export function parseQuickEntry(input: string): QuickParse {
  const hint = `Type a reaction, for example ${EXAMPLE}`;
  if (typeof input !== 'string' || input.trim() === '') return { ok: false, errors: [{ position: 0, message: hint }] };
  if (input.length > MAX_QUICK_LINE) return { ok: false, errors: [{ position: MAX_QUICK_LINE, message: `The line is longer than ${MAX_QUICK_LINE} characters: split it into smaller reactions` }] };
  const line = input;
  const errors: QuickError[] = [];
  const { masked, groups } = maskGroups(line, errors);
  const finish = (): QuickParse => ({ ok: false, errors: [...errors].sort((a, b) => a.position - b.position).slice(0, MAX_ERRORS) });

  const arrows = [...masked.matchAll(ARROWS)];
  if (arrows.length === 0) {
    errors.push({ position: line.length, message: 'No arrow: write the reactants, an arrow (->, → or =>) and the products' });
    return finish();
  }
  if (arrows.length > 1) {
    const second = arrows[1] as RegExpMatchArray;
    errors.push({ position: second.index as number, message: `Two arrows: a line has exactly one (the second one is after '${placeOf(line, 0, second.index as number)}')` });
    return finish();
  }
  const arrow = arrows[0] as RegExpMatchArray;
  const at = arrow.index as number;
  const after = at + arrow[0].length;
  const side: Side = { line, masked, groups, errors };

  const stages: QuickStage[] = [];
  if (masked.slice(0, at).trim() === '') errors.push({ position: at, message: 'Nothing before the arrow: write the reactants first' });
  else {
    const { pieces } = splitOn(masked, 0, at, STAGE_BREAK);
    pieces.forEach((stagePiece, stageIndex) => {
      if (masked.slice(stagePiece.start, stagePiece.end).trim() === '') {
        const prefix = placeOf(line, 0, stagePiece.start);
        errors.push({ position: stagePiece.start, message: stageIndex === 0 ? "Empty stage at the start of the line: write the reactants before ', then'" : `Empty stage after '${prefix}': write the terms of the next stage there` });
        return;
      }
      const terms = splitOn(masked, stagePiece.start, stagePiece.end, SEPARATOR).pieces.flatMap((piece) => {
        const term = readTerm(side, piece, stagePiece.start, stageIndex === 0 ? 'line' : 'stage', false);
        return term === undefined ? [] : [term];
      });
      stages.push({ terms });
    });
  }

  const products: QuickTerm[] = [];
  if (masked.slice(after).trim() === '') errors.push({ position: after, message: 'Nothing after the arrow: write the product(s) after it' });
  else {
    const stageBreak = new RegExp(STAGE_BREAK.source, STAGE_BREAK.flags).exec(masked.slice(after));
    if (stageBreak !== null) errors.push({ position: after + stageBreak.index, message: "', then' is only allowed before the arrow, between stages of the reactants" });
    for (const piece of splitOn(masked, after, line.length, SEPARATOR).pieces) {
      const term = readTerm(side, piece, after, 'products', true);
      if (term !== undefined) products.push(term);
    }
  }

  const count = stages.reduce((n, s) => n + s.terms.length, 0) + products.length;
  if (count > MAX_QUICK_TERMS) errors.push({ position: line.length, message: `More than ${MAX_QUICK_TERMS} terms in the line: split it into smaller reactions` });
  if (errors.length > 0) return finish();
  return { ok: true, entry: { stages, products, arrow: arrow[0] as QuickArrow } };
}

/** The condition texts of a stage's terms, joined by "; " (empty when none). */
export function stageConditionText(stage: QuickStage): string {
  return stage.terms.flatMap((term) => (term.condition === undefined ? [] : [term.condition])).join('; ');
}

const termText = (term: QuickTerm): string => (term.condition === undefined ? term.text : `${term.text} (${term.condition})`);

/** The line for an entry, with the arrow shown as given (default: the entry's own): terms joined by " + ", stages by ", then ". */
export function formatQuickEntry(entry: QuickEntry, arrow: QuickArrow = entry.arrow): string {
  const left = entry.stages.map((stage) => stage.terms.map(termText).join(' + ')).join(', then ');
  return `${left} ${arrow} ${entry.products.map((product) => product.text).join(' + ')}`;
}
