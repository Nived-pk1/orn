/**
 * FormattedText (step 5.3): the mini-markup AST of core/text turned into runs, and formula typography.
 * Both are total functions that never throw. Neither is chemistry: typography only, so the characters are never
 * changed, added or dropped (the runs of `formulaRuns` joined equal the input exactly).
 */
import type { ArrowTextPart } from '@/core/graph/arrow-text';
import type { RichNode } from '@/core/text';
import type { FormattedText, TextRun } from './contracts';

const MAX_AST_DEPTH = 16;

const isDigit = (c: string): boolean => c >= '0' && c <= '9';
const isUpper = (c: string): boolean => c >= 'A' && c <= 'Z';
const isLower = (c: string): boolean => c >= 'a' && c <= 'z';
const isClosing = (c: string): boolean => c === ')' || c === ']';
const isSign = (c: string): boolean => c === '+' || c === '-' || c === '−';

/** Appends a run, merging it into the previous one when the style is the same. Empty text adds nothing. */
function push(out: TextRun[], text: string, style: Pick<TextRun, 'script' | 'emphasis'> = {}): void {
  if (text === '') return;
  const last = out[out.length - 1];
  if (last !== undefined && last.script === style.script && last.emphasis === style.emphasis) {
    out[out.length - 1] = { ...last, text: last.text + text };
    return;
  }
  out.push({ text, ...(style.script === undefined ? {} : { script: style.script }), ...(style.emphasis === undefined ? {} : { emphasis: style.emphasis }) });
}

/** The plain text of a node, markup removed (used past the depth cap: no character is lost). */
function flatText(node: RichNode): string {
  switch (node.type) {
    case 'text':
    case 'sub':
    case 'sup':
      return node.text;
    case 'link':
      return node.label;
    case 'strong':
    case 'em':
    case 'paragraph':
      return node.children.map(flatText).join('');
    case 'bullets':
      return node.items.map((item) => item.map(flatText).join('')).join('\n');
  }
}

function walk(nodes: readonly RichNode[], emphasis: TextRun['emphasis'], depth: number, out: TextRun[]): void {
  nodes.forEach((node, index) => {
    if (depth > MAX_AST_DEPTH) {
      push(out, flatText(node), emphasis === undefined ? {} : { emphasis });
      return;
    }
    switch (node.type) {
      case 'text':
        push(out, node.text, emphasis === undefined ? {} : { emphasis });
        break;
      case 'sub':
      case 'sup':
        push(out, node.text, { script: node.type, ...(emphasis === undefined ? {} : { emphasis }) });
        break;
      case 'link':
        push(out, node.label, emphasis === undefined ? {} : { emphasis });
        break;
      case 'strong':
      case 'em':
        // The innermost emphasis wins: a run has one.
        walk(node.children, node.type, depth + 1, out);
        break;
      case 'paragraph':
        walk(node.children, emphasis, depth + 1, out);
        if (index < nodes.length - 1) push(out, '\n');
        break;
      case 'bullets':
        node.items.forEach((item, i) => {
          push(out, '• ');
          walk(item, emphasis, depth + 1, out);
          if (i < node.items.length - 1 || index < nodes.length - 1) push(out, '\n');
        });
        break;
    }
  });
}

/** Mini-markup AST to runs: strong and em become the run's emphasis, sub and sup its script, a link its label as text. */
export function richToRuns(nodes: readonly RichNode[]): FormattedText {
  const out: TextRun[] = [];
  walk(nodes, undefined, 0, out);
  return out;
}

/** One run of plain text (no markup is read): how names are shown, character for character. */
export function plainRuns(text: string, emphasis?: TextRun['emphasis']): FormattedText {
  return text === '' ? [] : [{ text, ...(emphasis === undefined ? {} : { emphasis }) }];
}

