/**
 * The words on an arrow's chip (step 8.2b, ADR-044 addendum). An arrow that carries ONE reaction shows that reaction's reagent words on its
 * chip instead of the number, cut at CHIP_WORDS_MAX characters with an ellipsis (the whole words are in the chip's accessible name and
 * tooltip). An arrow of several reactions keeps the number. A chip with words that would overlap another chip keeps the number (a lone
 * arrow, which has no number chip, then has no chip): the map never has more overlap than before. Pure; no DOM, no chemistry.
 */
import type { ArrowTextPart } from '@/core/graph';
import { CHIP_HEIGHT, chipTextWidth, chipWidth, partsToRuns, type FormattedText, type TextRun } from '@/render/scene';

export const CHIP_WORDS_MAX = 14;

export const clipWords = (words: string): string => {
  const letters = [...words];
  return letters.length <= CHIP_WORDS_MAX ? words : `${letters.slice(0, CHIP_WORDS_MAX).join('')}…`;
};

export interface ChipText {
  /** What the chip shows. */
  readonly text: string;
  /** Its accessible name and tooltip (the whole words, or "n reactions"). */
  readonly name: string;
  /** The words in the reaction card's typography (formulas with subscripts), cut like `text`; only for words. */
  readonly runs?: FormattedText;
}

const countName = (n: number): string => `${n} ${n === 1 ? 'reaction' : 'reactions'}`;

/** The runs cut at CHIP_WORDS_MAX visible characters (the characters of the runs, not the markup) with an ellipsis. */
export function clipRuns(runs: FormattedText): FormattedText {
  const total = runs.reduce((sum, run) => sum + [...run.text].length, 0);
  if (total <= CHIP_WORDS_MAX) return runs;
  const out: TextRun[] = [];
  let left = CHIP_WORDS_MAX;
  for (const run of runs) {
    if (left <= 0) break;
    const letters = [...run.text];
    out.push({ ...run, text: letters.slice(0, left).join('') });
    left -= letters.length;
  }
  out.push({ text: '…' });
  return out;
}

export function chipTextOf(reactions: number, words: string | undefined, parts?: readonly ArrowTextPart[]): ChipText {
  if (reactions === 1 && words !== undefined && words !== '') {
    const text = clipWords(words);
    return parts === undefined || parts.length === 0 ? { text, name: words } : { text, name: words, runs: clipRuns(partsToRuns(parts)) };
  }
  return { text: String(reactions), name: countName(reactions) };
}

export interface ChipWish {
  /** A stable key (the edge id, plus ":back" for the other end of a pair). */
  readonly key: string;
  readonly at: { readonly x: number; readonly y: number };
  /** The reactions this chip counts. */
  readonly count: number;
  /** Reagent words, when the arrow carries one reaction that has some. */
  readonly words?: string | undefined;
  /** The parts of those words (name or formula), for the typography. */
  readonly parts?: readonly ArrowTextPart[] | undefined;
  /** `none`: a lone arrow, which has no number chip (so, with no words that fit, no chip). Default `number`. */
  readonly base?: 'number' | 'none';
  /** A step of a chain (1, 2, 3): the chip is numbered, "2" or "2: PCC". */
  readonly step?: number;
}

const stepped = (wish: ChipWish, chip: ChipText, words: boolean): ChipText => {
  if (wish.step === undefined) return chip;
  const prefix = `${wish.step}: `;
  return {
    text: words ? prefix + chip.text : String(wish.step),
    name: `step ${wish.step}: ${chip.name}`,
    ...(words && chip.runs !== undefined ? { runs: [{ text: prefix }, ...chip.runs] } : {}),
  };
};
const widthOf = (chip: ChipText): number => (/^[0-9]+$/.test(chip.text) ? chipWidth(Number(chip.text)) : chipTextWidth(chip.text));

interface Box {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}
const boxAt = (at: { readonly x: number; readonly y: number }, width: number): Box => ({ x0: at.x - width / 2, x1: at.x + width / 2, y0: at.y - CHIP_HEIGHT / 2, y1: at.y + CHIP_HEIGHT / 2 });
const overlap = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** The chip each wish gets: its words where they fit among the other chips (as they are now) and clear of every box, else its number, else none. Decided in key order. */
export function resolveChips(wishes: readonly ChipWish[], obstacles: readonly { readonly x: number; readonly y: number; readonly width: number; readonly height: number }[] = []): Map<string, ChipText> {
  const boxesOfNodes: Box[] = obstacles.map((n) => ({ x0: n.x, x1: n.x + n.width, y0: n.y, y1: n.y + n.height }));
  const ordered = [...wishes].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const out = new Map<string, ChipText>();
  const boxes = new Map<string, Box>();
  for (const wish of ordered) {
    if (wish.base !== 'none') {
      const chip = stepped(wish, chipTextOf(wish.count, undefined), false);
      out.set(wish.key, chip);
      boxes.set(wish.key, boxAt(wish.at, widthOf(chip)));
    }
  }
  for (const wish of ordered) {
    if (wish.words === undefined || wish.words === '') continue;
    const chip = stepped(wish, chipTextOf(1, wish.words, wish.parts), true);
    const box = boxAt(wish.at, widthOf(chip));
    let clear = true;
    for (const [key, other] of boxes) if (key !== wish.key && overlap(box, other)) clear = false;
    for (const node of boxesOfNodes) if (overlap(box, node)) clear = false;
    if (!clear) continue;
    out.set(wish.key, chip);
    boxes.set(wish.key, box);
  }
  return out;
}
