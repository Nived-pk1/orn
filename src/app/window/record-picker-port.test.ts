/**
 * The record pickers' port over the real demo state and real indexes (step 6.2b decisions D1, D3, D4): the words of a choice (kind and
 * scope), the search through the search service's own request, and the two cycle questions answered in words by the core's guards.
 */
import { describe, expect, it } from 'vitest';
import { indexEngine } from '@/core/indexes';
import type { CanonicalState, Reagent } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { reagent, rg, sp } from '@/test-support/demo/kit';
import { createRecordPicker } from './record-picker-port';

const withReagents = (state: CanonicalState, ...extra: Reagent[]): CanonicalState =>
  ({ ...state, records: { ...state.records, reagent: { ...state.records.reagent, ...Object.fromEntries(extra.map((r) => [r.id, r])) } } }) as CanonicalState;

function picker(state: CanonicalState = demoState(), requests: unknown[] = []) {
  const indexes = indexEngine.build(state);
  return createRecordPicker({
    search: (async (channel: string, request: { kinds: readonly string[] }) => {
      requests.push({ channel, request });
      return { ok: true, value: [{ ref: { kind: request.kinds[0], id: Object.keys((state.records as unknown as Record<string, object>)[request.kinds[0] as string] ?? {})[0] } }] };
    }) as never,
    state: () => state,
    indexes: () => indexes,
    activeExam: () => null,
  });
}

describe('describe', () => {
  it('gives a class its kind words, a species its kind, a reagent "reagent", each with the scope words', () => {
    const port = picker();
    expect(port.describe('class', 'cls_alcohols')).toEqual({ kind: 'class', id: 'cls_alcohols', name: 'Alcohols', kindWords: 'compound class', scope: '' });
    expect(port.describe('reagent', 'rgt_pcc')).toMatchObject({ kind: 'reagent', name: 'PCC', kindWords: 'reagent' });
    expect(port.describe('species', 'spc_ethanol')).toMatchObject({ kind: 'species', name: 'Ethanol' });
    expect(port.describe('class', 'cls_nope')).toBeUndefined();
    expect(port.describe('class', '__proto__')).toBeUndefined();
  });
});

describe('search', () => {
  it('asks the search service for the kinds on a channel of its own, and answers what exists', async () => {
    const requests: unknown[] = [];
    const port = picker(demoState(), requests);
    const found = await port.search(['class'], 'alc');
    expect(found).toHaveLength(1);
    expect(requests[0]).toMatchObject({ channel: 'record-picker:class', request: { text: 'alc', kinds: ['class'], limit: 10 } });
    await port.search(['species', 'class', 'reagent'], 'x');
    expect(requests[1]).toMatchObject({ channel: 'record-picker:species,class,reagent' });
  });
});

describe('the cycle questions, in words', () => {
  it('a class parent: itself and a descendant are refused with the reason, others are not', () => {
    const port = picker();
    expect(port.parentRefusal?.('cls_alcohols', 'cls_alcohols')).toBe('A class cannot be its own parent.');
    expect(port.parentRefusal?.('cls_alcohols', 'cls_alcohols-primary')).toBe('Primary alcohols is already below this class, so it cannot be its parent: that would make a cycle.');
    expect(port.parentRefusal?.('cls_alcohols-primary', 'cls_alcohols')).toBeUndefined();
    expect(port.parentRefusal?.('cls_brand-new', 'cls_alcohols')).toBeUndefined();
  });

  it('a reagent component: a reagent built from the owner is refused; species and classes never are', () => {
    const a = reagent('cyc-a', 'Cycle A', { families: ['catalyst'], components: [{ ref: rg('cyc-b'), role: 'active' }] });
    const b = reagent('cyc-b', 'Cycle B', { families: ['catalyst'], components: [{ ref: sp('ethanol'), role: 'solvent' }] });
    const port = picker(withReagents(demoState(), a, b));
    expect(port.componentRefusal?.('rgt_cyc-b', { kind: 'reagent', id: 'rgt_cyc-a' })).toBe('Cycle A is already built from this reagent, so it cannot be one of its components: that would make a cycle.');
    expect(port.componentRefusal?.('rgt_cyc-b', { kind: 'reagent', id: 'rgt_cyc-b' })).toBe('A reagent cannot be a component of itself.');
    expect(port.componentRefusal?.('rgt_cyc-a', { kind: 'reagent', id: 'rgt_cyc-b' })).toBeUndefined();
    expect(port.componentRefusal?.('rgt_cyc-b', { kind: 'species', id: 'spc_ethanol' })).toBeUndefined();
    expect(port.componentRefusal?.('rgt_cyc-b', { kind: 'class', id: 'cls_alcohols' })).toBeUndefined();
  });
});

