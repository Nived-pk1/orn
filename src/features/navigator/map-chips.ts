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

/** The same arrows with the chip marks added. `chain`: every arrow is a numbered step (in the order given) and has a chip. */
export function withChips(drawn: readonly Drawn[], facts: Facts, chain: boolean, nodes: readonly { readonly x: number; readonly y: number; readonly width: number; readonly height: number }[] = []): Drawn[] {
  if (facts === undefined && !chain) return [...drawn];
  const wishes: ChipWish[] = [];
  drawn.forEach((d, at) => {
    const { edge, mark } = d;
    const reactions = facts?.(edge.from, edge.to)?.reactions;
    wishes.push({
      key: edge.id,
      at: edge.labelAt,
      count: chain ? (reactions ?? edge.bundleSize ?? 1) : (edge.bundleSize ?? 1),
      ...wordsOf(facts, edge.from, edge.to),
      base: chain || edge.bundleSize !== undefined ? 'number' : 'none',
      ...(chain ? { step: at + 1 } : {}),
    });
    if (mark.extraChip !== undefined) wishes.push({ key: `${edge.id}:back`, at: mark.extraChip.at, count: mark.extraChip.size, ...wordsOf(facts, edge.to, edge.from) });
  });
  const chips = resolveChips(wishes, nodes);
  return drawn.map((d) => {
    const own = chips.get(d.edge.id);
    const back = chips.get(`${d.edge.id}:back`);
    const lone = d.edge.bundleSize === undefined;
    const changed = own !== undefined && (chain || lone || own.text !== String(d.edge.bundleSize));
    const extra = d.mark.extraChip;
    const extraChanged = extra !== undefined && back !== undefined && back.text !== String(extra.size);
    if (!changed && !extraChanged) return d;
    return {
      edge: d.edge,
      mark: {
        ...d.mark,
        ...(changed ? { chip: own } : {}),
        ...(extra !== undefined && extraChanged ? { extraChip: { ...extra, text: back.text, name: back.name, ...(back.runs === undefined ? {} : { runs: back.runs }) } } : {}),
      },
    };
  });
}
