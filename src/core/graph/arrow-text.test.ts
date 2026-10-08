/** `arrowTextOf` (step 5.3 review follow-up a): what is over and under an arrow, from roles, schemes and stages. */
import { describe, expect, it } from 'vitest';
import { arrowTextOf, MAX_ARROW_PARTS, type ArrowText, type ArrowTextContext } from '.';
import { documentToState } from '@/core/dataset';
import type { CanonicalState, ConditionVariantId, ParticipantId, Reaction, ReactionScheme, RecordRef } from '@/core/schema';
import { buildDemoDocument } from '@/test-support/demo';

const parsed = documentToState(buildDemoDocument());
if (!parsed.ok) throw new Error('duplicate IDs');
const DEMO: CanonicalState = parsed.state;

type Loose = Record<string, unknown>;
const hiddenFromNodes = new Set(Object.values(DEMO.records.entity_display).filter((d) => d.showAsNode === 'never').map((d) => `${d.target.kind}:${d.target.id}`));

function describeIn(state: CanonicalState): ArrowTextContext['describe'] {
  return (ref: RecordRef) => {
    const record = (state.records[ref.kind] as Record<string, unknown>)[ref.id] as Loose | undefined;
    if (record === undefined) return undefined;
    const names = record.names as { canonical: string };
    // A reagent has a formula only when it is exactly one species (its `speciesId`): that species' formula (item e).
    const species = ref.kind === 'reagent' && typeof record.speciesId === 'string' ? ((state.records.species as Record<string, unknown>)[record.speciesId] as Loose | undefined) : undefined;
    const formula = (ref.kind === 'reagent' ? species?.formula : (record.formula ?? record.formulaText)) as string | undefined;
    return { name: names.canonical, ...(formula === undefined ? {} : { formula }) };
  };
}

function contextIn(reactionId: string, carried: string | undefined, variants: readonly string[] = []): { reaction: Reaction; context: ArrowTextContext } {
  const reaction = DEMO.records.reaction[reactionId as keyof typeof DEMO.records.reaction] as Reaction;
  return {
    reaction,
    context: {
      schemes: Object.values(DEMO.records.reaction_scheme).filter((s) => s.reactionId === reactionId),
      conditionVariantIds: variants as ConditionVariantId[],
      ...(carried === undefined ? {} : { carriedParticipantId: carried as ParticipantId }),
      describe: describeIn(DEMO),
      shownAsNode: (ref) => !hiddenFromNodes.has(`${ref.kind}:${ref.id}`),
    },
  };
}
const textOfDemo = (reactionId: string, carried: string | undefined, variants: readonly string[] = []): ArrowText => {
  const { reaction, context } = contextIn(reactionId, carried, variants);
  return arrowTextOf(reaction, context);
};
/** `kind:text` per part, so the table shows the kind as well. */
const shown = (parts: ArrowText['above']): string[] => parts.map((p) => `${p.kind}:${p.text}`);

