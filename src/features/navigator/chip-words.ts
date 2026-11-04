/**
 * The words on an arrow's chip (step 8.2b, ADR-044 addendum). An arrow that carries ONE reaction shows that reaction's reagent words on its
 * chip instead of the number, cut at CHIP_WORDS_MAX characters with an ellipsis (the whole words are in the chip's accessible name and
 * tooltip). An arrow of several reactions keeps the number. A chip with words that would overlap another chip keeps the number (a lone
 * arrow, which has no number chip, then has no chip): the map never has more overlap than before. Pure; no DOM, no chemistry.
 */
import { CHIP_HEIGHT, chipTextWidth, chipWidth } from '@/render/scene';

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
}

const countName = (n: number): string => `${n} ${n === 1 ? 'reaction' : 'reactions'}`;

export function chipTextOf(reactions: number, words: string | undefined): ChipText {
  if (reactions === 1 && words !== undefined && words !== '') return { text: clipWords(words), name: words };
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
  /** `none`: a lone arrow, which has no number chip (so, with no words that fit, no chip). Default `number`. */
  readonly base?: 'number' | 'none';
  /** A step of a chain (1, 2, 3): the chip is numbered, "2" or "2: PCC". */
  readonly step?: number;
}

const stepped = (wish: ChipWish, chip: ChipText, words: boolean): ChipText => (wish.step === undefined ? chip : { text: words ? `${wish.step}: ${chip.text}` : String(wish.step), name: `step ${wish.step}: ${chip.name}` });
const widthOf = (chip: ChipText): number => (/^[0-9]+$/.test(chip.text) ? chipWidth(Number(chip.text)) : chipTextWidth(chip.text));

interface Box {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}
const boxAt = (at: { readonly x: number; readonly y: number }, width: number): Box => ({ x0: at.x - width / 2, x1: at.x + width / 2, y0: at.y - CHIP_HEIGHT / 2, y1: at.y + CHIP_HEIGHT / 2 });
const overlap = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** The chip each wish gets: its words where they fit among the other chips (as they are now), else its number, else none. Decided in key order. */
export function resolveChips(wishes: readonly ChipWish[]): Map<string, ChipText> {
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
    const chip = stepped(wish, chipTextOf(1, wish.words), true);
    const box = boxAt(wish.at, widthOf(chip));
    let clear = true;
    for (const [key, other] of boxes) if (key !== wish.key && overlap(box, other)) clear = false;
    if (!clear) continue;
    out.set(wish.key, chip);
    boxes.set(wish.key, box);
  }
  return out;
}