/** The strings a charge can be written as at the end of a formula: `-`, `2-`, `-2`, `3+` (both minus signs). */
function chargeTails(charge: number): readonly string[] {
  const size = Math.abs(charge);
  if (size === 0) return [];
  const signs = charge > 0 ? ['+'] : ['-', '−'];
  if (size === 1) return signs;
  return signs.flatMap((sign) => [`${size}${sign}`, `${sign}${size}`]);
}

interface Tail {
  /** Where the tail starts in the text; the text from there on is the tail. */
  readonly start: number;
  /** A superscript charge, or text that may be a charge but is not decided (kept plain, never guessed). */
  readonly script: 'sup' | 'plain';
}

/**
 * The trailing charge of a formula. With the record's own `charge`: a tail that matches it is the superscript, and
 * nothing else is. Without: a lone trailing sign after a letter or a closing bracket is a superscript; digits then a
 * sign (`NH4+`, `C2H3-`: a subscript and a charge, or a charge of 4?) are ambiguous and stay plain.
 */
function tailOf(text: string, charge: number | undefined): Tail | undefined {
  const n = text.length;
  if (charge !== undefined) {
    const tails = [...chargeTails(charge)].sort((a, b) => b.length - a.length);
    const hit = tails.find((tail) => n > tail.length && text.endsWith(tail));
    return hit === undefined ? undefined : { start: n - hit.length, script: 'sup' };
  }
  if (n < 2 || !isSign(text[n - 1] as string)) return undefined;
  const before = text[n - 2] as string;
  if (isUpper(before) || isLower(before) || isClosing(before)) return { start: n - 1, script: 'sup' };
  if (!isDigit(before)) return undefined;
  let start = n - 2;
  while (start > 0 && isDigit(text[start - 1] as string)) start -= 1;
  return { start, script: 'plain' };
}

/**
 * Formula typography: digits that follow an element symbol (an upper-case letter and at most one lower-case letter) or a closing
 * bracket become subscripts, a trailing charge becomes a superscript (see `tailOf`: the record's `charge` decides when it is
 * given), everything else stays as it is (a leading coefficient, a digit after a dot or a dash, text that is not a formula).
 * Not a parser: `CnH2n+2` gets only the subscript after H.
 */
export function formulaRuns(text: string, charge?: number): FormattedText {
  const out: TextRun[] = [];
  const tail = tailOf(text, charge);
  const body = tail === undefined ? text : text.slice(0, tail.start);
  let afterSymbol = false;
  let lowers = 0;
  let i = 0;
  while (i < body.length) {
    const c = body[i] as string;
    if (isDigit(c)) {
      let j = i;
      while (j < body.length && isDigit(body[j] as string)) j += 1;
      push(out, body.slice(i, j), afterSymbol ? { script: 'sub' } : {});
      afterSymbol = false;
      lowers = 0;
      i = j;
      continue;
    }
    if (isUpper(c)) {
      afterSymbol = true;
      lowers = 0;
    } else if (isLower(c) && afterSymbol && lowers === 0) {
      lowers = 1;
    } else {
      afterSymbol = isClosing(c);
      lowers = 0;
    }
    push(out, c);
    i += 1;
  }
  if (tail !== undefined) push(out, text.slice(tail.start), tail.script === 'sup' ? { script: 'sup' } : {});
  return out;
}

/**
 * The parts of one side of an arrow as runs: a formula part through the formula typography, every other part as plain text
 * (a name is never read as markup). Parts are joined by ", "; a stage number is followed by a space; a `more` part stands alone.
 */
export function partsToRuns(parts: readonly ArrowTextPart[]): FormattedText {
  const out: TextRun[] = [];
  parts.forEach((part, index) => {
    const previous = parts[index - 1];
    if (previous !== undefined) push(out, previous.kind === 'separator' ? ' ' : ', ');
    for (const run of part.kind === 'formula' ? formulaRuns(part.text) : plainRuns(part.text)) push(out, run.text, run);
  });
  return out;
}