describe('isMapFamily', () => {
  it('is true for a class with a navigator anchor, false for one without', () => {
    const state = demoState();
    const port = picker(state);
    const anchored = Object.values(state.records.navigator_anchor).find((a) => a.target.kind === 'class');
    expect(anchored).toBeDefined();
    if (anchored === undefined) return;
    expect(port.isMapFamily?.(anchored.target.id)).toBe(true);
    const plain = Object.keys(state.records.class).find((id) => !Object.values(state.records.navigator_anchor).some((a) => a.target.id === id));
    expect(port.isMapFamily?.(plain as string)).toBe(false);
  });
});

describe('concepts and sources (step 6.6a)', () => {
  const withSource = (state: CanonicalState): CanonicalState =>
    ({ ...state, records: { ...state.records, reference: { ref_a: { id: 'ref_a', kind: 'reference', refKind: 'textbook', title: 'Morrison and Boyd', year: 2010 } } } }) as unknown as CanonicalState;
  it('describes a concept by its name and kind, and a source by its title and kind of source', () => {
    const port = picker(withSource(demoState()));
    const concept = Object.values(demoState().records.concept)[0];
    expect(port.describe('concept', concept?.id as string)).toMatchObject({ kind: 'concept', name: concept?.name });
    expect(port.describe('reference', 'ref_a')).toEqual({ kind: 'reference', id: 'ref_a', name: 'Morrison and Boyd', kindWords: 'textbook, 2010', scope: '' });
    expect(port.describe('reference', 'ref_nope')).toBeUndefined();
  });
  it('V4: a concept choice carries its concept kind, so a picker can put the matching kind first', () => {
    const concept = Object.values(demoState().records.concept)[0];
    expect(picker().describe('concept', concept?.id as string)).toMatchObject({ conceptKind: concept?.conceptKind });
  });
  it('counts records of a kind and gives the title and year of a source', () => {
    const port = picker(withSource(demoState()));
    expect(port.count?.('reference')).toBe(1);
    expect(picker().count?.('reference')).toBe(0);
    expect(port.sourceOf?.('ref_a')).toEqual({ title: 'Morrison and Boyd', year: 2010 });
    expect(port.sourceOf?.('ref_nope')).toBeUndefined();
  });
});

describe('knowledge records (step 6.6b part 2)', () => {
  const state = demoState();
  const named = Object.values(state.records.named_reaction);
  const transformation = Object.values(state.records.transformation)[0];
  it('describes a named reaction, a transformation and a caveat by name (a caveat by title)', () => {
    const port = picker();
    expect(port.describe('named_reaction', named[0]?.id as string)).toMatchObject({ kind: 'named_reaction', name: named[0]?.name, kindWords: 'named reaction' });
    expect(port.describe('transformation', transformation?.id as string)).toMatchObject({ kind: 'transformation', name: transformation?.name, kindWords: 'transformation' });
    const caveat = Object.values(state.records.caveat)[0];
    expect(port.describe('caveat', caveat?.id as string)).toMatchObject({ kind: 'caveat', name: caveat?.title, kindWords: caveat?.caveatKind.replace(/_/g, ' ') });
    expect(port.describe('named_reaction', 'nrx_nope')).toBeUndefined();
  });
  it('answers the parent-cycle question for concepts and named reactions, in words', () => {
    const port = picker();
    const concepts = Object.keys(state.records.concept);
    const top = concepts.find((id) => indexEngine.build(state).descendantsOf('concept', id).length > 0) as string;
    const below = indexEngine.build(state).descendantsOf('concept', top)[0] as string;
    expect(port.parentRefusal?.(top, top, 'concept')).toMatch(/cannot be its own parent/);
    expect(port.parentRefusal?.(top, below, 'concept')).toMatch(/already below this concept.*cycle/);
    expect(port.parentRefusal?.(top, concepts.find((id) => id !== top && id !== below && !indexEngine.build(state).descendantsOf('concept', top).includes(id)) as string, 'concept')).toBeUndefined();
    expect(port.parentRefusal?.(named[0]?.id as string, named[0]?.id as string, 'named_reaction')).toMatch(/named reaction cannot be its own parent/);
    expect(port.parentRefusal?.('cls_alcohols', 'cls_alcohols')).toMatch(/A class cannot be its own parent/); // the class default is unchanged
  });
  it('"Used by": the reactions that name a named reaction or a transformation, once each', () => {
    const port = picker();
    const reaction = Object.values(state.records.reaction).find((r) => r.namedReactionIds.length > 0);
    const users = port.usedBy?.('named_reaction', reaction?.namedReactionIds[0] as string) ?? [];
    expect(users.map((u) => u.id)).toContain(reaction?.id);
    expect(new Set(users.map((u) => u.id)).size).toBe(users.length);
    const t = Object.values(state.records.reaction).find((r) => r.transformationIds.length > 0);
    expect(port.usedBy?.('transformation', t?.transformationIds[0] as string).map((u) => u.id)).toContain(t?.id);
    expect(port.usedBy?.('named_reaction', 'nrx_nobody')).toEqual([]);
  });
});
