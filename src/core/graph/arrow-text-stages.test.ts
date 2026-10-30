/**
 * Multi-stage arrow text (7.3a D1 to D3): two or more stages are numbered (i), (ii) ... over and under the arrow; a reactant the card does
 * not draw (anything but the carried substrate) is written on the arrow; one function feeds every caller. Tests written first (seen red).
 */
import { describe, expect, it } from 'vitest';
import { arrowPartsText, arrowTextOf, arrowWordsOf, stageNumeral, type ArrowText, type ArrowTextContext } from '.';
import { documentToState } from '@/core/dataset';
import type { CanonicalState, ParticipantId, Reaction } from '@/core/schema';
import { buildDemoDocument } from '@/test-support/demo';

const parsed = documentToState(buildDemoDocument());
if (!parsed.ok) throw new Error('duplicate IDs');
const DEMO: CanonicalState = parsed.state;

const base = DEMO.records.reaction['rxn_ethanol-to-ethanal-pcc' as keyof typeof DEMO.records.reaction] as Reaction;
type Participant = Reaction['participants'][number];
const part = (n: number, role: Participant['role']): Participant => ({ id: `prt_x-${n}` as ParticipantId, ref: { kind: 'reagent', id: `rgt_x${n}` } as Participant['ref'], role });
const stageOf = (ids: number[], parameters: object = {}, kind: 'reaction' | 'workup' = 'reaction'): Reaction['stages'][number] =>
  ({ id: `stg_${ids.join('')}`, kind, participantIds: ids.map((n) => `prt_x-${n}`), parameters: { solventCharacter: [], activation: [], other: [], parsedFields: [], ...parameters } }) as unknown as Reaction['stages'][number];
const reactionOf = (participants: Participant[], stages: Reaction['stages']): Reaction => ({ ...base, id: 'rxn_x' as Reaction['id'], participants, stages, conditionVariants: [] });
const contextOf = (over: Partial<ArrowTextContext> = {}): ArrowTextContext => ({ schemes: [], conditionVariantIds: [], describe: (ref) => ({ name: `name-${ref.id}` }), shownAsNode: () => true, ...over });
const shown = (parts: ArrowText['above']): string[] => parts.map((p) => `${p.kind}:${p.text}`);

describe('numbered stages (D1)', () => {
  const grignard = reactionOf([part(1, 'reactant'), part(2, 'reactant'), part(3, 'workup_reagent')], [stageOf([1, 2], { medium: 'basic' }), stageOf([3], { medium: 'acidic' }, 'workup')]);

  it('two stages: above numbers what is added in each stage, below numbers that stage\'s conditions with the same numeral', () => {
    const text = arrowTextOf(grignard, contextOf({ carriedParticipantId: 'prt_x-2' as ParticipantId }));
    expect(shown(text.above)).toEqual(['separator:(i)', 'name:name-rgt_x1', 'separator:(ii)', 'name:name-rgt_x3']);
    expect(shown(text.below)).toEqual(['separator:(i)', 'condition:basic medium', 'separator:(ii)', 'condition:acidic medium']);
    expect(arrowPartsText(text.above)).toBe('(i) name-rgt_x1 (ii) name-rgt_x3');
    expect(arrowPartsText(text.below)).toBe('(i) basic medium (ii) acidic medium');
  });

  it('numbers without the scheme asking; a stage with nothing on a side has no numeral there, and the others keep theirs', () => {
    const noBelowInOne = reactionOf([part(1, 'reagent'), part(2, 'reagent')], [stageOf([1]), stageOf([2], { medium: 'acidic' })]);
    const text = arrowTextOf(noBelowInOne, contextOf());
    expect(shown(text.above)).toEqual(['separator:(i)', 'name:name-rgt_x1', 'separator:(ii)', 'name:name-rgt_x2']);
    expect(shown(text.below)).toEqual(['separator:(ii)', 'condition:acidic medium']);
  });

  it('one stage is unchanged: no numerals', () => {
    const one = reactionOf([part(1, 'reagent')], [stageOf([1], { medium: 'acidic' })]);
    const text = arrowTextOf(one, contextOf());
    expect(shown(text.above)).toEqual(['name:name-rgt_x1']);
    expect(shown(text.below)).toEqual(['condition:acidic medium']);
  });

  it('three stages are (i), (ii) and (iii); the numerals run on in Roman', () => {
    const three = reactionOf([part(1, 'reagent'), part(2, 'reagent'), part(3, 'reagent')], [stageOf([1]), stageOf([2]), stageOf([3])]);
    expect(arrowPartsText(arrowTextOf(three, contextOf()).above)).toBe('(i) name-rgt_x1 (ii) name-rgt_x2 (iii) name-rgt_x3');
    expect([1, 2, 3, 4, 5, 9, 12, 14, 16].map(stageNumeral)).toEqual(['(i)', '(ii)', '(iii)', '(iv)', '(v)', '(ix)', '(xii)', '(xiv)', '(xvi)']);
  });

  it('within a stage the parts are joined by commas, between stages by a space', () => {
    const r = reactionOf([part(1, 'reagent'), part(2, 'catalyst'), part(3, 'reagent')], [stageOf([1, 2]), stageOf([3])]);
    expect(arrowPartsText(arrowTextOf(r, contextOf()).above)).toBe('(i) name-rgt_x1, name-rgt_x2 (ii) name-rgt_x3');
  });

  it('a numeral never stands alone at the cap', () => {
    const r = reactionOf([part(1, 'reagent'), part(2, 'reagent'), part(3, 'reagent'), part(4, 'reagent')], [stageOf([1, 2, 3]), stageOf([4])]);
    expect(shown(arrowTextOf(r, contextOf()).above)).toEqual(['separator:(i)', 'name:name-rgt_x1', 'name:name-rgt_x2', 'name:name-rgt_x3', 'more:+1 more']);
  });
});

