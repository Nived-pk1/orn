/**
 * The chips of the drawn arrows (step 8.2b, D and C2): the words of an arrow that carries one reaction, or the step numbers of a chain, decided
 * by `resolveChips` so a chip that would overlap another keeps its number. Pure: edges and marks in, edges' marks out.
 */
import type { ArrowTextPart } from '@/core/graph';
import type { EdgeMark } from '@/render/svg';
import type { SceneEdge } from '@/render/scene';
import { resolveChips, type ChipWish } from './chip-words';

export interface PairFacts {
  readonly reactions: number;
  readonly words?: string | undefined;
  readonly parts?: readonly ArrowTextPart[] | undefined;
}

export interface Drawn {
  readonly edge: SceneEdge;
  readonly mark: EdgeMark;
}

type Facts = ((from: string, to: string) => PairFacts | undefined) | undefined;

/** The words are there only when the arrow is ONE reaction card (an example folded under its general reaction is not another card). */
const wordsOf = (facts: Facts, from: string, to: string): { readonly words: string | undefined; readonly parts: readonly ArrowTextPart[] | undefined } => {
  const found = facts?.(from, to);
  return { words: found?.words, parts: found?.parts };
};

/** Where along a line of a two-way pair its chip sits: near its own head, so the two chips of a pair are at opposite ends (step 8.4c, C). */
const NEAR_HEAD = 0.78;

/**
 * The same arrows with the chip marks added: words or numbers, placed in SCREEN pixels at `zoom` (step 8.4b, A); a chip with no free place is marked
 * hidden (its words stay in the arrow's name). `chain`: every arrow is a numbered step (in the order given) and has a chip.
 */
export function withChips(drawn: readonly Drawn[], facts: Facts, chain: boolean, nodes: readonly { readonly x: number; readonly y: number; readonly width: number; readonly height: number }[] = [], zoom = 1): Drawn[] {
  if (facts === undefined && !chain) return [...drawn];
  const wishes: ChipWish[] = [];
  drawn.forEach((d, at) => {
    const { edge, mark } = d;
    const reactions = facts?.(edge.from, edge.to)?.reactions;
    const pair = mark.paired === true;
    wishes.push({
      key: edge.id,
      at: edge.labelAt,
      route: edge.points,
      start: pair ? NEAR_HEAD : 0.5,
      count: chain ? (reactions ?? edge.bundleSize ?? 1) : (edge.bundleSize ?? 1),
      ...wordsOf(facts, edge.from, edge.to),
      base: chain || pair || edge.bundleSize !== undefined ? 'number' : 'none', // each line of a pair has its own chip (step 8.4c, C)
      ...(chain ? { step: at + 1 } : {}),
    });
  });
  const chips = resolveChips(wishes, nodes, zoom);
  return drawn.map((d) => {
    const own = chips.get(d.edge.id);
    const wanted = d.edge.bundleSize !== undefined || chain || own !== undefined || d.mark.chip !== undefined;
    return {
      edge: d.edge,
      mark: {
        ...d.mark,
        ...(own !== undefined ? { chip: own } : wanted && (d.edge.bundleSize !== undefined || chain) ? { chipHidden: true } : {}),
      },
    };
  });
}