describe('the demo reactions', () => {
  const table: readonly (readonly [string, string, string, readonly string[], readonly string[]])[] = [
    // reaction, carried participant, label, above, below
    ['rxn_ethanol-to-ethanal-pcc', 'prt_ethanol-to-ethanal-pcc-1', 'PCC above, the solvent below', ['name:PCC'], ['name:Dichloromethane']],
    ['rxn_ethene-hydration', 'prt_ethene-hydration-1', 'water is never a node: above, first; then the catalyst', ['formula:H2O', 'name:H₃PO₄ catalyst'], []],
    ['rxn_ethene-hydration', 'prt_ethene-hydration-2', 'carrying water: the ethene is a node, so it is left out', ['name:H₃PO₄ catalyst'], []],
    ['rxn_propene-hbr-peroxide', 'prt_propene-hbr-peroxide-1', 'reagent and initiator above', ['formula:HBr', 'name:Benzoyl peroxide'], []],
    ['rxn_methylmgbr-ethanal', 'prt_methylmgbr-ethanal-2', 'two stages, no scheme: the work-up above, the solvent below', ['formula:H3O+'], ['name:Diethyl ether']],
    ['rxn_methylmgbr-propanone', 'prt_methylmgbr-propanone-2', 'two stages with a scheme: placements and stage numbers', ['separator:1.', 'name:Diethyl ether'], ['separator:2.', 'formula:H3O+']],
    ['rxn_haloform-ethanol', 'prt_haloform-ethanol-1', 'two reagents above, in the order of the record', ['formula:I2', 'formula:NaOH'], []],
  ];
  it.each(table)('%s carrying %s: %s', (reactionId, carried, _label, above, below) => {
    const text = textOfDemo(reactionId, carried);
    expect(shown(text.above)).toEqual(above);
    expect(shown(text.below)).toEqual(below);
  });

  it('never repeats the carried substrate and never lists a product', () => {
    for (const reaction of Object.values(DEMO.records.reaction)) {
      const carried = reaction.participants.find((p) => p.isPrimarySubstrate === true);
      const text = arrowTextOf(reaction, contextIn(reaction.id, carried?.id).context);
      const productNames = reaction.outcomes.flatMap((o) => o.products.map((pr) => describeIn(DEMO)(pr.ref as RecordRef)?.name));
      const carriedName = carried === undefined ? undefined : describeIn(DEMO)(carried.ref as RecordRef)?.name;
      const all = [...text.above, ...text.below].map((p) => p.text);
      if (carriedName !== undefined) expect(all, reaction.id).not.toContain(carriedName);
      for (const name of productNames) if (name !== undefined && carriedName !== name) expect(all.includes(name) && all.filter((t) => t === name).length > 1, reaction.id).toBe(false);
    }
  });

  it('is deterministic', () => {
    for (const reaction of Object.values(DEMO.records.reaction)) {
      const context = contextIn(reaction.id, undefined).context;
      expect(arrowTextOf(reaction, context)).toEqual(arrowTextOf(reaction, context));
    }
  });
});

describe('condition variants', () => {
  it('a participant listed in a variant applies under that variant only', () => {
    const reaction = DEMO.records.reaction['rxn_ethanal-aldol' as keyof typeof DEMO.records.reaction] as Reaction;
    const variants = reaction.conditionVariants;
    expect(variants.length).toBe(2);
    const carried = reaction.participants.find((p) => p.isPrimarySubstrate === true)?.id;
    const under = (variantId: ConditionVariantId | undefined): readonly string[] => {
      const context = { ...contextIn(reaction.id, carried).context, conditionVariantIds: variantId === undefined ? [] : [variantId] };
      const text = arrowTextOf(reaction, context);
      return [...text.above, ...text.below].map((p) => p.text);
    };
    const first = under(variants[0]?.id);
    const second = under(variants[1]?.id);
    expect(first).not.toEqual(second);
    // No variant: neither variant's own participants.
    expect(under(undefined).length).toBeLessThan(Math.max(first.length, second.length) + 1);
  });
});