describe('a reactant the card does not draw (D2)', () => {
  const grignard = reactionOf([part(1, 'reactant'), part(2, 'reactant'), part(3, 'workup_reagent')], [stageOf([1, 2]), stageOf([3], {}, 'workup')]);

  it('any reactant but the carried substrate is written above the arrow, first in its stage, even though it is a node elsewhere', () => {
    const text = arrowTextOf(grignard, contextOf({ carriedParticipantId: 'prt_x-2' as ParticipantId, shownAsNode: () => true }));
    expect(arrowPartsText(text.above)).toBe('(i) name-rgt_x1 (ii) name-rgt_x3');
  });

  it('the full equation draws its reactants as structures, so it numbers only what it does not draw', () => {
    const text = arrowTextOf(grignard, contextOf({ omitReactants: true }));
    expect(arrowPartsText(text.above)).toBe('(ii) name-rgt_x3');
  });

  it('a single-stage reaction writes the other reactant too, without a numeral', () => {
    const one = reactionOf([part(1, 'reactant'), part(2, 'reactant')], []);
    expect(shown(arrowTextOf(one, contextOf({ carriedParticipantId: 'prt_x-2' as ParticipantId })).above)).toEqual(['name:name-rgt_x1']);
  });
});

describe('the demo Grignard (D2, D3)', () => {
  const reaction = DEMO.records.reaction['rxn_methylmgbr-ethanal' as keyof typeof DEMO.records.reaction] as Reaction;
  const text = arrowTextOf(reaction, {
    schemes: [],
    conditionVariantIds: [],
    carriedParticipantId: 'prt_methylmgbr-ethanal-2' as ParticipantId,
    describe: (ref) => {
      const record = (DEMO.records[ref.kind] as Record<string, { names: { canonical: string }; formula?: string; speciesId?: string }>)[ref.id];
      if (record === undefined) return undefined;
      const species = ref.kind === 'reagent' && record.speciesId !== undefined ? DEMO.records.species[record.speciesId as keyof typeof DEMO.records.species] : undefined;
      const formula = ref.kind === 'reagent' ? (species as { formula?: string } | undefined)?.formula : record.formula;
      return { name: record.names.canonical, ...(formula === undefined ? {} : { formula }) };
    },
    shownAsNode: () => true,
  });

  it('reads (i) CH3MgBr (ii) H3O+ above, and each stage\'s conditions under it', () => {
    expect(arrowPartsText(text.above).replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 0x2080))).toMatch(/^\(i\) CH3MgBr.* \(ii\) /);
    expect(text.below.filter((p) => p.kind === 'separator').map((p) => p.text)).toEqual(['(i)', '(ii)']);
    expect(arrowPartsText(text.below)).toMatch(/^\(i\) .+ \(ii\) acidic medium$/);
  });
});

describe('one text for every caller (D3)', () => {
  const r = reactionOf([part(1, 'reagent'), part(2, 'workup_reagent')], [stageOf([1], { medium: 'basic' }), stageOf([2], { medium: 'acidic' }, 'workup')]);
  const text = arrowTextOf(r, contextOf());
  it('a route line joins the sides with "; " and a sentence with ", ", both keeping the numerals', () => {
    expect(arrowWordsOf(text)).toBe('(i) name-rgt_x1 (ii) name-rgt_x2; (i) basic medium (ii) acidic medium');
    expect(arrowWordsOf(text, ', ')).toBe('(i) name-rgt_x1 (ii) name-rgt_x2, (i) basic medium (ii) acidic medium');
  });
  it('an arrow with nothing on a side has no stray separator', () => {
    expect(arrowWordsOf({ above: text.above, below: [] })).toBe('(i) name-rgt_x1 (ii) name-rgt_x2');
    expect(arrowWordsOf({ above: [], below: [] })).toBe('');
  });
});