describe('a synthetic reaction', () => {
  const base = DEMO.records.reaction['rxn_ethanol-to-ethanal-pcc' as keyof typeof DEMO.records.reaction] as Reaction;
  const part = (n: number, role: Reaction['participants'][number]['role'], over: Partial<Reaction['participants'][number]> = {}): Reaction['participants'][number] => ({
    id: `prt_x-${n}` as ParticipantId,
    ref: { kind: 'reagent', id: `rgt_x${n}` as Reaction['participants'][number]['ref']['id'] } as Reaction['participants'][number]['ref'],
    role,
    ...over,
  });
  const reactionOf = (participants: Reaction['participants'], stages: Reaction['stages'] = []): Reaction => ({ ...base, id: 'rxn_x' as Reaction['id'], participants, stages, conditionVariants: [] });
  const contextOf = (over: Partial<ArrowTextContext> = {}): ArrowTextContext => ({
    schemes: [],
    conditionVariantIds: [],
    describe: (ref) => ({ name: `name-${ref.id}` }),
    shownAsNode: () => true,
    ...over,
  });
  const scheme = (placements: ReactionScheme['placements'], over: Partial<ReactionScheme> = {}): ReactionScheme => ({ ...(Object.values(DEMO.records.reaction_scheme)[0] as ReactionScheme), id: 'rsc_x' as ReactionScheme['id'], reactionId: 'rxn_x' as Reaction['id'], placements, ...over });

  it('role defaults of DOMAIN_MODEL §6.2', () => {
    const roles = ['reagent', 'catalyst', 'initiator', 'promoter', 'workup_reagent', 'solvent', 'additive', 'spectator', 'reactant'] as const;
    const text = arrowTextOf(reactionOf(roles.map((role, i) => part(i, role))), contextOf());
    expect(text.above.map((p) => p.text)).toEqual(['name-rgt_x0', 'name-rgt_x1', 'name-rgt_x2', '+2 more']);
    expect(text.below.map((p) => p.text)).toEqual(['name-rgt_x5', 'name-rgt_x6']); // the spectator is hidden, the reactant is a node
  });

  it('a reactant nobody draws is above the arrow, first within its stage (5.4a review decision 1)', () => {
    const r = reactionOf([part(1, 'reagent'), part(2, 'reactant'), part(3, 'solvent'), part(4, 'reactant')]);
    const undrawn = new Set(['reagent:rgt_x2', 'reagent:rgt_x4']);
    const text = arrowTextOf(r, contextOf({ shownAsNode: (ref) => !undrawn.has(`${ref.kind}:${ref.id}`) }));
    expect(text.above.map((p) => p.text)).toEqual(['name-rgt_x2', 'name-rgt_x4', 'name-rgt_x1']);
    expect(text.below.map((p) => p.text)).toEqual(['name-rgt_x3']);
    // Within a stage only: a reactant of stage 2 does not jump before the reagent of stage 1.
    const staged = reactionOf([part(1, 'reagent'), part(2, 'reactant')], [
      { id: 'stg_x1' as Reaction['stages'][number]['id'], participantIds: ['prt_x-1' as ParticipantId] },
      { id: 'stg_x2' as Reaction['stages'][number]['id'], participantIds: ['prt_x-2' as ParticipantId] },
    ] as unknown as Reaction['stages']);
    const two = arrowTextOf(staged, contextOf({ shownAsNode: (ref) => ref.id !== 'rgt_x2', schemes: [scheme([], { showStageNumbers: true })] }));
    expect(shown(two.above)).toEqual(['separator:1.', 'name:name-rgt_x1', 'separator:2.', 'name:name-rgt_x2']);
  });

  it('at most 3 parts a side; the rest is one `more` part with its count, never silently cut', () => {
    const many = Array.from({ length: 9 }, (_, i) => part(i, 'reagent'));
    const text = arrowTextOf(reactionOf(many), contextOf());
    expect(text.above).toHaveLength(MAX_ARROW_PARTS + 1);
    expect(text.above[MAX_ARROW_PARTS]).toEqual({ text: '+6 more', kind: 'more' });
    const exact = arrowTextOf(reactionOf(many.slice(0, 3)), contextOf());
    expect(exact.above.map((p) => p.kind)).toEqual(['name', 'name', 'name']);
  });

  it('a scheme placement beats the role; hidden leaves a participant out; reactant_side leaves a node out', () => {
    const r = reactionOf([part(1, 'reagent'), part(2, 'solvent'), part(3, 'spectator'), part(4, 'reactant'), part(5, 'reagent')]);
    const placements: ReactionScheme['placements'] = [
      { participantId: 'prt_x-1' as ParticipantId, position: 'below_arrow' },
      { participantId: 'prt_x-2' as ParticipantId, position: 'hidden' },
      { participantId: 'prt_x-3' as ParticipantId, position: 'above_arrow' },
      { participantId: 'prt_x-5' as ParticipantId, position: 'reactant_side' },
    ];
    const text = arrowTextOf(r, contextOf({ schemes: [scheme(placements)] }));
    expect(text.above.map((p) => p.text)).toEqual(['name-rgt_x3']);
    expect(text.below.map((p) => p.text)).toEqual(['name-rgt_x1']);
  });

  it('a scheme of another reaction or variant is ignored; the one for the arrow variant wins', () => {
    const r = reactionOf([part(1, 'reagent')]);
    const go = (schemes: ReactionScheme[], variants: string[] = []): ArrowText =>
      arrowTextOf(r, contextOf({ schemes, conditionVariantIds: variants as ConditionVariantId[] }));
    const below = scheme([{ participantId: 'prt_x-1' as ParticipantId, position: 'below_arrow' }]);
    expect(go([{ ...below, reactionId: 'rxn_other' as Reaction['id'] }]).above).toHaveLength(1);
    const forVariant = { ...below, id: 'rsc_y' as ReactionScheme['id'], conditionVariantId: 'cvr_1' as ConditionVariantId };
    expect(go([forVariant]).above).toHaveLength(1);
    expect(go([forVariant], ['cvr_1']).below).toHaveLength(1);
    expect(go([forVariant, scheme([])], ['cvr_1']).below).toHaveLength(1);
    expect(go([forVariant, scheme([])]).above).toHaveLength(1);
  });

  it('a record that is gone is written by its ID; an original wording is kept as written', () => {
    const r = reactionOf([part(1, 'reagent'), part(2, 'reagent', { originalText: 'alc. KOH' })]);
    const text = arrowTextOf(r, contextOf({ describe: () => undefined }));
    expect(shown(text.above)).toEqual(['name:rgt_x1', 'name:alc. KOH']);
  });

  it('hostile names stay text, character for character', () => {
    const hostile = '<img src=x onerror=alert(1)> **b** [[spc_x|y]]';
    const text = arrowTextOf(reactionOf([part(1, 'reagent')]), contextOf({ describe: () => ({ name: hostile }) }));
    expect(text.above).toEqual([{ text: hostile, kind: 'name' }]);
  });

  it('stage numbers only when the scheme asks and there is more than one stage', () => {
    const stageOf = (ids: string[], kind: 'reaction' | 'workup'): Reaction['stages'][number] => ({ id: `stg_${ids[0]}` as Reaction['stages'][number]['id'], kind, participantIds: ids as ParticipantId[], parameters: { other: [], parsedFields: [] } as never });
    const r = reactionOf([part(1, 'reagent'), part(2, 'workup_reagent'), part(3, 'reagent')], [stageOf(['prt_x-1', 'prt_x-3'], 'reaction'), stageOf(['prt_x-2'], 'workup')]);
    const plain = arrowTextOf(r, contextOf());
    expect(plain.above.map((p) => p.text)).toEqual(['name-rgt_x1', 'name-rgt_x3', 'name-rgt_x2']);
    const numbered = arrowTextOf(r, contextOf({ schemes: [scheme([], { showStageNumbers: true })] }));
    expect(shown(numbered.above)).toEqual(['separator:1.', 'name:name-rgt_x1', 'name:name-rgt_x3', 'separator:2.', 'name:name-rgt_x2']);
    const oneStage = reactionOf([part(1, 'reagent')], [stageOf(['prt_x-1'], 'reaction')]);
    expect(arrowTextOf(oneStage, contextOf({ schemes: [scheme([], { showStageNumbers: true })] })).above.map((p) => p.kind)).toEqual(['name']);
  });

  it('a stage number never stands alone at the cap', () => {
    const stageOf = (ids: string[]): Reaction['stages'][number] => ({ id: `stg_${ids[0]}` as Reaction['stages'][number]['id'], kind: 'reaction', participantIds: ids as ParticipantId[], parameters: { other: [], parsedFields: [] } as never });
    const r = reactionOf([part(1, 'reagent'), part(2, 'reagent'), part(3, 'reagent'), part(4, 'reagent')], [stageOf(['prt_x-1', 'prt_x-2', 'prt_x-3']), stageOf(['prt_x-4'])]);
    const text = arrowTextOf(r, contextOf({ schemes: [scheme([], { showStageNumbers: true })] }));
    expect(shown(text.above)).toEqual(['separator:1.', 'name:name-rgt_x1', 'name:name-rgt_x2', 'name:name-rgt_x3', 'more:+1 more']);
  });
});

// Step 5.5a review, item e: a length rule, never a name rule.
describe('names on the arrow (item e)', () => {
  const base = DEMO.records.reaction['rxn_ethanol-to-ethanal-pcc' as keyof typeof DEMO.records.reaction] as Reaction;
  const textFor = (kind: 'species' | 'reagent' | 'class', role: Reaction['participants'][number]['role'], name: string, formula: string | undefined, originalText?: string): readonly string[] => {
    const participant = {
      id: 'prt_x-1' as ParticipantId,
      ref: { kind, id: `${kind === 'species' ? 'spc' : kind === 'reagent' ? 'rgt' : 'cls'}_x` } as Reaction['participants'][number]['ref'],
      role,
      ...(originalText === undefined ? {} : { originalText }),
    };
    const reaction: Reaction = { ...base, id: 'rxn_x' as Reaction['id'], participants: [participant], stages: [], conditionVariants: [] };
    const context: ArrowTextContext = { schemes: [], conditionVariantIds: [], describe: () => ({ name, ...(formula === undefined ? {} : { formula }) }), shownAsNode: () => true };
    const text = arrowTextOf(reaction, context);
    return shown([...text.above, ...text.below]);
  };
  // role 'reagent' stands above the arrow, 'solvent' below.
  const rows: readonly (readonly [string, 'species' | 'reagent' | 'class', Reaction['participants'][number]['role'], string | undefined, string | undefined, string | undefined, string])[] = [
    // label, ref kind, role, originalText, name, formula, expected
    ['original text wins over a short formula', 'species', 'reagent', 'dil. NaOH', 'Sodium hydroxide', 'NaOH', 'name:dil. NaOH'],
    ['original text wins over a long name', 'reagent', 'reagent', 'PCC/DCM', 'Pyridinium chlorochromate', undefined, 'name:PCC/DCM'],
    ['a solvent is written by its name, even with a short formula', 'species', 'solvent', undefined, 'Dichloromethane', 'CH2Cl2', 'name:Dichloromethane'],
    ['a species with a formula of 5 characters', 'species', 'reagent', undefined, 'Sulfuric acid', 'H2SO4', 'formula:H2SO4'],
    ['a species with a formula of exactly 7 characters', 'species', 'reagent', undefined, 'Name', 'ABCDEFG', 'formula:ABCDEFG'],
    ['a species with a formula of 8 characters', 'species', 'reagent', undefined, 'Name', 'ABCDEFGH', 'name:Name'],
    ['a charged species: H3O+', 'species', 'catalyst', undefined, 'Hydronium', 'H3O+', 'formula:H3O+'],
    ['a species without a formula', 'species', 'reagent', undefined, 'Mystery', undefined, 'name:Mystery'],
    ['a species with an empty formula', 'species', 'reagent', undefined, 'Mystery', '', 'name:Mystery'],
    ['a reagent backed by one species with a short formula', 'reagent', 'reagent', undefined, 'Hydrogen bromide', 'HBr', 'formula:HBr'],
    ['a reagent backed by one species with a long formula', 'reagent', 'reagent', undefined, 'Benzoyl peroxide', 'C14H10O4', 'name:Benzoyl peroxide'],
    ['a reagent without a species (no formula) is written by its name', 'reagent', 'reagent', undefined, 'PCC', undefined, 'name:PCC'],
    ['a class is written by its name', 'class', 'reagent', undefined, 'Acids', 'HA', 'name:Acids'],
    ['a formula is counted in characters, not bytes', 'species', 'reagent', undefined, 'Iodine', 'I₂', 'formula:I₂'],
  ];
  it.each(rows)('%s', (_label, kind, role, original, name, formula, expected) => {
    expect(textFor(kind, role, name as string, formula, original)).toEqual([expected]);
  });

  it('is a length rule: the same formula gives the same answer under any name or id', () => {
    for (const name of ['NaOH', 'Sodium hydroxide', 'caustic soda', 'x']) expect(textFor('species', 'reagent', name, 'NaOH')).toEqual(['formula:NaOH']);
    for (const name of ['NaOH', 'x']) expect(textFor('species', 'reagent', name, 'C14H10O4')).toEqual([`name:${name}`]);
  });
});
